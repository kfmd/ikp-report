/**
 * ============================================================
 *  app.js  –  IKM Dashboard, RSU Islam Klaten
 * ============================================================
 *  React application – compiled by Babel in the browser.
 *  Uses globals from data.js:  LocalDB, DataManager, IKM, DEMO_CONFIG
 *  Uses Chart.js (loaded via CDN in index.html)
 *
 *  Component tree:
 *    <App>
 *      <AppHeader>       ← sticky bar, month selector, refresh btn
 *      <main>
 *        <ReportHeader>  ← Title + Month subheading
 *        <SummaryText>   ← body paragraph with bold data values
 *        <ScoreSection>  ← SVG gauge + stat cards
 *        <ChartsSection> ← bar chart + pie charts
 *        <AspectAnalysis>← numbered list of 9 aspects
 *        <Conclusion>    ← closing paragraph
 *      </main>
 *      <AppFooter>       ← online/offline status + cache timestamp
 * ============================================================
 */

/* global React, ReactDOM, Chart, DataManager, LocalDB, IKM, DEMO_CONFIG */

const { useState, useEffect, useRef, useCallback } = React;

// ============================================================
// SCORE GAUGE  (SVG semicircle speedometer-style gauge)
// ============================================================
function ScoreGauge({ score }) {
  // Geometry
  const R = 78, cx = 100, cy = 98;
  const pct = Math.min(Math.max(parseFloat(score) / 100, 0), 1);
  const cat = IKM.getCategory(parseFloat(score));

  // Arc endpoint: theta sweeps from π (left, score=0) → 0 (right, score=100)
  // In SVG (y-down), the top-semicircle uses sweep-flag=0 (counterclockwise)
  const theta = Math.PI * (1 - pct);
  const ex = (cx + R * Math.cos(theta)).toFixed(2);
  const ey = (cy - R * Math.sin(theta)).toFixed(2); // minus = invert Y axis

  // SVG arc paths
  const bgPath    = `M ${cx - R} ${cy} A ${R} ${R} 0 0 0 ${cx + R} ${cy}`;
  const scorePath = pct > 0.005
    ? `M ${cx - R} ${cy} A ${R} ${R} 0 0 0 ${ex} ${ey}`
    : null;

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 115" className="w-full max-w-xs mx-auto block">
        {/* Background track */}
        <path d={bgPath} fill="none" stroke="#e5e7eb" strokeWidth="14" strokeLinecap="round" />

        {/* Score arc */}
        {scorePath && (
          <path d={scorePath} fill="none" stroke={cat.color} strokeWidth="14" strokeLinecap="round" />
        )}

        {/* Needle-tip dot at end of arc */}
        {scorePath && (
          <circle cx={ex} cy={ey} r="6" fill={cat.color} stroke="#fff" strokeWidth="2" />
        )}

        {/* Large score number */}
        <text
          x={cx} y={cy - 14}
          textAnchor="middle" fontSize="30" fontWeight="700"
          fontFamily="'Playfair Display', serif" fill="#111827"
        >
          {parseFloat(score).toFixed(2)}
        </text>

        {/* "Nilai IKM" label */}
        <text x={cx} y={cy} textAnchor="middle" fontSize="10" fill="#6b7280">
          Nilai IKM
        </text>

        {/* Category badge */}
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill={cat.color}>
          Kategori {cat.grade} — {cat.label}
        </text>

        {/* Scale labels */}
        <text x={cx - R + 2} y={cy + 20} textAnchor="middle" fontSize="8" fill="#9ca3af">0</text>
        <text x={cx + R - 2} y={cy + 20} textAnchor="middle" fontSize="8" fill="#9ca3af">100</text>
      </svg>
    </div>
  );
}

// ============================================================
// BAR CHART  (aspect scores + linear regression trendline)
// ============================================================
function AspectBarChart({ labels, scores }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !labels?.length) return;

    // Destroy existing chart before creating a new one
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const trendline = IKM.calcTrendline(scores);

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Nilai Aspek (%)',
            data: scores,
            backgroundColor: scores.map(s => IKM.getCategory(s).color + '33'),  // 20% opacity
            borderColor:     scores.map(s => IKM.getCategory(s).color),
            borderWidth: 2,
            borderRadius: 7,
            borderSkipped: false,
          },
          {
            // Trendline – rendered as a Line on top of the bars (mixed chart)
            label: 'Trendline (linear)',
            data: trendline,
            type: 'line',
            borderColor: '#f59e0b',
            borderWidth: 2.5,
            borderDash: [7, 4],
            pointRadius: 4,
            pointBackgroundColor: '#f59e0b',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            fill: false,
            tension: 0.35,
            order: -1,   // Draw on top of bars
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0, max: 100,
            ticks: {
              callback: v => v + '%',
              font: { family: "'Nunito', sans-serif", size: 11 },
            },
            grid: { color: '#f3f4f6' },
          },
          x: {
            ticks: {
              font: { family: "'Nunito', sans-serif", size: 10 },
              maxRotation: 28,
              autoSkip: false,
            },
            grid: { display: false },
          },
        },
        plugins: {
          legend: {
            labels: { font: { family: "'Nunito', sans-serif", size: 12 }, padding: 16 },
          },
          tooltip: {
            titleFont: { family: "'Nunito', sans-serif" },
            bodyFont:  { family: "'Nunito', sans-serif" },
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(2)}%`,
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [JSON.stringify(labels), JSON.stringify(scores)]);

  return (
    <div style={{ position: 'relative', height: '300px', width: '100%' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

// ============================================================
// DOUGHNUT CHART  (for demographics)
// ============================================================
function DoughnutChart({ title, labels, values, colors }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !labels?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 3,
          hoverOffset: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '58%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: "'Nunito', sans-serif", size: 10.5 },
              padding: 10,
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${ctx.raw} orang (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [JSON.stringify(labels), JSON.stringify(values)]);

  return (
    <div className="card p-5 flex flex-col">
      <h4 className="text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        {title}
      </h4>
      <div className="flex-1">
        <canvas ref={canvasRef} style={{ maxHeight: '220px' }}></canvas>
      </div>
    </div>
  );
}

// ============================================================
// LOADING / ERROR STATES
// ============================================================
function LoadingState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 gap-5">
      <div className="spinner"></div>
      <p className="text-gray-400 text-sm font-medium">{message || 'Memuat data…'}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="card p-6 border-l-4 border-red-400 bg-red-50 flex gap-4 items-start">
      <span className="text-2xl mt-0.5">⚠️</span>
      <div className="flex-1">
        <p className="font-bold text-red-800 mb-1">Gagal Memuat Data</p>
        <p className="text-red-600 text-sm leading-relaxed">{message}</p>
        <p className="text-red-400 text-xs mt-2">
          Pastikan Google Sheets sudah dipublikasikan dan nama sheet sesuai nama bulan Indonesia.
        </p>
      </div>
      {onRetry && (
        <button className="btn-solid shrink-0 text-xs" onClick={onRetry}>
          ↩ Coba Lagi
        </button>
      )}
    </div>
  );
}

// ============================================================
// APP HEADER  (sticky top bar)
// ============================================================
function AppHeader({ months, selectedMonth, onMonthChange, onRefresh, refreshing, online }) {
  return (
    <header className="app-header px-4 py-5 sm:px-8 no-print">
      <div className="max-w-5xl mx-auto">
        {/* Row 1: branding + controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl font-extrabold text-white flex-shrink-0 border border-white/30">
              ☪
            </div>
            <div>
              <p className="text-white/60 text-[10px] uppercase tracking-widest leading-none">Dashboard IKM</p>
              <p className="text-white font-bold text-sm leading-snug">RSU Islam Klaten</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Online/offline badge */}
            <span className="text-white/70 text-xs hidden sm:flex items-center">
              <span className={`status-dot ${online ? 'online' : 'offline'}`}></span>
              {online ? 'Online' : 'Offline'}
            </span>

            {/* Month selector */}
            {months.length > 0 && (
              <select
                className="month-selector"
                value={selectedMonth}
                onChange={e => onMonthChange(e.target.value)}
              >
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            {/* Refresh button */}
            <button
              className="btn-glass"
              onClick={onRefresh}
              disabled={refreshing || !online}
              title={online ? 'Ambil data terbaru dari Google Sheets' : 'Tidak ada koneksi internet'}
            >
              {refreshing
                ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }}></span> Memuat…</>
                : <>⟳ Perbarui Data</>
              }
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// REPORT HEADER  (title + month, inside the page content)
// ============================================================
function ReportHeader({ title, month }) {
  return (
    <div className="text-center py-7 px-4">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
        {title}
      </h1>
      <p className="text-brand-700 font-semibold mt-2 text-lg tracking-wide">{month}</p>
      <span className="report-accent-line"></span>
    </div>
  );
}

// ============================================================
// SUMMARY TEXT  (the paragraph body with bold data values)
// ============================================================
function SummaryText({ month, totalRespondents, finalScore, finalScoreText }) {
  const cat = IKM.getCategory(finalScore);
  const B = ({ children }) => <strong className="data-highlight">{children}</strong>;

  return (
    <div className="card p-6 sm:p-8 space-y-4 text-gray-700 text-[15px] leading-[1.85]">
      <p>
        Sebagai wujud komitmen berkelanjutan dalam menjaga kualitas layanan, RSU Islam Klaten
        secara berkala menyelenggarakan Survei Kepuasan Masyarakat. Pada periode{' '}
        <B>{month}</B>, survei yang melibatkan <B>{totalRespondents} responden</B> ini
        menghasilkan nilai Indeks Kepuasan Masyarakat (IKM) sebesar{' '}
        <B>{parseFloat(finalScore).toFixed(2)}</B>. Skor tersebut menempatkan mutu
        pelayanan kami pada <B>Kategori {cat.grade}</B> dengan predikat kinerja{' '}
        <B>{cat.label}</B>.
      </p>
      <p>
        Pencapaian ini sekaligus membuktikan bahwa RSU Islam Klaten telah berhasil memenuhi
        target yang direncanakan, di mana target kepuasan pelanggan pada bulan <B>{month}</B> mencapai
        predikat <B>{finalScoreText || cat.label}</B>.
      </p>
    </div>
  );
}

// ============================================================
// SCORE SECTION  (gauge + 3 stat cards)
// ============================================================
function ScoreSection({ finalScore, finalScoreText, totalRespondents }) {
  const cat = IKM.getCategory(finalScore);
  return (
    <div className="card card-elevated">
      <div className="px-6 pt-6 pb-2 text-center border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-800">
          Nilai Kumulatif Indeks Kepuasan Masyarakat
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Skala 0–100 · Permenpan RB No. 14 Tahun 2017
        </p>
      </div>
      <div className="p-6">
        <ScoreGauge score={finalScore} />
        {/* Three stat cards below the gauge */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Responden</p>
            <p className="text-2xl font-extrabold text-gray-800 mt-1">{totalRespondents}</p>
          </div>
          <div className="rounded-xl p-3 border" style={{ background: cat.bg, borderColor: cat.color + '40' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cat.color }}>Kategori</p>
            <p className="text-2xl font-extrabold mt-1" style={{ color: cat.color }}>{cat.grade}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Predikat</p>
            <p className="text-sm font-extrabold text-gray-800 mt-1 leading-snug">{finalScoreText || cat.label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CHARTS SECTION  (bar chart + demographics pie charts)
// ============================================================
function ChartsSection({ data }) {
  const showDemographics = DEMO_CONFIG.enabled && data.demographics;

  return (
    <div className="space-y-6">
      {/* ── Bar chart ─────────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-0.5">
          Rincian Nilai Aspek Pelayanan
        </h2>
        <p className="text-xs text-gray-400 mb-5">
          Nilai per aspek (%) dengan trendline regresi linear · Maks. 100%
        </p>
        <AspectBarChart labels={data.aspectLabels} scores={data.aspectScores} />
      </div>

      {/* ── Demographics pie charts ─────────────────────── */}
      <div>
        <div className="divider my-6">
          <span className="divider-label">Data Responden</span>
        </div>

        {showDemographics ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <DoughnutChart
              title="Jenis Kelamin"
              labels={data.demographics.gender.labels}
              values={data.demographics.gender.values}
              colors={data.demographics.gender.colors}
            />
            <DoughnutChart
              title="Tingkat Pendidikan"
              labels={data.demographics.education.labels}
              values={data.demographics.education.values}
              colors={data.demographics.education.colors}
            />
            <DoughnutChart
              title="Jenis Pekerjaan"
              labels={data.demographics.occupation.labels}
              values={data.demographics.occupation.values}
              colors={data.demographics.occupation.colors}
            />
          </div>
        ) : (
          /* Placeholder shown until DEMO_CONFIG is configured */
          <div className="card p-8 text-center border-2 border-dashed border-gray-200 bg-gray-50">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-bold text-gray-600 text-sm">Grafik Demografi Responden</p>
            <p className="text-xs text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
              Pie chart jenis kelamin, pendidikan, dan pekerjaan belum dikonfigurasi.{' '}
              Buka <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-600">data.js</code>,
              isi referensi sel pada <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-600">DEMO_CONFIG</code>,
              lalu ubah <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-600">enabled: true</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ASPECT ANALYSIS  (numbered list of 9 aspects with scores)
// ============================================================
// Default aspect names used as fallback if sheet labels are empty
const DEFAULT_ASPECT_NAMES = [
  'Kesesuaian Persyaratan',
  'Kemudahan Pelayanan',
  'Kecepatan Pelayanan',
  'Tarif Pelayanan',
  'Kesesuaian Pelayanan',
  'Kompetensi Petugas',
  'Kesopanan dan Keramahan',
  'Sarana dan Prasarana',
  'Penanganan Aduan',
];

function AspectAnalysis({ finalScore, aspectScores, aspectTexts, aspectLabels }) {
  return (
    <div className="card p-6 sm:p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Analisis Unsur Pelayanan</h2>
      <p className="text-gray-600 text-sm mb-6 leading-relaxed">
        Secara akumulatif, nilai{' '}
        <strong className="data-highlight">{parseFloat(finalScore).toFixed(2)}</strong>{' '}
        mencerminkan performa layanan yang solid. Berikut adalah rincian capaian per aspek:
      </p>

      <div>
        {DEFAULT_ASPECT_NAMES.map((defaultName, i) => {
          const score = aspectScores[i] ?? 0;
          const text  = aspectTexts[i]  || '';
          const label = aspectLabels[i] || defaultName;
          const cat   = IKM.getCategory(score);

          return (
            <div key={i} className="aspect-row">
              {/* Number bubble */}
              <span className="aspect-num">{i + 1}</span>

              {/* Name + description */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm leading-snug">{label}</p>
                {text && <p className="text-xs text-gray-400 mt-0.5">{text}</p>}
              </div>

              {/* Score pill */}
              <span className="score-pill" style={{ color: cat.color, background: cat.bg }}>
                {parseFloat(score).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// CONCLUSION
// ============================================================
function Conclusion() {
  return (
    <div className="card p-6 sm:p-8 border-l-4 border-brand-600 bg-brand-50/30">
      <h2 className="text-lg font-bold text-gray-900 mb-3">Kesimpulan</h2>
      <p className="text-gray-700 text-[15px] leading-[1.85]">
        Meskipun sebagian besar unsur pelayanan sudah berjalan optimal dan masuk dalam
        kategori baik, RSU Islam Klaten akan terus melakukan langkah-langkah strategis
        untuk meningkatkan efisiensi waktu layanan demi kenyamanan dan kepuasan pasien
        yang lebih baik.
      </p>
    </div>
  );
}

// ============================================================
// APP FOOTER  (status bar at the bottom)
// ============================================================
function AppFooter({ cachedAt, online, selectedMonth }) {
  const fmt = ts =>
    ts ? new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <footer className="app-footer no-print">
      <span>
        <span className={`status-dot ${online ? 'online' : 'offline'}`}></span>
        {online ? 'Terhubung ke Internet' : 'Mode Offline — Menampilkan data tersimpan lokal'}
      </span>
      <span>
        {selectedMonth && `Periode: ${selectedMonth}`}
        {cachedAt && ` · Diperbarui: ${fmt(cachedAt)}`}
      </span>
    </footer>
  );
}

// ============================================================
// MAIN APP  (state management + layout)
// ============================================================
function App() {
  const [months,      setMonths]      = useState([]);
  const [selected,    setSelected]    = useState('');
  const [data,        setData]        = useState(null);
  const [cachedAt,    setCachedAt]    = useState(null);
  const [phase,       setPhase]       = useState('init');  // 'init'|'months'|'data'|'ready'|'error'
  const [errMsg,      setErrMsg]      = useState('');
  const [refreshing,  setRefreshing]  = useState(false);
  const [online,      setOnline]      = useState(navigator.onLine);

  // ── Track network status ───────────────────────────────
  useEffect(() => {
    const goOn  = () => setOnline(true);
    const goOff = () => setOnline(false);
    window.addEventListener('online',  goOn);
    window.addEventListener('offline', goOff);
    return () => { window.removeEventListener('online', goOn); window.removeEventListener('offline', goOff); };
  }, []);

  // ── Load data for a selected month ────────────────────
  const loadMonth = useCallback(async (month, force = false) => {
    if (!month) return;
    setPhase('data');
    setErrMsg('');
    try {
      const result = await DataManager.getSheetData(month, force);
      setData(result);
      setCachedAt(result._cachedAt);
      setPhase('ready');

      // Background auto-refresh if stale (without blocking the UI)
      if (!force && LocalDB.isStale(month) && online) {
        setTimeout(async () => {
          try {
            const fresh = await DataManager.getSheetData(month, true);
            setData(fresh);
            setCachedAt(fresh._cachedAt);
          } catch (e) { /* silent background fail */ }
        }, 100);
      }
    } catch (e) {
      // Try to serve from cache even if live fetch failed
      const cached = LocalDB.getSheet(month);
      if (cached?.data) {
        setData({ ...cached.data, _fromCache: true });
        setCachedAt(cached.savedAt);
        setPhase('ready');
      } else {
        setErrMsg(e.message || 'Terjadi kesalahan.');
        setPhase('error');
      }
    }
  }, [online]);

  // ── Startup: discover available months ────────────────
  useEffect(() => {
    const boot = async () => {
      setPhase('months');
      try {
        const found = await DataManager.getAvailableSheets();
        if (found.length === 0) {
          setPhase('error');
          setErrMsg('Tidak ada lembar ditemukan. Pastikan tab sheet dinamai sesuai nama bulan Indonesia (Januari, Februari, …) dan Google Sheets sudah dibagikan secara publik.');
          return;
        }
        setMonths(found);
        const defaultMonth = found[found.length - 1]; // Most recent = last item
        setSelected(defaultMonth);
        await loadMonth(defaultMonth);
      } catch (e) {
        // Fully offline: try to use any locally cached data
        const cached = LocalDB.getCachedSheetNames();
        if (cached.length > 0) {
          setMonths(cached);
          const defaultMonth = cached[cached.length - 1];
          setSelected(defaultMonth);
          await loadMonth(defaultMonth);
        } else {
          setPhase('error');
          setErrMsg(e.message || 'Tidak dapat terhubung ke Google Sheets dan tidak ada data lokal tersedia.');
        }
      }
    };
    boot();
  }, []);                 // ← intentionally empty deps: run once on mount

  // ── Month selector change ──────────────────────────────
  const handleMonthChange = useCallback((month) => {
    setSelected(month);
    loadMonth(month);
  }, [loadMonth]);

  // ── Manual refresh button ──────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (!online) return;
    setRefreshing(true);
    try {
      // Re-discover months + refresh current month's data
      const found = await DataManager.discoverAvailableMonths();
      if (found.length > 0) setMonths(found);
      if (selected) await loadMonth(selected, true);
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [online, selected, loadMonth]);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader
        months={months}
        selectedMonth={selected}
        onMonthChange={handleMonthChange}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        online={online}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">

        {/* ── Loading phases ─────────────────────────────── */}
        {(phase === 'init' || phase === 'months') && (
          <LoadingState message="Mendeteksi lembar data yang tersedia di Google Sheets…" />
        )}
        {phase === 'data' && (
          <LoadingState message={`Memuat data survei untuk bulan ${selected}…`} />
        )}

        {/* ── Error ─────────────────────────────────────── */}
        {phase === 'error' && (
          <ErrorState message={errMsg} onRetry={handleRefresh} />
        )}

        {/* ── Main report content ────────────────────────── */}
        {phase === 'ready' && data && (
          <>
            {/* Offline warning banner */}
            {!online && (
              <div className="card p-4 border border-amber-200 bg-amber-50 flex items-center gap-3 text-sm text-amber-800">
                <span className="text-xl">📶</span>
                <span>
                  Anda sedang <strong>offline</strong>. Data yang ditampilkan berasal dari cache lokal
                  (tersimpan pada {cachedAt ? new Date(cachedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—'}).
                </span>
              </div>
            )}

            {/* Title + month subheading */}
            <ReportHeader title={data.title} month={data.month || selected} />

            {/* Body paragraph */}
            <SummaryText
              month={data.month || selected}
              totalRespondents={data.totalRespondents}
              finalScore={data.finalScore}
              finalScoreText={data.finalScoreText}
            />

            {/* ─────── GRAPH AREA ─────── */}
            <div className="divider my-2"><span className="divider-label">Grafik & Visualisasi</span></div>

            {/* Score gauge */}
            <ScoreSection
              finalScore={data.finalScore}
              finalScoreText={data.finalScoreText}
              totalRespondents={data.totalRespondents}
            />

            {/* Bar chart + pie charts */}
            <ChartsSection data={data} />

            {/* ─────── ANALISIS ─────── */}
            <div className="divider my-2"><span className="divider-label">Analisis Unsur Pelayanan</span></div>

            {/* Aspect breakdown list */}
            <AspectAnalysis
              finalScore={data.finalScore}
              aspectScores={data.aspectScores}
              aspectTexts={data.aspectTexts}
              aspectLabels={data.aspectLabels}
            />

            {/* Conclusion */}
            <Conclusion />
          </>
        )}
      </main>

      <AppFooter cachedAt={cachedAt} online={online} selectedMonth={selected} />
    </div>
  );
}

// ── Mount the React app into <div id="root"> ────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
