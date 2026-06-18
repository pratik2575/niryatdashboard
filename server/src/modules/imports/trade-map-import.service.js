import { ExportSnapshot, HsProduct, ImportBatch } from '../../models/index.js';
import { parseNumber } from '../../utils/cleaning.js';
import { batchPreview, retainSourceFile, saveIssues } from './import-audit.service.js';
import { upsertGeography } from './geography.service.js';
import { readSpreadsheetRows } from './spreadsheet-parser.js';

function cellText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function extractMetadata(rows) {
  const allText = rows.flat().map(cellText).filter(Boolean);
  const productText = allText.find((value) => /Product\s*:\s*\d+/i.test(value));
  const productMatch = productText?.match(/Product\s*:\s*(\d{1,6})\s+(.+)/i);
  const headerText = allText.find((value) => /Value exported in \d{4}/i.test(value));
  const yearMatch = headerText?.match(/Value exported in (\d{4})/i);
  return {
    hscode: productMatch ? productMatch[1].padStart(productMatch[1].length <= 2 ? 2 : productMatch[1].length <= 4 ? 4 : 6, '0') : null,
    description: productMatch?.[2]?.trim() || null,
    year: yearMatch ? Number(yearMatch[1]) : null
  };
}

function findMetricTable(rows) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => /Value exported in \d{4}/i.test(cellText(cell))));
  if (headerIndex < 0) throw new Error('Could not find the Trade Map metrics header');
  const parsedHeaders = rows[headerIndex].map(cellText);
  // Trade Map renders “Exporters” with rowspan=2, so a plain HTML row parser
  // sees it on the preceding row while exporter values still occupy column 1.
  const headers = /^Value exported/i.test(parsedHeaders[0]) ? ['Exporters', ...parsedHeaders] : parsedHeaders;
  const dataRows = rows.slice(headerIndex + 1).filter((row) => cellText(row[0]) && !/^Sources?:/i.test(cellText(row[0])));
  return { headers, dataRows, headerIndex };
}

function valueAt(row, headers, pattern) {
  const index = headers.findIndex((header) => pattern.test(header));
  return index < 0 ? null : row[index];
}

function metricRecord(row, headers, year, rank) {
  return {
    exporter_name_as_reported: cellText(row[0]),
    rank: /^world$/i.test(cellText(row[0])) ? null : rank,
    value_exported_usd_thousand: parseNumber(valueAt(row, headers, new RegExp(`^Value exported in ${year}`))),
    trade_balance_usd_thousand: parseNumber(valueAt(row, headers, new RegExp(`^Trade balance in ${year}`))),
    quantity_exported: parseNumber(valueAt(row, headers, new RegExp(`^Quantity exported in ${year}$`))),
    quantity_unit: cellText(valueAt(row, headers, /^Quantity Unit$/i)) || null,
    unit_value_usd_per_unit: parseNumber(valueAt(row, headers, /^Unit value/i)),
    annual_growth_value_5y_percent: parseNumber(valueAt(row, headers, /^Annual growth in value between \d{4}-\d{4}/i)),
    annual_growth_quantity_5y_percent: parseNumber(valueAt(row, headers, /^Annual growth in quantity between/i)),
    annual_growth_value_1y_percent: parseNumber(valueAt(row, headers, new RegExp(`^Annual growth in value between ${year - 1}-${year}`))),
    share_world_exports_percent: parseNumber(valueAt(row, headers, /^Share in world exports/i)),
    average_importer_distance_km: parseNumber(valueAt(row, headers, /^Average distance of importing countries/i)),
    importer_concentration_index: parseNumber(valueAt(row, headers, /^Concentration of importing countries/i))
  };
}

export async function parseTradeMapWorkbook(buffer, fileName, confirmations = {}) {
  const rows = await readSpreadsheetRows(buffer, fileName);
  const extracted = extractMetadata(rows);
  const hscode = confirmations.hscode ? String(confirmations.hscode).replace(/\D/g, '') : extracted.hscode;
  const year = confirmations.year ? Number(confirmations.year) : extracted.year;
  if (!hscode || ![2, 4, 6].includes(hscode.length)) throw new Error('A valid 2, 4, or 6 digit HS code is required');
  if (!year || year < 1900 || year > 2200) throw new Error('A valid snapshot year is required');
  if (confirmations.hscode && extracted.hscode && hscode !== extracted.hscode) throw new Error(`Entered HS code ${hscode} does not match file HS code ${extracted.hscode}`);
  if (confirmations.year && extracted.year && year !== extracted.year) throw new Error(`Entered year ${year} does not match file year ${extracted.year}`);
  const { headers, dataRows, headerIndex } = findMetricTable(rows);
  let countryRank = 0;
  const metrics = dataRows.map((row, index) => {
    if (!/^world$/i.test(cellText(row[0]))) countryRank += 1;
    return { row, rowNumber: headerIndex + index + 2, metric: metricRecord(row, headers, year, countryRank), headers };
  });
  return { hscode, year, description: extracted.description, metrics };
}

export async function importTradeMapExports(buffer, options = {}) {
  const batch = await ImportBatch.create({
    import_type: 'trade_map_exports', file_name: options.fileName,
    uploaded_by: options.uploadedBy || null, status: 'processing', started_at: new Date()
  });
  const issues = [];

  try {
    batch.source_file = await retainSourceFile(buffer, { fileName: options.fileName, mimeType: options.mimeType });
    await batch.save();
    const parsed = await parseTradeMapWorkbook(buffer, options.fileName, { hscode: options.hscode, year: options.year });
    const { hscode, year } = parsed;

    const product = await HsProduct.findOne({ hscode });
    if (!product) throw new Error(`HS code ${hscode} is not present in the base HS catalog`);
    let created = 0;
    let updated = 0;

    for (const item of parsed.metrics) {
      const { row, rowNumber, metric, headers } = item;
      const name = metric.exporter_name_as_reported;
      if (!name) continue;
      const { geography, resolved } = await upsertGeography(name);
      if (!resolved) issues.push({
        severity: 'warning', row_number: rowNumber, code: 'UNRESOLVED_GEOGRAPHY',
        message: `Stored “${name}” without an ISO code`, raw_payload: row
      });
      const result = await ExportSnapshot.updateOne(
        { product_id: product._id, year, geography_id: geography._id },
        {
          $set: {
            ...metric, product_id: product._id, hscode, year, geography_id: geography._id,
            import_batch_id: batch._id, raw_payload: Object.fromEntries(headers.map((header, i) => [header, row[i] ?? null]))
          }
        },
        { upsert: true }
      );
      if (result.upsertedCount) created += 1;
      else updated += 1;
    }

    await ExportSnapshot.deleteMany({
      product_id: product._id,
      year,
      import_batch_id: { $ne: batch._id }
    });

    const now = new Date();
    await HsProduct.updateOne({ _id: product._id }, {
      $set: { is_active: true, activated_at: product.activated_at || now, last_trade_import_batch_id: batch._id }
    });
    const ancestorCodes = [hscode.slice(0, 2), hscode.length >= 4 ? hscode.slice(0, 4) : null].filter((code) => code && code !== hscode);
    if (ancestorCodes.length) await HsProduct.updateMany({ hscode: { $in: ancestorCodes } }, { $set: { is_active: true } });

    await saveIssues(batch._id, issues);
    batch.target_hscode = hscode;
    batch.snapshot_year = year;
    batch.record_count = parsed.metrics.length;
    batch.status = issues.length ? 'partial' : 'completed';
    batch.validation_summary = { created, updated, skipped: 0, errors: 0 };
    batch.warning_messages = batchPreview(issues, 'warning');
    batch.completed_at = new Date();
    await batch.save();
    return {
      success: true, batch_id: batch._id, status: batch.status, hscode, year,
      product_description: product.description, summary: batch.validation_summary,
      warning_count: issues.length
    };
  } catch (error) {
    batch.status = 'failed';
    batch.error_messages = [error.message];
    batch.completed_at = new Date();
    await batch.save();
    throw error;
  }
}
