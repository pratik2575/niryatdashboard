import { Geography, IndiaDestinationExportAnnual } from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';

async function selectedPeriod(requested) {
  if (requested) return requested;
  const latest = await IndiaDestinationExportAnnual.findOne().sort({ fiscal_year_start: -1 }).select('financial_year').lean();
  return latest?.financial_year || null;
}

export default async function indiaExportRoutes(app) {
  app.get('/periods', async () => {
    const world = await Geography.findOne({ key: 'world' }).lean();
    const rows = world
      ? await IndiaDestinationExportAnnual.find({ destination_geography_id: world._id }).sort({ fiscal_year_start: -1 }).lean()
      : [];
    return {
      success: true,
      items: rows.map((row) => ({
        financial_year: row.financial_year,
        fiscal_year_start: row.fiscal_year_start,
        period_status: row.period_status
      }))
    };
  });

  app.get('/summary', async (request, reply) => {
    const financialYear = await selectedPeriod(request.query.financial_year);
    if (!financialYear) return reply.status(404).send({ success: false, error: 'No India destination export data is available' });
    const world = await Geography.findOne({ key: 'world' }).lean();
    const total = world
      ? await IndiaDestinationExportAnnual.findOne({ financial_year: financialYear, destination_geography_id: world._id }).lean()
      : null;
    if (!total) return reply.status(404).send({ success: false, error: `No total is available for ${financialYear}` });
    const [destinationCount, topDestinations] = await Promise.all([
      IndiaDestinationExportAnnual.countDocuments({ financial_year: financialYear, rank: { $ne: null } }),
      IndiaDestinationExportAnnual.find({ financial_year: financialYear, rank: { $ne: null } })
        .populate('destination_geography_id').sort({ rank: 1 }).limit(5).lean()
    ]);
    return {
      success: true,
      data: {
        financial_year: financialYear,
        period_status: total.period_status,
        total_export_value_usd_million: total.export_value_usd_million,
        yoy_growth_percent: total.yoy_growth_percent,
        destination_count: destinationCount,
        top_destinations: topDestinations
      }
    };
  });

  app.get('/destinations', async (request, reply) => {
    const financialYear = await selectedPeriod(request.query.financial_year);
    if (!financialYear) return reply.status(404).send({ success: false, error: 'No India destination export data is available' });
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 50), 1), 200);
    const query = { financial_year: financialYear, rank: { $ne: null } };
    if (request.query.q) {
      const regex = { $regex: escapeRegex(request.query.q), $options: 'i' };
      const geographies = await Geography.find({ $or: [{ name: regex }, { aliases: regex }, { iso2: regex }, { iso3: regex }] }).select('_id').lean();
      query.destination_geography_id = { $in: geographies.map((item) => item._id) };
    }
    const sortFields = new Set(['rank', 'export_value_usd_million', 'share_percent', 'yoy_growth_percent']);
    const sortBy = sortFields.has(request.query.sort) ? request.query.sort : 'rank';
    const direction = request.query.direction === 'asc' ? 1 : -1;
    const sort = sortBy === 'rank' ? { rank: 1 } : { [sortBy]: direction, rank: 1 };
    const world = await Geography.findOne({ key: 'world' }).lean();
    const [items, total, periodTotal] = await Promise.all([
      IndiaDestinationExportAnnual.find(query).populate('destination_geography_id').sort(sort)
        .skip((page - 1) * limit).limit(limit).lean(),
      IndiaDestinationExportAnnual.countDocuments(query),
      world ? IndiaDestinationExportAnnual.findOne({ financial_year: financialYear, destination_geography_id: world._id }).lean() : null
    ]);
    return { success: true, financial_year: financialYear, period_status: periodTotal?.period_status || null, items, page, limit, total, total_pages: Math.ceil(total / limit) };
  });
}
