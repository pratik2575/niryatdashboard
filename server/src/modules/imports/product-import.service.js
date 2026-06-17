import {
  Country,
  HsChapter,
  HsCode,
  ImportBatch,
  Opportunity,
  Product,
  ProductCountryExport,
  ProductExportYear,
  ProductWorldPosition,
  StateProductExport
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
import { validateProductInput } from '../../utils/validation.js';
import { generateProductEmbeddingText } from '../search/vector.service.js';

const UNSPECIFIED_FINANCIAL_YEAR = 'unspecified';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
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
      source_name: pick(record, ['source_name'], fallback.source_name ?? null),
      source_link: pick(record, ['source_link'], fallback.source_link ?? null),
      notes: pick(record, ['source_notes', 'notes'], fallback.notes ?? null)
    };
  }

  return {
    source_name: pick(source, ['source_name', 'name'], pick(record, ['source_name'], fallback.source_name ?? null)),
    source_link: pick(source, ['source_link', 'link', 'url'], pick(record, ['source_link'], fallback.source_link ?? null)),
    notes: pick(source, ['notes'], pick(record, ['source_notes', 'notes'], fallback.notes ?? null))
  };
}

function mergeImportSections(primary = {}, fallback = {}) {
  const merged = { ...fallback };
  for (const [key, value] of Object.entries(primary || {})) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

function recordsFromSection(section, typeKey = null) {
  if (Array.isArray(section)) return section.filter(hasValue);
  if (!isPlainObject(section)) return [];

  return Object.entries(section)
    .filter(([, value]) => isPlainObject(value))
    .map(([key, value]) => (typeKey && !hasValue(value[typeKey]) ? { ...value, [typeKey]: key } : value));
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

function normalizeProductRecord(record) {
  const masterInformation = isPlainObject(record?.master_information) ? record.master_information : {};
  const exportMetrics = isPlainObject(record?.export_metrics) ? record.export_metrics : {};
  const mergedRecord = mergeImportSections(record, mergeImportSections(masterInformation, exportMetrics));

  const hsCode = String(pick(mergedRecord, ['hs_code_6_digit', 'hs_code', 'hs_code_6'], '')).replace(/\D/g, '').slice(0, 6);
  const itcCodeValue = pick(mergedRecord, ['itc_hs_8_digit', 'itc_hs_code', 'itc_hs'], null);
  const itcCode = itcCodeValue ? String(itcCodeValue).replace(/\D/g, '').slice(0, 8) : null;
  const hsChapter = String(pick(mergedRecord, ['hs_chapter', 'hs_code_2_digit'], hsCode.slice(0, 2))).replace(/\D/g, '').slice(0, 2);
  const productName = String(pick(mergedRecord, ['product_name', 'name', 'product'], '')).trim();

  return {
    ...mergedRecord,
    hs_chapter: hsChapter,
    hs_code_6_digit: hsCode,
    itc_hs_8_digit: itcCode || null,
    product_name: productName,
    product_name_slug: slugify(productName)
  };
}

function latestProductMetric(record, yearlyMetrics) {
  const latest = record.latest_export_snapshot || record.latest_metrics || yearlyMetrics[0] || {};
  return {
    financial_year: financialYearFrom(latest, financialYearFrom(record, null)),
    export_value_usd_mn: parseNumber(pick(latest, ['export_value_usd_mn', 'export_usd_mn'], pick(record, ['latest_export_value_usd_mn'], null))),
    quantity: pick(latest, ['quantity'], pick(record, ['quantity'], null)),
    unit: pick(latest, ['unit'], pick(record, ['unit', 'unit_of_quantity'], null)),
    yoy_growth_percent: parsePercent(pick(latest, ['yoy_growth_percent', 'yoy_growth'], pick(record, ['yoy_growth_percent'], null))),
    three_year_cagr_percent: parsePercent(
      pick(latest, ['three_year_cagr_percent', 'three_year_cagr'], pick(record, ['three_year_cagr_percent'], null))
    ),
    share_in_india_exports_percent: parsePercent(
      pick(latest, ['share_in_india_exports_percent'], pick(record, ['share_in_india_exports_percent'], null))
    ),
    india_global_share_percent: parsePercent(pick(latest, ['india_global_share_percent'], pick(record, ['india_global_share_percent'], null))),
    global_export_value_usd_mn: parseNumber(
      pick(latest, ['global_export_value_usd_mn', 'global_export_value'], pick(record, ['global_export_value_usd_mn', 'global_export_value'], null))
    ),
    india_global_rank: parseNumber(pick(latest, ['india_global_rank', 'indias_global_rank'], pick(record, ['india_global_rank', 'indias_global_rank'], null))),
    top_global_exporter: pick(latest, ['top_global_exporter'], pick(record, ['top_global_exporter'], null))
  };
}

function yearlyMetricsFrom(record) {
  const explicit = pick(record, ['export_metrics', 'yearly_exports', 'product_export_years'], null);
  if (Array.isArray(explicit)) {
    return explicit
      .map((item) => ({
        financial_year: normalizeFinancialYear(pick(item, ['financial_year', 'fy', 'year'], null)),
        export_value_usd_mn: parseNumber(pick(item, ['export_value_usd_mn', 'export_usd_mn', 'value_usd_mn'], null)),
        quantity: pick(item, ['quantity', 'export_quantity'], null),
        unit: pick(item, ['unit'], pick(record, ['unit', 'unit_of_quantity'], null)),
        yoy_growth_percent: parsePercent(pick(item, ['yoy_growth_percent', 'yoy_growth'], null)),
        three_year_cagr_percent: parsePercent(pick(item, ['three_year_cagr_percent', 'three_year_cagr'], null)),
        share_in_india_exports_percent: parsePercent(pick(item, ['share_in_india_exports_percent', 'share_percent'], null))
      }))
      .filter((item) => item.financial_year);
  }

  const metricSource = isPlainObject(explicit) ? mergeImportSections(record, explicit) : record;
  return extractYearlyMetrics(metricSource).map((item) => ({
    ...item,
    share_in_india_exports_percent: item.share_percent ?? null
  }));
}

async function upsertCountryByName(name, importBatchId, source) {
  const countryName = String(name || '').trim();
  if (!countryName) return null;

  const countrySlug = slugify(countryName);
  return Country.findOneAndUpdate(
    { country_slug: countrySlug, iso_code: null },
    {
      $set: {
        country_name: countryName,
        country_slug: countrySlug,
        iso_code: null,
        search_text: countryName,
        embedding_text: countryName,
        source,
        import_batch_id: importBatchId
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertProductYears(product, yearlyMetrics, importBatchId, source) {
  for (const metric of yearlyMetrics) {
    await ProductExportYear.findOneAndUpdate(
      { product_id: product._id, financial_year: metric.financial_year },
      {
        $set: {
          product_id: product._id,
          hs_code_6_digit: product.hs_code_6_digit,
          itc_hs_8_digit: product.itc_hs_8_digit,
          financial_year: metric.financial_year,
          export_value_usd_mn: parseNumber(metric.export_value_usd_mn),
          quantity: metric.quantity ?? null,
          unit: metric.unit ?? product.policy?.unit_of_quantity ?? null,
          yoy_growth_percent: parsePercent(metric.yoy_growth_percent),
          three_year_cagr_percent: parsePercent(metric.three_year_cagr_percent),
          share_in_india_exports_percent: parsePercent(metric.share_in_india_exports_percent),
          source,
          import_batch_id: importBatchId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertDestinations(product, record, importBatchId, source, warnings) {
  const destinations = recordsFromSection(pick(record, ['top_destinations', 'destination_markets', 'product_country_exports', 'top_destination_countries'], []));

  for (const destination of destinations) {
    const countryName = typeof destination === 'string' ? destination : pick(destination, ['country_name', 'destination_country', 'country'], null);
    const country = await upsertCountryByName(countryName, importBatchId, source);
    if (!country) continue;

    const financialYear =
      typeof destination === 'string'
        ? financialYearFrom(record, product.latest_export_snapshot?.financial_year)
        : financialYearFrom(destination, financialYearFrom(record, product.latest_export_snapshot?.financial_year)) || UNSPECIFIED_FINANCIAL_YEAR;
    if (financialYear === UNSPECIFIED_FINANCIAL_YEAR) {
      warnings.push(`Stored destination for ${product.product_name} with unspecified financial_year`);
    }

    await ProductCountryExport.findOneAndUpdate(
      { product_id: product._id, country_id: country._id, financial_year: financialYear },
      {
        $set: {
          product_id: product._id,
          country_id: country._id,
          hs_code_6_digit: product.hs_code_6_digit,
          itc_hs_8_digit: product.itc_hs_8_digit,
          financial_year: financialYear,
          destination_rank: parseNumber(typeof destination === 'string' ? null : pick(destination, ['destination_rank', 'dest_rank', 'rank'], null)),
          export_value_usd_mn: parseNumber(typeof destination === 'string' ? null : pick(destination, ['export_value_usd_mn', 'export_usd_mn'], null)),
          export_quantity: typeof destination === 'string' ? null : pick(destination, ['export_quantity', 'quantity'], null),
          unit: typeof destination === 'string' ? product.policy?.unit_of_quantity : pick(destination, ['unit'], product.policy?.unit_of_quantity),
          share_of_product_export_percent: parsePercent(
            typeof destination === 'string' ? null : pick(destination, ['share_of_product_export_percent', 'share_of_product_export', 'share_percent'], null)
          ),
          yoy_growth_percent: parsePercent(typeof destination === 'string' ? null : pick(destination, ['yoy_growth_percent', 'yoy_growth'], null)),
          three_year_cagr_percent: parsePercent(typeof destination === 'string' ? null : pick(destination, ['three_year_cagr_percent', 'three_year_cagr'], null)),
          avg_unit_value_usd_per_unit: typeof destination === 'string' ? null : pick(destination, ['avg_unit_value_usd_per_unit', 'avg_unit_value'], null),
          main_competitor_countries: splitCommaList(
            typeof destination === 'string' ? null : pick(destination, ['main_competitor_countries', 'competitors'], null)
          ),
          indias_competitive_advantage: typeof destination === 'string' ? null : pick(destination, ['indias_competitive_advantage', 'competitive_advantage'], null),
          source: typeof destination === 'string' ? source : sourceFrom(destination, source),
          raw_payload: typeof destination === 'string' ? { destination_country: destination } : destination,
          import_batch_id: importBatchId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertStateExports(product, record, importBatchId, source, warnings) {
  const states = recordsFromSection(pick(record, ['state_export_matrix', 'state_exports', 'state_product_exports'], []));

  for (const state of states) {
    const stateName = pick(state, ['state_name', 'state'], null);
    const financialYear = financialYearFrom(state, financialYearFrom(record, product.latest_export_snapshot?.financial_year)) || UNSPECIFIED_FINANCIAL_YEAR;
    if (!stateName) continue;
    if (financialYear === UNSPECIFIED_FINANCIAL_YEAR) {
      warnings.push(`Stored state export for ${product.product_name} / ${stateName} with unspecified financial_year`);
    }

    await StateProductExport.findOneAndUpdate(
      { product_id: product._id, state_slug: slugify(stateName), financial_year: financialYear },
      {
        $set: {
          product_id: product._id,
          state_name: stateName,
          state_slug: slugify(stateName),
          hs_code_6_digit: product.hs_code_6_digit,
          itc_hs_8_digit: product.itc_hs_8_digit,
          financial_year: financialYear,
          export_value_usd_mn: parseNumber(pick(state, ['export_value_usd_mn', 'export_usd_mn'], null)),
          export_quantity: pick(state, ['export_quantity', 'quantity'], null),
          unit: pick(state, ['unit'], product.policy?.unit_of_quantity),
          state_share_in_india_export_percent: parsePercent(pick(state, ['state_share_in_india_export_percent', 'state_share_in_india_export', 'state_share_percent'], null)),
          yoy_growth_percent: parsePercent(pick(state, ['yoy_growth_percent', 'yoy_growth'], null)),
          top_destination_countries: splitCommaList(pick(state, ['top_destination_countries', 'top_destinations'], null)),
          major_clusters: splitCommaList(pick(state, ['major_clusters', 'clusters'], null)),
          source: sourceFrom(state, source),
          raw_payload: state,
          import_batch_id: importBatchId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertWorldPosition(product, record, importBatchId, source, warnings) {
  const world = pick(record, ['india_vs_world_share', 'world_position', 'product_world_position'], null);
  if (!world) return;

  const financialYear = financialYearFrom(world, financialYearFrom(record, product.latest_export_snapshot?.financial_year)) || UNSPECIFIED_FINANCIAL_YEAR;
  if (financialYear === UNSPECIFIED_FINANCIAL_YEAR) {
    warnings.push(`Stored world position for ${product.product_name} with unspecified financial_year`);
  }
  const worldSource = sourceFrom(world, source);

  await ProductWorldPosition.findOneAndUpdate(
    { product_id: product._id, financial_year: financialYear },
    {
      $set: {
        product_id: product._id,
        hs_code_6_digit: product.hs_code_6_digit,
        itc_hs_8_digit: product.itc_hs_8_digit,
        financial_year: financialYear,
        india_export_value_usd_mn: parseNumber(pick(world, ['india_export_value_usd_mn', 'india_exports_usd_mn'], null)),
        world_export_value_usd_mn: parseNumber(pick(world, ['world_export_value_usd_mn', 'global_export_value_usd_mn'], null)),
        india_share_in_world_exports_percent: parsePercent(pick(world, ['india_share_in_world_exports_percent', 'india_global_share_percent'], null)),
        india_global_rank: parseNumber(pick(world, ['india_global_rank', 'rank'], null)),
        top_global_exporters: splitCommaList(pick(world, ['top_global_exporters', 'top_5_global_exporters', 'top_exporters'], null)),
        top_exporter_share_percent: parsePercent(pick(world, ['top_exporter_share'], null)),
        growth_trend: pick(world, ['growth_trend'], null),
        opportunity_level: pick(world, ['opportunity_level'], null),
        reason: pick(world, ['reason'], null),
        source: {
          source_name: worldSource.source_name,
          source_link: worldSource.source_link
        },
        raw_payload: world,
        import_batch_id: importBatchId
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function opportunityMatchesProduct(opportunity, product) {
  const hs = pick(opportunity, ['hs_code_6_digit', 'hs_code'], null);
  const itc = pick(opportunity, ['itc_hs_8_digit', 'itc_hs_code'], null);
  const productName = pick(opportunity, ['product_name'], null);

  if (!hs && !itc && !productName) return true;
  if (itc && product.itc_hs_8_digit && String(itc).replace(/\D/g, '') === product.itc_hs_8_digit) return true;
  if (hs && String(hs).replace(/\D/g, '').slice(0, 6) === product.hs_code_6_digit) return true;
  return productName && slugify(productName) === product.product_name_slug;
}

async function upsertOpportunities(product, record, importBatchId, source, warnings) {
  const opportunities = recordsFromSection(pick(record, ['opportunities', 'export_opportunities'], []), 'opportunity_type');

  for (const opportunity of opportunities) {
    if (!opportunityMatchesProduct(opportunity, product)) {
      warnings.push(`Skipped opportunity for ${product.product_name}: HS/product mismatch`);
      continue;
    }

    const financialYear = financialYearFrom(opportunity, financialYearFrom(record, product.latest_export_snapshot?.financial_year)) || UNSPECIFIED_FINANCIAL_YEAR;
    if (financialYear === UNSPECIFIED_FINANCIAL_YEAR) {
      warnings.push(`Stored opportunity for ${product.product_name} with unspecified financial_year`);
    }
    const opportunitySource = sourceFrom(opportunity, source);
    const exportValue = pick(
      opportunity,
      ['export_value_usd_mn', 'export_usd_mn', 'value_usd_mn'],
      matchingValue(opportunity, /export.*fy.*usd.*mn/i, null)
    );

    await Opportunity.findOneAndUpdate(
      {
        product_id: product._id,
        financial_year: financialYear,
        opportunity_type: pick(opportunity, ['opportunity_type', 'type'], 'general')
      },
      {
        $set: {
          opportunity_type: pick(opportunity, ['opportunity_type', 'type'], 'general'),
          product_id: product._id,
          hs_code_6_digit: product.hs_code_6_digit,
          itc_hs_8_digit: product.itc_hs_8_digit,
          product_name: product.product_name,
          sector: pick(opportunity, ['sector'], product.sector),
          financial_year: financialYear,
          rank: parseNumber(pick(opportunity, ['rank'], null)),
          export_value_usd_mn: parseNumber(exportValue),
          yoy_growth_percent: parsePercent(pick(opportunity, ['yoy_growth_percent', 'yoy_growth', 'growth_percent'], null)),
          three_year_cagr_percent: parsePercent(pick(opportunity, ['three_year_cagr_percent', 'three_year_cagr'], null)),
          india_global_share_percent: parsePercent(pick(opportunity, ['india_global_share_percent'], null)),
          top_destination_countries: splitCommaList(
            pick(opportunity, ['top_destination_countries', 'top_destinations', 'top_importing_countries'], null)
          ),
          competition_level: pick(opportunity, ['competition_level'], null),
          entry_barrier_score: parseNumber(pick(opportunity, ['entry_barrier_score', 'entry_barrier'], null)),
          compliance_difficulty_score: parseNumber(pick(opportunity, ['compliance_difficulty_score', 'compliance_difficulty'], null)),
          margin_potential: pick(opportunity, ['margin_potential'], null),
          buyer_availability: pick(opportunity, ['buyer_availability'], null),
          opportunity_score: parseNumber(pick(opportunity, ['opportunity_score', 'export_opportunity_score'], null)),
          growth_percent: parsePercent(pick(opportunity, ['growth'], null)),
          no_of_indian_exporters: pick(opportunity, ['no_of_indian_exporters'], null),
          india_share_in_world_export: pick(opportunity, ['india_share_in_world_export'], null),
          required_certifications: pick(opportunity, ['required_certifications'], null),
          avg_order_size: pick(opportunity, ['avg_order_size'], null),
          logistics_complexity: pick(opportunity, ['logistics_complexity'], null),
          reason_for_selection: pick(opportunity, ['reason_for_selection', 'reason'], null),
          recommended_exporter_type: pick(opportunity, ['recommended_exporter_type'], null),
          source: {
            source_name: opportunitySource.source_name,
            source_link: opportunitySource.source_link
          },
          raw_payload: opportunity,
          import_batch_id: importBatchId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function importOneProduct(record, importBatchId, summary, warnings) {
  const normalized = normalizeProductRecord(record);
  const validationErrors = validateProductInput(normalized);
  if (validationErrors.length) {
    summary.skipped += 1;
    summary.errors += validationErrors.length;
    return validationErrors.map((error) => `${normalized.product_name || 'Unknown product'}: ${error}`);
  }

  const source = sourceFrom(normalized);
  const yearlyMetrics = yearlyMetricsFrom(normalized);

  const chapter = await HsChapter.findOneAndUpdate(
    { hs_chapter: normalized.hs_chapter },
    {
      $set: {
        hs_chapter: normalized.hs_chapter,
        chapter_name: pick(normalized, ['chapter_name', 'hs_chapter_name'], null),
        description: pick(normalized, ['chapter_description', 'description'], null)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const hsCode = await HsCode.findOneAndUpdate(
    { hs_code_6_digit: normalized.hs_code_6_digit },
    {
      $set: {
        hs_chapter_id: chapter._id,
        hs_chapter: normalized.hs_chapter,
        hs_code_6_digit: normalized.hs_code_6_digit,
        hs_heading_4_digit: normalized.hs_code_6_digit.slice(0, 4),
        heading_description: pick(normalized, ['heading_description'], null),
        hs_6_digit_description: pick(normalized, ['hs_6_digit_description', 'hs_description'], null)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const latest = latestProductMetric(normalized, yearlyMetrics);
  const productDoc = {
    product_uid: normalized.itc_hs_8_digit ? `itc:${normalized.itc_hs_8_digit}` : `hs6:${normalized.hs_code_6_digit}:${normalized.product_name_slug}`,
    hs_chapter_id: chapter._id,
    hs_code_id: hsCode._id,
    hs_chapter: normalized.hs_chapter,
    hs_code_6_digit: normalized.hs_code_6_digit,
    itc_hs_8_digit: normalized.itc_hs_8_digit,
    product_name: normalized.product_name,
    product_name_slug: normalized.product_name_slug,
    product_category: pick(normalized, ['product_category', 'category'], null),
    sector: pick(normalized, ['sector'], null),
    description: {
      product_description: pick(normalized, ['product_description', 'hs_6_digit_description'], null),
      itc_hs_description: pick(normalized, ['itc_hs_description', 'itc_hs_8_digit_description'], null)
    },
    policy: {
      exportable_from_india: pick(normalized, ['exportable_from_india'], null),
      export_policy: pick(normalized, ['export_policy'], null),
      unit_of_quantity: pick(normalized, ['unit_of_quantity', 'unit'], null)
    },
    latest_export_snapshot: latest,
    source,
    source_sheets: splitCommaList(pick(normalized, ['source_sheets'], [])),
    import_batch_id: importBatchId
  };

  productDoc.search_text = buildSearchText([
    productDoc.product_name,
    productDoc.hs_chapter,
    productDoc.hs_code_6_digit,
    productDoc.itc_hs_8_digit,
    productDoc.product_category,
    productDoc.sector,
    productDoc.description.product_description,
    productDoc.description.itc_hs_description,
    productDoc.policy.export_policy
  ]);
  productDoc.embedding_text = generateProductEmbeddingText(productDoc);

  const fallbackProductFilter = {
    hs_code_6_digit: normalized.hs_code_6_digit,
    product_name_slug: normalized.product_name_slug,
    itc_hs_8_digit: null
  };
  const productLookup = normalized.itc_hs_8_digit
    ? { $or: [{ itc_hs_8_digit: normalized.itc_hs_8_digit }, fallbackProductFilter] }
    : fallbackProductFilter;

  const existingProduct = await Product.findOne(productLookup).select('_id');
  const productFilter = existingProduct ? { _id: existingProduct._id } : (normalized.itc_hs_8_digit ? { itc_hs_8_digit: normalized.itc_hs_8_digit } : fallbackProductFilter);
  const product = await Product.findOneAndUpdate(productFilter, { $set: productDoc }, { upsert: true, new: true, setDefaultsOnInsert: true });
  summary[existingProduct ? 'updated' : 'created'] += 1;

  await upsertProductYears(product, yearlyMetrics, importBatchId, source);
  await upsertDestinations(product, normalized, importBatchId, source, warnings);
  await upsertStateExports(product, normalized, importBatchId, source, warnings);
  await upsertWorldPosition(product, normalized, importBatchId, source, warnings);
  await upsertOpportunities(product, normalized, importBatchId, source, warnings);

  return [];
}

export async function importProducts(payload, options = {}) {
  const records = Array.isArray(payload) ? payload : payload?.products || payload?.records || [];
  const batch = await ImportBatch.create({
    import_type: 'product_data',
    file_name: options.fileName || 'json-body',
    uploaded_by: options.uploadedBy || null,
    status: 'processing',
    record_count: records.length,
    started_at: new Date()
  });

  const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };
  const warnings = [];
  const errors = [];

  try {
    for (const record of records) {
      const recordErrors = await importOneProduct(record, batch._id, summary, warnings);
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
