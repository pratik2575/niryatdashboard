import { ExportSnapshot, Geography } from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';
import { isObjectId } from '../../utils/object-id.js';

async function findGeography(id) {
  const value = String(id);
  const filters = isObjectId(value)
    ? [{ _id: value }]
    : [{ key: value.toUpperCase() }, { slug: value.toLowerCase() }, { iso2: value.toUpperCase() }, { iso3: value.toUpperCase() }];
  return Geography.findOne({ $or: filters }).lean();
}

export default async function countryRoutes(app) {
  app.get('/', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 50), 1), 200);
    const query = {};
    if (request.query.type) query.type = request.query.type;
    if (request.query.q) {
      const regex = { $regex: escapeRegex(request.query.q), $options: 'i' };
      query.$or = [{ name: regex }, { aliases: regex }, { iso2: regex }, { iso3: regex }];
    }
    const [items, total] = await Promise.all([
      Geography.find(query).sort({ type: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Geography.countDocuments(query)
    ]);
    return { success: true, items, page, limit, total, total_pages: Math.ceil(total / limit) };
  });

  app.get('/:id', async (request, reply) => {
    const geography = await findGeography(request.params.id);
    if (!geography) return reply.status(404).send({ success: false, error: 'Geography not found' });
    const query = { geography_id: geography._id };
    if (request.query.year) query.year = Number(request.query.year);
    const snapshots = await ExportSnapshot.find(query).populate('product_id').sort({ year: -1, hscode: 1 }).lean();
    return { success: true, data: { geography, export_metrics: snapshots } };
  });
}
