# Niryat Portal

Niryat Portal stores three source datasets:

1. Base HS catalog (`section`, `hscode`, `description`, `parent`, `level`).
2. Global exporter metrics from one Trade Map workbook per HS code and calendar year.
3. India destination-country exports from one TradeStat workbook per selected financial year.

## Data model

- `hs_products` — canonical HS records at level 2, 4, or 6.
- `geographies` — canonical countries, territories and non-ISO aggregates with source aliases.
- `export_snapshots` — global exporter metrics by HS code, calendar year and geography.
- `india_destination_export_annual` — India export value, share, growth and rank by destination and financial year.
- `import_batches_v2`, `import_issues` and GridFS `import_files` — upload audit and retained sources.

Legacy collections from the previous model are not read or modified.

## Imports

### HS catalog

`POST /api/admin/import/catalog`

Accepts `.xlsx`, `.csv`, `.json`, and HTML-based `.xls`. Level 2/4 categories are active by default; level 6 products activate after their first Trade Map import.

### Trade Map exports

`POST /api/admin/import/trade-map`

Imports one HS code and calendar year. Trade Map HTML `.xls` downloads are detected by content.

### India country-wise exports

`POST /api/admin/import/india-country-exports/preview`

Uploads a TradeStat `.xlsx` once and creates a retained preview. Only the right-hand financial year is stored; the left-hand year validates growth. Unknown source names must be mapped before confirmation through `POST /api/admin/imports/:id/confirm`.

Pending previews can be resumed or cancelled. Newer report dates replace older records, identical confirmed files are rejected as duplicates, and final periods cannot be downgraded by YTD uploads.

## Main APIs

- `GET /api/products`
- `GET /api/products/:id?year=2025`
- `GET /api/countries`
- `GET /api/countries/:id`
- `GET /api/countries/:id/india-export-history`
- `GET /api/india-exports/periods`
- `GET /api/india-exports/summary?financial_year=2025-2026`
- `GET /api/india-exports/destinations?financial_year=2025-2026`
- `GET /api/admin/india-country-exports`
- `GET /api/admin/imports/:id`
- `GET /api/admin/imports/:id/source`

Admin routes require `Authorization: Bearer <token>`.

## Run

```bash
npm install
npm run dev
```

Required environment variables are `MONGODB_URI`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Configure `JWT_SECRET` in production.

Sync indexes with:

```bash
node server/src/scripts/sync-indexes.js
```
