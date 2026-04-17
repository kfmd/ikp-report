// app.js — IKM Dashboard React Application (JSX, processed by Babel)
// Data source: Google Sheets via CSV export

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SHEET_ID = '19nNWdVnYdW1vEv0E0zAzVBSNc5DQKebAia7LD3fMv_o';

// Column mapping (0-indexed): A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9
const COL = { B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9 };

// Demographic data ranges — rows are 0-indexed (row 1 = index 0 in CSV)
// Gender: rows around 20-24, Education ~26-31, Employment ~33-38 (adjust per actual sheet)
// These are defined per sheet discovery — we read all rows and find headers dynamically.

function csvExportUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&sheet=${encodeURIComponent(sheetName)}`;
}

// Parse CSV (RFC 4180 compliant)
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], nx = text[i + 1];
    if (inQ) { if (c === '"' && nx === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\r' || c === '\n') {
      row.push(field.trim()); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = []; if (c === '\r' && nx === '\n') i++;
    } else field += c;
  }
  row.push(field.trim());
  if (row.some(f => f !== '')) rows.push(row);
  return rows;
}

function getCell(rows, rowIdx, colIdx) {
  const row = rows[rowIdx];
  if (!row) return '';
  return (row[colIdx] || '').trim();
}

// Extract IKM data from parsed CSV rows
function extractIKMData(rows) {
  const r = rows; // rows are 0-indexed; row 2 (B2) = rows[1][1]
  const title = getCell(r, 1, COL.B);       // B2
  const month = getCell(r, 2, COL.B);       // B3
  const totalRespondents = getCell(r, 24, COL.C); // C25
  const finalScore = getCell(r, 18, COL.D); // D19
  const finalScoreText = getCell(r, 18, COL.E); // E19

  // SC values: row 16 (index 15), labels: row 17 (index 16)
  const aspects = [];
  const aspCols = [COL.B, COL.C, COL.D, COL.E, COL.F, COL.G, COL.H, COL.I, COL.J];
  const aspNames = [
    'Kesesuaian Persyaratan', 'Kemudahan Pelayanan', 'Kecepatan Pelayanan',
    'Tarif Pelayanan', 'Kesesuaian Pelayanan', 'Kompetensi Petugas',
    'Kesopanan & Keramahan', 'Sarana & Prasarana', 'Penanganan Aduan'
  ];
  for (let i = 0; i < aspCols.length; i++) {
    aspects.push({
      name: aspNames[i],
      score: parseFloat(getCell(r, 15, aspCols[i])) || 0,  // row 16 = index 15
      label: getCell(r, 16, aspCols[i])  // row 17 = index 16
    });
  }

  // Demographics — scan rows from 18 onwards for labeled sections
  // Gender: look for "Jenis Kelamin" or rows with Laki/Perempuan data
  const demographics = extractDemographics(r);

  return { title, month, totalRespondents, finalScore, finalScoreText, aspects, demographics };
}

function extractDemographics(rows) {
  // We'll search for known patterns in rows 19–50 range
  const gender = { labels: [], values: [] };
  const education = { labels: [], values: [] };
  const employment = { labels: [], values: [] };

  // Scan all rows for demographic keywords
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const row = rows[i];
    if (!row) continue;
    const joined = row.join(' ').toLowerCase();

    // Gender section
    if (joined.includes('laki-laki') || joined.includes('laki laki')) {
      for (let j = 0; j < row.length; j++) {
        const cell = row[j].trim().toLowerCase();
        if (cell.includes('laki')) {
          const val = parseFloat(row[j+1] || row[j+2] || '0');
          if (!isNaN(val) && val > 0) { gender.labels.push('Laki-Laki'); gender.values.push(val); }
        }
        if (cell.includes('perempuan') || cell.includes('wanita')) {
          const val = parseFloat(row[j+1] || row[j+2] || '0');
          if (!isNaN(val) && val > 0) { gender.labels.push('Perempuan'); gender.values.push(val); }
        }
      }
    }

    // Education section
    if (joined.includes('sd') || joined.includes('smp') || joined.includes('sma') || joined.includes('diploma') || joined.includes('sarjana') || joined.includes('s1')) {
      const edKeywords = ['sd', 'smp', 'sma/smk', 'sma', 'smk', 'd1', 'd2', 'd3', 'diploma', 's1', 's2', 's3', 'sarjana'];
      for (let j = 0; j < row.length; j++) {
        const cell = row[j].trim().toLowerCase();
        const matched = edKeywords.find(k => cell === k || cell.startsWith(k + ' ') || cell.startsWith(k + '/'));
        if (matched) {
          const val = parseFloat(row[j+1] || row[j+2] || '0');
          if (!isNaN(val) && val > 0 && !education.labels.includes(row[j].trim())) {
            education.labels.push(row[j].trim()); education.values.push(val);
          }
        }
      }
    }

    // Employment section
    if (joined.includes('pns') || joined.includes('swasta') || joined.includes('wirausaha') || joined.includes('pelajar') || joined.includes('pensiunan')) {
      const empKeywords = ['pns', 'tni/polri', 'tni', 'polri', 'swasta', 'wirausaha', 'pelajar', 'mahasiswa', 'pensiunan', 'lainnya'];
      for (let j = 0; j < row.length; j++) {
        const cell = row[j].trim().toLowerCase();
        const matched = empKeywords.find(k => cell.startsWith(k));
        if (matched) {
          const val = parseFloat(row[j+1] || row[j+2] || '0');
          if (!isNaN(val) && val > 0 && !employment.labels.includes(row[j].trim())) {
            employment.labels.push(row[j].trim()); employment.values.push(val);
          }
        }
      }
    }
  }

  return { gender, education, employment };
}

// ─── CHART COMPONENTS ────────────────────────────────────────────────────────

function AspectBarChart({ aspects }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !aspects || aspects.length === 0) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const scores = aspects.map(a => a.score);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const trendData = aspects.map(() => avg);

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: aspects.map(a => a.name),
        datasets: [
          {
            label: 'Nilai Aspek',
            data: scores,
            backgroundColor: scores.map(s => s >= 80 ? 'rgba(1,105,111,0.75)' : s >= 65 ? 'rgba(209,153,0,0.75)' : 'rgba(161,44,123,0.75)'),
            borderColor: scores.map(s => s >= 80 ? '#01696f' : s >= 65 ? '#d19900' : '#a12c7b'),
            borderWidth: 1.5, borderRadius: 6, borderSkipped: false,
          },
          {
            label: 'Rata-rata',
            data: trendData,
            type: 'line',
            borderColor: '#a12c7b',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            tension: 0,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" }, padding: 12, boxWidth: 12 } },
          tooltip: { backgroundColor: '#1c1b19', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' }, color: '#7a7974', maxRotation: 35 } },
          y: {
            beginAtZero: false, min: 50, max: 100,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { font: { size: 10 }, callback: v => v + '%' }
          }
        },
        animation: { duration: 500, easing: 'easeOutQuart' }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [aspects]);

  if (!aspects || aspects.length === 0) return null;
  return <canvas ref={canvasRef} style={{ width: '100%', height: '280px' }} />;
}

function PieChart({ labels, values, colors, title }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const defaultColors = [
    '#01696f','#d19900','#a12c7b','#437a22','#006494','#7a39bb','#da7101','#a13544'
  ];

  useEffect(() => {
    if (!canvasRef.current || !values || values.length === 0) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const bg = colors || defaultColors.slice(0, values.length);

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: bg,
          borderColor: '#fff',
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, boxWidth: 12, color: '#28251d' } },
          tooltip: {
            backgroundColor: '#1c1b19', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round(ctx.raw / total * 100) : 0;
                return ` ${ctx.raw} (${pct}%)`;
              }
            }
          }
        },
        animation: { duration: 500, easing: 'easeOutQuart' }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [labels, values]);

  if (!values || values.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', color: '#bab9b4', fontSize: '0.85rem', gap: '8px' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <span>Data tidak tersedia</span>
      </div>
    );
  }
  return <canvas ref={canvasRef} style={{ width: '100%', height: '200px' }} />;
}

// ─── SCORE GAUGE ─────────────────────────────────────────────────────────────

function ScoreGauge({ score }) {
  const num = parseFloat(score) || 0;
  const pct = Math.min(Math.max((num - 0) / 100 * 100, 0), 100);
  const color = num >= 80 ? '#01696f' : num >= 65 ? '#d19900' : '#a12c7b';
  const r = 64; const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="gauge-wrap">
      <svg width="160" height="90" viewBox="0 0 160 90" style={{ overflow: 'visible' }}>
        <path d="M 16 80 A 64 64 0 0 1 144 80" fill="none" stroke="var(--color-divider)" strokeWidth="12" strokeLinecap="round"/>
        <path
          d="M 16 80 A 64 64 0 0 1 144 80" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circ / 2} strokeDashoffset={circ / 2 - (pct / 100) * (circ / 2)}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="80" y="70" textAnchor="middle" fontSize="24" fontWeight="800" fill={color} fontFamily="'Plus Jakarta Sans',sans-serif">{score || '–'}</text>
      </svg>
    </div>
  );
}

// ─── SKELETON LOADER ─────────────────────────────────────────────────────────

function Skeleton({ height = '1rem', width = '100%', style = {} }) {
  return <div className="skeleton" style={{ height, width, borderRadius: '6px', ...style }} />;
}

function SkeletonBlock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Skeleton height="2.5rem" width="60%" />
      <Skeleton height="1rem" />
      <Skeleton height="1rem" />
      <Skeleton height="1rem" width="80%" />
      <Skeleton height="280px" style={{ marginTop: '8px' }} />
    </div>
  );
}

// ─── SHEET SELECTOR ──────────────────────────────────────────────────────────

function SheetSelector({ sheets, current, onChange }) {
  return (
    <div className="sheet-selector">
      <label htmlFor="sheet-select" className="sheet-label">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        Pilih Periode
      </label>
      <select id="sheet-select" className="sheet-select" value={current} onChange={e => onChange(e.target.value)}>
        {sheets.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const KNOWN_SHEETS = ['Juni 2025', 'Juli 2025', 'Agustus 2025', 'September 2025', 'Oktober 2025', 'November 2025', 'Desember 2025', 'Januari 2026', 'Februari 2026', 'Maret 2026', 'April 2026'];

function App() {
  const [selectedSheet, setSelectedSheet] = useState('Juni 2025');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [cacheTs, setCacheTs] = useState(null);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const fetchData = useCallback(async (sheetName, forceRefresh = false) => {
    setLoading(true); setError(null);

    if (!forceRefresh) {
      const cached = await window.IKMApp.DB.getCache(sheetName);
      if (cached && cached.data) {
        const cacheAge = cached.ts ? (Date.now() - new Date(cached.ts).getTime()) : Infinity;
        // Use cache if offline or less than 24h old
        if (!navigator.onLine || cacheAge < 86400000) {
          setData(cached.data); setFromCache(true); setCacheTs(cached.ts);
          setLoading(false); return;
        }
      }
    }

    if (!navigator.onLine) {
      const cached = await window.IKMApp.DB.getCache(sheetName);
      if (cached && cached.data) {
        setData(cached.data); setFromCache(true); setCacheTs(cached.ts);
        setError('Offline – menampilkan data tersimpan');
      } else {
        setError('Tidak ada koneksi internet dan belum ada data tersimpan untuk periode ini.');
        setData(null);
      }
      setLoading(false); return;
    }

    try {
      const url = csvExportUrl(sheetName);
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) throw new Error('Spreadsheet tidak publik atau nama sheet salah');
      const text = await res.text();
      const rows = parseCSV(text);
      const extracted = extractIKMData(rows);
      await window.IKMApp.DB.setCache(sheetName, extracted);
      setData(extracted); setFromCache(false); setCacheTs(new Date().toISOString());
    } catch (err) {
      const cached = await window.IKMApp.DB.getCache(sheetName);
      if (cached && cached.data) {
        setData(cached.data); setFromCache(true); setCacheTs(cached.ts);
        setError(`Gagal memuat dari Google Sheets – menampilkan cache. (${err.message})`);
      } else {
        setError(`Gagal memuat data: ${err.message}`);
        setData(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(selectedSheet); }, [selectedSheet, fetchData]);

  // Auto-refresh daily
  useEffect(() => {
    const timer = setInterval(() => fetchData(selectedSheet, true), 86400000);
    return () => clearInterval(timer);
  }, [selectedSheet, fetchData]);

  const d = data;
  const score = d ? parseFloat(d.finalScore) : 0;

  return (
    <div className="app-root">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <svg className="header-logo" aria-label="RSU Islam Klaten IKM" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="var(--color-primary)"/>
              <path d="M12 36V18l12-8 12 8v18" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
              <rect x="19" y="24" width="10" height="12" rx="1" fill="white" fillOpacity="0.9"/>
              <path d="M22 20h4M24 18v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <h1 className="header-title">{d?.title || 'Survei Kepuasan Masyarakat'}</h1>
              <p className="header-sub">RSU Islam Klaten · Indeks Kepuasan Masyarakat (IKM)</p>
            </div>
          </div>
          <div className="header-actions">
            {!isOnline && <span className="badge-offline">Offline</span>}
            {fromCache && <span className="badge-cache">Cache</span>}
            <SheetSelector sheets={KNOWN_SHEETS} current={selectedSheet} onChange={s => { setSelectedSheet(s); setData(null); }} />
            <button className="btn-refresh" onClick={() => fetchData(selectedSheet, true)} disabled={loading} title="Refresh data">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={loading ? 'spin' : ''}>
                <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span>{loading ? 'Memuat…' : 'Perbarui'}</span>
            </button>
          </div>
        </div>
        {!isOnline && <div className="offline-bar">⚡ Mode Offline — menampilkan data tersimpan terakhir</div>}
      </header>

      <main className="main-content">
        {error && (
          <div className="alert-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-wrap"><SkeletonBlock /></div>
        ) : !data ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-faint)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <h3>Data tidak tersedia</h3>
            <p>Tidak ada data untuk periode <strong>{selectedSheet}</strong>. Pastikan nama sheet benar dan spreadsheet sudah diatur publik.</p>
            <button className="btn-primary" onClick={() => fetchData(selectedSheet, true)}>Coba Lagi</button>
          </div>
        ) : (
          <>
            {/* ── SECTION 1: INTRO ── */}
            <section className="section-card intro-section">
              <div className="intro-header">
                <div>
                  <div className="section-eyebrow">Periode Survei</div>
                  <h2 className="section-heading">{d.month || selectedSheet}</h2>
                </div>
                <div className="respondent-badge">
                  <span className="respondent-num">{d.totalRespondents || '—'}</span>
                  <span className="respondent-label">Responden</span>
                </div>
              </div>
              <p className="intro-text">
                Sebagai wujud komitmen berkelanjutan dalam menjaga kualitas layanan, RSU Islam Klaten secara berkala menyelenggarakan Survei Kepuasan Masyarakat. Pada periode <strong>{d.month || selectedSheet}</strong>, survei yang melibatkan <strong>{d.totalRespondents || '—'} responden</strong> ini menghasilkan nilai Indeks Kepuasan Masyarakat (IKM) sebesar <strong>{d.finalScore}</strong>. Skor tersebut menempatkan mutu pelayanan kami pada Kategori B dengan predikat kinerja <strong>{d.finalScoreText || 'Baik'}</strong>. Pencapaian ini sekaligus membuktikan bahwa RSU Islam Klaten telah berhasil memenuhi target yang direncanakan, di mana target kepuasan pelanggan pada bulan <strong>{d.month || selectedSheet}</strong> mencapai predikat <strong>{d.finalScoreText || 'Baik'}</strong>.
              </p>
            </section>

            {/* ── SECTION 2: SCORE OVERVIEW ── */}
            <section className="section-card score-section">
              <h2 className="section-heading">Nilai Kumulatif IKM</h2>
              <div className="score-layout">
                <div className="score-gauge-wrap">
                  <ScoreGauge score={d.finalScore} />
                  <div className="score-number" style={{ color: score >= 80 ? 'var(--color-primary)' : score >= 65 ? 'var(--color-gold)' : 'var(--color-error)' }}>
                    {d.finalScore}
                  </div>
                  <div className="score-label-text">{d.finalScoreText || 'Baik'}</div>
                </div>
                <div className="score-legend">
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-primary)' }}/>
                    <span><strong>≥ 80</strong> — Sangat Baik (A)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-gold)' }}/>
                    <span><strong>65–79</strong> — Baik (B)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-error)' }}/>
                    <span><strong>&lt; 65</strong> — Kurang Baik (C)</span>
                  </div>
                  <div className="legend-divider"/>
                  <p className="legend-note">Skor ini merupakan rata-rata tertimbang dari {d.aspects?.length || 9} aspek penilaian pelayanan.</p>
                </div>
              </div>
            </section>

            {/* ── SECTION 3: BAR CHART ── */}
            <section className="section-card">
              <h2 className="section-heading">Rincian Nilai Aspek Pelayanan</h2>
              <p className="section-sub">Ditampilkan dalam bentuk bar chart dengan nilai maksimum 100%, dilengkapi trendline rata-rata.</p>
              <div className="chart-container" style={{ height: '300px', marginTop: '1rem' }}>
                <AspectBarChart aspects={d.aspects} />
              </div>
            </section>

            {/* ── SECTION 4: PIE CHARTS ── */}
            <section className="section-card">
              <h2 className="section-heading">Data Responden</h2>
              <div className="pie-grid">
                <div className="pie-card">
                  <h3 className="pie-title">Jenis Kelamin</h3>
                  <div style={{ height: '220px' }}>
                    <PieChart
                      labels={d.demographics?.gender?.labels?.length ? d.demographics.gender.labels : ['Laki-Laki', 'Perempuan']}
                      values={d.demographics?.gender?.values?.length ? d.demographics.gender.values : [0, 0]}
                      colors={['#3b82f6', '#ec4899']}
                    />
                  </div>
                </div>
                <div className="pie-card">
                  <h3 className="pie-title">Pendidikan</h3>
                  <div style={{ height: '220px' }}>
                    <PieChart
                      labels={d.demographics?.education?.labels || []}
                      values={d.demographics?.education?.values || []}
                    />
                  </div>
                </div>
                <div className="pie-card">
                  <h3 className="pie-title">Pekerjaan</h3>
                  <div style={{ height: '220px' }}>
                    <PieChart
                      labels={d.demographics?.employment?.labels || []}
                      values={d.demographics?.employment?.values || []}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── SECTION 5: ASPECT DETAIL TABLE ── */}
            <section className="section-card">
              <h2 className="section-heading">Analisis Unsur Pelayanan</h2>
              <p className="section-sub">
                Secara akumulatif, nilai <strong>{d.finalScore}</strong> mencerminkan performa layanan yang solid. Berikut adalah rincian capaian per aspek:
              </p>
              <div className="table-wrap">
                <table className="aspect-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Aspek Pelayanan</th>
                      <th>Nilai</th>
                      <th>Predikat</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.aspects?.map((asp, i) => (
                      <tr key={i}>
                        <td className="td-num">{i + 1}</td>
                        <td>{asp.name}</td>
                        <td className="td-score" style={{ color: asp.score >= 80 ? 'var(--color-primary)' : asp.score >= 65 ? 'var(--color-gold)' : 'var(--color-error)' }}>
                          <strong>{asp.score > 0 ? asp.score.toFixed(2) : '—'}</strong>
                        </td>
                        <td>{asp.label || '—'}</td>
                        <td>
                          <span className={`status-badge ${asp.score >= 80 ? 'status-great' : asp.score >= 65 ? 'status-good' : 'status-poor'}`}>
                            {asp.score >= 80 ? 'Sangat Baik' : asp.score >= 65 ? 'Baik' : asp.score > 0 ? 'Perlu Perhatian' : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── SECTION 6: CONCLUSION ── */}
            <section className="section-card conclusion-section">
              <h2 className="section-heading">Kesimpulan</h2>
              <p>
                Meskipun sebagian besar unsur pelayanan sudah berjalan optimal dan masuk dalam kategori baik, RSU Islam Klaten akan terus melakukan langkah-langkah strategis untuk meningkatkan efisiensi waktu layanan demi kenyamanan dan kepuasan pasien yang lebih baik.
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>RSU Islam Klaten · Laporan IKM {d?.month || selectedSheet}</p>
        {cacheTs && <p className="footer-ts">Data diperbarui: {new Date(cacheTs).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
