import { Geography, HsProduct } from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';

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
    return { success: true, products, countries };
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
    return { success: true, items };
  });
}
