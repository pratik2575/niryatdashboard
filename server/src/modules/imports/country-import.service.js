import {
  Country,
  CountryBusinessInsight,
  CountryExportYear,
  FastestGrowingCountryProfile,
  ImportBatch,
  IndiaExportSummary
} from '../../models/index.js';
import {
  buildSearchText,
  extractYearlyMetrics,
  normalizeFinancialYear,
  parseNumber,
  parsePercent,
  pick,
  slugify,
  splitCommaList
} from '../../utils/cleaning.js';
import { validateCountryInput } from '../../utils/validation.js';
import { generateCountryEmbeddingText } from '../search/vector.service.js';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
}

function mergeImportSections(primary = {}, fallback = {}) {
  const merged = { ...fallback };
  for (const [key, value] of Object.entries(primary || {})) {
    if (hasValue(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function sourceFrom(record = {}, fallback = {}) {
  const source = record?.source;
  if (typeof source === 'string') {
    return {
      source_name: source,
      source_link: pick(record, ['source_link'], fallback.source_link ?? null),
      notes: pick(record, ['source_notes', 'notes'], fallback.notes ?? null)
    };
  }

  if (!isPlainObject(source)) {
    return {
      source_name: pick(record, ['source_name', 'data_source'], fallback.source_name ?? null),
      source_link: pick(record, ['source_link'], fallback.source_link ?? null),
      notes: pick(record, ['source_notes', 'notes'], fallback.notes ?? null)
    };
  }

  return {
    source_name: pick(source, ['source_name', 'name'], pick(record, ['source_name', 'data_source'], fallback.source_name ?? null)),
    source_link: pick(source, ['source_link', 'link', 'url'], pick(record, ['source_link'], fallback.source_link ?? null)),
    notes: pick(source, ['notes'], pick(record, ['source_notes', 'notes'], fallback.notes ?? null))
  };
}

function matchingValue(source, pattern, fallback = null) {
  if (!isPlainObject(source)) return fallback;
  const entry = Object.entries(source).find(([key, value]) => pattern.test(key) && hasValue(value));
  return entry ? entry[1] : fallback;
}

function financialYearFromKeys(source) {
  if (!isPlainObject(source)) return null;
  const key = Object.keys(source).find((item) => /fy_?20\d{2}_?\d{2}/i.test(item));
  if (!key) return null;

  const match = key.match(/fy_?(20\d{2})_?(\d{2})/i);
  return match ? normalizeFinancialYear(`${match[1]}-${match[2]}`) : null;
}

function financialYearFrom(source, fallback = null) {
  return normalizeFinancialYear(pick(source, ['financial_year', 'fy', 'year'], null)) || financialYearFromKeys(source) || normalizeFinancialYear(fallback);
}

function normalizeCountryRecord(record) {
  const exportMetrics = isPlainObject(record?.export_metrics) ? record.export_metrics : {};
  const mergedRecord = mergeImportSections(record, exportMetrics);
  const countryName = String(pick(mergedRecord, ['country_name', 'name', 'country'], '')).trim();
  const isoCode = pick(mergedRecord, ['iso_code', 'iso', 'country_code'], null);
  return {
    ...mergedRecord,
    country_name: countryName,
    country_slug: slugify(countryName),
    iso_code: isoCode ? String(isoCode).trim().toUpperCase() : null
  };
}

function yearlyMetricsFrom(record) {
  const explicit = pick(record, ['export_metrics', 'yearly_exports', 'country_export_years'], null);
  if (Array.isArray(explicit)) {
    return explicit
      .map((item) => ({
        financial_year: financialYearFrom(item, null),
        rank: parseNumber(pick(item, ['rank'], null)),
        export_value_usd_mn: parseNumber(pick(item, ['export_value_usd_mn', 'export_usd_mn', 'value_usd_mn'], null)),
        yoy_growth_percent: parsePercent(pick(item, ['yoy_growth_percent', 'yoy_growth'], null)),
        three_year_cagr_percent: parsePercent(pick(item, ['three_year_cagr_percent', 'three_year_cagr'], null)),
        share_in_india_total_exports_percent: parsePercent(pick(item, ['share_in_india_total_exports_percent', 'share_percent'], null)),
        opportunity_score: parseNumber(pick(item, ['opportunity_score'], null)),
        risk_score: parseNumber(pick(item, ['risk_score'], null)),
        raw_payload: item
      }))
      .filter((item) => item.financial_year);
  }

  const metricSource = isPlainObject(explicit) ? mergeImportSections(record, explicit) : record;
  return extractYearlyMetrics(metricSource).map((item) => ({
    financial_year: item.financial_year,
    rank: item.rank ?? parseNumber(pick(metricSource, ['rank'], null)),
    export_value_usd_mn: item.export_value_usd_mn ?? null,
    yoy_growth_percent: item.yoy_growth_percent ?? null,
    three_year_cagr_percent: item.three_year_cagr_percent ?? parsePercent(pick(metricSource, ['three_year_cagr_percent', 'three_year_cagr'], null)),
    share_in_india_total_exports_percent: item.share_percent ?? null,
    opportunity_score: parseNumber(pick(metricSource, ['opportunity_score'], null)),
    risk_score: parseNumber(pick(metricSource, ['risk_score'], null)),
    raw_payload: explicit || metricSource
  }));
}

function latestCountryMetric(record, yearlyMetrics) {
  const latest = record.latest_export_snapshot || record.latest_metrics || yearlyMetrics[0] || {};
  const profile = isPlainObject(record.fastest_growing_profile) ? record.fastest_growing_profile : {};
  return {
    financial_year: financialYearFrom(latest, financialYearFrom(record, financialYearFrom(profile, null))),
    rank: parseNumber(pick(latest, ['rank'], pick(record, ['rank'], pick(profile, ['rank'], null)))),
    export_value_usd_mn: parseNumber(
      pick(
        latest,
        ['export_value_usd_mn', 'export_usd_mn'],
        pick(record, ['latest_export_value_usd_mn'], pick(profile, ['export_value_usd_mn', 'export_usd_mn'], matchingValue(profile, /india_export.*fy.*usd.*mn/i, null)))
      )
    ),
    yoy_growth_percent: parsePercent(
      pick(latest, ['yoy_growth_percent', 'yoy_growth'], pick(record, ['yoy_growth_percent'], pick(profile, ['yoy_growth_percent', 'yoy_growth'], matchingValue(profile, /yoy_growth.*fy/i, null))))
    ),
    three_year_cagr_percent: parsePercent(
      pick(latest, ['three_year_cagr_percent', 'three_year_cagr'], pick(record, ['three_year_cagr_percent'], pick(profile, ['three_year_cagr_percent'], null)))
    ),
    computed_share_in_india_exports_percent: parsePercent(
      pick(
        latest,
        ['computed_share_in_india_exports_percent'],
        pick(record, ['computed_share_in_india_exports_percent', 'computed_share_in_india_exports_percent_from_usd_mn'], null)
      )
    ),
    opportunity_score: parseNumber(pick(latest, ['opportunity_score'], pick(record, ['opportunity_score'], null))),
    risk_score: parseNumber(pick(latest, ['risk_score'], pick(record, ['risk_score'], null)))
  };
}

async function upsertIndiaSummary(summary, importBatchId) {
  if (!summary) return;
  const summaries = Array.isArray(summary) ? summary : [summary];

  for (const item of summaries) {
    const source = sourceFrom(item);
    const financialYear = financialYearFrom(item, null);
    if (!financialYear) continue;

    await IndiaExportSummary.findOneAndUpdate(
      { financial_year: financialYear },
      {
        $set: {
          financial_year: financialYear,
          india_total_exports_usd_bn: parseNumber(pick(item, ['india_total_exports_usd_bn', 'total_exports_usd_bn', 'india_total_exports'], null)),
          yoy_growth_percent: parsePercent(pick(item, ['yoy_growth_percent', 'yoy_growth'], null)),
          top_export_sector: pick(item, ['top_export_sector'], null),
          total_export_destinations: parseNumber(pick(item, ['total_export_destinations'], null)),
          estimated_hs_codes_exported: pick(item, ['estimated_hs_codes_exported', 'est_hs_codes_exported'], null),
          is_partial_year: Boolean(pick(item, ['is_partial_year'], /partial/i.test(String(pick(item, ['financial_year'], ''))))),
          source,
          raw_payload: item,
          import_batch_id: importBatchId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertCountryYears(country, yearlyMetrics, importBatchId, source) {
  for (const metric of yearlyMetrics) {
    await CountryExportYear.findOneAndUpdate(
      { country_id: country._id, financial_year: metric.financial_year },
      {
        $set: {
          country_id: country._id,
          country_name: country.country_name,
          iso_code: country.iso_code,
          financial_year: metric.financial_year,
          rank: parseNumber(metric.rank),
          export_value_usd_mn: parseNumber(metric.export_value_usd_mn),
          yoy_growth_percent: parsePercent(metric.yoy_growth_percent),
          three_year_cagr_percent: parsePercent(metric.three_year_cagr_percent),
          share_in_india_total_exports_percent: parsePercent(metric.share_in_india_total_exports_percent),
          opportunity_score: parseNumber(metric.opportunity_score),
          risk_score: parseNumber(metric.risk_score),
          source,
          raw_payload: metric.raw_payload ?? metric,
          import_batch_id: importBatchId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertBusinessInsights(country, record, importBatchId) {
  const insights = pick(record, ['business_insights', 'country_business_insights'], null);
  if (!insights) return;

  await CountryBusinessInsight.findOneAndUpdate(
    { country_id: country._id },
    {
      $set: {
        country_id: country._id,
        export_trend: pick(insights, ['export_trend'], null),
        fastest_growing_indian_exports: splitCommaList(pick(insights, ['fastest_growing_indian_exports'], null)),
        declining_exports: splitCommaList(pick(insights, ['declining_exports'], null)),
        best_opportunity_sectors: splitCommaList(pick(insights, ['best_opportunity_sectors'], null)),
        typical_buyer_type: splitCommaList(pick(insights, ['typical_buyer_type'], null)),
        market_entry_difficulty: parseNumber(pick(insights, ['market_entry_difficulty'], null)),
        key_documentation: splitCommaList(pick(insights, ['key_documentation'], null)),
        compliance_notes: pick(insights, ['compliance_notes'], null),
        payment_risk: pick(insights, ['payment_risk'], null),
        logistics_notes: pick(insights, ['logistics_notes'], null),
        strategic_recommendation: pick(insights, ['strategic_recommendation'], null),
        source: sourceFrom(insights, sourceFrom(record)),
        raw_payload: insights,
        import_batch_id: importBatchId
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertFastestProfile(country, record, importBatchId) {
  const profile = pick(record, ['fastest_growing_profile', 'fastest_growing_country_profile'], null);
  if (!profile) return;

  const financialYear = financialYearFrom(profile, country.latest_export_snapshot?.financial_year);
  if (!financialYear) return;
  const profileSource = sourceFrom(profile, sourceFrom(record));

  await FastestGrowingCountryProfile.findOneAndUpdate(
    { country_id: country._id, financial_year: financialYear },
    {
      $set: {
        country_id: country._id,
        rank: parseNumber(pick(profile, ['rank'], null)),
        financial_year: financialYear,
        export_value_usd_mn: parseNumber(
          pick(profile, ['export_value_usd_mn', 'export_usd_mn'], matchingValue(profile, /india_export.*fy.*usd.*mn/i, null))
        ),
        yoy_growth_percent: parsePercent(pick(profile, ['yoy_growth_percent', 'yoy_growth'], matchingValue(profile, /yoy_growth.*fy/i, null))),
        three_year_cagr_percent: parsePercent(pick(profile, ['three_year_cagr_percent', 'three_year_cagr'], null)),
        fastest_growing_products: splitCommaList(pick(profile, ['fastest_growing_products'], null)),
        fta_trade_agreement: pick(profile, ['fta_trade_agreement', 'fta_trade_agreement_status'], null),
        ease_of_entry_notes: pick(profile, ['ease_of_entry_notes'], null),
        payment_risk: pick(profile, ['payment_risk'], null),
        best_entry_strategy: pick(profile, ['best_entry_strategy'], null),
        source: {
          source_name: profileSource.source_name,
          source_link: profileSource.source_link
        },
        raw_payload: profile,
        import_batch_id: importBatchId
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function importOneCountry(record, importBatchId, summary) {
  const normalized = normalizeCountryRecord(record);
  const validationErrors = validateCountryInput(normalized);
  if (validationErrors.length) {
    summary.skipped += 1;
    summary.errors += validationErrors.length;
    return validationErrors.map((error) => `${normalized.country_name || 'Unknown country'}: ${error}`);
  }

  const yearlyMetrics = yearlyMetricsFrom(normalized);
  const source = sourceFrom(normalized);
  const tradeProfile = normalized.trade_profile || {};

  const countryDoc = {
    country_name: normalized.country_name,
    country_slug: normalized.country_slug,
    iso_code: normalized.iso_code,
    region: pick(normalized, ['region'], null),
    continent: pick(normalized, ['continent'], null),
    latest_export_snapshot: latestCountryMetric(normalized, yearlyMetrics),
    trade_profile: {
      major_products_exported: splitCommaList(pick(tradeProfile, ['major_products_exported'], pick(normalized, ['major_products_exported'], null))),
      top_hs_chapters: splitCommaList(pick(tradeProfile, ['top_hs_chapters', 'top_3_hs_chapters'], pick(normalized, ['top_hs_chapters', 'top_3_hs_chapters'], null))),
      fta_trade_agreement_status: pick(tradeProfile, ['fta_trade_agreement_status'], pick(normalized, ['fta_trade_agreement_status'], null))
    },
    source,
    source_sheets: splitCommaList(pick(normalized, ['source_sheets'], [])),
    raw_payload: record,
    import_batch_id: importBatchId
  };

  countryDoc.search_text = buildSearchText([
    countryDoc.country_name,
    countryDoc.iso_code,
    countryDoc.region,
    countryDoc.continent,
    countryDoc.trade_profile.major_products_exported,
    countryDoc.trade_profile.top_hs_chapters,
    countryDoc.trade_profile.fta_trade_agreement_status
  ]);
  countryDoc.embedding_text = generateCountryEmbeddingText(countryDoc);

  const fallbackCountryFilter = { country_slug: normalized.country_slug, iso_code: null };
  const countryLookup = normalized.iso_code ? { $or: [{ iso_code: normalized.iso_code }, fallbackCountryFilter] } : fallbackCountryFilter;
  const existingCountry = await Country.findOne(countryLookup).select('_id');
  const countryFilter = existingCountry ? { _id: existingCountry._id } : (normalized.iso_code ? { iso_code: normalized.iso_code } : fallbackCountryFilter);
  const country = await Country.findOneAndUpdate(countryFilter, { $set: countryDoc }, { upsert: true, new: true, setDefaultsOnInsert: true });
  summary[existingCountry ? 'updated' : 'created'] += 1;

  await upsertCountryYears(country, yearlyMetrics, importBatchId, source);
  await upsertBusinessInsights(country, normalized, importBatchId);
  await upsertFastestProfile(country, normalized, importBatchId);

  return [];
}

export async function importCountries(payload, options = {}) {
  const countries = Array.isArray(payload) ? payload : payload?.countries || payload?.records || [];
  const batch = await ImportBatch.create({
    import_type: 'country_data',
    file_name: options.fileName || 'json-body',
    uploaded_by: options.uploadedBy || null,
    status: 'processing',
    record_count: countries.length,
    started_at: new Date()
  });

  const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };
  const warnings = [];
  const errors = [];

  try {
    await upsertIndiaSummary(payload?.india_export_summary, batch._id);

    for (const record of countries) {
      const recordErrors = await importOneCountry(record, batch._id, summary);
      errors.push(...recordErrors);
    }

    const status = errors.length ? (summary.created || summary.updated ? 'partial' : 'failed') : 'completed';
    await ImportBatch.findByIdAndUpdate(batch._id, {
      $set: {
        status,
        validation_summary: summary,
        warnings,
        errors,
        completed_at: new Date()
      }
    });

    return { success: status !== 'failed', import_batch_id: batch._id, summary, warnings, errors };
  } catch (error) {
    await ImportBatch.findByIdAndUpdate(batch._id, {
      $set: {
        status: 'failed',
        validation_summary: { ...summary, errors: summary.errors + 1 },
        warnings,
        errors: [...errors, error.message],
        completed_at: new Date()
      }
    });
    throw error;
  }
}
