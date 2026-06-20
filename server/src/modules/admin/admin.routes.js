import mongoose from 'mongoose';
import { Geography, HsProduct, ImportBatch, ImportIssue, IndiaDestinationExportAnnual } from '../../models/index.js';
import { readJsonPayload, readMultipartUpload } from '../../utils/http.js';
import { importHsCatalog } from '../imports/catalog-import.service.js';
import { importTradeMapExports } from '../imports/trade-map-import.service.js';
import {
  cancelIndiaCountryExportPreview,
  confirmIndiaCountryExports,
  previewIndiaCountryExports
} from '../imports/india-country-export-import.service.js';
import { escapeRegex } from '../../utils/cleaning.js';

export default async function adminRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post('/import/catalog', async (request) => {
    if (request.isMultipart()) {
      const upload = await readMultipartUpload(request);
      return importHsCatalog(null, { ...upload, uploadedBy: request.user?.sub || null });
    }
    return importHsCatalog(await readJsonPayload(request), {
      fileName: 'json-body', uploadedBy: request.user?.sub || null
    });
  });

  app.post('/import/trade-map', async (request) => {
    const upload = await readMultipartUpload(request);
    return importTradeMapExports(upload.buffer, {
      ...upload,
      hscode: upload.fields.hscode,
      year: upload.fields.year,
      uploadedBy: request.user?.sub || null
    });
  });

  app.post('/import/india-country-exports/preview', async (request) => {
    const upload = await readMultipartUpload(request);
    return previewIndiaCountryExports(upload.buffer, {
      ...upload,
      periodStatus: upload.fields.period_status,
      uploadedBy: request.user?.sub || null
    });
  });

  app.post('/imports/:id/confirm', async (request) => {
    return confirmIndiaCountryExports(request.params.id, { mappings: request.body?.mappings || [] });
  });

  app.delete('/imports/:id', async (request) => cancelIndiaCountryExportPreview(request.params.id));

  app.get('/geographies', async (request) => {
    const limit = Math.min(Math.max(Number(request.query.limit || 500), 1), 500);
    const query = {};
    if (request.query.q) {
      const regex = { $regex: escapeRegex(request.query.q), $options: 'i' };
      query.$or = [{ name: regex }, { aliases: regex }, { iso2: regex }, { iso3: regex }];
    }
    const items = await Geography.find(query).sort({ type: 1, name: 1 }).limit(limit).lean();
    return { success: true, items, total: items.length };
  });

  app.get('/india-country-exports', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 50), 1), 200);
    const query = {};
    if (request.query.financial_year) query.financial_year = request.query.financial_year;
    if (request.query.period_status) query.period_status = request.query.period_status;
    if (request.query.q) {
      const regex = { $regex: escapeRegex(request.query.q), $options: 'i' };
      const geographies = await Geography.find({ $or: [{ name: regex }, { aliases: regex }, { iso2: regex }, { iso3: regex }] }).select('_id').lean();
      query.destination_geography_id = { $in: geographies.map((item) => item._id) };
    }
    const [items, total, years] = await Promise.all([
      IndiaDestinationExportAnnual.find(query)
        .populate('destination_geography_id')
        .sort({ fiscal_year_start: -1, rank: 1, export_value_usd_million: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      IndiaDestinationExportAnnual.countDocuments(query),
      IndiaDestinationExportAnnual.distinct('financial_year')
    ]);
    years.sort().reverse();
    return { success: true, items, years, page, limit, total, total_pages: Math.ceil(total / limit) };
  });

  app.get('/products', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 50), 1), 200);
    const query = {};
    if (request.query.active === 'true') query.is_active = true;
    if (request.query.active === 'false') query.is_active = false;
    if (request.query.level) query.level = Number(request.query.level);
    if (request.query.q) {
      const escaped = String(request.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ hscode: new RegExp(escaped, 'i') }, { description: new RegExp(escaped, 'i') }];
    }
    const [items, total] = await Promise.all([
      HsProduct.find(query).sort({ hscode: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      HsProduct.countDocuments(query)
    ]);
    return { success: true, items, page, limit, total, total_pages: Math.ceil(total / limit) };
  });

  app.get('/imports', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 20), 1), 100);
    const [items, total] = await Promise.all([
      ImportBatch.find().sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ImportBatch.countDocuments()
    ]);
    return { success: true, items, page, limit, total };
  });

  app.get('/imports/:id', async (request, reply) => {
    const batch = await ImportBatch.findById(request.params.id).lean();
    if (!batch) return reply.status(404).send({ success: false, error: 'Import batch not found' });
    const issues = await ImportIssue.find({ import_batch_id: batch._id }).sort({ row_number: 1 }).limit(500).lean();
    return { success: true, item: batch, issues };
  });

  app.get('/imports/:id/source', async (request, reply) => {
    const batch = await ImportBatch.findById(request.params.id).lean();
    if (!batch?.source_file?.storage_id) return reply.status(404).send({ success: false, error: 'Source file not found' });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: batch.source_file.bucket });
    reply.header('Content-Type', batch.source_file.mime_type);
    reply.header('Content-Disposition', `attachment; filename="${batch.source_file.file_name.replace(/"/g, '')}"`);
    return reply.send(bucket.openDownloadStream(batch.source_file.storage_id));
  });
}
