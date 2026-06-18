const infrastructureFields = new Set([
  '_id',
  '__v',
  'product_id',
  'country_id',
  'import_batch_id',
  'raw_payload',
  'created_at',
  'updated_at'
]);

function compact(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map(compact).filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compact(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return value;
}

export function publicFields(document, extraExcluded = []) {
  if (!document) return null;
  const excluded = new Set([...infrastructureFields, ...extraExcluded]);
  return compact(Object.fromEntries(Object.entries(document).filter(([key]) => !excluded.has(key)))) || {};
}

export function formatProduct(product) {
  const chapter = product.hs_chapter_id;
  const hsCode = product.hs_code_id;

  return compact({
    id: String(product._id),
    uid: product.product_uid,
    slug: product.product_name_slug,
    name: product.product_name,
    category: product.product_category,
    sector: product.sector,
    classification: {
      hs_chapter: {
        code: product.hs_chapter,
        name: chapter?.chapter_name,
        description: chapter?.description
      },
      hs_code: {
        code: product.hs_code_6_digit,
        heading_code: hsCode?.hs_heading_4_digit,
        heading_description: hsCode?.heading_description,
        description: hsCode?.hs_6_digit_description
      },
      itc_hs_8_digit: product.itc_hs_8_digit
    },
    descriptions: product.description,
    policy: product.policy,
    latest_export: product.latest_export_snapshot,
    source: product.source,
    source_sheets: product.source_sheets
  });
}

export function formatProductSummary(product) {
  return compact({
    id: String(product._id),
    uid: product.product_uid,
    slug: product.product_name_slug,
    name: product.product_name,
    category: product.product_category,
    sector: product.sector,
    hs_chapter: product.hs_chapter,
    hs_code_6_digit: product.hs_code_6_digit,
    itc_hs_8_digit: product.itc_hs_8_digit,
    latest_export: product.latest_export_snapshot
  });
}

export function formatCountry(country) {
  return compact({
    id: String(country._id),
    slug: country.country_slug,
    name: country.country_name,
    iso_code: country.iso_code,
    region: country.region,
    continent: country.continent,
    latest_export: country.latest_export_snapshot,
    trade_profile: country.trade_profile,
    source: country.source,
    source_sheets: country.source_sheets
  });
}

export function formatCountrySummary(country) {
  return compact({
    id: String(country._id),
    slug: country.country_slug,
    name: country.country_name,
    iso_code: country.iso_code,
    region: country.region,
    continent: country.continent,
    latest_export: country.latest_export_snapshot,
    trade_profile: country.trade_profile
  });
}

function groupBy(records, getKey, formatIdentity, formatMetrics) {
  const groups = new Map();

  for (const record of records) {
    const key = getKey(record);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, { ...formatIdentity(record), export_history: [] });
    }
    groups.get(key).export_history.push(formatMetrics(record));
  }

  return [...groups.values()];
}

export function groupProductDestinations(records) {
  return groupBy(
    records,
    (record) => record.country_id?._id && String(record.country_id._id),
    (record) => ({ country: formatCountrySummary(record.country_id) }),
    (record) => publicFields(record, ['hs_code_6_digit', 'itc_hs_8_digit'])
  );
}

export function groupStateExports(records) {
  return groupBy(
    records,
    (record) => record.state_slug,
    (record) => ({ state: { name: record.state_name, slug: record.state_slug } }),
    (record) => publicFields(record, ['state_name', 'state_slug', 'hs_code_6_digit', 'itc_hs_8_digit'])
  );
}

export function groupCountryProducts(records) {
  return groupBy(
    records,
    (record) => record.product_id?._id && String(record.product_id._id),
    (record) => ({ product: formatProductSummary(record.product_id) }),
    (record) => publicFields(record, ['hs_code_6_digit', 'itc_hs_8_digit'])
  );
}
