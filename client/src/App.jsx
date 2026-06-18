import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Database, FileSpreadsheet, Globe2, LoaderCircle, LogOut, PackageSearch, Search, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, downloadImportSource, getToken, setToken } from './api/client.js';

function AdminShell({ children }) {
  const navigate = useNavigate();
  if (!getToken()) return <Navigate to="/login" replace />;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">Niryat Portal</div>
      <nav>
        <NavLink to="/admin/products"><PackageSearch size={18} /> HS Catalog</NavLink>
        <NavLink to="/admin/geographies"><Globe2 size={18} /> Geographies</NavLink>
        <NavLink to="/admin/imports/catalog"><FileSpreadsheet size={18} /> Import HS Catalog</NavLink>
        <NavLink to="/admin/imports/trade-map"><UploadCloud size={18} /> Import Trade Map</NavLink>
        <NavLink to="/admin/imports"><Database size={18} /> Import History</NavLink>
      </nav>
      <button className="ghost-button" type="button" onClick={() => { setToken(null); navigate('/login'); }}>
        <LogOut size={18} /> Sign out
      </button>
    </aside>
    <main className="content">{children}</main>
  </div>;
}

function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    try { const result = await api.login(form); setToken(result.token); navigate('/admin/products'); }
    catch (err) { setError(err.message); }
  }
  return <main className="login-page"><form className="login-panel" onSubmit={submit}>
    <h1>Niryat Admin</h1>
    <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
    <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
    {error ? <p className="error">{error}</p> : null}<button type="submit">Sign in</button>
  </form></main>;
}

function CatalogPage() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [data, setData] = useState({ items: [], total: 0 });
  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set('q', query); if (active) params.set('active', active);
      api.adminProducts(`?${params}`).then(setData).catch(console.error);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, active]);
  return <AdminShell>
    <div className="page-head"><div><h1>HS Product Catalog</h1><p className="page-subtitle">{data.total} records</p></div>
      <Link className="button-link" to="/admin/imports/catalog"><UploadCloud size={18} /> Import catalog</Link></div>
    <div className="toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search HS code or description" /></label>
      <select value={active} onChange={(e) => setActive(e.target.value)}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div>
    <div className="panel"><table><thead><tr><th>HS Code</th><th>Description</th><th>Section</th><th>Parent</th><th>Level</th><th>Status</th></tr></thead>
      <tbody>{data.items.map((item) => <tr key={item._id}><td><strong>{item.hscode}</strong></td><td>{item.description}</td><td>{item.section}</td><td>{item.parent_code || '—'}</td><td>{item.level}</td><td><span className={`status ${item.is_active ? 'completed' : 'pending'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></div>
  </AdminShell>;
}

function GeographyPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => api.countries(query ? `?q=${encodeURIComponent(query)}` : '').then(setData).catch(console.error), 200); return () => clearTimeout(t); }, [query]);
  return <AdminShell><div className="page-head"><div><h1>Geographies</h1><p className="page-subtitle">{data.total} canonical and aggregate records</p></div></div>
    <div className="toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or ISO code" /></label></div>
    <div className="panel"><table><thead><tr><th>Name</th><th>Type</th><th>ISO-2</th><th>ISO-3</th><th>Trade Map aliases</th></tr></thead><tbody>
      {data.items.map((item) => <tr key={item._id}><td><strong>{item.name}</strong></td><td>{item.type}</td><td>{item.iso2 || '—'}</td><td>{item.iso3 || '—'}</td><td>{item.aliases?.join(', ')}</td></tr>)}</tbody></table></div>
  </AdminShell>;
}

function ImportPage({ type }) {
  const catalog = type === 'catalog';
  const [file, setFile] = useState(null); const [hscode, setHscode] = useState(''); const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState(null);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      if (!file) throw new Error('Choose a source file');
      const body = new FormData(); body.append('file', file);
      if (!catalog) { if (hscode) body.append('hscode', hscode); if (year) body.append('year', year); }
      setResult(catalog ? await api.importCatalog(body) : await api.importTradeMap(body));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <AdminShell><div className="page-head"><div><h1>{catalog ? 'Import HS Catalog' : 'Import Trade Map Exports'}</h1>
    <p className="page-subtitle">{catalog ? 'Upload the base section, hscode, description, parent, and level dataset.' : 'One file must represent exactly one HS code and one calendar year.'}</p></div></div>
    <form className="panel upload-panel" onSubmit={submit}>
      <label>Source file<input type="file" accept={catalog ? '.xlsx,.csv,.json,.xls' : '.xls,.xlsx'} onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      {!catalog ? <><label>HS code (optional confirmation)<input value={hscode} onChange={(e) => setHscode(e.target.value)} placeholder="100630" /></label><label>Year (optional confirmation)<input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2025" /></label></> : null}
      <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <UploadCloud size={18} />}{busy ? 'Importing…' : 'Import'}</button>
    </form>{error ? <p className="error">{error}</p> : null}{result ? <ImportSummary result={result} /> : null}
  </AdminShell>;
}

function ImportSummary({ result }) {
  return <div className="panel"><h2>Import Summary</h2><div className="summary-grid">{Object.entries(result.summary || {}).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>
    <p className="muted">Status: {result.status}{result.warning_count ? ` · ${result.warning_count} warnings` : ''}</p></div>;
}

function ImportHistory() {
  const [data, setData] = useState({ items: [] }); useEffect(() => { api.listImports().then(setData).catch(console.error); }, []);
  return <AdminShell><div className="page-head"><h1>Import History</h1></div><div className="panel"><table><thead><tr><th>Type</th><th>Target</th><th>Year</th><th>Status</th><th>Rows</th><th>File</th><th></th></tr></thead><tbody>
    {data.items.map((batch) => <tr key={batch._id}><td>{batch.import_type}</td><td>{batch.target_hscode || '—'}</td><td>{batch.snapshot_year || '—'}</td><td><span className={`status ${batch.status}`}>{batch.status}</span></td><td>{batch.record_count}</td><td>{batch.file_name}</td><td><NavLink to={`/admin/imports/${batch._id}`}>View</NavLink></td></tr>)}</tbody></table></div></AdminShell>;
}

function ImportDetail() {
  const [data, setData] = useState(null); const id = window.location.pathname.split('/').pop();
  useEffect(() => { api.getImport(id).then(setData).catch(console.error); }, [id]);
  if (!data) return <AdminShell><p className="muted">Loading…</p></AdminShell>;
  return <AdminShell><div className="page-head"><h1>Import Detail</h1></div><div className="panel"><div className="detail-grid"><div><span>Type</span><strong>{data.item.import_type}</strong></div><div><span>Status</span><strong>{data.item.status}</strong></div><div><span>Records</span><strong>{data.item.record_count}</strong></div><div><span>File</span><strong><button className="ghost-button" onClick={() => downloadImportSource(id, data.item.file_name)}>{data.item.file_name}</button></strong></div></div>
    <ImportSummary result={{ summary: data.item.validation_summary, status: data.item.status }} />{data.issues?.length ? <pre>{data.issues.map((issue) => `${issue.severity}: ${issue.message}`).join('\n')}</pre> : null}</div></AdminShell>;
}

export default function App() {
  return <Routes><Route path="/" element={<Navigate to="/admin/products" replace />} /><Route path="/login" element={<Login />} />
    <Route path="/admin/products" element={<CatalogPage />} /><Route path="/admin/geographies" element={<GeographyPage />} />
    <Route path="/admin/imports/catalog" element={<ImportPage type="catalog" />} /><Route path="/admin/imports/trade-map" element={<ImportPage type="trade-map" />} />
    <Route path="/admin/imports" element={<ImportHistory />} /><Route path="/admin/imports/:id" element={<ImportDetail />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
