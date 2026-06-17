import {
  Country,
  CountryBusinessInsight,
  CountryExportYear,
  FastestGrowingCountryProfile
} from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';
import { isObjectId } from '../../utils/object-id.js';

async function findCountry(id) {
  const filters = isObjectId(id)
    ? [{ _id: id }]
    : [{ iso_code: String(id).toUpperCase() }, { country_slug: id }];
  return Country.findOne({ $or: filters }).lean();
}

export default async function countryRoutes(app) {
  app.get('/', async (request) => {
    const page = Math.max(Number(request.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(request.query.limit || 24), 1), 100);
    const query = {};

    if (request.query.q) {
      query.search_text = { $regex: escapeRegex(request.query.q), $options: 'i' };
    }
    if (request.query.region) query.region = request.query.region;
    if (request.query.continent) query.continent = request.query.continent;

    const [items, total] = await Promise.all([
      Country.find(query)
        .sort({ country_name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Country.countDocuments(query)
    ]);

    return { success: true, items, page, limit, total };
  });

  app.get('/:id', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });

    const [exportYears, businessInsights, fastestGrowingProfile] = await Promise.all([
      CountryExportYear.find({ country_id: country._id }).sort({ financial_year: -1 }).lean(),
      CountryBusinessInsight.findOne({ country_id: country._id }).lean(),
      FastestGrowingCountryProfile.find({ country_id: country._id }).sort({ financial_year: -1 }).lean()
    ]);

    return {
      success: true,
      country,
      export_years: exportYears,
      business_insights: businessInsights,
      fastest_growing_profile: fastestGrowingProfile
    };
  });

  app.get('/:id/export-years', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });
    const items = await CountryExportYear.find({ country_id: country._id }).sort({ financial_year: -1 }).lean();
    return { success: true, items };
  });

  app.get('/:id/business-insights', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });
    const item = await CountryBusinessInsight.findOne({ country_id: country._id }).lean();
    return { success: true, item };
  });

  app.get('/:id/fastest-growing-profile', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });
    const items = await FastestGrowingCountryProfile.find({ country_id: country._id }).sort({ financial_year: -1 }).lean();
    return { success: true, items };
  });
}
