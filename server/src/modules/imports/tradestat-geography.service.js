import { resolveGeography, resolveIso3 } from './geography.service.js';
import { slugify } from '../../utils/cleaning.js';

const isoAliases = new Map(Object.entries({
  'AMERI SAMOA': 'American Samoa',
  ANTARTICA: 'Antarctica',
  ANTIGUA: 'Antigua and Barbuda',
  'BAHARAIN IS': 'Bahrain',
  'BANGLADESH PR': 'Bangladesh',
  'BOSNIA-HRZGOVIN': 'Bosnia and Herzegovina',
  'BR VIRGN IS': 'British Virgin Islands',
  'BRITISH INDIAN': 'British Indian Ocean Territory',
  BRUNEI: 'Brunei Darussalam',
  'C AFRI REP': 'Central African Republic',
  'CAPE VERDE IS': 'Cabo Verde',
  'CAYMAN IS': 'Cayman Islands',
  'CHINA P RP': 'China',
  'CHRISTMAS IS.': 'Christmas Island',
  'COCOS IS': 'Cocos (Keeling) Islands',
  'CONGO D. REP.': 'Democratic Republic of the Congo',
  'CONGO P REP': 'Republic of the Congo',
  'COOK IS': 'Cook Islands',
  "COTE D' IVOIRE": "Côte d'Ivoire",
  CURACAO: 'Curaçao',
  'DOMINIC REP': 'Dominican Republic',
  'EGYPT A RP': 'Egypt',
  'EQUTL GUINEA': 'Equatorial Guinea',
  'FALKLAND IS': 'Falkland Islands',
  'FAROE IS.': 'Faroe Islands',
  'FIJI IS': 'Fiji',
  'FR GUIANA': 'French Guiana',
  'FR POLYNESIA': 'French Polynesia',
  'GUINEA BISSAU': 'Guinea-Bissau',
  'KIRIBATI REP': 'Kiribati',
  'KOREA DP RP': 'North Korea',
  'KOREA RP': 'South Korea',
  KYRGHYZSTAN: 'Kyrgyzstan',
  'LAO PD RP': 'Laos',
  MACEDONIA: 'North Macedonia',
  'MARSHALL ISLAND': 'Marshall Islands',
  MICRONESIA: 'Micronesia',
  MOLDOVA: 'Moldova',
  'N. MARIANA IS.': 'Northern Mariana Islands',
  'NAURU RP': 'Nauru',
  NETHERLAND: 'Netherlands',
  'NORFOLK IS': 'Norfolk Island',
  'PAKISTAN IR': 'Pakistan',
  'PANAMA REPUBLIC': 'Panama',
  'PAPUA N GNA': 'Papua New Guinea',
  'PITCAIRN IS.': 'Pitcairn',
  'SAHARWI A.DM RP': 'Western Sahara',
  'SAO TOME': 'Sao Tome and Principe',
  'SAUDI ARAB': 'Saudi Arabia',
  'SLOVAK REP': 'Slovakia',
  'SOLOMON IS': 'Solomon Islands',
  'SRI LANKA DSR': 'Sri Lanka',
  'ST HELENA': 'Saint Helena',
  'ST KITT N A': 'Saint Kitts and Nevis',
  'ST LUCIA': 'Saint Lucia',
  'ST VINCENT': 'Saint Vincent and the Grenadines',
  'STATE OF PALEST': 'Palestine',
  'SVALLBARD AND J': 'Svalbard and Jan Mayen',
  SWAZILAND: 'Eswatini',
  SYRIA: 'Syria',
  'TANZANIA REP': 'Tanzania',
  'TIMOR LESTE': 'Timor-Leste',
  'TOKELAU IS': 'Tokelau',
  TRINIDAD: 'Trinidad and Tobago',
  'TURKS C IS': 'Turks and Caicos Islands',
  'U ARAB EMTS': 'United Arab Emirates',
  'U K': 'United Kingdom',
  'U S A': 'United States of America',
  'US MINOR OUTLYING ISLANDS': 'United States Minor Outlying Islands',
  'VANUATU REP': 'Vanuatu',
  'VATICAN CITY': 'Vatican City',
  'VIETNAM SOC REP': 'Viet Nam',
  'VIRGIN IS US': 'United States Virgin Islands',
  'WALLIS F IS': 'Wallis and Futuna',
  'YEMEN REPUBLC': 'Yemen'
}));

const knownAggregates = new Map([
  ['INSTALLATIONS IN INTERNATIONAL WATERS', 'Installations in International Waters'],
  ['UNSPECIFIED', 'Unspecified'],
  ['NETHERLANDANTIL', 'Netherlands Antilles'],
  ['UNION OF SERBIA & MONTENEGRO', 'Serbia and Montenegro']
]);

const forcedIso3 = new Map(Object.entries({
  'BR VIRGN IS': 'VGB',
  'CAPE VERDE IS': 'CPV',
  'FALKLAND IS': 'FLK',
  'LAO PD RP': 'LAO',
  MICRONESIA: 'FSM',
  MOLDOVA: 'MDA',
  SYRIA: 'SYR',
  'VATICAN CITY': 'VAT',
  'VIRGIN IS US': 'VIR'
}));

export function resolveTradeStatGeography(reportedName) {
  const sourceName = String(reportedName || '').trim();
  if (/^India's Total Export$/i.test(sourceName)) return resolveGeography('World');
  const upper = sourceName.toUpperCase();
  if (knownAggregates.has(upper)) {
    const name = knownAggregates.get(upper);
    return {
      key: `aggregate:${slugify(name)}`,
      name,
      slug: slugify(name),
      type: 'aggregate',
      iso2: null,
      iso3: null,
      resolved: true
    };
  }
  if (forcedIso3.has(upper)) return resolveIso3(forcedIso3.get(upper), sourceName);
  return resolveGeography(isoAliases.get(upper) || sourceName);
}
