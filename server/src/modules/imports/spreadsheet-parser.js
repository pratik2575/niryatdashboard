import readXlsxFile from 'read-excel-file/node';

function decodeHtml(value) {
  const entities = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', ocirc: 'ô'
  };
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlRows(text) {
  const rows = [];
  for (const rowMatch of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => decodeHtml(match[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

export function isHtmlSpreadsheet(buffer) {
  return buffer.subarray(0, 256).toString('utf8').trimStart().startsWith('<');
}

export async function readSpreadsheetRows(buffer, fileName = '') {
  const lowerName = fileName.toLowerCase();
  if (isHtmlSpreadsheet(buffer)) return htmlRows(buffer.toString('utf8'));
  if (lowerName.endsWith('.csv')) return parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (lowerName.endsWith('.json')) {
    const payload = JSON.parse(buffer.toString('utf8'));
    const records = Array.isArray(payload) ? payload : payload.products || payload.records;
    if (!Array.isArray(records)) throw new Error('JSON must contain an array, products array, or records array');
    return records;
  }
  if (lowerName.endsWith('.xlsx')) return readXlsxFile(buffer);
  if (lowerName.endsWith('.xls')) {
    throw new Error('Binary .xls is not supported. Export as .xlsx or CSV. Trade Map HTML .xls files are supported.');
  }
  throw new Error('Unsupported file type. Use .xlsx, .csv, .json, or a Trade Map .xls export.');
}

export function rowsToRecords(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  if (!Array.isArray(rows[0])) return rows;
  const headers = rows[0].map((value) => String(value ?? '').trim());
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}
