import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Database, FileJson, Globe2, LoaderCircle, LogOut, PackageSearch, Search, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api/client.js';

function AdminShell({ children }) {
  const navigate = useNavigate();
  const authed = Boolean(getToken());

  if (!authed) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Niryat Portal</div>
        <nav>
          <NavLink to="/admin/products"><PackageSearch size={18} /> Products</NavLink>
          <NavLink to="/admin/countries"><Globe2 size={18} /> Countries</NavLink>
          <NavLink to="/admin/imports/products"><UploadCloud size={18} /> Add Product JSON</NavLink>
          <NavLink to="/admin/imports/countries"><FileJson size={18} /> Add Country JSON</NavLink>
          <NavLink to="/admin/imports"><Database size={18} /> Import History</NavLink>
        </nav>
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            setToken(null);
            navigate('/login');
          }}
        >
          <LogOut size={18} /> Sign out
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const result = await api.login(form);
      setToken(result.token);
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <h1>Niryat Admin</h1>
        <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}

function PublicSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ products: [], countries: [] });

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!query.trim()) {
        setResults({ products: [], countries: [] });
        return;
      }
      const data = await api.search(query);
      setResults(data);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <main className="public-page">
      <section className="search-band">
        <div>
          <h1>Export Intelligence Search</h1>
          <p>Search products, HS codes, countries, sectors, and trade agreements.</p>
        </div>
        <label className="search-box">
          <Search size={20} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Honey, 040900, UAE, textiles..." />
        </label>
      </section>
      <section className="result-grid">
        <ResultList title="Products" items={results.products} labelKey="product_name" metaKey="hs_code_6_digit" />
        <ResultList title="Countries" items={results.countries} labelKey="country_name" metaKey="iso_code" />
      </section>
    </main>
  );
}

function ResultList({ title, items, labelKey, metaKey }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {items.length ? items.map((item) => (
        <div className="row" key={item._id}>
          <strong>{item[labelKey]}</strong>
          <span>{item[metaKey] || item.region || item.sector || 'N/A'}</span>
        </div>
      )) : <p className="muted">No results</p>}
    </div>
  );
}

function DataListingPage({ type }) {
  const isProducts = type === 'products';
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
        const result = isProducts ? await api.products(params) : await api.countries(params);
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [isProducts, query]);

  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <h1>{isProducts ? 'Product Data' : 'Country Data'}</h1>
          <p className="page-subtitle">{data.total || 0} records available</p>
        </div>
        <Link className="button-link" to={isProducts ? '/admin/imports/products' : '/admin/imports/countries'}>
          <UploadCloud size={18} /> Add JSON
        </Link>
      </div>

      <div className="toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isProducts ? 'Search product, HS code, sector...' : 'Search country, ISO, region...'}
          />
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="panel">
        {loading ? <p className="muted">Loading...</p> : isProducts ? <ProductTable items={data.items || []} /> : <CountryTable items={data.items || []} />}
      </div>
    </AdminShell>
  );
}

function ProductTable({ items }) {
  if (!items.length) return <p className="muted">No product records found.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>HS 6</th>
          <th>ITC-HS 8</th>
          <th>Sector</th>
          <th>Category</th>
          <th>Latest FY</th>
          <th>Export USD Mn</th>
        </tr>
      </thead>
      <tbody>
        {items.map((product) => (
          <tr key={product._id}>
            <td><strong>{product.product_name}</strong></td>
            <td>{product.hs_code_6_digit}</td>
            <td>{product.itc_hs_8_digit || 'N/A'}</td>
            <td>{product.sector || 'N/A'}</td>
            <td>{product.product_category || 'N/A'}</td>
            <td>{product.latest_export_snapshot?.financial_year || 'N/A'}</td>
            <td>{product.latest_export_snapshot?.export_value_usd_mn ?? 'N/A'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CountryTable({ items }) {
  if (!items.length) return <p className="muted">No country records found.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Country</th>
          <th>ISO</th>
          <th>Region</th>
          <th>Continent</th>
          <th>Latest FY</th>
          <th>Rank</th>
          <th>Export USD Mn</th>
        </tr>
      </thead>
      <tbody>
        {items.map((country) => (
          <tr key={country._id}>
            <td><strong>{country.country_name}</strong></td>
            <td>{country.iso_code || 'N/A'}</td>
            <td>{country.region || 'N/A'}</td>
            <td>{country.continent || 'N/A'}</td>
            <td>{country.latest_export_snapshot?.financial_year || 'N/A'}</td>
            <td>{country.latest_export_snapshot?.rank ?? 'N/A'}</td>
            <td>{country.latest_export_snapshot?.export_value_usd_mn ?? 'N/A'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImportHistory() {
  const [data, setData] = useState({ items: [] });

  useEffect(() => {
    api.listImports().then(setData).catch(console.error);
  }, []);

  return (
    <AdminShell>
      <div className="page-head">
        <h1>Import History</h1>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr><th>Type</th><th>Status</th><th>Records</th><th>Created</th><th>Updated</th><th>Skipped</th><th></th></tr>
          </thead>
          <tbody>
            {data.items.map((batch) => (
              <tr key={batch._id}>
                <td>{batch.import_type}</td>
                <td><span className={`status ${batch.status}`}>{batch.status}</span></td>
                <td>{batch.record_count}</td>
                <td>{batch.validation_summary?.created || 0}</td>
                <td>{batch.validation_summary?.updated || 0}</td>
                <td>{batch.validation_summary?.skipped || 0}</td>
                <td><NavLink to={`/admin/imports/${batch._id}`}>View</NavLink></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function UploadPage({ type }) {
  const [file, setFile] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const isProducts = type === 'products';

  function parseJsonBody() {
    const payload = JSON.parse(jsonText || (isProducts ? '[]' : '{}'));

    if (isProducts) {
      const hasValidShape = Array.isArray(payload) || Array.isArray(payload.products) || Array.isArray(payload.records);
      if (!hasValidShape) {
        throw new Error('Product JSON must be a direct array of objects, or an object with products/records array.');
      }
    }

    if (!isProducts) {
      const hasValidShape = Array.isArray(payload) || Array.isArray(payload.countries) || Array.isArray(payload.records);
      if (!hasValidShape) {
        throw new Error('Country JSON must be a direct array of country objects, or an object with countries/records array.');
      }
    }

    return payload;
  }

  async function submit(event) {
    event.preventDefault();
    setResult(null);
    setError('');
    setUploading(true);
    try {
      let payload;
      if (file) {
        payload = new FormData();
        payload.append('file', file);
      } else {
        payload = parseJsonBody();
      }

      const response = isProducts ? await api.importProducts(payload) : await api.importCountries(payload);
      setResult(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <h1>{isProducts ? 'Product JSON Import' : 'Country JSON Import'}</h1>
          <p className="page-subtitle">
            {isProducts
              ? 'Paste a direct JSON array of product objects or upload a .json file.'
              : 'Paste country JSON as an array, or as an object with india_export_summary and countries.'}
          </p>
        </div>
      </div>
      <form className="panel upload-panel" onSubmit={submit} aria-busy={uploading}>
        <label>
          JSON file
          <input
            type="file"
            accept="application/json,.json"
            disabled={uploading}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>
        <label>
          JSON body
          <textarea
            value={jsonText}
            disabled={uploading}
            onChange={(event) => setJsonText(event.target.value)}
            placeholder={
              isProducts
                ? '[{"hs_chapter":"04","hs_code_6_digit":"040900","product_name":"Natural Honey"}]'
                : '{"india_export_summary": {...}, "countries":[...]}'
            }
          />
        </label>
        <button type="submit" disabled={uploading}>
          {uploading ? <LoaderCircle className="spin" size={18} /> : <UploadCloud size={18} />}
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
      {uploading ? (
        <div className="panel loading-panel">
          <LoaderCircle className="spin" size={22} />
          <div>
            <strong>Import is running</strong>
            <p className="muted">The server is validating, normalizing, and saving the JSON records. Keep this page open.</p>
          </div>
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {result ? <ImportSummary result={result} /> : null}
    </AdminShell>
  );
}

function ImportSummary({ result }) {
  return (
    <div className="panel">
      <h2>Import Summary</h2>
      <div className="summary-grid">
        {Object.entries(result.summary || {}).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}
      </div>
      {result.warnings?.length ? <pre>{result.warnings.join('\n')}</pre> : null}
    </div>
  );
}

function ImportDetail() {
  const [batch, setBatch] = useState(null);
  const id = window.location.pathname.split('/').pop();

  useEffect(() => {
    api.getImport(id).then((data) => setBatch(data.item)).catch(console.error);
  }, [id]);

  return (
    <AdminShell>
      <div className="page-head">
        <h1>Import Detail</h1>
      </div>
      {batch ? (
        <div className="panel">
          <div className="detail-grid">
            <div><span>Type</span><strong>{batch.import_type}</strong></div>
            <div><span>Status</span><strong>{batch.status}</strong></div>
            <div><span>Records</span><strong>{batch.record_count}</strong></div>
            <div><span>File</span><strong>{batch.file_name}</strong></div>
          </div>
          <ImportSummary result={{ summary: batch.validation_summary, warnings: batch.warnings }} />
          {batch.errors?.length ? <pre>{batch.errors.join('\n')}</pre> : null}
        </div>
      ) : <p className="muted">Loading...</p>}
    </AdminShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/products" replace />} />
      <Route path="/search" element={<PublicSearch />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<Navigate to="/admin/products" replace />} />
      <Route path="/admin/products" element={<DataListingPage type="products" />} />
      <Route path="/admin/countries" element={<DataListingPage type="countries" />} />
      <Route path="/admin/imports" element={<ImportHistory />} />
      <Route path="/admin/imports/products" element={<UploadPage type="products" />} />
      <Route path="/admin/imports/countries" element={<UploadPage type="countries" />} />
      <Route path="/admin/imports/:id" element={<ImportDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
