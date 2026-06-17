import mongoose from 'mongoose';

const { Schema } = mongoose;

const sourceSchema = new Schema(
  {
    source_name: { type: String, default: null },
    source_link: { type: String, default: null },
    notes: { type: String, default: null }
  },
  { _id: false }
);

const timestamps = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
};

const hsChapterSchema = new Schema(
  {
    hs_chapter: { type: String, required: true },
    chapter_name: { type: String, default: null },
    description: { type: String, default: null }
  },
  timestamps
);
hsChapterSchema.index({ hs_chapter: 1 }, { unique: true });

const hsCodeSchema = new Schema(
  {
    hs_chapter_id: { type: Schema.Types.ObjectId, ref: 'HsChapter', required: true },
    hs_chapter: { type: String, required: true },
    hs_code_6_digit: { type: String, required: true },
    hs_heading_4_digit: { type: String, default: null },
    heading_description: { type: String, default: null },
    hs_6_digit_description: { type: String, default: null }
  },
  timestamps
);
hsCodeSchema.index({ hs_code_6_digit: 1 }, { unique: true });
hsCodeSchema.index({ hs_chapter: 1 });

const productSchema = new Schema(
  {
    product_uid: { type: String, required: true },
    hs_chapter_id: { type: Schema.Types.ObjectId, ref: 'HsChapter', required: true },
    hs_code_id: { type: Schema.Types.ObjectId, ref: 'HsCode', required: true },
    hs_chapter: { type: String, required: true },
    hs_code_6_digit: { type: String, required: true },
    itc_hs_8_digit: { type: String, default: null },
    product_name: { type: String, required: true },
    product_name_slug: { type: String, required: true },
    product_category: { type: String, default: null },
    sector: { type: String, default: null },
    description: {
      product_description: { type: String, default: null },
      itc_hs_description: { type: String, default: null }
    },
    policy: {
      exportable_from_india: { type: String, default: null },
      export_policy: { type: String, default: null },
      unit_of_quantity: { type: String, default: null }
    },
    latest_export_snapshot: {
      financial_year: { type: String, default: null },
      export_value_usd_mn: { type: Number, default: null },
      quantity: { type: Schema.Types.Mixed, default: null },
      unit: { type: String, default: null },
      yoy_growth_percent: { type: Number, default: null },
      three_year_cagr_percent: { type: Number, default: null },
      share_in_india_exports_percent: { type: Number, default: null },
      india_global_share_percent: { type: Number, default: null },
      global_export_value_usd_mn: { type: Number, default: null },
      india_global_rank: { type: Number, default: null },
      top_global_exporter: { type: String, default: null }
    },
    source: { type: sourceSchema, default: () => ({}) },
    source_sheets: { type: [String], default: [] },
    search_text: { type: String, default: '' },
    embedding_text: { type: String, default: '' },
    embedding: { type: [Number], default: [] },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
productSchema.index(
  { itc_hs_8_digit: 1 },
  { unique: true, partialFilterExpression: { itc_hs_8_digit: { $type: 'string' } } }
);
productSchema.index(
  { hs_code_6_digit: 1, product_name_slug: 1 },
  { unique: true, partialFilterExpression: { itc_hs_8_digit: null } }
);
productSchema.index({ hs_code_6_digit: 1 });
productSchema.index({ hs_chapter: 1 });
productSchema.index({ product_name_slug: 1 });
productSchema.index({ sector: 1 });
productSchema.index({ product_category: 1 });
productSchema.index({ search_text: 'text', embedding_text: 'text' });

const productExportYearSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    hs_code_6_digit: { type: String, required: true },
    itc_hs_8_digit: { type: String, default: null },
    financial_year: { type: String, required: true },
    export_value_usd_mn: { type: Number, default: null },
    quantity: { type: Schema.Types.Mixed, default: null },
    unit: { type: String, default: null },
    yoy_growth_percent: { type: Number, default: null },
    three_year_cagr_percent: { type: Number, default: null },
    share_in_india_exports_percent: { type: Number, default: null },
    source: { type: sourceSchema, default: () => ({}) },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
productExportYearSchema.index({ product_id: 1, financial_year: 1 }, { unique: true });
productExportYearSchema.index({ hs_code_6_digit: 1 });

const countrySchema = new Schema(
  {
    country_name: { type: String, required: true },
    country_slug: { type: String, required: true },
    iso_code: { type: String, default: null },
    region: { type: String, default: null },
    continent: { type: String, default: null },
    latest_export_snapshot: {
      financial_year: { type: String, default: null },
      rank: { type: Number, default: null },
      export_value_usd_mn: { type: Number, default: null },
      yoy_growth_percent: { type: Number, default: null },
      three_year_cagr_percent: { type: Number, default: null },
      computed_share_in_india_exports_percent: { type: Number, default: null },
      opportunity_score: { type: Number, default: null },
      risk_score: { type: Number, default: null }
    },
    trade_profile: {
      major_products_exported: { type: [String], default: [] },
      top_hs_chapters: { type: [String], default: [] },
      fta_trade_agreement_status: { type: String, default: null }
    },
    source: { type: sourceSchema, default: () => ({}) },
    search_text: { type: String, default: '' },
    embedding_text: { type: String, default: '' },
    embedding: { type: [Number], default: [] },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
countrySchema.index(
  { iso_code: 1 },
  { unique: true, partialFilterExpression: { iso_code: { $type: 'string' } } }
);
countrySchema.index(
  { country_slug: 1 },
  { unique: true, partialFilterExpression: { iso_code: null } }
);
countrySchema.index({ region: 1 });
countrySchema.index({ continent: 1 });
countrySchema.index({ search_text: 'text', embedding_text: 'text' });

const countryExportYearSchema = new Schema(
  {
    country_id: { type: Schema.Types.ObjectId, ref: 'Country', required: true },
    country_name: { type: String, required: true },
    iso_code: { type: String, default: null },
    financial_year: { type: String, required: true },
    rank: { type: Number, default: null },
    export_value_usd_mn: { type: Number, default: null },
    yoy_growth_percent: { type: Number, default: null },
    three_year_cagr_percent: { type: Number, default: null },
    share_in_india_total_exports_percent: { type: Number, default: null },
    opportunity_score: { type: Number, default: null },
    risk_score: { type: Number, default: null },
    source: { type: sourceSchema, default: () => ({}) },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
countryExportYearSchema.index({ country_id: 1, financial_year: 1 }, { unique: true });

const productCountryExportSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    country_id: { type: Schema.Types.ObjectId, ref: 'Country', required: true },
    hs_code_6_digit: { type: String, required: true },
    itc_hs_8_digit: { type: String, default: null },
    financial_year: { type: String, required: true },
    destination_rank: { type: Number, default: null },
    export_value_usd_mn: { type: Number, default: null },
    export_quantity: { type: Schema.Types.Mixed, default: null },
    unit: { type: String, default: null },
    share_of_product_export_percent: { type: Number, default: null },
    yoy_growth_percent: { type: Number, default: null },
    three_year_cagr_percent: { type: Number, default: null },
    avg_unit_value_usd_per_unit: { type: Schema.Types.Mixed, default: null },
    main_competitor_countries: { type: [String], default: [] },
    indias_competitive_advantage: { type: String, default: null },
    source: { type: sourceSchema, default: () => ({}) },
    raw_payload: { type: Schema.Types.Mixed, default: null },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
productCountryExportSchema.index({ product_id: 1, country_id: 1, financial_year: 1 }, { unique: true });
productCountryExportSchema.index({ product_id: 1 });
productCountryExportSchema.index({ country_id: 1 });
productCountryExportSchema.index({ financial_year: 1 });
productCountryExportSchema.index({ hs_code_6_digit: 1 });

const stateProductExportSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    state_name: { type: String, required: true },
    state_slug: { type: String, required: true },
    hs_code_6_digit: { type: String, required: true },
    itc_hs_8_digit: { type: String, default: null },
    financial_year: { type: String, required: true },
    export_value_usd_mn: { type: Number, default: null },
    export_quantity: { type: Schema.Types.Mixed, default: null },
    unit: { type: String, default: null },
    state_share_in_india_export_percent: { type: Number, default: null },
    yoy_growth_percent: { type: Number, default: null },
    top_destination_countries: { type: [String], default: [] },
    major_clusters: { type: [String], default: [] },
    source: { type: sourceSchema, default: () => ({}) },
    raw_payload: { type: Schema.Types.Mixed, default: null },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
stateProductExportSchema.index({ product_id: 1, state_slug: 1, financial_year: 1 }, { unique: true });
stateProductExportSchema.index({ state_slug: 1 });
stateProductExportSchema.index({ hs_code_6_digit: 1 });

const productWorldPositionSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    hs_code_6_digit: { type: String, required: true },
    itc_hs_8_digit: { type: String, default: null },
    financial_year: { type: String, required: true },
    india_export_value_usd_mn: { type: Number, default: null },
    world_export_value_usd_mn: { type: Number, default: null },
    india_share_in_world_exports_percent: { type: Number, default: null },
    india_global_rank: { type: Number, default: null },
    top_global_exporters: { type: [String], default: [] },
    top_exporter_share_percent: { type: Number, default: null },
    growth_trend: { type: String, default: null },
    opportunity_level: { type: String, default: null },
    reason: { type: String, default: null },
    source: {
      source_name: { type: String, default: null },
      source_link: { type: String, default: null }
    },
    raw_payload: { type: Schema.Types.Mixed, default: null },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
productWorldPositionSchema.index({ product_id: 1, financial_year: 1 }, { unique: true });

const opportunitySchema = new Schema(
  {
    opportunity_type: { type: String, default: null },
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    hs_code_6_digit: { type: String, required: true },
    itc_hs_8_digit: { type: String, default: null },
    product_name: { type: String, required: true },
    sector: { type: String, default: null },
    financial_year: { type: String, required: true },
    rank: { type: Number, default: null },
    export_value_usd_mn: { type: Number, default: null },
    yoy_growth_percent: { type: Number, default: null },
    three_year_cagr_percent: { type: Number, default: null },
    india_global_share_percent: { type: Number, default: null },
    top_destination_countries: { type: [String], default: [] },
    competition_level: { type: String, default: null },
    entry_barrier_score: { type: Number, default: null },
    compliance_difficulty_score: { type: Number, default: null },
    margin_potential: { type: String, default: null },
    buyer_availability: { type: String, default: null },
    opportunity_score: { type: Number, default: null },
    growth_percent: { type: Number, default: null },
    no_of_indian_exporters: { type: Schema.Types.Mixed, default: null },
    india_share_in_world_export: { type: Schema.Types.Mixed, default: null },
    required_certifications: { type: String, default: null },
    avg_order_size: { type: String, default: null },
    logistics_complexity: { type: String, default: null },
    reason_for_selection: { type: String, default: null },
    recommended_exporter_type: { type: String, default: null },
    source: {
      source_name: { type: String, default: null },
      source_link: { type: String, default: null }
    },
    raw_payload: { type: Schema.Types.Mixed, default: null },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
opportunitySchema.index({ product_id: 1 });
opportunitySchema.index({ hs_code_6_digit: 1 });
opportunitySchema.index({ opportunity_type: 1 });
opportunitySchema.index({ opportunity_score: 1 });

const countryBusinessInsightSchema = new Schema(
  {
    country_id: { type: Schema.Types.ObjectId, ref: 'Country', required: true },
    export_trend: { type: String, default: null },
    fastest_growing_indian_exports: { type: [String], default: [] },
    declining_exports: { type: [String], default: [] },
    best_opportunity_sectors: { type: [String], default: [] },
    typical_buyer_type: { type: [String], default: [] },
    market_entry_difficulty: { type: Number, default: null },
    key_documentation: { type: [String], default: [] },
    compliance_notes: { type: String, default: null },
    payment_risk: { type: String, default: null },
    logistics_notes: { type: String, default: null },
    strategic_recommendation: { type: String, default: null },
    source: {
      source_name: { type: String, default: null },
      source_link: { type: String, default: null }
    },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
countryBusinessInsightSchema.index({ country_id: 1 }, { unique: true });

const fastestGrowingCountryProfileSchema = new Schema(
  {
    country_id: { type: Schema.Types.ObjectId, ref: 'Country', required: true },
    rank: { type: Number, default: null },
    financial_year: { type: String, required: true },
    export_value_usd_mn: { type: Number, default: null },
    yoy_growth_percent: { type: Number, default: null },
    three_year_cagr_percent: { type: Number, default: null },
    fastest_growing_products: { type: [String], default: [] },
    fta_trade_agreement: { type: String, default: null },
    ease_of_entry_notes: { type: String, default: null },
    payment_risk: { type: String, default: null },
    best_entry_strategy: { type: String, default: null },
    source: {
      source_name: { type: String, default: null }
    },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
fastestGrowingCountryProfileSchema.index({ country_id: 1, financial_year: 1 }, { unique: true });

const indiaExportSummarySchema = new Schema(
  {
    financial_year: { type: String, required: true },
    india_total_exports_usd_bn: { type: Number, default: null },
    yoy_growth_percent: { type: Number, default: null },
    top_export_sector: { type: String, default: null },
    total_export_destinations: { type: Number, default: null },
    estimated_hs_codes_exported: { type: String, default: null },
    is_partial_year: { type: Boolean, default: false },
    source: { type: sourceSchema, default: () => ({}) },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }
  },
  timestamps
);
indiaExportSummarySchema.index({ financial_year: 1 }, { unique: true });

const importBatchSchema = new Schema({
  import_type: { type: String, enum: ['product_data', 'country_data'], required: true },
  file_name: { type: String, default: null },
  uploaded_by: { type: Schema.Types.ObjectId, default: null },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'partial'],
    default: 'pending'
  },
  record_count: { type: Number, default: 0 },
  validation_summary: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errors: { type: Number, default: 0 }
  },
  warnings: { type: [String], default: [] },
  errors: { type: [String], default: [] },
  started_at: { type: Date, default: null },
  completed_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now }
});

const adminUserSchema = new Schema(
  {
    email: { type: String, required: true },
    name: { type: String, default: 'Admin' },
    role: { type: String, default: 'admin' }
  },
  timestamps
);
adminUserSchema.index({ email: 1 }, { unique: true });

export const HsChapter = mongoose.model('HsChapter', hsChapterSchema, 'hs_chapters');
export const HsCode = mongoose.model('HsCode', hsCodeSchema, 'hs_codes');
export const Product = mongoose.model('Product', productSchema, 'products');
export const ProductExportYear = mongoose.model('ProductExportYear', productExportYearSchema, 'product_export_years');
export const Country = mongoose.model('Country', countrySchema, 'countries');
export const CountryExportYear = mongoose.model('CountryExportYear', countryExportYearSchema, 'country_export_years');
export const ProductCountryExport = mongoose.model('ProductCountryExport', productCountryExportSchema, 'product_country_exports');
export const StateProductExport = mongoose.model('StateProductExport', stateProductExportSchema, 'state_product_exports');
export const ProductWorldPosition = mongoose.model('ProductWorldPosition', productWorldPositionSchema, 'product_world_positions');
export const Opportunity = mongoose.model('Opportunity', opportunitySchema, 'opportunities');
export const CountryBusinessInsight = mongoose.model('CountryBusinessInsight', countryBusinessInsightSchema, 'country_business_insights');
export const FastestGrowingCountryProfile = mongoose.model(
  'FastestGrowingCountryProfile',
  fastestGrowingCountryProfileSchema,
  'fastest_growing_country_profiles'
);
export const IndiaExportSummary = mongoose.model('IndiaExportSummary', indiaExportSummarySchema, 'india_export_summaries');
export const ImportBatch = mongoose.model('ImportBatch', importBatchSchema, 'import_batches');
export const AdminUser = mongoose.model('AdminUser', adminUserSchema, 'admin_users');
