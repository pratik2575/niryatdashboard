import { createRequire } from 'node:module';
import { Geography } from '../../models/index.js';
import { slugify } from '../../utils/cleaning.js';

const require = createRequire(import.meta.url);
const isoCountries = require('i18n-iso-countries');
isoCountries.registerLocale(require('i18n-iso-countries/langs/en.json'));

const isoOverrides = new Map(Object.entries({
  'viet nam': 'VNM',
  'taipei, chinese': 'TWN',
  'korea, republic of': 'KOR',
  'tanzania, united republic of': 'TZA',
  'lao people\'s democratic republic': 'LAO',
  'hong kong, china': 'HKG',
  'iran, islamic republic of': 'IRN',
  'moldova, republic of': 'MDA',
  'macao, china': 'MAC',
  'venezuela, bolivarian republic of': 'VEN',
  'macedonia, north': 'MKD',
  'russian federation': 'RUS',
  'syrian arab republic': 'SYR',
  'türkiye': 'TUR',
  'côte d\'ivoire': 'CIV'
}));

const territoryCodes = new Set([
  'ABW', 'AIA', 'ALA', 'ASM', 'BES', 'BLM', 'BMU', 'BVT', 'CCK', 'COK', 'CUW', 'CXR',
  'ESH', 'FLK', 'FRO', 'GGY', 'GIB', 'GLP', 'GRL', 'GUF', 'GUM', 'HKG', 'HMD', 'IMN',
  'IOT', 'JEY', 'MAC', 'MAF', 'MNP', 'MSR', 'MTQ', 'NCL', 'NFK', 'NIU', 'PCN', 'PRI',
  'PSE', 'PYF', 'REU', 'SGS', 'SHN', 'SJM', 'SPM', 'SXM', 'TCA', 'TKL', 'UMI', 'VGB',
  'VIR', 'WLF'
]);

const regionNames = new Set([
  'africa', 'asia', 'europe', 'oceania', 'americas', 'european union', 'other asia, nes',
  'western asia', 'eastern asia', 'southern asia', 'south-eastern asia', 'northern america',
  'latin america and the caribbean'
]);

export function resolveIso3(iso3, fallbackName = iso3) {
  const code = String(iso3 || '').toUpperCase();
  const iso2 = isoCountries.alpha3ToAlpha2(code);
  if (!iso2) return null;
  const name = isoCountries.getName(code, 'en') || fallbackName;
  return {
    key: code,
    name,
    slug: slugify(name),
    type: territoryCodes.has(code) ? 'territory' : 'country',
    iso2,
    iso3: code,
    resolved: true
  };
}

export function resolveGeography(reportedName) {
  const name = String(reportedName || '').trim();
  const normalized = name.toLocaleLowerCase('en');
  if (normalized === 'world') {
    return { key: 'world', name: 'World', slug: 'world', type: 'world', iso2: null, iso3: null, resolved: true };
  }

  const iso3 = isoOverrides.get(normalized)
    || isoCountries.getAlpha3Code(name, 'en')
    || null;
  if (iso3) {
    return resolveIso3(iso3, name);
  }

  const type = regionNames.has(normalized) ? 'region' : normalized.includes('zone') ? 'aggregate' : 'other';
  return { key: `${type}:${slugify(name)}`, name, slug: slugify(name), type, iso2: null, iso3: null, resolved: type !== 'other' };
}

export async function upsertGeography(reportedName) {
  const resolved = resolveGeography(reportedName);
  return upsertResolvedGeography(resolved, reportedName);
}

export async function upsertResolvedGeography(resolved, reportedName = resolved.name) {
  const geography = await Geography.findOneAndUpdate(
    { key: resolved.key },
    {
      $set: {
        name: resolved.name, slug: resolved.slug, type: resolved.type,
        iso2: resolved.iso2, iso3: resolved.iso3
      },
      $addToSet: { aliases: reportedName }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { geography, resolved: resolved.resolved };
}
