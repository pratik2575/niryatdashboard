export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value).trim();
  if (!text || /^n\/?a$/i.test(text) || /not comparable/i.test(text)) return null;

  const multiplier = /\bbn\b|billion/i.test(text) ? 1000 : 1;
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) * multiplier : null;
}

export function parsePercent(value) {
  return parseNumber(value);
}

export function splitCommaList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeFinancialYear(value) {
  if (!value) return null;
  const text = String(value).trim().replace(/^fy\s*/i, '').replace(/_/g, '-');
  const full = text.match(/(20\d{2})\s*[-/]\s*(\d{2})/);
  if (full) return `${full[1]}-${full[2]}`;

  const compact = text.match(/(20\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}`;

  return text;
}

export function removeNullFields(value) {
  if (Array.isArray(value)) {
    return value.map(removeNullFields).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, removeNullFields(item)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return value === undefined ? undefined : value;
}

export function buildSearchText(parts) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part) => part !== null && part !== undefined && part !== '')
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(' ');
}

export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractYearlyMetrics(record = {}) {
  const metrics = new Map();

  for (const [key, value] of Object.entries(record || {})) {
    const match = key.match(/(.+?)_?fy_?(20\d{2})_?(\d{2})(.*)/i);
    if (!match) continue;

    const [, prefix, startYear, endYear, suffix] = match;
    const financialYear = `${startYear}-${endYear}`;
    const bucket = metrics.get(financialYear) || { financial_year: financialYear };
    const normalizedKey = `${prefix}${suffix}`
      .toLowerCase()
      .replace(/^_+|_+$/g, '')
      .replace(/__+/g, '_');

    if (/export.*usd.*mn|export_value/i.test(normalizedKey)) {
      bucket.export_value_usd_mn = parseNumber(value);
    } else if (/quantity|qty/i.test(normalizedKey)) {
      bucket.quantity = value;
    } else if (/yoy/i.test(normalizedKey)) {
      bucket.yoy_growth_percent = parsePercent(value);
    } else if (/cagr|three_year/i.test(normalizedKey)) {
      bucket.three_year_cagr_percent = parsePercent(value);
    } else if (/share/i.test(normalizedKey)) {
      bucket.share_percent = parsePercent(value);
    } else if (/rank/i.test(normalizedKey)) {
      bucket.rank = parseNumber(value);
    }

    metrics.set(financialYear, bucket);
  }

  return [...metrics.values()].sort((a, b) => b.financial_year.localeCompare(a.financial_year));
}

export function pick(source, keys, fallback = null) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return fallback;
}
