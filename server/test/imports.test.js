import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCatalogRecord, validateCatalogRecord } from '../src/modules/imports/catalog-import.service.js';
import { resolveGeography } from '../src/modules/imports/geography.service.js';
import { parseTradeMapWorkbook } from '../src/modules/imports/trade-map-import.service.js';

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
