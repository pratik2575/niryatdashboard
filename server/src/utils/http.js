export async function readJsonPayload(request) {
  if (!request.isMultipart()) {
    return request.body;
  }

  const file = await request.file();
  if (!file) {
    throw Object.assign(new Error('JSON file is required'), { statusCode: 400 });
  }

  request.uploadedFileName = file.filename;
  const buffer = await file.toBuffer();
  return JSON.parse(buffer.toString('utf8'));
}
