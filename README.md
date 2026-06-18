# Niryat Portal

Niryat Portal stores exactly two source datasets:

1. The base HS catalog (`section`, `hscode`, `description`, `parent`, `level`).
2. Country/geography export metrics from one Trade Map workbook per HS code and calendar year.

## Data model

- `hs_products` — one canonical HS record at level 2, 4, or 6. Level 2/4 categories are active by default; level 6 products activate after their first successful Trade Map import.
- `geographies` — canonical ISO-identified countries/territories plus non-ISO rows such as World, regions, and Free Zones. Every Trade Map spelling is retained as an alias.
- `export_snapshots` — one row per HS code, year, and geography, with the values in the original Trade Map units.
- `import_batches_v2` — upload status, target HS/year, counts, uploader, and source-file metadata.
- `import_issues` — row-level warnings and errors.
- `import_files.files` / `import_files.chunks` — original uploads retained through MongoDB GridFS.

The unique snapshot key is `(product_id, year, geography_id)`. Re-uploading the same HS code and year replaces those geography snapshots while preserving both import audit records and both original source files.

Legacy collections from the previous model are not read or modified.

## Import behavior

### HS catalog

`POST /api/admin/import/catalog`

Accepted files: `.xlsx`, `.csv`, `.json`, and HTML-based `.xls`. Binary `.xls` must first be saved as `.xlsx` or CSV. HS codes are padded according to `level`, so level 4 value `101` becomes `0101`.

Catalog records begin inactive at level 6. Level 2 and level 4 categories remain active so they can be used for navigation. Fetching children through the public product API always returns only active children.

### Trade Map exports

`POST /api/admin/import/trade-map`

Upload one Trade Map file for one HS code and one year. The importer extracts both values from the workbook title/header. Optional `hscode` and `year` form fields act as confirmations and cause the import to fail if they disagree with the file.

Trade Map `.xls` downloads are detected as HTML by content rather than extension. All supplied metrics remain in their source units, including USD thousand and Tons.

## Main APIs

- `GET /api/products` — active catalog records only
- `GET /api/products?parent=10` — active direct children of HS 10
- `GET /api/products/by-hs/1006` — category and active children
- `GET /api/products/100630?year=2025` — product and exporter metrics
- `GET /api/countries` — all canonical and aggregate geographies
- `GET /api/countries/IND?year=2025` — exports reported for a geography
- `GET /api/admin/products` — complete active/inactive catalog
- `GET /api/admin/imports/:id` — batch plus row-level issues
- `GET /api/admin/imports/:id/source` — retained source file

Admin routes require `Authorization: Bearer <token>`.

## Run

```bash
npm install
npm run dev
```

Required environment variables are `MONGODB_URI`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Configure `JWT_SECRET` in production.

Sync the new indexes with:

```bash
node server/src/scripts/sync-indexes.js
```
