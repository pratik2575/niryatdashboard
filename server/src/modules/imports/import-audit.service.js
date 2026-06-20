import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ImportIssue } from '../../models/index.js';

export function sourceFileSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function retainSourceFile(buffer, { fileName, mimeType }) {
  if (!buffer) return null;
  if (!mongoose.connection.db) throw new Error('Database connection is required to retain import files');

  const bucketName = 'import_files';
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  const stream = bucket.openUploadStream(fileName, {
    contentType: mimeType || 'application/octet-stream',
    metadata: { sha256: sourceFileSha256(buffer) }
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
    sha256: sourceFileSha256(buffer)
  };
}

export async function readRetainedSourceFile(sourceFile) {
  if (!sourceFile?.storage_id || !mongoose.connection.db) throw new Error('Retained source file is unavailable');
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: sourceFile.bucket || 'import_files' });
  const chunks = [];
  await new Promise((resolve, reject) => {
    const stream = bucket.openDownloadStream(sourceFile.storage_id);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return Buffer.concat(chunks);
}

export async function deleteRetainedSourceFile(sourceFile) {
  if (!sourceFile?.storage_id || !mongoose.connection.db) return;
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: sourceFile.bucket || 'import_files' });
  await bucket.delete(sourceFile.storage_id);
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
