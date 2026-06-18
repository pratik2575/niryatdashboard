# Niryat Portal

Fastify, MongoDB, and React Vite implementation for the Niryat Portal export intelligence admin and public API surface.

## Structure

```txt
server/
  src/
    app.js
    server.js
    config/
    plugins/
    modules/
    models/
    utils/
    scripts/
client/
  src/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure the backend:

```bash
cp server/.env.example server/.env
```

Set:

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/niryat_portal
JWT_SECRET=replace-with-a-long-secret
NODE_ENV=development
ADMIN_EMAIL=admin@niryat.local
ADMIN_PASSWORD=change-me
```

3. Start the backend:

```bash
npm run dev:server
```

4. Start the Vite client:

```bash
npm run dev:client
```

The client runs at `http://localhost:5173` and proxies `/api` to `http://localhost:4000`.
The default web app route opens the admin data listing workflow. Products and countries can be listed, searched, and updated by uploading JSON.

## Admin Routes

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/admin/import/products`
- `POST /api/admin/import/countries`
- `GET /api/admin/imports`
- `GET /api/admin/imports/:id`

Admin import routes require `Authorization: Bearer <token>`.

Both import endpoints accept either a JSON request body or a multipart JSON file field.
Product uploads can be sent as a direct array of product objects:

```json
[
  {
    "hs_chapter": "04",
    "hs_code_6_digit": "040900",
    "product_name": "Natural Honey"
  }
]
```

Country uploads can be sent as a direct array of country objects, or as an object containing `india_export_summary` and `countries`.

## Public APIs

- `GET /health`
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/by-hs/:hsCode`
- `GET /api/products/:id/destinations`
- `GET /api/products/:id/states`
- `GET /api/products/:id/world-position`
- `GET /api/products/:id/opportunities`
- `GET /api/countries`
- `GET /api/countries/:id`
- `GET /api/countries/:id/export-years`
- `GET /api/countries/:id/business-insights`
- `GET /api/countries/:id/fastest-growing-profile`
- `GET /api/search?q=`
- `GET /api/search/products?q=`
- `GET /api/search/countries?q=`

### Catalog response format

Product and country list endpoints return compact summaries in `items` plus `page`, `limit`, `total`, and `total_pages`.
The detail endpoints return normalized page-ready data:

```json
{
  "success": true,
  "data": {
    "product": {},
    "export_history": [],
    "destinations": [],
    "states": [],
    "world_position": [],
    "opportunities": []
  }
}
```

Country detail uses `country`, `export_history`, `products`, `business_insights`, and `growth_profile`.
Destination, state, and country-product records are grouped by entity with an `export_history` array, preventing identity and classification data from being repeated for each financial year. Internal import fields, raw payloads, embeddings, and database relationship IDs are not exposed.

## Data Model Notes

Uploaded JSON is normalized into separate MongoDB collections:

- `hs_chapters`
- `hs_codes`
- `products`
- `product_export_years`
- `countries`
- `country_export_years`
- `product_country_exports`
- `state_product_exports`
- `product_world_positions`
- `opportunities`
- `country_business_insights`
- `fastest_growing_country_profiles`
- `india_export_summaries`
- `import_batches`
- `admin_users`

Product uniqueness uses `itc_hs_8_digit` when present. When the 8-digit code is missing, uniqueness falls back to `hs_code_6_digit + product_name_slug`.

Country uniqueness uses `iso_code` when present. When ISO is missing, uniqueness falls back to `country_slug`.

## Indexes

Mongoose creates indexes automatically in development. To explicitly sync indexes:

```bash
node server/src/scripts/sync-indexes.js
```

## Vector Search Preparation

`server/src/modules/search/vector.service.js` contains stubs for:

- `generateProductEmbeddingText(product)`
- `generateCountryEmbeddingText(country)`
- `semanticProductSearch(query)`
- `semanticCountrySearch(query)`

The semantic search methods currently return a clean fallback response until an embedding provider and Atlas Vector Search configuration are added.
