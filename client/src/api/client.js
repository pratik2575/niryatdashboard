const TOKEN_KEY = 'niryat_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function downloadImportSource(id, fileName) {
  const response = await fetch(`/api/admin/imports/${id}/source`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) throw new Error('Could not download source file');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'source-file';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

export const api = {
  login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  me: () => request('/api/auth/me'),
  listImports: () => request('/api/admin/imports'),
  getImport: (id) => request(`/api/admin/imports/${id}`),
  adminProducts: (params = '') => request(`/api/admin/products${params}`),
  importCatalog: (payload) => request('/api/admin/import/catalog', { method: 'POST', body: payload }),
  importTradeMap: (payload) => request('/api/admin/import/trade-map', { method: 'POST', body: payload }),
  previewIndiaCountryExports: (payload) => request('/api/admin/import/india-country-exports/preview', { method: 'POST', body: payload }),
  confirmIndiaCountryExports: (id, mappings, excludedSourceNames = []) => request(`/api/admin/imports/${id}/confirm`, {
    method: 'POST',
    body: { mappings, excluded_source_names: excludedSourceNames }
  }),
  cancelIndiaCountryExportPreview: (id) => request(`/api/admin/imports/${id}`, { method: 'DELETE' }),
  adminIndiaCountryExports: (params = '') => request(`/api/admin/india-country-exports${params}`),
  adminGeographies: (params = '') => request(`/api/admin/geographies${params}`),
  products: (params = '') => request(`/api/products${params}`),
  countries: (params = '') => request(`/api/countries${params}`),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  productDossier: (id) => request(`/api/products/${id}`),
  countryDossier: (id) => request(`/api/countries/${id}`)
};
