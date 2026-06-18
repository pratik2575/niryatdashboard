import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ImportIssue } from '../../models/index.js';

export async function retainSourceFile(buffer, { fileName, mimeType }) {
  if (!buffer) return null;
  if (!mongoose.connection.db) throw new Error('Database connection is required to retain import files');

  const bucketName = 'import_files';
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  const stream = bucket.openUploadStream(fileName, {
    contentType: mimeType || 'application/octet-stream',
    metadata: { sha256: crypto.createHash('sha256').update(buffer).digest('hex') }
  });

  await new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('finish', resolve);
    stream.end(buffer);
  });

  return {
    storage_id: stream.id,
    bucket: bucketName,
    file_name: fileName,
    mime_type: mimeType || 'application/octet-stream',
    size_bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

export async function saveIssues(batchId, issues) {
  if (!issues.length) return;
  await ImportIssue.insertMany(issues.map((issue) => ({ ...issue, import_batch_id: batchId })), { ordered: false });
}

export function batchPreview(issues, severity) {
  return issues.filter((issue) => issue.severity === severity).slice(0, 20).map((issue) =>
    `${issue.row_number ? `Row ${issue.row_number}: ` : ''}${issue.message}`
  );
}
