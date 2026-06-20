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
        <NavLink to="/admin/india-country-exports"><Globe2 size={18} /> India Country Exports</NavLink>
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

function SearchableGeographySelect({ options, value, onChange }) {
  const selected = options.find((item) => item._id === value);
  const formatOption = (item) => `${item.name} (${item.iso3 || item.iso2 || item.type})`;
  const [query, setQuery] = useState(selected ? formatOption(selected) : '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) setQuery(selected ? formatOption(selected) : '');
  }, [value, open]);

  const normalized = query.trim().toLowerCase();
  const filtered = options.filter((item) => {
    if (!normalized || selected?._id === item._id) return true;
    return [item.name, item.iso2, item.iso3, item.type, ...(item.aliases || [])]
      .some((field) => String(field || '').toLowerCase().includes(normalized));
  }).slice(0, 30);

  return <div className="searchable-select">
    <input
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      value={query}
      placeholder="Search country, ISO code or alias"
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onChange={(event) => {
        setQuery(event.target.value);
        if (value) onChange('');
        setOpen(true);
      }}
    />
    {open ? <div className="searchable-select-menu" role="listbox">
      {filtered.length ? filtered.map((item) => <button
        type="button"
        role="option"
        aria-selected={item._id === value}
        className={item._id === value ? 'selected' : ''}
        key={item._id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onChange(item._id); setQuery(formatOption(item)); setOpen(false); }}
      >
        <span>{item.name}</span>
        <small>{item.iso3 || item.iso2 || item.type}</small>
      </button>) : <p className="muted">No matching geography</p>}
    </div> : null}
  </div>;
}

function IndiaCountryExportsPage() {
  const [records, setRecords] = useState({ items: [], years: [], total: 0 });
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  const [file, setFile] = useState(null);
  const [periodStatus, setPeriodStatus] = useState('final');
  const [preview, setPreview] = useState(null);
  const [geographies, setGeographies] = useState([]);
  const [mappings, setMappings] = useState({});
  const [excludedNames, setExcludedNames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function loadRecords() {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (year) params.set('financial_year', year);
    if (status) params.set('period_status', status);
    api.adminIndiaCountryExports(`?${params}`).then(setRecords).catch((err) => setError(err.message));
  }

  useEffect(() => {
    const timeout = setTimeout(loadRecords, 200);
    return () => clearTimeout(timeout);
  }, [query, year, status]);

  useEffect(() => {
    api.adminGeographies('?limit=500').then((data) => setGeographies(data.items || [])).catch(console.error);
    const batchId = new URLSearchParams(window.location.search).get('batch');
    if (batchId) {
      api.getImport(batchId).then((data) => {
        const batch = data.item;
        if (batch.import_type === 'india_country_exports' && batch.status === 'awaiting_confirmation') {
          setPreview({ batch_id: batch._id, status: batch.status, preview: batch.preview_summary, unresolved_names: batch.unresolved_geographies || [], warnings: batch.warning_messages || [] });
          setPeriodStatus(batch.period_status || 'final');
        }
      }).catch((err) => setError(err.message));
    }
  }, []);

  async function uploadPreview(event) {
    event.preventDefault();
    setBusy(true); setError(''); setResult(null); setPreview(null); setMappings({}); setExcludedNames([]);
    try {
      if (!file) throw new Error('Choose the TradeStat .xlsx file');
      const body = new FormData();
      body.append('file', file);
      body.append('period_status', periodStatus);
      const response = await api.previewIndiaCountryExports(body);
      if (response.duplicate) setResult({ status: 'duplicate', summary: {}, existing_batch_id: response.existing_batch_id });
      else setPreview(response);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function confirmPreview() {
    setBusy(true); setError('');
    try {
      const unresolved = (preview.unresolved_names || []).filter((name) => !excludedNames.includes(name));
      if (unresolved.some((name) => !mappings[name])) throw new Error('Map every unresolved country before confirming');
      const mappingPayload = unresolved.map((name) => ({ source_name: name, geography_id: mappings[name] }));
      const response = await api.confirmIndiaCountryExports(preview.batch_id, mappingPayload, excludedNames);
      setResult(response); setPreview(null); setFile(null); loadRecords();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function cancelPreview() {
    setBusy(true); setError('');
    try { await api.cancelIndiaCountryExportPreview(preview.batch_id); setPreview(null); setMappings({}); setExcludedNames([]); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <AdminShell>
    <div className="page-head"><div><h1>India Country Exports</h1><p className="page-subtitle">One destination record per selected financial year</p></div></div>
    <form className="panel upload-panel" onSubmit={uploadPreview}>
      <label>TradeStat country-wise Excel<input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <label>Period status<select value={periodStatus} onChange={(event) => setPeriodStatus(event.target.value)}><option value="final">Final financial year</option><option value="ytd">YTD / partial year</option></select></label>
      <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <FileSpreadsheet size={18} />}Preview import</button>
    </form>
    {error ? <p className="error">{error}</p> : null}
    {preview ? <div className="panel preview-panel">
      <div className="page-head"><div><h2>Import Preview</h2><p className="page-subtitle">Review detected data before writing records.</p></div><span className="status processing">Awaiting confirmation</span></div>
      <div className="summary-grid">
        <div><span>Selected period</span><strong>{preview.preview.current_financial_year}</strong></div>
        <div><span>Previous baseline</span><strong>{preview.preview.previous_financial_year}</strong></div>
        <div><span>Current total USD Mn</span><strong>{preview.preview.current_total_usd_million?.toLocaleString()}</strong></div>
        <div><span>Destinations</span><strong>{preview.preview.destination_count}</strong></div>
        <div><span>Create</span><strong>{preview.preview.created}</strong></div>
        <div><span>Update</span><strong>{preview.preview.updated}</strong></div>
        <div><span>Unchanged</span><strong>{preview.preview.unchanged}</strong></div>
        <div><span>Skipped</span><strong>{preview.preview.skipped}</strong></div>
      </div>
      {(preview.unresolved_names || []).length ? <div className="mapping-list"><h2>Required country mappings</h2>{preview.unresolved_names.filter((name) => !excludedNames.includes(name)).map((name) => <div className="mapping-row" key={name}><strong>{name}</strong><SearchableGeographySelect options={geographies} value={mappings[name] || ''} onChange={(geographyId) => setMappings({ ...mappings, [name]: geographyId })} /><button type="button" className="remove-mapping-button" onClick={() => { if (window.confirm(`Remove “${name}” from this import? The source workbook will remain unchanged.`)) { setExcludedNames([...excludedNames, name]); const next = { ...mappings }; delete next[name]; setMappings(next); } }}>Remove record</button></div>)}{excludedNames.length ? <div className="excluded-records"><strong>Excluded from this import ({excludedNames.length})</strong>{excludedNames.map((name) => <span key={name}>{name}<button type="button" className="ghost-button" onClick={() => setExcludedNames(excludedNames.filter((item) => item !== name))}>Undo</button></span>)}</div> : null}</div> : <p className="success-note">All country names resolved successfully.</p>}
      {preview.warnings?.length ? <pre>{preview.warnings.join('\n')}</pre> : null}
      <div className="action-row"><button type="button" disabled={busy} onClick={confirmPreview}>Confirm import</button><button type="button" disabled={busy} className="danger-button" onClick={cancelPreview}>Cancel preview</button></div>
    </div> : null}
    {result ? <ImportSummary result={result} /> : null}
    <div className="page-head records-head"><div><h2>Stored Records</h2><p className="page-subtitle">{records.total} destination-year records</p></div></div>
    <div className="toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search destination or ISO code" /></label><select value={year} onChange={(event) => setYear(event.target.value)}><option value="">All years</option>{records.years?.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="final">Final</option><option value="ytd">YTD</option></select></div>
    <div className="panel"><table><thead><tr><th>Rank</th><th>Destination</th><th>FY</th><th>Status</th><th>USD Million</th><th>Share</th><th>YoY Growth</th><th>Report Date</th></tr></thead><tbody>{records.items.map((item) => <tr key={item._id}><td>{item.rank ?? '—'}</td><td><strong>{item.destination_geography_id?.name || item.source_name_as_reported}</strong><br /><span className="muted">{item.destination_geography_id?.iso3 || item.destination_geography_id?.type}</span></td><td>{item.financial_year}</td><td><span className={`status ${item.period_status === 'final' ? 'completed' : 'processing'}`}>{item.period_status}</span></td><td>{item.export_value_usd_million?.toLocaleString()}</td><td>{item.share_percent?.toFixed(4)}%</td><td>{item.yoy_growth_percent === null ? '—' : `${item.yoy_growth_percent.toFixed(2)}%`}</td><td>{new Date(item.source_report_date).toLocaleDateString()}</td></tr>)}</tbody></table></div>
  </AdminShell>;
}

function ImportHistory() {
  const [data, setData] = useState({ items: [] }); useEffect(() => { api.listImports().then(setData).catch(console.error); }, []);
  return <AdminShell><div className="page-head"><h1>Import History</h1></div><div className="panel"><table><thead><tr><th>Type</th><th>Target</th><th>Year</th><th>Status</th><th>Rows</th><th>File</th><th></th></tr></thead><tbody>
    {data.items.map((batch) => <tr key={batch._id}><td>{batch.import_type}</td><td>{batch.target_hscode || batch.financial_year || '—'}</td><td>{batch.snapshot_year || batch.financial_year || '—'}</td><td><span className={`status ${batch.status}`}>{batch.status}</span></td><td>{batch.record_count}</td><td>{batch.file_name}</td><td><NavLink to={`/admin/imports/${batch._id}`}>View</NavLink></td></tr>)}</tbody></table></div></AdminShell>;
}

function ImportDetail() {
  const [data, setData] = useState(null); const id = window.location.pathname.split('/').pop();
  useEffect(() => { api.getImport(id).then(setData).catch(console.error); }, [id]);
  if (!data) return <AdminShell><p className="muted">Loading…</p></AdminShell>;
  return <AdminShell><div className="page-head"><h1>Import Detail</h1></div><div className="panel"><div className="detail-grid"><div><span>Type</span><strong>{data.item.import_type}</strong></div><div><span>Status</span><strong>{data.item.status}</strong></div><div><span>Records</span><strong>{data.item.record_count}</strong></div><div><span>File</span><strong>{data.item.source_file ? <button className="ghost-button" onClick={() => downloadImportSource(id, data.item.file_name)}>{data.item.file_name}</button> : data.item.file_name}</strong></div></div>
    {data.item.status === 'awaiting_confirmation' && data.item.import_type === 'india_country_exports' ? <p><Link className="button-link" to={`/admin/india-country-exports?batch=${id}`}>Resume preview</Link></p> : null}
    <ImportSummary result={{ summary: data.item.validation_summary, status: data.item.status }} />{data.issues?.length ? <pre>{data.issues.map((issue) => `${issue.severity}: ${issue.message}`).join('\n')}</pre> : null}</div></AdminShell>;
}

export default function App() {
  return <Routes><Route path="/" element={<Navigate to="/admin/products" replace />} /><Route path="/login" element={<Login />} />
    <Route path="/admin/products" element={<CatalogPage />} /><Route path="/admin/geographies" element={<GeographyPage />} />
    <Route path="/admin/imports/catalog" element={<ImportPage type="catalog" />} /><Route path="/admin/imports/trade-map" element={<ImportPage type="trade-map" />} />
    <Route path="/admin/india-country-exports" element={<IndiaCountryExportsPage />} />
    <Route path="/admin/imports" element={<ImportHistory />} /><Route path="/admin/imports/:id" element={<ImportDetail />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
