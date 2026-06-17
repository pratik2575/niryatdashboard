import { Country, Product } from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';

function searchRegex(q) {
  return { $regex: escapeRegex(q), $options: 'i' };
}

async function productSearch(q, limit = 10) {
  const regex = searchRegex(q);
  return Product.find({
    $or: [
      { search_text: regex },
      { product_name: regex },
      { hs_code_6_digit: regex },
      { itc_hs_8_digit: regex },
      { sector: regex },
      { product_category: regex },
      { 'policy.export_policy': regex }
    ]
  })
    .limit(limit)
    .sort({ product_name: 1 })
    .lean();
}

async function countrySearch(q, limit = 10) {
  const regex = searchRegex(q);
  return Country.find({
    $or: [
      { search_text: regex },
      { country_name: regex },
      { iso_code: regex },
      { region: regex },
      { continent: regex },
      { 'trade_profile.major_products_exported': regex },
      { 'trade_profile.top_hs_chapters': regex },
      { 'trade_profile.fta_trade_agreement_status': regex }
    ]
  })
    .limit(limit)
    .sort({ country_name: 1 })
    .lean();
}

export default async function searchRoutes(app) {
  app.get('/', async (request) => {
    const q = String(request.query.q || '').trim();
    if (!q) return { success: true, products: [], countries: [] };
    const limit = Math.min(Number(request.query.limit || 10), 50);
    const [products, countries] = await Promise.all([productSearch(q, limit), countrySearch(q, limit)]);
    return { success: true, products, countries };
  });

  app.get('/products', async (request) => {
    const q = String(request.query.q || '').trim();
    if (!q) return { success: true, items: [] };
    const items = await productSearch(q, Math.min(Number(request.query.limit || 20), 100));
    return { success: true, items };
  });

  app.get('/countries', async (request) => {
    const q = String(request.query.q || '').trim();
    if (!q) return { success: true, items: [] };
    const items = await countrySearch(q, Math.min(Number(request.query.limit || 20), 100));
    return { success: true, items };
  });
}
