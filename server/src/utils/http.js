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

export async function readMultipartUpload(request) {
  if (!request.isMultipart()) {
    throw Object.assign(new Error('Multipart file upload is required'), { statusCode: 400 });
  }

  let upload = null;
  const fields = {};
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (upload) {
        part.file.resume();
        continue;
      }
      upload = {
        buffer: await part.toBuffer(),
        fileName: part.filename,
        mimeType: part.mimetype
      };
    } else {
      fields[part.fieldname] = part.value;
    }
  }
  if (!upload) throw Object.assign(new Error('A source file is required'), { statusCode: 400 });
  return { ...upload, fields };
}
