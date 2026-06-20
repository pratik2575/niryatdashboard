import { Geography, ImportBatch, IndiaDestinationExportAnnual } from '../../models/index.js';
import { readSpreadsheetRows } from './spreadsheet-parser.js';
import {
  batchPreview,
  deleteRetainedSourceFile,
  readRetainedSourceFile,
  retainSourceFile,
  saveIssues,
  sourceFileSha256
} from './import-audit.service.js';
import { upsertResolvedGeography } from './geography.service.js';
import { resolveTradeStatGeography } from './tradestat-geography.service.js';

const SHARE_TOLERANCE = 0.0002;
const GROWTH_TOLERANCE = 0.02;

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value, places = 6) {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(places));
}

function parseFinancialYear(value) {
  const match = text(value).match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  return { label: match[0], start: Number(match[1]), end: Number(match[2]) };
}

function parseReportDate(value) {
  const match = text(value).match(/Report Generated on:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

function calculateGrowth(current, previous) {
  if (previous === null || previous <= 0 || current === null) return null;
  return rounded(((current / previous) - 1) * 100);
}

function reportedGrowthMatchesRoundedValues(reported, current, previous) {
  if (reported === null || previous === null || previous <= 0 || current === null) return true;
  const previousMin = Math.max(previous - 0.005, Number.EPSILON);
  const previousMax = previous + 0.005;
  const currentMin = Math.max(current - 0.005, 0);
  const currentMax = current + 0.005;
  const low = ((currentMin / previousMax) - 1) * 100 - GROWTH_TOLERANCE;
  const high = ((currentMax / previousMin) - 1) * 100 + GROWTH_TOLERANCE;
  return reported >= low && reported <= high;
}

export async function parseIndiaCountryExportWorkbook(buffer, fileName = 'upload.xlsx') {
  if (!fileName.toLowerCase().endsWith('.xlsx')) throw httpError('TradeStat country exports must be uploaded as .xlsx');
  const rows = await readSpreadsheetRows(buffer, fileName);
  return parseIndiaCountryExportRows(rows, fileName);
}

export function parseIndiaCountryExportRows(rows, fileName = 'upload.xlsx') {
  if (!Array.isArray(rows) || rows.length < 5) throw httpError('Workbook does not contain enough rows');
  if (!/^TradeStat->Eidb->Export->Country-wise$/i.test(text(rows[0]?.[0]))) {
    throw httpError('Workbook title must be “TradeStat->Eidb->Export->Country-wise”');
  }
  if (!/Values in US \$ Million/i.test(text(rows[1]?.[0]))) throw httpError('Workbook values must be in US $ Million');
  const reportDate = parseReportDate(rows[1]?.[0]);
  if (!reportDate) throw httpError('Could not detect the report-generated date');

  const headerIndex = rows.findIndex((row) => text(row?.[0]).toLowerCase() === 's.no.' && text(row?.[1]).toLowerCase() === 'country/region');
  if (headerIndex < 0) throw httpError('Could not find the seven-column country export header');
  const header = rows[headerIndex].map(text);
  if (header.length !== 7 || header[3] !== '%Share' || header[5] !== '%Share' || header[6] !== '%Growth') {
    throw httpError('Country export header must contain exactly seven expected columns');
  }
  const previousYear = parseFinancialYear(header[2]);
  const currentYear = parseFinancialYear(header[4]);
  if (!previousYear || !currentYear || currentYear.start !== previousYear.start + 1 || currentYear.end !== previousYear.end + 1) {
    throw httpError('Workbook must contain two consecutive financial years');
  }

  const totalIndex = rows.findIndex((row, index) => index > headerIndex && /^India's Total Export$/i.test(text(row?.[1])));
  if (totalIndex < 0) throw httpError('Workbook is missing the India’s Total Export row');
  const totalRow = rows[totalIndex];
  const previousTotal = number(totalRow[2]);
  const currentTotal = number(totalRow[4]);
  if (previousTotal === null || currentTotal === null || currentTotal <= 0) throw httpError('India total values are invalid');

  const issues = [];
  const sourceRows = rows.slice(headerIndex + 1, totalIndex);
  const records = sourceRows.map((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    const sourceName = text(row[1]);
    const previousValue = number(row[2]);
    const currentValue = number(row[4]);
    const reportedShare = number(row[5]);
    const reportedGrowth = number(row[6]);
    if (!sourceName) throw httpError(`Row ${rowNumber}: Country/Region is required`);
    if (previousValue === null || previousValue < 0 || currentValue === null || currentValue < 0) {
      throw httpError(`Row ${rowNumber}: Export values must be non-negative numbers`);
    }
    const sharePercent = rounded((currentValue / currentTotal) * 100);
    const yoyGrowthPercent = calculateGrowth(currentValue, previousValue);
    if (reportedShare !== null && Math.abs(sharePercent - reportedShare) > SHARE_TOLERANCE) {
      issues.push({ severity: 'warning', row_number: rowNumber, code: 'SHARE_MISMATCH', message: `${sourceName}: reported share ${reportedShare} differs from calculated ${sharePercent}` });
    }
    if (!reportedGrowthMatchesRoundedValues(reportedGrowth, currentValue, previousValue)) {
      issues.push({ severity: 'warning', row_number: rowNumber, code: 'GROWTH_MISMATCH', message: `${sourceName}: reported growth ${reportedGrowth} differs from calculated ${yoyGrowthPercent}` });
    }
    return {
      rowNumber,
      sourceName,
      currentValue,
      sharePercent,
      yoyGrowthPercent,
      proposedGeography: resolveTradeStatGeography(sourceName)
    };
  });

  const totalGrowth = calculateGrowth(currentTotal, previousTotal);
  const reportedTotalGrowth = number(totalRow[6]);
  if (!reportedGrowthMatchesRoundedValues(reportedTotalGrowth, currentTotal, previousTotal)) {
    issues.push({ severity: 'warning', row_number: totalIndex + 1, code: 'TOTAL_GROWTH_MISMATCH', message: `India total: reported growth ${reportedTotalGrowth} differs from calculated ${totalGrowth}` });
  }
  records.push({
    rowNumber: totalIndex + 1,
    sourceName: "India's Total Export",
    currentValue: currentTotal,
    sharePercent: 100,
    yoyGrowthPercent: totalGrowth,
    proposedGeography: resolveTradeStatGeography("India's Total Export")
  });

  return {
    fileName,
    reportDate,
    previousYear,
    currentYear,
    previousTotal,
    currentTotal,
    destinationCount: sourceRows.length,
    records,
    issues
  };
}

function sameNumber(left, right) {
  return left === right || (left === null && right === null);
}

export function replacementDecision(existing, incoming) {
  if (!existing) return 'create';
  if (existing.period_status === 'final' && incoming.period_status === 'ytd') return 'skip_final_downgrade';
  const existingDate = new Date(existing.source_report_date).getTime();
  const incomingDate = new Date(incoming.source_report_date).getTime();
  if (incomingDate < existingDate) return 'skip_older_report';
  if (
    existing.period_status === incoming.period_status
    && existingDate === incomingDate
    && sameNumber(existing.export_value_usd_million, incoming.export_value_usd_million)
    && sameNumber(existing.share_percent, incoming.share_percent)
    && sameNumber(existing.yoy_growth_percent, incoming.yoy_growth_percent)
  ) return 'unchanged';
  return 'update';
}

async function geographyContext(parsed, manualMappings = new Map(), persist = false) {
  const geographies = await Geography.find().lean();
  const byKey = new Map(geographies.map((item) => [item.key, item]));
  const byAlias = new Map();
  geographies.forEach((item) => (item.aliases || []).forEach((alias) => byAlias.set(text(alias).toUpperCase(), item)));
  const resolved = [];
  const unresolved = [];

  for (const record of parsed.records) {
    const aliasMatch = byAlias.get(record.sourceName.toUpperCase());
    const mappedId = manualMappings.get(record.sourceName);
    let geography = aliasMatch || null;
    if (mappedId) {
      geography = geographies.find((item) => String(item._id) === String(mappedId)) || null;
      if (!geography) throw httpError(`Mapped geography for “${record.sourceName}” does not exist`);
      if (persist) await Geography.updateOne({ _id: geography._id }, { $addToSet: { aliases: record.sourceName } });
    }
    if (!geography && record.proposedGeography.resolved) {
      geography = byKey.get(record.proposedGeography.key) || null;
      if (!geography && persist) {
        const result = await upsertResolvedGeography(record.proposedGeography, record.sourceName);
        geography = result.geography.toObject();
        byKey.set(geography.key, geography);
      }
    }
    if (!geography && !record.proposedGeography.resolved) {
      unresolved.push(record.sourceName);
    } else {
      resolved.push({ record, geography, proposed: !geography ? record.proposedGeography : null });
    }
  }
  return { resolved, unresolved: [...new Set(unresolved)] };
}

async function previewChanges(parsed, periodStatus) {
  const context = await geographyContext(parsed);
  const existingByGeography = new Map();
  const geographyIds = context.resolved.filter((item) => item.geography).map((item) => item.geography._id);
  const existing = await IndiaDestinationExportAnnual.find({
    fiscal_year_start: parsed.currentYear.start,
    destination_geography_id: { $in: geographyIds }
  }).lean();
  existing.forEach((item) => existingByGeography.set(String(item.destination_geography_id), item));
  const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const item of context.resolved) {
    if (!item.geography) {
      counts.created += 1;
      continue;
    }
    const decision = replacementDecision(existingByGeography.get(String(item.geography._id)), {
      period_status: periodStatus,
      source_report_date: parsed.reportDate,
      export_value_usd_million: item.record.currentValue,
      share_percent: item.record.sharePercent,
      yoy_growth_percent: item.record.yoyGrowthPercent
    });
    if (decision === 'create') counts.created += 1;
    else if (decision === 'update') counts.updated += 1;
    else if (decision === 'unchanged') counts.unchanged += 1;
    else counts.skipped += 1;
  }
  return { ...counts, unresolved: context.unresolved };
}

export async function previewIndiaCountryExports(buffer, options = {}) {
  if (!['ytd', 'final'].includes(options.periodStatus)) throw httpError('period_status must be ytd or final');
  const sha256 = sourceFileSha256(buffer);
  const duplicate = await ImportBatch.findOne({
    import_type: 'india_country_exports',
    'source_file.sha256': sha256,
    status: { $in: ['completed', 'partial'] }
  }).lean();
  if (duplicate) return { success: true, duplicate: true, existing_batch_id: duplicate._id, status: duplicate.status };

  const batch = await ImportBatch.create({
    import_type: 'india_country_exports', file_name: options.fileName,
    uploaded_by: options.uploadedBy || null, period_status: options.periodStatus,
    status: 'processing', started_at: new Date()
  });
  try {
    batch.source_file = await retainSourceFile(buffer, { fileName: options.fileName, mimeType: options.mimeType });
    const parsed = await parseIndiaCountryExportWorkbook(buffer, options.fileName);
    const changes = await previewChanges(parsed, options.periodStatus);
    const unresolvedIssues = changes.unresolved.map((name) => ({ severity: 'warning', code: 'UNRESOLVED_GEOGRAPHY', message: `Map “${name}” before confirming this import` }));
    await saveIssues(batch._id, [...parsed.issues, ...unresolvedIssues]);
    batch.financial_year = parsed.currentYear.label;
    batch.fiscal_year_start = parsed.currentYear.start;
    batch.source_report_date = parsed.reportDate;
    batch.record_count = parsed.records.length;
    batch.unresolved_geographies = changes.unresolved;
    batch.preview_summary = {
      previous_financial_year: parsed.previousYear.label,
      current_financial_year: parsed.currentYear.label,
      previous_total_usd_million: parsed.previousTotal,
      current_total_usd_million: parsed.currentTotal,
      destination_count: parsed.destinationCount,
      created: changes.created,
      updated: changes.updated,
      unchanged: changes.unchanged,
      skipped: changes.skipped,
      warning_count: parsed.issues.length,
      unresolved_count: changes.unresolved.length
    };
    batch.warning_messages = batchPreview([...parsed.issues, ...unresolvedIssues], 'warning');
    batch.status = 'awaiting_confirmation';
    await batch.save();
    return { success: true, duplicate: false, batch_id: batch._id, status: batch.status, preview: batch.preview_summary, unresolved_names: changes.unresolved, warnings: batch.warning_messages };
  } catch (error) {
    batch.status = 'failed';
    batch.error_messages = [error.message];
    batch.completed_at = new Date();
    await batch.save();
    throw error;
  }
}

export async function confirmIndiaCountryExports(batchId, options = {}) {
  const batch = await ImportBatch.findById(batchId);
  if (!batch || batch.import_type !== 'india_country_exports') throw httpError('India country export preview not found', 404);
  if (batch.status !== 'awaiting_confirmation') throw httpError('Only awaiting-confirmation previews can be confirmed', 409);
  const mappings = new Map((options.mappings || []).map((item) => [String(item.source_name), String(item.geography_id)]));
  const buffer = await readRetainedSourceFile(batch.source_file);
  const parsed = await parseIndiaCountryExportWorkbook(buffer, batch.file_name);
  if (parsed.currentYear.label !== batch.financial_year || parsed.reportDate.getTime() !== new Date(batch.source_report_date).getTime()) {
    throw httpError('Retained workbook metadata no longer matches the preview', 409);
  }
  const context = await geographyContext(parsed, mappings, true);
  if (context.unresolved.length) throw httpError(`Map all unresolved geographies before confirmation: ${context.unresolved.join(', ')}`, 409);

  const ids = context.resolved.map((item) => String(item.geography._id));
  if (new Set(ids).size !== ids.length) throw httpError('Two workbook rows resolve to the same geography', 409);
  const existing = await IndiaDestinationExportAnnual.find({
    fiscal_year_start: parsed.currentYear.start,
    destination_geography_id: { $in: ids }
  }).lean();
  const existingMap = new Map(existing.map((item) => [String(item.destination_geography_id), item]));
  const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };

  for (const item of context.resolved) {
    const incoming = {
      destination_geography_id: item.geography._id,
      financial_year: parsed.currentYear.label,
      fiscal_year_start: parsed.currentYear.start,
      export_value_usd_million: item.record.currentValue,
      share_percent: item.record.sharePercent,
      yoy_growth_percent: item.record.yoyGrowthPercent,
      period_status: batch.period_status,
      source_name_as_reported: item.record.sourceName,
      source_report_date: parsed.reportDate,
      import_batch_id: batch._id
    };
    const decision = replacementDecision(existingMap.get(String(item.geography._id)), incoming);
    if (decision === 'create' || decision === 'update') {
      await IndiaDestinationExportAnnual.updateOne(
        { destination_geography_id: item.geography._id, fiscal_year_start: parsed.currentYear.start },
        { $set: incoming },
        { upsert: true }
      );
      summary[decision === 'create' ? 'created' : 'updated'] += 1;
    } else {
      summary.skipped += 1;
    }
  }

  const annual = await IndiaDestinationExportAnnual.find({ fiscal_year_start: parsed.currentYear.start }).populate('destination_geography_id').lean();
  const ranked = annual
    .filter((item) => ['country', 'territory'].includes(item.destination_geography_id?.type))
    .sort((a, b) => b.export_value_usd_million - a.export_value_usd_million);
  await IndiaDestinationExportAnnual.updateMany({ fiscal_year_start: parsed.currentYear.start }, { $set: { rank: null } });
  if (ranked.length) {
    await IndiaDestinationExportAnnual.bulkWrite(ranked.map((item, index) => ({
      updateOne: { filter: { _id: item._id }, update: { $set: { rank: index + 1 } } }
    })));
  }

  batch.status = 'completed';
  batch.validation_summary = summary;
  batch.unresolved_geographies = [];
  batch.completed_at = new Date();
  await batch.save();
  return { success: true, batch_id: batch._id, status: batch.status, financial_year: batch.financial_year, summary };
}

export async function cancelIndiaCountryExportPreview(batchId) {
  const batch = await ImportBatch.findById(batchId);
  if (!batch || batch.import_type !== 'india_country_exports') throw httpError('India country export preview not found', 404);
  if (batch.status !== 'awaiting_confirmation') throw httpError('Only awaiting-confirmation previews can be cancelled', 409);
  await deleteRetainedSourceFile(batch.source_file);
  batch.source_file = null;
  batch.status = 'cancelled';
  batch.completed_at = new Date();
  await batch.save();
  return { success: true, batch_id: batch._id, status: batch.status };
}
