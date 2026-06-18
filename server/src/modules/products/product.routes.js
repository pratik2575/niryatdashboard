import { ExportSnapshot, HsProduct } from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';
import { isObjectId } from '../../utils/object-id.js';

async function findProduct(id) {
  const value = String(id).trim();
  const query = isObjectId(value) ? { _id: value } : { hscode: value.replace(/\D/g, '') };
  return HsProduct.findOne(query).lean();
}

export default async function productRoutes(app) {
  app.get('/', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 50), 1), 200);
    const query = { is_active: true };
    if (request.query.parent !== undefined) query.parent_code = String(request.query.parent).replace(/\D/g, '');
    if (request.query.level) query.level = Number(request.query.level);
    if (request.query.hs) query.hscode = String(request.query.hs).replace(/\D/g, '');
    if (request.query.q) {
      const regex = { $regex: escapeRegex(request.query.q), $options: 'i' };
      query.$or = [{ hscode: regex }, { description: regex }];
    }
    const [items, total] = await Promise.all([
      HsProduct.find(query).sort({ hscode: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      HsProduct.countDocuments(query)
    ]);
    return { success: true, items, page, limit, total, total_pages: Math.ceil(total / limit) };
  });

  app.get('/by-hs/:hscode', async (request, reply) => {
    const product = await HsProduct.findOne({ hscode: String(request.params.hscode).replace(/\D/g, '') }).lean();
    if (!product) return reply.status(404).send({ success: false, error: 'HS product not found' });
    const children = await HsProduct.find({ parent_code: product.hscode, is_active: true }).sort({ hscode: 1 }).lean();
    return { success: true, product, items: children, total: children.length };
  });

  app.get('/:id', async (request, reply) => {
    const product = await findProduct(request.params.id);
    if (!product) return reply.status(404).send({ success: false, error: 'HS product not found' });
    const years = await ExportSnapshot.distinct('year', { product_id: product._id });
    years.sort((a, b) => b - a);
    const selectedYear = request.query.year ? Number(request.query.year) : years[0];
    const metrics = selectedYear
      ? await ExportSnapshot.find({ product_id: product._id, year: selectedYear })
        .populate('geography_id').sort({ rank: 1, value_exported_usd_thousand: -1 }).lean()
      : [];
    return { success: true, data: { product, available_years: years, selected_year: selectedYear || null, export_metrics: metrics } };
  });
}
