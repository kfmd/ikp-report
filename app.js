
// ═══════════════════════════════════════════════════════════════
//  RSU Islam Klaten — IKM Dashboard  •  app.js  (FIXED v3)
//
//  Fetch strategy (based on confirmed working methods):
//  ✅ Sheet names  → allorigins.win proxy → pubhtml HTML parse
//  ✅ Sheet data   → direct gviz/tq CSV  (web server, CORS-safe)
//                 → allorigins.win proxy  (file://, fallback)
//  ✅ Offline      → localStorage cache, auto-refresh every 24h
// ═══════════════════════════════════════════════════════════════

const { useState, useEffect, useRef, useCallback } = React;

const SHEET_ID   = '19nNWdVnYdW1vEv0E0zAzVBSNc5DQKebAia7LD3fMv_o';
const ALLORIGINS = 'https://api.allorigins.win/get?url=';
const DB_KEY     = 'ikm_db_v3';
const META_KEY   = 'ikm_meta_v3';

// ── DETECT ENVIRONMENT ───────────────────────────────────────
const isFileProt = () => window.location.protocol === 'file:';

// ── FETCH HELPERS ────────────────────────────────────────────
async function proxyFetch(url) {
  const r = await fetch(ALLORIGINS + encodeURIComponent(url), { cache: 'no-store' });
  if (!r.ok) throw new Error(`Proxy ${r.status}: ${url}`);
  const j = await r.json();
  if (!j.contents) throw new Error('Proxy returned empty contents');
  return j.contents;
}

async function directFetch(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// smartFetch: direct first on web servers, proxy fallback; always proxy on file://
async function smartFetch(url) {
  if (isFileProt()) return proxyFetch(url);
  try   { return await directFetch(url); }
  catch { return proxyFetch(url); }
}

// ── SHEET NAME DISCOVERY (pubhtml parse via proxy) ───────────
async function fetchSheetNames() {
  const url  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pubhtml`;
  const html = await proxyFetch(url); // always proxy — pubhtml needs no-CORS workaround

  const sheets = [];
  const seen   = new Set();

  // Pattern A  →  <a ...href="#gid=NUMBER"...>Name</a>
  const reA = /href="#gid=(\d+)"[^>]*>\s*([^<]{1,80}?)\s*<\/a>/g;
  let m;
  while ((m = reA.exec(html)) !== null) {
    const name = decodeHtmlEntities(m[2].trim());
    if (name && name.length > 0 && !seen.has(name)) {
      seen.add(name);
      sheets.push({ name, gid: m[1] });
    }
  }

  // Pattern B  →  data-id="gid=NUMBER">Name  (alternate pubhtml format)
  if (!sheets.length) {
    const reB = /data-id="gid=(\d+)"[^>]*>\s*([^<]{1,80}?)\s*</g;
    while ((m = reB.exec(html)) !== null) {
      const name = decodeHtmlEntities(m[2].trim());
      if (name && !seen.has(name)) { seen.add(name); sheets.push({ name, gid: m[1] }); }
    }
  }

  // Pattern C  →  id="sheet-button-XXX" ... title="Name"
  if (!sheets.length) {
    const reC = /id="sheet-button-[^"]*"[^>]*title="([^"]{1,80})"/g;
    while ((m = reC.exec(html)) !== null) {
      const name = decodeHtmlEntities(m[1].trim());
      if (name && !seen.has(name)) { seen.add(name); sheets.push({ name, gid: null }); }
    }
  }

  if (!sheets.length) throw new Error('Tidak dapat membaca daftar sheet. Pastikan sheet sudah dipublikasikan (File → Publish to web).');
  return sheets; // [{name, gid}]
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

// ── SHEET DATA (CSV via gviz) ─────────────────────────────────
async function fetchSheetCSV(sheetName) {
  const url  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const text = await smartFetch(url);
  if (text.trim().startsWith('<'))
    throw new Error('Menerima HTML bukan CSV. Pastikan sheet dibagikan sebagai publik.');
  return parseCSV(text);
}

// ── CSV PARSER ────────────────────────────────────────────────
function parseCSV(text) {
  return text.split(/\r?\n/).map(line => {
    const cells = []; let inQ = false, cell = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if      (c === '"' && !inQ)                   { inQ = true; }
      else if (c === '"' && inQ && line[i+1] === '"'){ cell += '"'; i++; }
      else if (c === '"' && inQ)                    { inQ = false; }
      else if (c === ',' && !inQ)                   { cells.push(cell.trim()); cell = ''; }
      else                                           { cell += c; }
    }
    cells.push(cell.trim());
    return cells;
  });
}

// ── CELL ACCESSOR ─────────────────────────────────────────────
function colIdx(letter) {
  let idx = 0;
  for (let i = 0; i < letter.length; i++) idx = idx * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
  return idx;
}
function gc(grid, row, col) {
  const r = grid[row - 1]; if (!r) return '';
  return (r[colIdx(col) - 1] || '').replace(/^"|"$/g, '').trim();
}

// ── EXTRACT STRUCTURED DATA ───────────────────────────────────
function extractData(grid, sheetName) {
  const c = (r, l) => gc(grid, r, l);
  return {
    title:            c(2,'B'),
    month:            c(3,'B') || sheetName,
    totalRespondents: c(25,'C'),
    finalScore:       c(19,'D'),
    finalScoreText:   c(19,'E'),
    aspects: [
      { label:'Kesesuaian Persyaratan', score:c(16,'B'), text:c(17,'B') },
      { label:'Pelayanan Kemudahan',    score:c(16,'C'), text:c(17,'C') },
      { label:'Prosedur Kecepatan',     score:c(16,'D'), text:c(17,'D') },
      { label:'Tarif Pelayanan',        score:c(16,'E'), text:c(17,'E') },
      { label:'Kesesuaian Pelayanan',   score:c(16,'F'), text:c(17,'F') },
      { label:'Kompetensi Petugas',     score:c(16,'G'), text:c(17,'G') },
      { label:'Kesopanan & Keramahan',  score:c(16,'H'), text:c(17,'H') },
      { label:'Sarana & Prasarana',     score:c(16,'I'), text:c(17,'I') },
      { label:'Penanganan Aduan',       score:c(16,'J'), text:c(17,'J') },
    ],
    demographics: scanDemographics(grid),
  };
}

function scanDemographics(grid) {
  const gender = [], edu = [], job = [];
  const genderKw  = ['laki-laki','laki laki','pria','perempuan','wanita'];
  const eduKw     = ['sd','smp','sma','smk','d1','d2','d3','d4','s1','s2','s3','diploma','sarjana','magister','doktor','tidak sekolah','tidak tamat'];
  const jobKw     = ['pns','tni','polri','swasta','pegawai','wiraswasta','petani','buruh','pelajar','mahasiswa','ibu rumah tangga','irt','pensiunan','lainnya'];

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]; if (!row) continue;
    for (let c = 0; c < row.length - 1; c++) {
      const raw   = (row[c] || '').replace(/^"|"$/g,'').trim();
      const lower = raw.toLowerCase();
      const val   = parseFloat((row[c+1] || '').replace(/^"|"$/g,'').replace(/[^0-9.]/g,''));
      if (!raw || isNaN(val) || val <= 0) continue;

      if (lower.includes('laki')) {
        gender.push({ label:'Laki-Laki', value:val });
      } else if (lower.includes('perempuan') || lower.includes('wanita')) {
        gender.push({ label:'Perempuan', value:val });
      } else if (eduKw.some(k => lower.includes(k))) {
        edu.push({ label:raw, value:val });
      } else if (jobKw.some(k => lower.includes(k))) {
        job.push({ label:raw, value:val });
      }
    }
  }
  const dedup = arr => arr.filter((v,i,a) => a.findIndex(x => x.label.toLowerCase() === v.label.toLowerCase()) === i);
  return { gender:dedup(gender), education:dedup(edu), occupation:dedup(job) };
}

// ── LOCAL DB ─────────────────────────────────────────────────
function saveDB(data) {
  try {
    localStorage.setItem(DB_KEY,   JSON.stringify(data));
    localStorage.setItem(META_KEY, JSON.stringify({ lastUpdated:new Date().toISOString(), sheets:Object.keys(data) }));
    return true;
  } catch { return false; }
}
function loadDB() {
  try {
    const raw  = localStorage.getItem(DB_KEY);
    const meta = localStorage.getItem(META_KEY);
    if (!raw) return null;
    return { data:JSON.parse(raw), meta:meta?JSON.parse(meta):null };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════
//  REACT COMPONENTS
// ══════════════════════════════════════════════════════════════

// ── ICONS ─────────────────────────────────────────────────────
const Ico = ({d,sw=2,sz=18,...p}) =>
  React.createElement('svg',{width:sz,height:sz,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:sw,strokeLinecap:'round',strokeLinejoin:'round',...p},
    ...(Array.isArray(d)?d:[d]).map((dd,i)=>React.createElement('path',{key:i,d:dd})));
const Circ = ({cx,cy,r,...p}) => React.createElement('circle',{cx,cy,r,...p});
const Line = ({x1,y1,x2,y2,...p}) => React.createElement('line',{x1,y1,x2,y2,...p});
const Rect = ({x,y,width,height,rx,...p}) => React.createElement('rect',{x,y,width,height,rx,...p});
const Poly = ({points,...p}) => React.createElement('polyline',{points,...p});

const ActivityIcon  =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},React.createElement('path',{d:'M22 12h-4l-3 9L9 3l-3 9H2'}));
const UsersIcon     =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},React.createElement('path',{d:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'}),Circ({cx:9,cy:7,r:4}),React.createElement('path',{d:'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'}));
const BarIcon       =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},Line({x1:18,y1:20,x2:18,y2:10}),Line({x1:12,y1:20,x2:12,y2:4}),Line({x1:6,y1:20,x2:6,y2:14}),Line({x1:2,y1:20,x2:22,y2:20}));
const ListIcon      =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},...[6,12,18].flatMap(y=>[Line({key:'l'+y,x1:8,y1:y,x2:21,y2:y}),Line({key:'d'+y,x1:3,y1:y,x2:3.01,y2:y})]));
const InfoIcon      =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},Circ({cx:12,cy:12,r:10}),Line({x1:12,y1:8,x2:12,y2:12}),Line({x1:12,y1:16,x2:12.01,y2:16}));
const BookIcon      =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},React.createElement('path',{d:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20'}),React.createElement('path',{d:'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'}));
const BriefIcon     =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},Rect({x:2,y:7,width:20,height:14,rx:2}),React.createElement('path',{d:'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'}));
const UserIcon      =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},Circ({cx:12,cy:8,r:4}),React.createElement('path',{d:'M20 21a8 8 0 1 0-16 0'}));
const RefreshIcon   =()=>React.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},React.createElement('path',{d:'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'}));
const CheckIcon     =()=>React.createElement('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},Poly({points:'20 6 9 17 4 12'}));
const WarnIcon      =()=>React.createElement('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},React.createElement('path',{d:'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01'}));
const ChevIcon      =()=>React.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2.5},Poly({points:'6 9 12 15 18 9'}));
const SpinnerIcon   =()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,style:{animation:'spin 1s linear infinite'}},React.createElement('path',{d:'M21 12a9 9 0 1 1-6.219-8.56',strokeLinecap:'round'}));

// ── THEME TOGGLE ──────────────────────────────────────────────
function ThemeToggle() {
  const [dark,setDark] = useState(()=>document.documentElement.getAttribute('data-theme')==='dark');
  const toggle = () => { const nd=!dark; setDark(nd); document.documentElement.setAttribute('data-theme',nd?'dark':'light'); };
  const Sun  = () => React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},Circ({cx:12,cy:12,r:5}),React.createElement('path',{d:'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'}));
  const Moon = () => React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},React.createElement('path',{d:'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'}));
  return React.createElement('button',{className:'btn btn-icon btn-ghost',onClick:toggle,'aria-label':'Toggle tema'},dark?React.createElement(Sun):React.createElement(Moon));
}

// ── STAT ROW ──────────────────────────────────────────────────
function StatRow({label,value}) {
  const e=React.createElement;
  return e('div',{className:'stat-row'},
    e('span',{className:'stat-label'},label),
    e('span',{className:'stat-value'},value||'—'));
}

// ── BAR CHART ─────────────────────────────────────────────────
function BarChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !data?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const values = data.map(d => parseFloat(d.score) || 0);
    const avg    = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
    chartRef.current = new Chart(canvasRef.current, {
      type:'bar',
      data:{
        labels: data.map(d=>d.label),
        datasets:[
          { label:'Nilai Aspek (%)', data:values,
            backgroundColor: values.map(v=>v>=75?'rgba(29,111,164,0.78)':v>=60?'rgba(14,158,132,0.78)':'rgba(209,121,0,0.78)'),
            borderColor:      values.map(v=>v>=75?'#1d6fa4':v>=60?'#0e9e84':'#d17900'),
            borderWidth:1.5, borderRadius:6, borderSkipped:false },
          { label:'Rata-rata', data:Array(values.length).fill(parseFloat(avg.toFixed(2))),
            type:'line', borderColor:'#e8454a', borderWidth:2.5,
            borderDash:[6,4], pointRadius:0, fill:false, tension:0, order:0 }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:true,
        plugins:{
          legend:{ display:true, position:'top', labels:{font:{family:"'Plus Jakarta Sans'"},boxWidth:14,padding:16} },
          tooltip:{ callbacks:{ label: ctx => ctx.dataset.label==='Rata-rata'
            ? `Rata-rata: ${avg.toFixed(2)}%`
            : `${ctx.parsed.y.toFixed(2)}% — ${data[ctx.dataIndex]?.text||''}` } }
        },
        scales:{
          y:{ min:0, max:100, ticks:{callback:v=>v+'%',font:{family:"'Plus Jakarta Sans'",size:11}}, grid:{color:'rgba(0,50,100,0.06)'} },
          x:{ ticks:{font:{family:"'Plus Jakarta Sans'",size:11},maxRotation:28}, grid:{display:false} }
        }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current=null; } };
  }, [data]);
  return React.createElement('div',{className:'chart-wrapper'},React.createElement('canvas',{ref:canvasRef}));
}

// ── PIE CHART ─────────────────────────────────────────────────
function PieChart({ data, colors }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const COLORS = ['#1d6fa4','#e8599a','#0e9e84','#d17900','#7c3aed','#0891b2','#c53030','#16a34a','#b45309','#db2777'];
  useEffect(() => {
    if (!canvasRef.current || !data?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current=null; }
    const total = data.reduce((a,b)=>a+b.value,0);
    chartRef.current = new Chart(canvasRef.current, {
      type:'doughnut',
      data:{
        labels: data.map(d=>d.label),
        datasets:[{ data:data.map(d=>d.value),
          backgroundColor: colors||COLORS.slice(0,data.length),
          borderWidth:2.5, borderColor:'rgba(255,255,255,0.85)', hoverOffset:6 }]
      },
      options:{
        responsive:true, maintainAspectRatio:true, cutout:'58%',
        plugins:{
          legend:{ position:'bottom', labels:{font:{family:"'Plus Jakarta Sans'",size:11},padding:8,boxWidth:11} },
          tooltip:{ callbacks:{ label:ctx=>`${ctx.label}: ${ctx.parsed} (${((ctx.parsed/total)*100).toFixed(1)}%)` } }
        }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current=null; } };
  }, [data, colors]);
  return React.createElement('div',{className:'pie-chart-wrapper'},React.createElement('canvas',{ref:canvasRef}));
}

// ── EMPTY DEMO STATE ──────────────────────────────────────────
function NoDemoData({label}) {
  const e=React.createElement;
  return e('div',{className:'no-demo'},
    e('svg',{width:32,height:32,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5},
      Circ({cx:12,cy:12,r:10}),Line({x1:8,y1:12,x2:16,y2:12})),
    e('span',null,`Data ${label} tidak tersedia`));
}

// ── DASHBOARD ─────────────────────────────────────────────────
function Dashboard({ data:d }) {
  const e = React.createElement;
  const score = parseFloat(d.finalScore)||0;

  return e('div',null,
    // ── KPI + Summary ──────────────────────────────────────
    e('div',{className:'grid-2',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card kpi-card'},
        e('div',{className:'kpi-inner'},
          e('p',{className:'kpi-eyebrow'},'Indeks Kepuasan Masyarakat (IKM)'),
          e('div',{className:'kpi-score'},score?score.toFixed(2):d.finalScore||'—'),
          e('p',{className:'kpi-label'},'Nilai Kumulatif Kepuasan Masyarakat'),
          e('div',{className:'kpi-badge'},e(CheckIcon),d.finalScoreText||'Baik'),
          e('p',{className:'kpi-meta'},`Kategori B — Predikat Kinerja: ${d.finalScoreText||'Baik'}`)
        )
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(UsersIcon)),'Ringkasan Survei'),
        e('div',{className:'stat-list'},
          e(StatRow,{label:'Periode',          value:d.month}),
          e(StatRow,{label:'Total Responden',  value:d.totalRespondents}),
          e(StatRow,{label:'Skor IKM',         value:d.finalScore}),
          e(StatRow,{label:'Predikat',          value:d.finalScoreText}),
        )
      )
    ),

    // ── Body text ──────────────────────────────────────────
    e('div',{className:'body-section'},
      e('p',null,
        `Sebagai wujud komitmen berkelanjutan dalam menjaga kualitas layanan, RSU Islam Klaten secara berkala menyelenggarakan Survei Kepuasan Masyarakat. Pada periode ${d.month}, survei yang melibatkan ${d.totalRespondents||'—'} responden ini menghasilkan nilai Indeks Kepuasan Masyarakat (IKM) sebesar ${d.finalScore||'—'}. Skor tersebut menempatkan mutu pelayanan kami pada Kategori B dengan predikat kinerja Baik.`),
      e('p',null,
        `Pencapaian ini sekaligus membuktikan bahwa RSU Islam Klaten telah berhasil memenuhi target yang direncanakan, di mana target kepuasan pelanggan pada bulan ${d.month} mencapai predikat ${d.finalScoreText||'—'}.`)
    ),
    e('hr',{className:'divider'}),

    // ── Bar chart ──────────────────────────────────────────
    e('h2',{className:'section-heading'},'Grafik Nilai Aspek Pelayanan'),
    e('p',{className:'section-subheading'},'Nilai per aspek layanan (skala 0–100%). Garis merah menunjukkan rata-rata keseluruhan.'),
    e('div',{className:'card',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card-title'},e('span',{className:'icon'},e(BarIcon)),'Nilai Aspek Layanan'),
      e(BarChart,{data:d.aspects})
    ),

    // ── Pie charts ─────────────────────────────────────────
    e('h2',{className:'section-heading'},'Data Responden'),
    e('p',{className:'section-subheading'},'Profil demografis responden survei kepuasan masyarakat.'),
    e('div',{className:'grid-3',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(UserIcon)),'Jenis Kelamin'),
        d.demographics.gender.length>0
          ? e(PieChart,{data:d.demographics.gender,
              colors:d.demographics.gender.map(g=>g.label.toLowerCase().includes('laki')?'#1d6fa4':'#e8599a')})
          : e(NoDemoData,{label:'Jenis Kelamin'})
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(BookIcon)),'Pendidikan'),
        d.demographics.education.length>0
          ? e(PieChart,{data:d.demographics.education})
          : e(NoDemoData,{label:'Pendidikan'})
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(BriefIcon)),'Pekerjaan'),
        d.demographics.occupation.length>0
          ? e(PieChart,{data:d.demographics.occupation})
          : e(NoDemoData,{label:'Pekerjaan'})
      )
    ),
    e('hr',{className:'divider'}),

    // ── Aspect analysis ────────────────────────────────────
    e('h2',{className:'section-heading'},'Analisis Unsur Pelayanan'),
    e('p',{className:'section-subheading'},
      `Secara akumulatif, nilai ${d.finalScore||'—'} mencerminkan performa layanan yang solid. Berikut rincian capaian per aspek:`),
    e('div',{className:'grid-2',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(ListIcon)),'Rincian Nilai Aspek'),
        e('ul',{className:'aspect-list'},
          d.aspects.map((a,i)=>e('li',{key:i,className:'aspect-item'},
            e('span',{className:'aspect-num'},i+1),
            e('span',{className:'aspect-name'},a.label),
            e('div',{className:'aspect-score-wrap'},
              e('span',{className:'aspect-score-num'},a.score||'—'),
              a.text&&e('span',{className:'aspect-score-label'},a.text)
            )
          ))
        )
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(InfoIcon)),'Kesimpulan'),
        e('div',{className:'conclusion-body'},
          e('p',null,'Meskipun sebagian besar unsur pelayanan sudah berjalan optimal dan masuk dalam kategori baik, RSU Islam Klaten akan terus melakukan langkah-langkah strategis untuk meningkatkan efisiensi waktu layanan demi kenyamanan dan kepuasan pasien yang lebih baik.'),
          e('div',{className:'conclusion-score-box'},
            e('span',{className:'conclusion-score-eyebrow'},'Skor Keseluruhan'),
            e('span',{className:'conclusion-score-num'},d.finalScore||'—'),
            e('span',{className:'conclusion-score-label'},d.finalScoreText||'')
          )
        )
      )
    )
  );
}

// ══════════════════════════════════════════════════════════════
//  APP ROOT
// ══════════════════════════════════════════════════════════════
function App() {
  const e = React.createElement;
  const [sheets,     setSheets]      = useState([]);  // [{name, gid}]
  const [active,     setActive]      = useState('');
  const [data,       setData]        = useState(null);
  const [loading,    setLoading]     = useState(true);
  const [loadingMsg, setLoadingMsg]  = useState('Menghubungkan ke Google Sheets...');
  const [error,      setError]       = useState('');
  const [isOnline,   setIsOnline]    = useState(navigator.onLine);
  const [dbMeta,     setDbMeta]      = useState(null);
  const [toast,      setToast]       = useState(null);
  const [fetching,   setFetching]    = useState(false);

  // ── online/offline listeners ─────────────────────────────
  useEffect(()=>{
    const on  = ()=>setIsOnline(true);
    const off = ()=>setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return ()=>{ window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  },[]);

  // ── boot ─────────────────────────────────────────────────
  useEffect(()=>{ boot(); },[]);

  async function boot() {
    // 1. Show local cache immediately if available
    const stored = loadDB();
    if (stored?.meta) setDbMeta(stored.meta);
    if (stored?.data) {
      const keys = Object.keys(stored.data);
      if (keys.length > 0) {
        const sheetList = keys.map(k => ({ name:k, gid:stored.data[k].gid||null }));
        setSheets(sheetList);
        const last = sheetList[sheetList.length-1].name;
        setActive(last);
        setData(stored.data[last].data);
        setLoading(false);
        setLoadingMsg('');
        // Auto-refresh if cache is stale (>24h)
        const ageH = stored.meta?.lastUpdated
          ? (Date.now()-new Date(stored.meta.lastUpdated))/3600000 : 99;
        if (ageH >= 24 && navigator.onLine) showToast('Cache usang, memperbarui data…',null);
        if (ageH >= 24 && navigator.onLine) silentRefreshAll(keys, stored.data);
        return;
      }
    }

    // 2. No cache → need internet
    if (!navigator.onLine) {
      setError('Tidak ada koneksi internet dan belum ada data lokal tersimpan.\nHubungkan ke internet untuk pertama kali.');
      setLoading(false); return;
    }
    await loadAllSheets();
  }

  async function loadAllSheets() {
    setLoading(true); setLoadingMsg('Mengambil daftar sheet…'); setError('');
    try {
      const sheetList = await fetchSheetNames();
      setSheets(sheetList);
      const last = sheetList[sheetList.length-1];
      setActive(last.name);
      setLoadingMsg(`Memuat data bulan: ${last.name}…`);
      const grid = await fetchSheetCSV(last.name);
      const d    = extractData(grid, last.name);
      setData(d);
      // Cache all sheets in background
      const db = {};
      db[last.name] = { data:d, grid, gid:last.gid||null };
      saveDB(db);
      setDbMeta(loadDB()?.meta||null);
      // Load remaining sheets silently
      silentRefreshAll(sheetList.map(s=>s.name), db, sheetList);
    } catch(err) {
      setError(`Gagal memuat data: ${err.message}`);
    }
    setLoading(false); setLoadingMsg('');
  }

  async function silentRefreshAll(names, existingDb={}, sheetList=[]) {
    const db = {...existingDb};
    for (const name of names) {
      if (db[name]?.grid) continue; // skip already loaded
      try {
        const grid = await fetchSheetCSV(name);
        const d    = extractData(grid, name);
        const gid  = (sheetList.find(s=>s.name===name)||{}).gid || null;
        db[name]   = { data:d, grid, gid };
        saveDB(db);
      } catch(e) { console.warn('Silent refresh failed for', name, e.message); }
    }
    setDbMeta(loadDB()?.meta||null);
  }

  // ── sheet change ─────────────────────────────────────────
  async function handleSheetChange(name) {
    if (name === active) return;
    setActive(name); setError(''); setData(null);

    // Try cache first
    const stored = loadDB();
    if (stored?.data?.[name]) {
      setData(stored.data[name].data);
      if (!isOnline) return;
    }

    if (!isOnline) {
      setError('Tidak ada koneksi. Data bulan ini belum tersimpan secara lokal.'); return;
    }

    try {
      const grid = await fetchSheetCSV(name);
      const d    = extractData(grid, name);
      setData(d);
      const db = loadDB()?.data || {};
      const gid = (sheets.find(s=>s.name===name)||{}).gid||null;
      saveDB({...db, [name]:{data:d,grid,gid}});
      setDbMeta(loadDB()?.meta||null);
    } catch(err) {
      if (!data) setError(`Gagal memuat: ${err.message}`);
    }
  }

  // ── manual refresh ────────────────────────────────────────
  async function handleRefresh() {
    if (!isOnline) { showToast('Tidak ada koneksi internet.',false); return; }
    if (fetching) return;
    setFetching(true);
    showToast('Memperbarui semua data dari Google Sheets…',null);
    try {
      const sheetList = await fetchSheetNames();
      setSheets(sheetList);
      const db = {};
      for (const s of sheetList) {
        const grid = await fetchSheetCSV(s.name);
        const d    = extractData(grid, s.name);
        db[s.name] = { data:d, grid, gid:s.gid||null };
      }
      saveDB(db);
      const meta = loadDB()?.meta||null;
      setDbMeta(meta);
      if (db[active]) setData(db[active].data);
      showToast('✓ Semua data berhasil diperbarui!',true);
    } catch(err) {
      showToast(`Gagal memperbarui: ${err.message}`,false);
    }
    setFetching(false);
  }

  function showToast(text,ok){ setToast({text,ok}); if(ok!==null) setTimeout(()=>setToast(null),4500); }

  // ─────────────────────────────────────────────────────────
  return e('div',null,

    // ── spinner keyframe (injected once) ──────────────────
    e('style',{key:'spin'},`@keyframes spin{to{transform:rotate(360deg)}}`),

    // ── HEADER ────────────────────────────────────────────
    e('header',{className:'site-header'},
      e('div',{className:'container'},
        e('div',{className:'header-inner'},
          e('a',{className:'logo',href:'#'},
            e('div',{className:'logo-icon'},e(ActivityIcon)),
            e('div',null,
              e('div',{className:'logo-text'},'RSU Islam Klaten'),
              e('div',{className:'logo-sub'},'Dashboard IKM'))
          ),
          e('div',{className:'header-actions'},
            e('span',{className:`status-badge ${isOnline?'status-online':'status-offline'}`},
              e('span',{className:'status-dot'}), isOnline?'Online':'Offline'),
            e('button',{
              className:`btn btn-sm btn-secondary${fetching?' btn-loading':''}`,
              onClick:handleRefresh, disabled:!isOnline||fetching,
              title:'Perbarui dari Google Sheets'},
              fetching?e(SpinnerIcon):e(RefreshIcon),
              fetching?'Memuat…':'Perbarui Data'),
            e(ThemeToggle)
          )
        )
      )
    ),

    // ── PAGE HERO ─────────────────────────────────────────
    e('section',{className:'page-hero'},
      e('div',{className:'container'},
        e('div',{className:'page-hero-inner'},
          e('div',null,
            e('h1',{className:'page-hero-title'},
              loading ? 'Survei Kepuasan Masyarakat' : (data?.title||'Survei Kepuasan Masyarakat')),
            e('p',{className:'page-hero-subtitle'},
              data?.month ? `Periode: ${data.month}` : 'Indeks Kepuasan Masyarakat — RSU Islam Klaten')
          ),
          sheets.length>0 && e('div',{className:'month-selector'},
            e('label',{htmlFor:'month-sel',className:'selector-label'},'Pilih Periode:'),
            e('div',{className:'select-wrapper'},
              e('select',{id:'month-sel',value:active,
                onChange:ev=>handleSheetChange(ev.target.value)},
                sheets.map(s=>e('option',{key:s.name,value:s.name},s.name))
              ),
              e('span',{className:'select-arrow'},e(ChevIcon))
            )
          )
        )
      )
    ),

    // ── MAIN ──────────────────────────────────────────────
    e('main',{className:'main-content'},
      e('div',{className:'container'},

        // Toast
        toast && e('div',{className:`banner ${toast.ok===true?'banner-success':toast.ok===false?'banner-error':'banner-info'}`},
          toast.ok===true?e(CheckIcon):e(WarnIcon), toast.text),

        // Error
        error && e('div',{className:'banner banner-error'},e(WarnIcon),
          e('div',null,...error.split('\n').map((l,i)=>e('p',{key:i,style:{margin:0}},l)))),

        // Loading skeleton
        loading && e('div',null,
          e('div',{style:{marginBottom:'var(--space-4)',color:'var(--color-text-muted)',fontSize:'var(--text-sm)',display:'flex',alignItems:'center',gap:'var(--space-2)'}},
            e(SpinnerIcon),loadingMsg),
          e('div',{className:'grid-2',style:{marginBottom:'var(--space-6)'}},
            e('div',{className:'skeleton',style:{height:180,borderRadius:'var(--radius-lg)'}}),
            e('div',{className:'skeleton',style:{height:180,borderRadius:'var(--radius-lg)'}})
          ),
          e('div',{className:'skeleton',style:{height:280,borderRadius:'var(--radius-lg)',marginBottom:'var(--space-6)'}}),
        ),

        // Dashboard
        !loading && data && e(Dashboard,{data}),

        // No data state
        !loading && !data && !error &&
          e('div',{className:'empty-state'},
            e('svg',{width:48,height:48,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,style:{color:'var(--color-text-faint)',marginBottom:'var(--space-4)'}},
              Circ({cx:12,cy:12,r:10}),
              React.createElement('path',{d:'M12 8v4M12 16h.01'})),
            e('h3',null,'Tidak ada data'),
            e('p',null,'Pilih periode dari menu di atas atau perbarui koneksi internet.')
          )
      )
    ),

    // ── FOOTER ────────────────────────────────────────────
    e('footer',{className:'site-footer'},
      e('div',{className:'container'},
        e('p',null,'© RSU Islam Klaten — Dashboard Indeks Kepuasan Masyarakat'),
        dbMeta?.lastUpdated && e('p',{style:{marginTop:'0.25rem'}},
          `Data lokal terakhir: ${new Date(dbMeta.lastUpdated).toLocaleString('id-ID')}`)
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
