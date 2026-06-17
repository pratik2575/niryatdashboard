import { ImportBatch } from '../../models/index.js';
import { readJsonPayload } from '../../utils/http.js';
import { importProducts } from '../imports/product-import.service.js';
import { importCountries } from '../imports/country-import.service.js';

export default async function adminRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post('/import/products', async (request) => {
    const payload = await readJsonPayload(request);
    return importProducts(payload, {
      fileName: request.uploadedFileName || 'json-body',
      uploadedBy: request.user?.sub || null
    });
  });

  app.post('/import/countries', async (request) => {
    const payload = await readJsonPayload(request);
    return importCountries(payload, {
      fileName: request.uploadedFileName || 'json-body',
      uploadedBy: request.user?.sub || null
    });
  });

  app.get('/imports', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 20), 1), 100);
    const [items, total] = await Promise.all([
      ImportBatch.find()
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ImportBatch.countDocuments()
    ]);

    return { success: true, items, page, limit, total };
  });

  app.get('/imports/:id', async (request, reply) => {
    const batch = await ImportBatch.findById(request.params.id).lean();
    if (!batch) return reply.status(404).send({ success: false, error: 'Import batch not found' });
    return { success: true, item: batch };
  });
}
