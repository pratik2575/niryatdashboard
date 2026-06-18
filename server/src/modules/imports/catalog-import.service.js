import { HsProduct, ImportBatch } from '../../models/index.js';
import { retainSourceFile, saveIssues, batchPreview } from './import-audit.service.js';
import { readSpreadsheetRows, rowsToRecords } from './spreadsheet-parser.js';

function normalizedKeys(record) {
  return Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [
    String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    value
  ]));
}

function normalizeCode(value, level) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits || ![2, 4, 6].includes(level) || digits.length > level) return null;
  return digits.padStart(level, '0');
}

export function normalizeCatalogRecord(source) {
  const row = normalizedKeys(source);
  const level = Number(row.level);
  const hscode = normalizeCode(row.hscode ?? row.hs_code, level);
  const rawParent = String(row.parent ?? row.parent_code ?? '').trim();
  const expectedParentLevel = level === 6 ? 4 : level === 4 ? 2 : null;
  const parentCode = /^(total|null|none|-)?$/i.test(rawParent)
    ? null
    : normalizeCode(rawParent, expectedParentLevel);

  return {
    section: String(row.section ?? '').trim(),
    hscode,
    description: String(row.description ?? '').trim(),
    parent_code: parentCode,
    level
  };
}

export function validateCatalogRecord(record) {
  const errors = [];
  if (!record.section) errors.push('section is required');
  if (!record.description) errors.push('description is required');
  if (![2, 4, 6].includes(record.level)) errors.push('level must be 2, 4, or 6');
  if (!record.hscode) errors.push('hscode is invalid for its level');
  if (record.level > 2 && !record.parent_code) errors.push('parent is required for level 4 and 6');
  return errors;
}

export async function importHsCatalog(input, options = {}) {
  const batch = await ImportBatch.create({
    import_type: 'hs_catalog',
    file_name: options.fileName || 'json-body',
    uploaded_by: options.uploadedBy || null,
    status: 'processing',
    started_at: new Date()
  });
  const issues = [];

  try {
    if (options.buffer) {
      batch.source_file = await retainSourceFile(options.buffer, {
        fileName: options.fileName,
        mimeType: options.mimeType
      });
      await batch.save();
    }

    const rows = options.buffer
      ? await readSpreadsheetRows(options.buffer, options.fileName)
      : Array.isArray(input) ? input : input?.products || input?.records || [];
    const records = rows.length && Array.isArray(rows[0]) ? rowsToRecords(rows) : rows;
    const operations = [];

    records.forEach((source, index) => {
      const record = normalizeCatalogRecord(source);
      const errors = validateCatalogRecord(record);
      if (errors.length) {
        issues.push({
          severity: 'error', row_number: index + 2, code: 'INVALID_HS_PRODUCT',
          message: errors.join('; '), raw_payload: source
        });
        return;
      }
      operations.push({
        updateOne: {
          filter: { hscode: record.hscode },
          update: {
            $set: {
              ...record,
              catalog_import_batch_id: batch._id,
              ...(record.level < 6 ? { is_active: true } : {})
            },
            ...(record.level === 6 ? { $setOnInsert: { is_active: false } } : {})
          },
          upsert: true
        }
      });
    });

    const result = operations.length
      ? await HsProduct.bulkWrite(operations, { ordered: false })
      : { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };

    const importedCodes = operations.map((operation) => operation.updateOne.filter.hscode);
    const imported = await HsProduct.find({ hscode: { $in: importedCodes }, parent_code: { $ne: null } })
      .select('hscode parent_code').lean();
    const parentCodes = [...new Set(imported.map((item) => item.parent_code))];
    const existingParents = new Set((await HsProduct.find({ hscode: { $in: parentCodes } }).select('hscode').lean()).map((item) => item.hscode));
    imported.filter((item) => !existingParents.has(item.parent_code)).forEach((item) => issues.push({
      severity: 'warning', code: 'MISSING_PARENT',
      message: `HS ${item.hscode} references missing parent ${item.parent_code}`
    }));

    await saveIssues(batch._id, issues);
    const errorCount = issues.filter((item) => item.severity === 'error').length;
    const warningCount = issues.length - errorCount;
    batch.record_count = records.length;
    batch.status = errorCount ? (operations.length ? 'partial' : 'failed') : 'completed';
    batch.validation_summary = {
      created: result.upsertedCount || 0,
      updated: (result.modifiedCount || 0) + Math.max((result.matchedCount || 0) - (result.modifiedCount || 0), 0),
      skipped: errorCount,
      errors: errorCount
    };
    batch.warning_messages = batchPreview(issues, 'warning');
    batch.error_messages = batchPreview(issues, 'error');
    batch.completed_at = new Date();
    await batch.save();

    return { success: batch.status !== 'failed', batch_id: batch._id, status: batch.status, summary: batch.validation_summary, warning_count: warningCount };
  } catch (error) {
    batch.status = 'failed';
    batch.error_messages = [error.message];
    batch.completed_at = new Date();
    await batch.save();
    throw error;
  }
}
