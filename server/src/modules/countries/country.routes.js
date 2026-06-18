import {
  Country,
  CountryBusinessInsight,
  CountryExportYear,
  FastestGrowingCountryProfile,
  ProductCountryExport
} from '../../models/index.js';
import { escapeRegex } from '../../utils/cleaning.js';
import { isObjectId } from '../../utils/object-id.js';
import {
  formatCountry,
  formatCountrySummary,
  groupCountryProducts,
  publicFields
} from '../catalog-response.js';

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

    return {
      success: true,
      items: items.map(formatCountrySummary),
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    };
  });

  app.get('/:id', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });

    const [exportYears, productExports, businessInsights, fastestGrowingProfile] = await Promise.all([
      CountryExportYear.find({ country_id: country._id }).sort({ financial_year: -1 }).lean(),
      ProductCountryExport.find({ country_id: country._id })
        .populate('product_id', 'product_uid product_name product_name_slug product_category sector hs_chapter hs_code_6_digit itc_hs_8_digit latest_export_snapshot')
        .sort({ financial_year: -1, destination_rank: 1 })
        .lean(),
      CountryBusinessInsight.findOne({ country_id: country._id }).lean(),
      FastestGrowingCountryProfile.find({ country_id: country._id }).sort({ financial_year: -1 }).lean()
    ]);

    return {
      success: true,
      data: {
        country: formatCountry(country),
        export_history: exportYears.map((item) => publicFields(item, ['country_name', 'iso_code'])),
        products: groupCountryProducts(productExports),
        business_insights: publicFields(businessInsights),
        growth_profile: fastestGrowingProfile.map((item) => publicFields(item))
      }
    };
  });

  app.get('/:id/export-years', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });
    const items = await CountryExportYear.find({ country_id: country._id }).sort({ financial_year: -1 }).lean();
    return {
      success: true,
      items: items.map((item) => publicFields(item, ['country_name', 'iso_code'])),
      total: items.length
    };
  });

  app.get('/:id/business-insights', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });
    const item = await CountryBusinessInsight.findOne({ country_id: country._id }).lean();
    return { success: true, item: publicFields(item) };
  });

  app.get('/:id/fastest-growing-profile', async (request, reply) => {
    const country = await findCountry(request.params.id);
    if (!country) return reply.status(404).send({ success: false, error: 'Country not found' });
    const items = await FastestGrowingCountryProfile.find({ country_id: country._id }).sort({ financial_year: -1 }).lean();
    return { success: true, items: items.map((item) => publicFields(item)), total: items.length };
  });
}
