import mongoose from 'mongoose';

const { Schema } = mongoose;
const timestamps = { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } };

const hsProductSchema = new Schema(
  {
    section: { type: String, required: true, trim: true },
    hscode: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    parent_code: { type: String, default: null },
    level: { type: Number, required: true, enum: [2, 4, 6] },
    is_active: { type: Boolean, required: true, default: false },
    catalog_import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', default: null },
    activated_at: { type: Date, default: null },
    last_trade_import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', default: null }
  },
  timestamps
);
hsProductSchema.index({ hscode: 1 }, { unique: true });
hsProductSchema.index({ parent_code: 1, is_active: 1, hscode: 1 });
hsProductSchema.index({ level: 1, is_active: 1 });
hsProductSchema.index({ description: 'text', hscode: 'text' });

const geographySchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['world', 'country', 'territory', 'region', 'aggregate', 'other']
    },
    iso2: { type: String, default: null },
    iso3: { type: String, default: null },
    aliases: { type: [String], default: [] }
  },
  timestamps
);
geographySchema.index({ key: 1 }, { unique: true });
geographySchema.index({ iso3: 1 }, { unique: true, partialFilterExpression: { iso3: { $type: 'string' } } });
geographySchema.index({ slug: 1 });
geographySchema.index({ name: 'text', aliases: 'text' });

const exportSnapshotSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'HsProduct', required: true },
    hscode: { type: String, required: true },
    year: { type: Number, required: true, min: 1900, max: 2200 },
    geography_id: { type: Schema.Types.ObjectId, ref: 'Geography', required: true },
    exporter_name_as_reported: { type: String, required: true },
    rank: { type: Number, default: null },
    value_exported_usd_thousand: { type: Number, default: null },
    trade_balance_usd_thousand: { type: Number, default: null },
    quantity_exported: { type: Number, default: null },
    quantity_unit: { type: String, default: null },
    unit_value_usd_per_unit: { type: Number, default: null },
    annual_growth_value_5y_percent: { type: Number, default: null },
    annual_growth_quantity_5y_percent: { type: Number, default: null },
    annual_growth_value_1y_percent: { type: Number, default: null },
    share_world_exports_percent: { type: Number, default: null },
    average_importer_distance_km: { type: Number, default: null },
    importer_concentration_index: { type: Number, default: null },
    import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true },
    raw_payload: { type: Schema.Types.Mixed, default: null }
  },
  timestamps
);
exportSnapshotSchema.index({ product_id: 1, year: 1, geography_id: 1 }, { unique: true });
exportSnapshotSchema.index({ product_id: 1, year: -1, rank: 1 });
exportSnapshotSchema.index({ geography_id: 1, year: -1 });
exportSnapshotSchema.index({ hscode: 1, year: -1 });

const sourceFileSchema = new Schema(
  {
    storage_id: { type: Schema.Types.ObjectId, required: true },
    bucket: { type: String, default: 'import_files' },
    file_name: { type: String, required: true },
    mime_type: { type: String, default: 'application/octet-stream' },
    size_bytes: { type: Number, required: true },
    sha256: { type: String, required: true }
  },
  { _id: false }
);

const importBatchSchema = new Schema({
  import_type: { type: String, enum: ['hs_catalog', 'trade_map_exports'], required: true },
  file_name: { type: String, default: null },
  source_file: { type: sourceFileSchema, default: null },
  uploaded_by: { type: Schema.Types.ObjectId, default: null },
  target_hscode: { type: String, default: null },
  snapshot_year: { type: Number, default: null },
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
  warning_messages: { type: [String], default: [] },
  error_messages: { type: [String], default: [] },
  started_at: { type: Date, default: null },
  completed_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now }
});
importBatchSchema.index({ created_at: -1 });
importBatchSchema.index({ import_type: 1, target_hscode: 1, snapshot_year: -1 });

const importIssueSchema = new Schema({
  import_batch_id: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true },
  severity: { type: String, enum: ['warning', 'error'], required: true },
  row_number: { type: Number, default: null },
  code: { type: String, default: null },
  message: { type: String, required: true },
  raw_payload: { type: Schema.Types.Mixed, default: null },
  created_at: { type: Date, default: Date.now }
});
importIssueSchema.index({ import_batch_id: 1, row_number: 1 });

const adminUserSchema = new Schema(
  {
    email: { type: String, required: true },
    name: { type: String, default: 'Admin' },
    role: { type: String, default: 'admin' }
  },
  timestamps
);
adminUserSchema.index({ email: 1 }, { unique: true });

export const HsProduct = mongoose.model('HsProduct', hsProductSchema, 'hs_products');
export const Geography = mongoose.model('Geography', geographySchema, 'geographies');
export const ExportSnapshot = mongoose.model('ExportSnapshot', exportSnapshotSchema, 'export_snapshots');
export const ImportBatch = mongoose.model('ImportBatch', importBatchSchema, 'import_batches_v2');
export const ImportIssue = mongoose.model('ImportIssue', importIssueSchema, 'import_issues');
export const AdminUser = mongoose.model('AdminUser', adminUserSchema, 'admin_users');
