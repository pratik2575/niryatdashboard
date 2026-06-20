import { Geography, HsProduct, IndiaDestinationExportAnnual } from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';

async function withLatestIndiaExports(countries) {
  if (!countries.length) return countries;
  const rows = await IndiaDestinationExportAnnual.aggregate([
    { $match: { destination_geography_id: { $in: countries.map((item) => item._id) } } },
    { $sort: { fiscal_year_start: -1 } },
    { $group: { _id: '$destination_geography_id', latest: { $first: '$$ROOT' } } }
  ]);
  const byId = new Map(rows.map((row) => [String(row._id), row.latest]));
  return countries.map((country) => ({ ...country, latest_india_export: byId.get(String(country._id)) || null }));
}

export default async function searchRoutes(app) {
  app.get('/', async (request) => {
    const q = String(request.query.q || '').trim();
    if (!q) return { success: true, products: [], countries: [] };
    const limit = Math.min(Number(request.query.limit || 10), 50);
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    const [products, countries] = await Promise.all([
      HsProduct.find({ is_active: true, $or: [{ hscode: regex }, { description: regex }] }).sort({ hscode: 1 }).limit(limit).lean(),
      Geography.find({ $or: [{ name: regex }, { aliases: regex }, { iso2: regex }, { iso3: regex }] }).sort({ name: 1 }).limit(limit).lean()
    ]);
    return { success: true, products, countries: await withLatestIndiaExports(countries) };
  });

  app.get('/products', async (request) => {
    const q = String(request.query.q || '').trim();
    if (!q) return { success: true, items: [] };
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    const items = await HsProduct.find({ is_active: true, $or: [{ hscode: regex }, { description: regex }] }).limit(100).lean();
    return { success: true, items };
  });

  app.get('/countries', async (request) => {
    const q = String(request.query.q || '').trim();
    if (!q) return { success: true, items: [] };
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    const items = await Geography.find({ $or: [{ name: regex }, { aliases: regex }, { iso2: regex }, { iso3: regex }] }).limit(100).lean();
    return { success: true, items: await withLatestIndiaExports(items) };
  });
}
