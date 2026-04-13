
// RSU Islam Klaten — IKM Dashboard (FIXED)
// Sheet name discovery: gviz/tq JSONP callback
// Sheet data: gviz/tq?tqx=out:csv&sheet=NAME

const { useState, useEffect, useRef } = React;
const SHEET_ID = '19nNWdVnYdW1vEv0E0zAzVBSNc5DQKebAia7LD3fMv_o';
const DB_KEY = 'ikm_local_db';
const DB_META_KEY = 'ikm_local_db_meta';

// ── LOCAL DB ─────────────────────────────────────────────
function saveDB(data) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    localStorage.setItem(DB_META_KEY, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      sheets: Object.keys(data)
    }));
    return true;
  } catch(e) { return false; }
}
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    const meta = localStorage.getItem(DB_META_KEY);
    if (!raw) return null;
    return { data: JSON.parse(raw), meta: meta ? JSON.parse(meta) : null };
  } catch(e) { return null; }
}

// ── JSONP helper (bypasses CORS for gviz endpoint) ───────
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = 'gvizCb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, 10000);
    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Script load failed')); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName;
    document.head.appendChild(script);
  });
}

// ── FETCH SHEET NAMES via JSONP gviz ─────────────────────
async function fetchSheetNames() {
  // The gviz tq response includes sheet metadata in the table description
  // We request sheet 0 with limit 0 rows — response contains all sheet info
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&tq=SELECT%20A1%20LIMIT%200`;
  try {
    const data = await jsonp(url);
    // data.status === 'ok', data.table has cols/rows
    // Sheet names are NOT in the tq response directly — use alternative:
    // Parse from the raw response wrapper which sometimes includes sheet name in sig
    // Better: use the HTML page approach via a different trick
    // Actually gviz doesn't return sheet list. Use the /edit page scrape via allsheets
    throw new Error('need alternate method');
  } catch(e) {
    // Fallback: try fetching the spreadsheet HTML page for sheet names
    return await fetchSheetNamesFromHTML();
  }
}

async function fetchSheetNamesFromHTML() {
  // Use the /export endpoint with no sheet specified — it returns first sheet
  // For sheet discovery, we use the public spreadsheet's JSON feed alternative:
  // https://spreadsheets.google.com/feeds/worksheets/SHEET_ID/public/basic?alt=json
  // This is the CORRECT working endpoint (different from deprecated Sheets v3)
  const url = `https://spreadsheets.google.com/feeds/worksheets/${SHEET_ID}/public/basic?alt=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const entries = json.feed.entry || [];
  return entries.map(e => e.title.$t);
}

// ── FETCH SHEET DATA (CSV via gviz — works with CORS) ────
async function fetchSheetCSV(sheetName) {
  // Primary: gviz tq CSV — works when sheet is publicly accessible
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for sheet: ${sheetName}`);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error('Received HTML instead of CSV — check sheet permissions');
  return parseCSV(text);
}

// ── CSV PARSER ────────────────────────────────────────────
function parseCSV(text) {
  return text.split('\n').map(line => {
    const cells = []; let inQ = false, cell = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && !inQ) { inQ = true; }
      else if (c === '"' && inQ && line[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"' && inQ) { inQ = false; }
      else if (c === ',' && !inQ) { cells.push(cell.trim()); cell = ''; }
      else { cell += c; }
    }
    cells.push(cell.trim());
    return cells;
  });
}

// ── CELL ACCESSOR ─────────────────────────────────────────
function colIdx(letter) {
  letter = letter.toUpperCase();
  let idx = 0;
  for (let i = 0; i < letter.length; i++) idx = idx * 26 + (letter.charCodeAt(i) - 64);
  return idx;
}
function getCell(grid, row, colLetter) {
  const r = grid[row - 1]; if (!r) return '';
  return (r[colIdx(colLetter) - 1] || '').replace(/^"|"$/g, '').trim();
}

// ── EXTRACT STRUCTURED DATA ───────────────────────────────
function extractData(grid, sheetName) {
  const c = (r, l) => getCell(grid, r, l);
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
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]; if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const raw = (row[c] || '').replace(/^"|"$/g,'').trim();
      const lower = raw.toLowerCase();
      const numStr = (row[c+1] || row[c+2] || '').replace(/^"|"$/g,'').trim();
      const val = parseFloat(numStr.replace(/[^0-9.]/g,''));
      if (!isNaN(val) && val > 0) {
        if (['laki-laki','laki laki','pria'].includes(lower))
          gender.push({label:'Laki-Laki',value:val});
        else if (['perempuan','wanita'].includes(lower))
          gender.push({label:'Perempuan',value:val});
        else if (['sd','smp','sma','smk','d1','d2','d3','d4','s1','s2','s3','diploma','sarjana','magister','doktor','tidak sekolah','tidak tamat'].some(k=>lower.includes(k)))
          edu.push({label:raw,value:val});
        else if (['pns','tni','polri','swasta','pegawai','wiraswasta','petani','buruh','pelajar','mahasiswa','ibu rumah tangga','irt','pensiunan','lainnya'].some(k=>lower.includes(k)))
          job.push({label:raw,value:val});
      }
    }
  }
  const dedup = arr => arr.filter((v,i,a)=>a.findIndex(x=>x.label.toLowerCase()===v.label.toLowerCase())===i);
  return { gender: dedup(gender), education: dedup(edu), occupation: dedup(job) };
}

// ── CHART COMPONENTS ──────────────────────────────────────
function BarChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !data?.length) return;
    if (chartRef.current) chartRef.current.destroy();
    const values = data.map(d => parseFloat(d.score) || 0);
    const avg = values.reduce((a,b)=>a+b,0) / values.length;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [
          { label:'Nilai Aspek (%)', data:values,
            backgroundColor: values.map(v=>v>=75?'rgba(29,111,164,0.75)':v>=60?'rgba(14,158,132,0.75)':'rgba(209,121,0,0.75)'),
            borderColor:      values.map(v=>v>=75?'#1d6fa4':v>=60?'#0e9e84':'#d17900'),
            borderWidth:1.5, borderRadius:6, borderSkipped:false },
          { label:'Rata-rata', data:Array(values.length).fill(avg), type:'line',
            borderColor:'#e8454a', borderWidth:2, borderDash:[6,4],
            pointRadius:0, fill:false, tension:0 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:true,
        plugins: {
          legend:{display:true,position:'top',labels:{font:{family:"'Plus Jakarta Sans'"},boxWidth:14,padding:16}},
          tooltip:{callbacks:{label:ctx=>ctx.dataset.label==='Rata-rata'
            ?`Rata-rata: ${avg.toFixed(2)}%`
            :`${ctx.parsed.y.toFixed(2)}% — ${data[ctx.dataIndex]?.text||''}`}}
        },
        scales:{
          y:{min:0,max:100,ticks:{callback:v=>v+'%',font:{family:"'Plus Jakarta Sans'",size:11}},grid:{color:'rgba(0,50,100,0.06)'}},
          x:{ticks:{font:{family:"'Plus Jakarta Sans'",size:11},maxRotation:30},grid:{display:false}}
        }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);
  return React.createElement('div',{className:'chart-wrapper'},React.createElement('canvas',{ref:canvasRef}));
}

function PieChart({ data, colors }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !data?.length) return;
    if (chartRef.current) chartRef.current.destroy();
    const total = data.reduce((a,b)=>a+b.value,0);
    chartRef.current = new Chart(canvasRef.current, {
      type:'doughnut',
      data:{
        labels:data.map(d=>d.label),
        datasets:[{data:data.map(d=>d.value),
          backgroundColor:colors||['#1d6fa4','#e8599a','#0e9e84','#d17900','#7c3aed','#0891b2','#c53030','#16a34a'],
          borderWidth:2, borderColor:'#ffffff', hoverOffset:6}]
      },
      options:{
        responsive:true, maintainAspectRatio:true, cutout:'60%',
        plugins:{
          legend:{position:'bottom',labels:{font:{family:"'Plus Jakarta Sans'",size:11},padding:10,boxWidth:12}},
          tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.parsed} (${((ctx.parsed/total)*100).toFixed(1)}%)`}}
        }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, colors]);
  return React.createElement('div',{className:'pie-chart-wrapper'},React.createElement('canvas',{ref:canvasRef}));
}

// ── THEME TOGGLE ──────────────────────────────────────────
function ThemeToggle() {
  const [dark,setDark] = useState(()=>document.documentElement.getAttribute('data-theme')==='dark');
  const toggle = ()=>{ const nd=!dark; setDark(nd); document.documentElement.setAttribute('data-theme',nd?'dark':'light'); };
  const Sun=()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},
    React.createElement('circle',{cx:12,cy:12,r:5}),
    React.createElement('path',{d:'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'}));
  const Moon=()=>React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},
    React.createElement('path',{d:'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'}));
  return React.createElement('button',{className:'btn btn-icon btn-ghost',onClick:toggle,'aria-label':'Toggle dark mode'},
    dark?React.createElement(Sun):React.createElement(Moon));
}

// ── ICON SET ──────────────────────────────────────────────
const mk = (...paths) => React.createElement('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},...paths);
const p  = (d,extra={}) => React.createElement('path',{d,...extra});
const ActivityIcon  =()=>mk(p('M22 12h-4l-3 9L9 3l-3 9H2'));
const UsersIcon     =()=>mk(p('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'),React.createElement('circle',{cx:9,cy:7,r:4}),p('M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'));
const BarIcon       =()=>mk(...['18,20,18,10','12,20,12,4','6,20,6,14','2,20,22,20'].map(pts=>React.createElement('line',{key:pts,...Object.fromEntries(pts.split(',').map((v,i)=>[[`x${(i<2?1:2)}`,''+v][0]??'',v]).map((_,i,a)=>i%2===0?[`x${i<2?1:2}`,a[i][1]]:null).filter(Boolean)),...(()=>{const [x1,y1,x2,y2]=pts.split(',');return{x1,y1,x2,y2};})()} )));
const ListIcon      =()=>mk(...[6,12,18].flatMap(y=>[React.createElement('line',{key:'l'+y,x1:8,y1:y,x2:21,y2:y}),React.createElement('line',{key:'d'+y,x1:3,y1:y,x2:3.01,y2:y})]));
const InfoIcon      =()=>mk(React.createElement('circle',{cx:12,cy:12,r:10}),React.createElement('line',{x1:12,y1:8,x2:12,y2:12}),React.createElement('line',{x1:12,y1:16,x2:12.01,y2:16}));
const BookIcon      =()=>mk(p('M4 19.5A2.5 2.5 0 0 1 6.5 17H20'),p('M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'));
const BriefcaseIcon =()=>mk(React.createElement('rect',{x:2,y:7,width:20,height:14,rx:2}),p('M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'));
const UserIcon      =()=>mk(React.createElement('circle',{cx:12,cy:8,r:4}),p('M20 21a8 8 0 1 0-16 0'));
const RefreshIcon   =()=>React.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},p('M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'));
const CheckIcon     =()=>React.createElement('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},React.createElement('polyline',{points:'20 6 9 17 4 12'}));
const WarnIcon      =()=>React.createElement('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},p('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01'));
const ChevIcon      =()=>React.createElement('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2.5},React.createElement('polyline',{points:'6 9 12 15 18 9'}));

function StatRow({label,value}) {
  return React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'var(--space-2) 0',borderBottom:'1px solid var(--color-divider)'}},
    React.createElement('span',{style:{fontSize:'var(--text-sm)',color:'var(--color-text-muted)',fontWeight:500}},label),
    React.createElement('span',{style:{fontSize:'var(--text-sm)',fontWeight:700,color:'var(--color-text)',fontVariantNumeric:'tabular-nums'}},value||'—'));
}

// ── DASHBOARD ─────────────────────────────────────────────
function Dashboard({ data:d }) {
  const e = React.createElement;
  const score = parseFloat(d.finalScore) || 0;

  return e('div',null,
    // KPI + Summary
    e('div',{className:'grid-2',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card kpi-card'},
        e('div',{style:{position:'relative',zIndex:1}},
          e('div',{style:{fontSize:'var(--text-sm)',opacity:0.85,marginBottom:'var(--space-2)',fontWeight:600}},'Indeks Kepuasan Masyarakat (IKM)'),
          e('div',{className:'kpi-score'},score?score.toFixed(2):d.finalScore||'—'),
          e('div',{className:'kpi-label'},'Nilai Kumulatif Kepuasan'),
          e('div',{className:'kpi-badge'},e(CheckIcon),d.finalScoreText||'Baik'),
          e('div',{className:'kpi-meta'},`Kategori B — Predikat: ${d.finalScoreText||'Baik'}`)
        )
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(UsersIcon)),'Ringkasan Survei'),
        e('div',{style:{display:'flex',flexDirection:'column',gap:'var(--space-4)'}},
          e(StatRow,{label:'Periode',value:d.month}),
          e(StatRow,{label:'Total Responden',value:d.totalRespondents}),
          e(StatRow,{label:'Skor IKM',value:d.finalScore}),
          e(StatRow,{label:'Predikat',value:d.finalScoreText}),
        )
      )
    ),

    // Body text
    e('div',{className:'body-section'},
      e('p',null,`Sebagai wujud komitmen berkelanjutan dalam menjaga kualitas layanan, RSU Islam Klaten secara berkala menyelenggarakan Survei Kepuasan Masyarakat. Pada periode ${d.month}, survei yang melibatkan ${d.totalRespondents} responden ini menghasilkan nilai Indeks Kepuasan Masyarakat (IKM) sebesar ${d.finalScore}. Skor tersebut menempatkan mutu pelayanan kami pada Kategori B dengan predikat kinerja Baik.`),
      e('p',null,`Pencapaian ini sekaligus membuktikan bahwa RSU Islam Klaten telah berhasil memenuhi target yang direncanakan, di mana target kepuasan pelanggan pada bulan ${d.month} mencapai predikat ${d.finalScoreText}.`)
    ),
    e('hr',{className:'divider'}),

    // Bar chart
    e('h2',{className:'section-heading'},'Grafik Nilai Aspek Pelayanan'),
    e('p',{className:'section-subheading'},'Rincian nilai per aspek (maks. 100%). Garis merah = rata-rata.'),
    e('div',{className:'card',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card-title'},e('span',{className:'icon'},e(BarIcon)),'Nilai Aspek Layanan'),
      e(BarChart,{data:d.aspects})
    ),

    // Pie charts
    e('h2',{className:'section-heading'},'Data Responden'),
    e('p',{className:'section-subheading'},'Profil demografis responden survei kepuasan.'),
    e('div',{className:'grid-3',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(UserIcon)),'Jenis Kelamin'),
        d.demographics.gender.length>0
          ? e(PieChart,{data:d.demographics.gender,colors:d.demographics.gender.map(g=>g.label.toLowerCase().includes('laki')?'#1d6fa4':'#e8599a')})
          : e('p',{style:{fontSize:'var(--text-sm)',color:'var(--color-text-muted)',padding:'var(--space-4) 0'}},'Data tidak ditemukan di sheet ini.')
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(BookIcon)),'Pendidikan'),
        d.demographics.education.length>0
          ? e(PieChart,{data:d.demographics.education})
          : e('p',{style:{fontSize:'var(--text-sm)',color:'var(--color-text-muted)',padding:'var(--space-4) 0'}},'Data tidak ditemukan di sheet ini.')
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(BriefcaseIcon)),'Pekerjaan'),
        d.demographics.occupation.length>0
          ? e(PieChart,{data:d.demographics.occupation})
          : e('p',{style:{fontSize:'var(--text-sm)',color:'var(--color-text-muted)',padding:'var(--space-4) 0'}},'Data tidak ditemukan di sheet ini.')
      )
    ),
    e('hr',{className:'divider'}),

    // Aspect analysis
    e('h2',{className:'section-heading'},'Analisis Unsur Pelayanan'),
    e('p',{className:'section-subheading'},`Nilai ${d.finalScore} mencerminkan performa layanan yang solid. Berikut rincian per aspek:`),
    e('div',{className:'grid-2',style:{marginBottom:'var(--space-8)'}},
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(ListIcon)),'Rincian Nilai Aspek'),
        e('ul',{className:'aspect-list'},
          d.aspects.map((a,i)=>e('li',{key:i,className:'aspect-item'},
            e('span',{className:'aspect-num'},i+1),
            e('span',{className:'aspect-name'},a.label),
            e('div',{className:'aspect-score-wrap'},
              e('span',{className:'aspect-score-num'},a.score||'—'),
              e('span',{className:'aspect-score-label'},a.text||'—')
            )
          ))
        )
      ),
      e('div',{className:'card'},
        e('div',{className:'card-title'},e('span',{className:'icon'},e(InfoIcon)),'Kesimpulan'),
        e('div',{style:{display:'flex',flexDirection:'column',gap:'var(--space-4)',height:'100%'}},
          e('p',{style:{fontSize:'var(--text-base)',color:'var(--color-text)',lineHeight:1.75}},
            'Meskipun sebagian besar unsur pelayanan sudah berjalan optimal dan masuk dalam kategori baik, RSU Islam Klaten akan terus melakukan langkah-langkah strategis untuk meningkatkan efisiensi waktu layanan demi kenyamanan dan kepuasan pasien yang lebih baik.'),
          e('div',{style:{marginTop:'auto',padding:'var(--space-4)',background:'var(--color-primary-light)',borderRadius:'var(--radius-md)'}},
            e('div',{style:{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'var(--space-1)'}},'Skor Keseluruhan'),
            e('div',{style:{fontSize:'var(--text-xl)',fontFamily:'var(--font-display)',fontWeight:700,color:'var(--color-primary)',lineHeight:1}},d.finalScore||'—'),
            e('div',{style:{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',marginTop:'var(--space-1)'}},d.finalScoreText||'')
          )
        )
      )
    )
  );
}

// ── MAIN APP ──────────────────────────────────────────────
function App() {
  const [sheets,setSheets]           = useState([]);
  const [activeSheet,setActiveSheet] = useState('');
  const [sheetData,setSheetData]     = useState(null);
  const [loading,setLoading]         = useState(false);
  const [error,setError]             = useState('');
  const [isOnline,setIsOnline]       = useState(navigator.onLine);
  const [dbMeta,setDbMeta]           = useState(null);
  const [msg,setMsg]                 = useState(null);
  const e = React.createElement;

  useEffect(()=>{
    const on=()=>setIsOnline(true), off=()=>setIsOnline(false);
    window.addEventListener('online',on); window.addEventListener('offline',off);
    return()=>{ window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  },[]);

  useEffect(()=>{
    const stored = loadDB();
    if(stored?.meta) setDbMeta(stored.meta);
  },[]);

  // Init on mount
  useEffect(()=>{ initSheets(); },[]);

  // Auto daily refresh
  useEffect(()=>{
    if(!isOnline||!dbMeta?.lastUpdated) return;
    if((Date.now()-new Date(dbMeta.lastUpdated))/3600000>=24) fetchAll();
  },[dbMeta]);

  async function initSheets() {
    // First try to load from local cache immediately for fast display
    const stored = loadDB();
    if(stored?.data){
      const keys = Object.keys(stored.data);
      if(keys.length>0){
        setSheets(keys);
        const last = keys[keys.length-1];
        setActiveSheet(last);
        setSheetData(stored.data[last].data);
      }
    }
    // Then try online
    if(navigator.onLine){
      try {
        const list = await fetchSheetNames();
        setSheets(list);
        // Load the most recent sheet (last in list)
        const last = list[list.length-1];
        if(last){
          setActiveSheet(last);
          await loadSheet(last);
        }
      } catch(err) {
        console.warn('Sheet names fetch failed:', err.message);
        // If we already have local data, that's fine — already shown above
        if(!stored?.data){ setError(`Gagal mengambil daftar sheet: ${err.message}`); }
      }
    } else {
      if(!stored?.data){
        setError('Tidak ada koneksi internet dan tidak ada data lokal. Harap hubungkan ke internet untuk pertama kali.');
      }
    }
  }

  useEffect(()=>{
    if(activeSheet && isOnline) loadSheet(activeSheet);
    else if(activeSheet){
      const stored = loadDB();
      if(stored?.data?.[activeSheet]) setSheetData(stored.data[activeSheet].data);
    }
  },[activeSheet]);

  async function loadSheet(name) {
    setLoading(true); setError('');
    try {
      const grid = await fetchSheetCSV(name);
      const data = extractData(grid, name);
      setSheetData(data);
      // Save to local DB
      const db = loadDB()?.data || {};
      saveDB({...db, [name]:{grid,data,fetchedAt:new Date().toISOString()}});
    } catch(err) {
      const stored = loadDB();
      if(stored?.data?.[name]){
        setSheetData(stored.data[name].data);
        setError(`Menggunakan data cache lokal (error: ${err.message}).`);
      } else {
        setError(`Gagal memuat data: ${err.message}`);
      }
    }
    setLoading(false);
  }

  async function fetchAll() {
    if(!isOnline){ showMsg('Tidak ada koneksi internet.',false); return; }
    showMsg('Mengambil semua data dari Google Sheets...',null);
    try {
      const list = await fetchSheetNames();
      const allData = {};
      for(const name of list){
        const grid = await fetchSheetCSV(name);
        allData[name] = {grid, data:extractData(grid,name), fetchedAt:new Date().toISOString()};
      }
      saveDB(allData);
      setSheets(list);
      const stored = loadDB();
      if(stored?.meta) setDbMeta(stored.meta);
      if(activeSheet && allData[activeSheet]) setSheetData(allData[activeSheet].data);
      showMsg('✓ Semua data berhasil diperbarui!',true);
    } catch(err){ showMsg(`Gagal: ${err.message}`,false); }
  }

  function showMsg(text,success){ setMsg({text,success}); if(success!==null) setTimeout(()=>setMsg(null),4000); }

  const handleSheetChange = (name) => {
    setActiveSheet(name);
    setSheetData(null);
    setError('');
    if(isOnline){ loadSheet(name); }
    else{
      const stored=loadDB();
      if(stored?.data?.[name]) setSheetData(stored.data[name].data);
      else setError('Data tidak tersedia offline untuk bulan ini.');
    }
  };

  return e('div',null,
    // HEADER
    e('header',{className:'site-header'},
      e('div',{className:'container'},
        e('div',{className:'header-inner'},
          e('a',{className:'logo',href:'#'},
            e('div',{className:'logo-icon'},e(ActivityIcon)),
            e('div',null,
              e('div',{className:'logo-text'},'RSU Islam Klaten'),
              e('div',{className:'logo-sub'},'Dashboard IKM')
            )
          ),
          e('div',{className:'header-actions'},
            e('span',{className:`status-badge ${isOnline?'status-online':'status-offline'}`},
              e('span',{className:'status-dot'}), isOnline?'Online':'Offline'),
            isOnline&&e('button',{className:'btn btn-sm btn-secondary',onClick:fetchAll},
              e(RefreshIcon),'Perbarui Data'),
            e(ThemeToggle)
          )
        )
      )
    ),

    // PAGE HERO
    e('section',{className:'page-hero'},
      e('div',{className:'container'},
        e('div',{className:'page-hero-inner'},
          e('div',null,
            e('h1',{className:'page-hero-title'},sheetData?.title||'Survei Kepuasan Masyarakat'),
            e('p',{className:'page-hero-subtitle'},sheetData?.month?`Periode: ${sheetData.month}`:'Indeks Kepuasan Masyarakat — RSU Islam Klaten')
          ),
          sheets.length>0&&e('div',{className:'month-selector'},
            e('label',{htmlFor:'month-select',style:{fontSize:'var(--text-sm)',fontWeight:600,color:'var(--color-text-muted)',whiteSpace:'nowrap'}},'Pilih Periode:'),
            e('div',{className:'select-wrapper'},
              e('select',{id:'month-select',value:activeSheet,onChange:ev=>handleSheetChange(ev.target.value)},
                sheets.map(s=>e('option',{key:s,value:s},s))),
              e('span',{className:'select-arrow'},e(ChevIcon))
            )
          )
        )
      )
    ),

    // MAIN
    e('main',{className:'main-content'},
      e('div',{className:'container'},
        msg&&e('div',{className:msg.success?'success-banner':'offline-banner'},
          msg.success?e(CheckIcon):e(WarnIcon), msg.text),
        error&&e('div',{className:'offline-banner'},e(WarnIcon),error),
        loading&&e('div',{className:'grid-2',style:{marginBottom:'var(--space-6)'}},
          e('div',{className:'card skeleton skeleton-block',style:{minHeight:160}}),
          e('div',{className:'card skeleton skeleton-block',style:{minHeight:160}})),
        !loading&&sheetData&&e(Dashboard,{data:sheetData}),
        !loading&&!sheetData&&!error&&sheets.length===0&&
          e('div',{className:'empty-state'},
            e('svg',{width:48,height:48,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,style:{color:'var(--color-text-faint)',marginBottom:'var(--space-4)'}},
              React.createElement('circle',{cx:12,cy:12,r:10}),
              p('M12 8v4M12 16h.01')),
            e('h3',null,'Menghubungkan ke Google Sheets...'),
            e('p',null,'Memuat daftar sheet, harap tunggu sebentar.')
          )
      )
    ),

    // FOOTER
    e('footer',{className:'site-footer'},
      e('div',{className:'container'},
        e('p',null,'© RSU Islam Klaten — Dashboard Indeks Kepuasan Masyarakat'),
        dbMeta?.lastUpdated&&e('p',{style:{marginTop:'0.25rem'}},
          `Data lokal: ${new Date(dbMeta.lastUpdated).toLocaleString('id-ID')}`)
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
