import {
  Opportunity,
  Product,
  ProductCountryExport,
  ProductExportYear,
  ProductWorldPosition,
  StateProductExport
} from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';
import { isObjectId } from '../../utils/object-id.js';

async function findProduct(id) {
  const filters = isObjectId(id)
    ? [{ _id: id }]
    : [{ product_uid: id }, { itc_hs_8_digit: id }, { product_name_slug: id }];
  return Product.findOne({ $or: filters }).lean();
}

export default async function productRoutes(app) {
  app.get('/', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 24), 1), 100);
    const query = {};

    if (request.query.q) {
      query.search_text = { $regex: escapeRegex(request.query.q), $options: 'i' };
    }
    if (request.query.sector) query.sector = request.query.sector;
    if (request.query.category) query.product_category = request.query.category;
    if (request.query.hs) query.hs_code_6_digit = String(request.query.hs);

    const [items, total] = await Promise.all([
      Product.find(query)
        .sort({ product_name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(query)
    ]);

    return { success: true, items, page, limit, total };
  });

  app.get('/by-hs/:hsCode', async (request) => {
    const hsCode = String(request.params.hsCode);
    const query = hsCode.length === 2 ? { hs_chapter: hsCode } : { hs_code_6_digit: hsCode };
    const items = await Product.find(query).sort({ product_name: 1 }).lean();
    return { success: true, items };
  });

  app.get('/:id', async (request, reply) => {
    const product = await findProduct(request.params.id);
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    const [exportYears, topDestinations, stateExports, worldPosition, opportunities] = await Promise.all([
      ProductExportYear.find({ product_id: product._id }).sort({ financial_year: -1 }).lean(),
      ProductCountryExport.find({ product_id: product._id }).populate('country_id').sort({ financial_year: -1, destination_rank: 1 }).lean(),
      StateProductExport.find({ product_id: product._id }).sort({ financial_year: -1, export_value_usd_mn: -1 }).lean(),
      ProductWorldPosition.find({ product_id: product._id }).sort({ financial_year: -1 }).lean(),
      Opportunity.find({ product_id: product._id }).sort({ opportunity_score: -1 }).lean()
    ]);

    return {
      success: true,
      product,
      export_years: exportYears,
      top_destinations: topDestinations,
      state_exports: stateExports,
      world_position: worldPosition,
      opportunities
    };
  });

  app.get('/:id/destinations', async (request, reply) => {
    const product = await findProduct(request.params.id);
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });
    const items = await ProductCountryExport.find({ product_id: product._id }).populate('country_id').sort({ financial_year: -1 }).lean();
    return { success: true, items };
  });

  app.get('/:id/states', async (request, reply) => {
    const product = await findProduct(request.params.id);
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });
    const items = await StateProductExport.find({ product_id: product._id }).sort({ financial_year: -1 }).lean();
    return { success: true, items };
  });

  app.get('/:id/world-position', async (request, reply) => {
    const product = await findProduct(request.params.id);
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });
    const items = await ProductWorldPosition.find({ product_id: product._id }).sort({ financial_year: -1 }).lean();
    return { success: true, items };
  });

  app.get('/:id/opportunities', async (request, reply) => {
    const product = await findProduct(request.params.id);
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });
    const items = await Opportunity.find({ product_id: product._id }).sort({ opportunity_score: -1 }).lean();
    return { success: true, items };
  });
}
