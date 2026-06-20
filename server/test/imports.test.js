import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCatalogRecord, validateCatalogRecord } from '../src/modules/imports/catalog-import.service.js';
import { resolveGeography } from '../src/modules/imports/geography.service.js';
import { parseTradeMapWorkbook } from '../src/modules/imports/trade-map-import.service.js';
import {
  parseIndiaCountryExportRows,
  replacementDecision
} from '../src/modules/imports/india-country-export-import.service.js';
import { resolveTradeStatGeography } from '../src/modules/imports/tradestat-geography.service.js';

test('catalog records preserve leading zeroes according to level', () => {
  const chapter = normalizeCatalogRecord({ section: 'I', hscode: 1, description: 'Animals', parent: 'TOTAL', level: 2 });
  const heading = normalizeCatalogRecord({ section: 'I', hscode: 101, description: 'Horses', parent: 1, level: 4 });
  const product = normalizeCatalogRecord({ section: 'I', hscode: 10121, description: 'Pure-bred horses', parent: 101, level: 6 });
  assert.deepEqual([chapter.hscode, heading.hscode, product.hscode], ['01', '0101', '010121']);
  assert.deepEqual([chapter.parent_code, heading.parent_code, product.parent_code], [null, '01', '0101']);
  assert.deepEqual(product && validateCatalogRecord(product), []);
});

test('Trade Map HTML .xls metadata and metrics are parsed by content', async () => {
  const html = `<!doctype html><html><body>
    <table><tr><td>List of exporters for the selected product in 2025</td></tr>
      <tr><td>Product : 100630 Semi-milled or wholly milled rice</td></tr></table>
    <table>
      <tr><th rowspan="2">Exporters</th><th>Select your indicators</th></tr>
      <tr><th>Value exported in 2025 (USD thousand)</th><th>Trade balance in 2025 (USD thousand)</th>
        <th>Quantity exported in 2025</th><th>Quantity Unit</th><th>Unit value (USD/unit)</th>
        <th>Annual growth in value between 2021-2025 (%)</th><th>Annual growth in quantity between 2021-2025 (%)</th>
        <th>Annual growth in value between 2024-2025 (%)</th><th>Share in world exports (%)</th>
        <th>Average distance of importing countries (km)</th><th>Concentration of importing countries</th></tr>
      <tr><td>World</td><td>27637011</td><td>311013</td><td>46179921</td><td>Tons</td><td>598</td><td>9</td><td>4</td><td>-12</td><td>100</td><td>5270</td><td>0.02</td></tr>
      <tr><td>India</td><td>11550357</td><td>11543520</td><td>20422326</td><td>Tons</td><td>566</td><td>9</td><td>3</td><td>3</td><td>41.8</td><td>5284</td><td>0.04</td></tr>
    </table></body></html>`;
  const parsed = await parseTradeMapWorkbook(Buffer.from(html), 'trade-map.xls');
  assert.equal(parsed.hscode, '100630');
  assert.equal(parsed.year, 2025);
  assert.equal(parsed.metrics.length, 2);
  assert.equal(parsed.metrics[0].metric.value_exported_usd_thousand, 27637011);
  assert.equal(parsed.metrics[1].metric.rank, 1);
  assert.equal(parsed.metrics[1].metric.importer_concentration_index, 0.04);
});

test('Trade Map names resolve to canonical ISO geographies and aggregates', () => {
  assert.equal(resolveGeography('Viet Nam').iso3, 'VNM');
  assert.equal(resolveGeography('Taipei, Chinese').iso3, 'TWN');
  assert.equal(resolveGeography('Macao, China').type, 'territory');
  assert.equal(resolveGeography('World').type, 'world');
  assert.equal(resolveGeography('Free Zones').type, 'aggregate');
});

function tradeStatRows(overrides = {}) {
  const header = overrides.header || ['S.No.', 'Country/Region', '2024-2025', '%Share', '2025-2026', '%Share', '%Growth'];
  const total = overrides.total || ["India's Total Export", "India's Total Export", 437704.58, '', 441745.86, '', 0.92];
  return [
    ['TradeStat->Eidb->Export->Country-wise'],
    ['Report Generated on: 19/06/2026 -  Values in US $ Million'],
    header,
    [1, 'AFGHANISTAN', 318.91, 0.0729, 253.63, 0.0574, -20.47],
    [2, 'U S A', 0, 0, 1, 0.0002, ''],
    total
  ];
}

test('TradeStat selected year creates one record per row and uses previous year only for growth', () => {
  const parsed = parseIndiaCountryExportRows(tradeStatRows());
  assert.equal(parsed.currentYear.label, '2025-2026');
  assert.equal(parsed.previousYear.label, '2024-2025');
  assert.equal(parsed.destinationCount, 2);
  assert.equal(parsed.records.length, 3);
  assert.equal(parsed.records[0].currentValue, 253.63);
  assert.equal(parsed.records[0].yoyGrowthPercent, -20.469725);
  assert.equal('previousValue' in parsed.records[0], false);
  assert.equal(parsed.records[1].yoyGrowthPercent, null);
  assert.equal(parsed.records.at(-1).sourceName, "India's Total Export");
  assert.equal(parsed.records.at(-1).sharePercent, 100);
});

test('TradeStat parser rejects malformed years and missing totals', () => {
  assert.throws(
    () => parseIndiaCountryExportRows(tradeStatRows({ header: ['S.No.', 'Country/Region', '2023-2024', '%Share', '2025-2026', '%Share', '%Growth'] })),
    /consecutive financial years/
  );
  assert.throws(
    () => parseIndiaCountryExportRows(tradeStatRows().slice(0, -1)),
    /Total Export row/
  );
});

test('TradeStat parser accepts common report-date formats', () => {
  const variants = [
    'Report Generated on: 19-06-2026 - Values in US $ Million',
    'Report Generated on: 2026-06-19 - Values in US $ Million',
    'Report Generated on: 19 June 2026 - Values in US $ Million'
  ];
  variants.forEach((reportLine) => {
    const rows = tradeStatRows();
    rows[1][0] = reportLine;
    assert.equal(parseIndiaCountryExportRows(rows).reportDate.toISOString(), '2026-06-19T00:00:00.000Z');
  });
});

test('TradeStat aliases resolve to canonical geographies', () => {
  assert.equal(resolveTradeStatGeography('U S A').iso3, 'USA');
  assert.equal(resolveTradeStatGeography('U ARAB EMTS').iso3, 'ARE');
  assert.equal(resolveTradeStatGeography('BR VIRGN IS').iso3, 'VGB');
  assert.equal(resolveTradeStatGeography('UNSPECIFIED').type, 'aggregate');
  assert.equal(resolveTradeStatGeography("India's Total Export").type, 'world');
});

test('country export revision rules protect newer and final records', () => {
  const existing = {
    period_status: 'final',
    source_report_date: new Date('2026-06-19'),
    export_value_usd_million: 100,
    share_percent: 2,
    yoy_growth_percent: 5
  };
  assert.equal(replacementDecision(existing, { ...existing, period_status: 'ytd', source_report_date: new Date('2026-07-01') }), 'skip_final_downgrade');
  assert.equal(replacementDecision(existing, { ...existing, source_report_date: new Date('2026-06-18') }), 'skip_older_report');
  assert.equal(replacementDecision(existing, { ...existing }), 'unchanged');
  assert.equal(replacementDecision(existing, { ...existing, export_value_usd_million: 101 }), 'update');
  assert.equal(replacementDecision(null, existing), 'create');
});
