const TOKEN_KEY = 'niryat_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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
  importProducts: (formData) => request('/api/admin/import/products', { method: 'POST', body: formData }),
  importCountries: (formData) => request('/api/admin/import/countries', { method: 'POST', body: formData }),
  products: (params = '') => request(`/api/products${params}`),
  countries: (params = '') => request(`/api/countries${params}`),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  productDossier: (id) => request(`/api/products/${id}`),
  countryDossier: (id) => request(`/api/countries/${id}`)
};
