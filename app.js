// app.js — IKM Dashboard React Application (JSX via Babel)
// Sheet discovery: tries multiple CORS proxies in parallel with timeout,
// ALWAYS falls back to hardcoded known sheets so app never shows blank.

const { useState, useEffect, useRef, useCallback } = React;

const SHEET_ID = '19nNWdVnYdW1vEv0E0zAzVBSNc5DQKebAia7LD3fMv_o';

// ─── HARDCODED FALLBACK (updated manually if new sheets are added) ────────────
// Used immediately if all proxies fail — app always renders with these.
const FALLBACK_SHEETS = [
  { name: 'Juni 2025', gid: '1660775658' },
  { name: 'Desember 2025', gid: '1177278318' },
];

// Always use gid= for CSV export — sheet= name param is ignored by Google
function csvExportUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

// Race multiple proxies with a per-proxy timeout, return first winner
async function fetchViaProxy(targetUrl) {
  const proxies = [
    url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  const tryProxy = async (buildUrl) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(buildUrl(targetUrl), { signal: ctrl.signal, cache: 'no-cache' });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // allorigins /get wraps in JSON: {"contents":"...","status":{"http_code":200}}
      try {
        const json = JSON.parse(text);
        if (json.contents) return json.contents;
      } catch (_) { }
      return text;
    } finally {
      clearTimeout(timer);
    }
  };

  // Race all proxies — first success wins
  return Promise.any(proxies.map(p => tryProxy(p)));
}

// Extract {name, gid} pairs from Google Sheets htmlview page source
function parseSheetList(html) {
  const re = /items\.push\(\{name:\s*"([^"]+)".*?gid:\s*"([^"]+)"/g;
  const sheets = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    sheets.push({ name: m[1], gid: m[2] });
  }
  return sheets;
}

async function discoverSheets(forceRefresh = false) {
  if (!forceRefresh) {
    try {
      const cached = await window.IKMApp.DB.getCache('__sheet_list__');
      if (cached?.data?.length > 0) {
        const age = cached.ts ? (Date.now() - new Date(cached.ts).getTime()) : Infinity;
        if (age < 3600000) return { sheets: cached.data, fromCache: true };
      }
    } catch (_) { }
  }

  const htmlviewUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`;
  const html = await fetchViaProxy(htmlviewUrl);
  const sheets = parseSheetList(html);
  if (sheets.length > 0) {
    try { await window.IKMApp.DB.setCache('__sheet_list__', sheets); } catch (_) { }
  }
  return { sheets, fromCache: false };
}

// ─── CSV PARSER ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], nx = text[i + 1];
    if (inQ) {
      if (c === '"' && nx === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\r' || c === '\n') {
      row.push(field.trim()); field = '';
      rows.push(row); row = [];
      if (c === '\r' && nx === '\n') i++;
    } else field += c;
  }
  row.push(field.trim()); rows.push(row);
  return rows;
}

function C(rows, ri, ci) { const r = rows[ri]; return r ? (r[ci] || '').trim() : ''; }
function toNum(s) { return parseFloat((s || '').replace('%', '').replace(',', '.').trim()) || 0; }

function extractIKMData(rows) {
  const title = C(rows, 1, 1);
  const month = C(rows, 2, 1);
  const totalRespondents = C(rows, 18, 3);
  const finalScore = C(rows, 19, 3);
  const finalScoreText = C(rows, 19, 4);

  const aspNames = [
    'Kesesuaian Persyaratan', 'Kemudahan Prosedur', 'Kecepatan Pelayanan',
    'Tarif Pelayanan', 'Kesesuaian Pelayanan', 'Kompetensi Petugas',
    'Kesopanan & Keramahan', 'Sarana & Prasarana', 'Penanganan Aduan'
  ];
  const aspects = aspNames.map((name, i) => ({
    name, score: toNum(C(rows, 15, i + 1)), label: C(rows, 16, i + 1)
  }));

  const gender = { labels: [], values: [] }, education = { labels: [], values: [] }, employment = { labels: [], values: [] };
  for (let i = 23; i <= 32 && i < rows.length; i++) {
    const gL = C(rows, i, 1), gV = toNum(C(rows, i, 2));
    if (gL && gV > 0 && gL.toLowerCase() !== 'total') { gender.labels.push(gL); gender.values.push(gV); }
    const eL = C(rows, i, 4), eV = toNum(C(rows, i, 5));
    if (eL && eV > 0) { education.labels.push(eL); education.values.push(eV); }
    const pL = C(rows, i, 7), pV = toNum(C(rows, i, 8));
    if (pL && pV > 0) { employment.labels.push(pL); employment.values.push(pV); }
  }
  return {
    title, month, totalRespondents, finalScore, finalScoreText, aspects,
    demographics: { gender, education, employment }
  };
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────
function AspectBarChart({ aspects }) {
  const ref = useRef(null), chart = useRef(null);
  useEffect(() => {
    if (!ref.current || !aspects?.length) return;
    if (chart.current) { chart.current.destroy(); chart.current = null; }
    const scores = aspects.map(a => a.score);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    chart.current = new Chart(ref.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: aspects.map(a => a.name), datasets: [
          {
            label: 'Nilai Aspek (%)', data: scores,
            backgroundColor: scores.map(s => s >= 88.31 ? 'rgba(1,105,111,0.75)' : s >= 76.61 ? 'rgba(67,122,34,0.75)' : 'rgba(209,153,0,0.75)'),
            borderColor: scores.map(s => s >= 88.31 ? '#01696f' : s >= 76.61 ? '#437a22' : '#d19900'),
            borderWidth: 1.5, borderRadius: 6, borderSkipped: false
          },
          {
            label: `Rata-rata (${avg.toFixed(2)}%)`, data: aspects.map(() => avg),
            type: 'line', borderColor: '#a12c7b', borderWidth: 2, borderDash: [6, 4],
            pointRadius: 0, fill: false, tension: 0
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { font: { size: 11 }, padding: 12, boxWidth: 12 } },
          tooltip: {
            backgroundColor: '#1c1b19', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => ` ${ctx.dataset.label.split(' (')[0]}: ${Number(ctx.raw).toFixed(2)}%` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' }, color: '#7a7974', maxRotation: 35 } },
          y: { beginAtZero: false, min: 50, max: 100, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 }, callback: v => v + '%' } }
        },
        animation: { duration: 500, easing: 'easeOutQuart' }
      }
    });
    return () => { if (chart.current) chart.current.destroy(); };
  }, [aspects]);
  if (!aspects?.length) return null;
  return <canvas ref={ref} style={{ width: '100%', height: '300px' }} />;
}

function PieChart({ labels, values, colors }) {
  const ref = useRef(null), chart = useRef(null);
  const fb = ['#01696f', '#d19900', '#a12c7b', '#437a22', '#006494', '#7a39bb', '#da7101', '#a13544'];
  useEffect(() => {
    if (!ref.current || !values?.length) return;
    if (chart.current) { chart.current.destroy(); chart.current = null; }
    chart.current = new Chart(ref.current.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors || fb.slice(0, values.length), borderColor: '#fff', borderWidth: 2, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, boxWidth: 12, color: '#28251d' } },
          tooltip: {
            backgroundColor: '#1c1b19', bodyFont: { size: 11 }, padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => { const t = ctx.dataset.data.reduce((a, b) => a + b, 0); return ` ${ctx.label}: ${ctx.raw} (${t > 0 ? Math.round(ctx.raw / t * 100) : 0}%)`; } }
          }
        }, animation: { duration: 500, easing: 'easeOutQuart' }
      }
    });
    return () => { if (chart.current) chart.current.destroy(); };
  }, [labels, values]);
  if (!values?.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', color: '#bab9b4', fontSize: '0.85rem', gap: '8px' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
      <span>Data tidak tersedia</span>
    </div>
  );
  return <canvas ref={ref} style={{ width: '100%', height: '200px' }} />;
}

function ScoreGauge({ score, color }) {
  const num = toNum(score), circ = Math.PI * 64, fill = (num / 100) * circ;
  return (
    <div className="gauge-wrap">
      <svg width="160" height="96" viewBox="0 0 160 96" style={{ overflow: 'visible' }}>
        <path d="M 16 80 A 64 64 0 0 1 144 80" fill="none" stroke="var(--color-divider)" strokeWidth="12" strokeLinecap="round" />
        <path d="M 16 80 A 64 64 0 0 1 144 80" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${circ}`} strokeDashoffset={`${circ - fill}`}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '1rem 0' }}>
      {[['50%', '2rem'], ['100%', '1rem'], ['100%', '1rem'], ['75%', '1rem'], ['100%', '280px']].map(([w, h], i) => (
        <div key={i} className="skeleton" style={{ height: h, width: w, borderRadius: '6px' }} />
      ))}
    </div>
  );
}

function SheetSelector({ sheets, currentGid, onChange, discovering, onRefresh }) {
  return (
    <div className="sheet-selector">
      <label htmlFor="sheet-select" className="sheet-label">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
        Periode
      </label>
      {sheets.length === 0 ? (
        <div className="sheet-discovering">
          {discovering
            ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg><span>Memuat…</span></>
            : <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>Gagal memuat</span>
          }
        </div>
      ) : (
        <select id="sheet-select" className="sheet-select" value={currentGid || ''} onChange={e => onChange(e.target.value)}>
          {sheets.map(s => <option key={s.gid} value={s.gid}>{s.name}</option>)}
        </select>
      )}
      <button className="btn-icon" onClick={onRefresh} disabled={discovering} title="Muat ulang daftar sheet">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={discovering ? 'spin' : ''}>
          <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function App() {
  const [sheets, setSheets] = useState(FALLBACK_SHEETS); // Start with fallback immediately
  const [discovering, setDiscovering] = useState(true);
  const [selectedGid, setSelectedGid] = useState(FALLBACK_SHEETS[FALLBACK_SHEETS.length - 1].gid);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [cacheTs, setCacheTs] = useState(null);
  const [error, setError] = useState(null);
  const [proxyNote, setProxyNote] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const loadSheets = useCallback(async (forceRefresh = false) => {
    setDiscovering(true);
    setProxyNote(null);

    if (!navigator.onLine) {
      // Try cached list, otherwise keep fallback
      try {
        const cached = await window.IKMApp.DB.getCache('__sheet_list__');
        if (cached?.data?.length > 0) {
          setSheets(cached.data);
          setSelectedGid(prev => (prev && cached.data.find(s => s.gid === prev)) ? prev : cached.data[cached.data.length - 1].gid);
        }
      } catch (_) { }
      setDiscovering(false);
      return;
    }

    try {
      const result = await discoverSheets(forceRefresh);
      if (result.sheets.length > 0) {
        setSheets(result.sheets);
        // Preserve selection if still valid, otherwise pick last (most recent)
        setSelectedGid(prev => {
          if (prev && result.sheets.find(s => s.gid === prev)) return prev;
          return result.sheets[result.sheets.length - 1].gid;
        });
      } else {
        // Proxy succeeded but found no sheets — keep fallback
        setProxyNote('Daftar sheet tidak dapat dibaca otomatis. Menggunakan daftar bawaan.');
      }
    } catch (e) {
      // ALL proxies failed — silently keep fallback, show small note
      setProxyNote('Memuat daftar dari data bawaan. Klik ↺ untuk coba lagi.');
    }
    setDiscovering(false);
  }, []);

  // On mount: start with fallback sheets so app renders immediately,
  // then try to discover real sheets in background
  useEffect(() => { loadSheets(); }, [loadSheets]);

  const fetchData = useCallback(async (gid, forceRefresh = false) => {
    if (!gid) return;
    setLoading(true); setError(null);
    const cacheKey = `sheet_${gid}`;

    if (!forceRefresh) {
      try {
        const cached = await window.IKMApp.DB.getCache(cacheKey);
        if (cached?.data) {
          const age = cached.ts ? (Date.now() - new Date(cached.ts).getTime()) : Infinity;
          if (!navigator.onLine || age < 86400000) {
            setData(cached.data); setFromCache(true); setCacheTs(cached.ts);
            setLoading(false); return;
          }
        }
      } catch (_) { }
    }

    if (!navigator.onLine) {
      try {
        const cached = await window.IKMApp.DB.getCache(cacheKey);
        if (cached?.data) { setData(cached.data); setFromCache(true); setCacheTs(cached.ts); setError('Offline – menampilkan data tersimpan.'); }
        else { setError('Tidak ada koneksi dan belum ada data tersimpan untuk periode ini.'); setData(null); }
      } catch (_) { setError('Tidak ada koneksi.'); setData(null); }
      setLoading(false); return;
    }

    try {
      const res = await fetch(csvExportUrl(gid), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) throw new Error('Sheet tidak dapat diakses. Pastikan spreadsheet diset publik.');
      const text = await res.text();
      if (text.trim().length < 10) throw new Error('Data kosong diterima dari server.');
      const extracted = extractIKMData(parseCSV(text));
      try { await window.IKMApp.DB.setCache(cacheKey, extracted); } catch (_) { }
      setData(extracted); setFromCache(false); setCacheTs(new Date().toISOString());
    } catch (err) {
      try {
        const cached = await window.IKMApp.DB.getCache(cacheKey);
        if (cached?.data) { setData(cached.data); setFromCache(true); setCacheTs(cached.ts); setError(`Gagal memuat — menampilkan cache. (${err.message})`); }
        else { setError(`Gagal memuat data: ${err.message}`); setData(null); }
      } catch (_) { setError(`Gagal memuat data: ${err.message}`); setData(null); }
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedGid) { setData(null); fetchData(selectedGid); } }, [selectedGid, fetchData]);
  useEffect(() => {
    const t = setInterval(() => { if (selectedGid) fetchData(selectedGid, true); }, 86400000);
    return () => clearInterval(t);
  }, [selectedGid, fetchData]);

  const d = data;
  const selectedSheet = sheets.find(s => s.gid === selectedGid);
  const sNum = d ? toNum(d.finalScore) : 0;
  const sColor = sNum >= 88.31 ? 'var(--color-primary)' : sNum >= 76.61 ? 'var(--color-success)' : sNum >= 65 ? 'var(--color-gold)' : 'var(--color-error)';

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <img src="rsi-logo.svg" className="header-logo" aria-label="RSU Islam Klaten"></img>
            <div>
              <h1 className="header-title">{d?.title || 'Survei Kepuasan Masyarakat'}</h1>
              <p className="header-sub">RSU Islam Klaten · Ramah, Amanah, Profesional, Islami (RAPI)</p>
            </div>
          </div>
          <div className="header-actions">
            {!isOnline && <span className="badge-offline">Offline</span>}
            {fromCache && <span className="badge-cache">Cache</span>}
            <SheetSelector sheets={sheets} currentGid={selectedGid} onChange={gid => { setSelectedGid(gid); }}
              discovering={discovering} onRefresh={() => loadSheets(true)} />
            <button className="btn-refresh" onClick={() => fetchData(selectedGid, true)} disabled={loading || !selectedGid}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={loading ? 'spin' : ''}>
                <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>{loading ? 'Memuat…' : 'Perbarui'}</span>
            </button>
          </div>
        </div>
        {!isOnline && <div className="offline-bar">⚡ Mode Offline — menampilkan data tersimpan terakhir</div>}
        {proxyNote && <div className="proxy-note">ℹ️ {proxyNote}</div>}
      </header>

      <main className="main-content">
        {error && (
          <div className="alert-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-wrap"><Skeleton /></div>
        ) : !d ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-faint)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <h3>Data tidak tersedia</h3>
            <p>Tidak ada data untuk periode <strong>{selectedSheet?.name || 'yang dipilih'}</strong>.</p>
            <button className="btn-primary" onClick={() => fetchData(selectedGid, true)}>Coba Lagi</button>
          </div>
        ) : (
          <>
            <section className="section-card intro-section">
              <div className="intro-header">
                <div>
                  <div className="section-eyebrow">Periode Survei</div>
                  <h2 className="section-heading">{d.month || selectedSheet?.name}</h2>
                </div>
                <div className="respondent-badge">
                  <span className="respondent-num">{d.totalRespondents || '—'}</span>
                  <span className="respondent-label">Responden</span>
                </div>
              </div>

              <p className="intro-text"><i>Assalamu'alaikum wr wb</i></p>
              <p className="intro-text">Yth. Pelanggan RSU Islam Klaten</p><br />
              <p className="intro-text">
                Sebagai wujud komitmen berkelanjutan dalam menjaga kualitas layanan, RSU Islam Klaten secara berkala
                menyelenggarakan Survei Kepuasan Masyarakat. Pada periode <strong>{d.month || selectedSheet?.name}</strong>,
                survei yang melibatkan <strong>{d.totalRespondents} responden</strong> ini menghasilkan nilai Indeks
                Kepuasan Masyarakat (IKM) sebesar <strong>{d.finalScore}</strong>. Skor tersebut menempatkan mutu
                pelayanan kami pada predikat kinerja <strong>{d.finalScoreText}</strong>.
                Pencapaian ini sekaligus membuktikan bahwa RSU Islam Klaten telah berhasil memenuhi target yang
                direncanakan, di mana target kepuasan pelanggan pada bulan <strong>{d.month || selectedSheet?.name}</strong> mencapai
                predikat <strong>{d.finalScoreText}</strong>.
              </p>
            </section>

            <section className="section-card score-section">
              <h2 className="section-heading">Nilai Kumulatif IKM</h2>
              <div className="score-layout">
                <div className="score-gauge-wrap">
                  <ScoreGauge score={d.finalScore} color={sColor} />
                  <div className="score-number" style={{ color: sColor }}>{d.finalScore || '—'}</div>
                  <div className="score-label-text">{d.finalScoreText || '—'}</div>
                </div>
                <div className="score-legend">
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-primary)' }} /><span><strong>88,31 – 100</strong> — Sangat Baik (A)</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-success)' }} /><span><strong>76,61 – 88,30</strong> — Baik (B)</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-gold)' }} /><span><strong>65,00 – 76,60</strong> — Kurang Baik (C)</span></div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-error)' }} /><span><strong>25,00 – 64,99</strong> — Tidak Baik (D)</span></div>
                  <div className="legend-divider" />
                  <p className="legend-note">Skor merupakan rata-rata tertimbang dari {d.aspects?.length || 9} aspek penilaian. Nilai minimal standar nasional adalah &#x3E;76,6%</p>
                </div>
              </div>
            </section>

            <section className="section-card">
              <h2 className="section-heading">Rincian Nilai Aspek Pelayanan</h2>
              <p className="section-sub">Bar chart dengan nilai maksimum 100%, dilengkapi trendline rata-rata.</p>
              <div className="chart-container" style={{ height: '320px', marginTop: '1rem' }}>
                <AspectBarChart aspects={d.aspects} />
              </div>
            </section>

            <section className="section-card">
              <h2 className="section-heading">Data Responden</h2>
              <div className="pie-grid">
                <div className="pie-card">
                  <h3 className="pie-title">Jenis Kelamin</h3>
                  <div style={{ height: '220px' }}>
                    <PieChart
                      labels={d.demographics.gender.labels.length ? d.demographics.gender.labels : ['Laki-Laki', 'Perempuan']}
                      values={d.demographics.gender.values.length ? d.demographics.gender.values : [0, 0]}
                      colors={['#3b82f6', '#ec4899']} />
                  </div>
                </div>
                <div className="pie-card">
                  <h3 className="pie-title">Pendidikan</h3>
                  <div style={{ height: '220px' }}>
                    <PieChart labels={d.demographics.education.labels} values={d.demographics.education.values} />
                  </div>
                </div>
                <div className="pie-card">
                  <h3 className="pie-title">Pekerjaan</h3>
                  <div style={{ height: '220px' }}>
                    <PieChart labels={d.demographics.employment.labels} values={d.demographics.employment.values} />
                  </div>
                </div>
              </div>
            </section>

            <section className="section-card">
              <h2 className="section-heading">Analisis Unsur Pelayanan</h2>
              <p className="section-sub">Secara akumulatif, nilai <strong>{d.finalScore}</strong> mencerminkan performa layanan yang solid. Berikut rincian capaian per aspek:</p>
              <div className="table-wrap">
                <table className="aspect-table">
                  <thead><tr><th>No.</th><th>Aspek Pelayanan</th><th>Nilai</th><th>Predikat</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.aspects.map((asp, i) => {
                      const sB = asp.score >= 88.31, b = asp.score >= 76.61, k = asp.score >= 65;
                      const bc = sB ? 'status-great' : b ? 'status-good' : k ? 'status-fair' : asp.score > 0 ? 'status-poor' : '';
                      const bt = sB ? 'Sangat Baik' : b ? 'Baik' : k ? 'Kurang Baik' : asp.score > 0 ? 'Tidak Baik' : '—';
                      const nc = sB ? 'var(--color-primary)' : b ? 'var(--color-success)' : k ? 'var(--color-gold)' : 'var(--color-error)';
                      return (
                        <tr key={i}>
                          <td className="td-num">{i + 1}</td><td>{asp.name}</td>
                          <td className="td-score" style={{ color: nc }}><strong>{asp.score > 0 ? asp.score.toFixed(2) + '%' : '—'}</strong></td>
                          <td>{asp.label || '—'}</td>
                          <td><span className={`status-badge ${bc}`}>{bt}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="section-card conclusion-section">
              <h2 className="section-heading">Kesimpulan</h2>
              <p>Meskipun sebagian besar unsur pelayanan sudah berjalan optimal dan masuk dalam kategori <strong>{d.finalScoreText}</strong>, RSU Islam Klaten akan terus melakukan langkah-langkah strategis untuk meningkatkan kenyamanan dan kepuasan pelanggan.</p>
              <br />
              <p>Terimakasih,</p>
              <p><i>Wassalamu'alaikum wr wb</i></p>
            </section>
          </>
        )}
      </main>
      <footer className="app-footer">
        <p>RSU Islam Klaten · Laporan IKM {d?.month || selectedSheet?.name}</p>
        <p>Dikembangkan oleh <a class="footer-link" href="https://kfmd.notion.site" target="_blank">dr. Khariz Fahrurrozi</a> & Tim IT RSU Islam Klaten</p>
        {cacheTs && <p className="footer-ts">Data diperbarui: {new Date(cacheTs).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
