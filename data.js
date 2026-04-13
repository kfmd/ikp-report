/**
 * ============================================================
 *  data.js  –  IKM Dashboard, RSU Islam Klaten
 * ============================================================
 *  Handles:
 *    1. Fetching data from Google Sheets (via public gviz API)
 *    2. Caching / persisting data in localStorage (local DB)
 *    3. Parsing raw sheet data into clean JS objects
 *    4. Auto-discovering available month sheets
 *
 *  This file uses plain JavaScript (no JSX).
 *  It exposes globals: LocalDB, DataManager, IKM
 *  These are used by app.js.
 * ============================================================
 */

// ── ① GOOGLE SHEETS CONFIGURATION ───────────────────────────
// Copy the ID from your spreadsheet URL:
//   https://docs.google.com/spreadsheets/d/[THIS_PART]/edit
const SHEET_ID = '19nNWdVnYdW1vEv0E0zAzVBSNc5DQKebAia7LD3fMv_o';

// Months to probe when discovering available sheets.
// Your sheet tabs should be named exactly like these (e.g. "Januari").
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// ── ② DEMOGRAPHICS CONFIGURATION ────────────────────────────
//
//  ⚠️  ACTION REQUIRED  ⚠️
//  The pie charts (gender, education, occupation) need the exact
//  cell locations from YOUR spreadsheet.
//
//  HOW TO CONFIGURE:
//  a) Open your Google Sheet, find where respondent demographics
//     are summarised (counts per category).
//  b) Note the row & column of each count.
//  c) Convert to 0-based indices:
//       Row 1   →  index 0     |   Column A  →  index 0
//       Row 20  →  index 19    |   Column C  →  index 2
//  d) Update the "cells" arrays below.
//  e) Set  enabled: true  to show the pie charts.
//
const DEMO_CONFIG = {
  enabled: false,            // ← Set to TRUE once cells below are correct

  gender: {
    labels: ['Laki-laki', 'Perempuan'],
    cells: [
      [19, 2],  // ← Row 20, Col C  (Laki-laki count) – UPDATE THIS
      [20, 2],  // ← Row 21, Col C  (Perempuan count) – UPDATE THIS
    ],
    colors: ['#3b82f6', '#ec4899'],   // Blue (male), Pink (female) as requested
  },

  education: {
    labels: ['SD', 'SMP', 'SMA / SMK', 'D1 – D3', 'S1', 'S2 / S3'],
    cells: [
      [22, 2],  // ← Row 23, Col C  – UPDATE THIS
      [23, 2],  // ← Row 24, Col C  – UPDATE THIS
      [24, 2],  // ← Row 25, Col C  – UPDATE THIS
      [25, 2],  // ← Row 26, Col C  – UPDATE THIS
      [26, 2],  // ← Row 27, Col C  – UPDATE THIS
      [27, 2],  // ← Row 28, Col C  – UPDATE THIS
    ],
    colors: ['#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#6366f1'],
  },

  occupation: {
    labels: ['PNS / TNI / Polri', 'Pegawai Swasta', 'Wiraswasta', 'Pelajar / Mahasiswa', 'Lainnya'],
    cells: [
      [29, 2],  // ← Row 30, Col C  – UPDATE THIS
      [30, 2],  // ← Row 31, Col C  – UPDATE THIS
      [31, 2],  // ← Row 32, Col C  – UPDATE THIS
      [32, 2],  // ← Row 33, Col C  – UPDATE THIS
      [33, 2],  // ← Row 34, Col C  – UPDATE THIS
    ],
    colors: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'],
  },
};

// ── ③ LOCAL DATABASE (localStorage wrapper) ─────────────────
const LocalDB = {
  DATA_KEY:   'rsui_ikm_data_v1',     // Key for all sheet data
  SHEETS_KEY: 'rsui_ikm_sheets_v1',   // Key for the sheet-names list
  EXPIRE_MS:  24 * 60 * 60 * 1000,    // 24 hours before data is "stale"

  // Low-level read
  _read(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (e) { return null; }
  },

  // Low-level write
  _write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('[LocalDB] Write failed (storage full?):', e.message); return false; }
  },

  /** Get the entire data store */
  getAll() { return this._read(this.DATA_KEY) || {}; },

  /** Save parsed data for one sheet */
  saveSheet(sheetName, parsedData) {
    const db = this.getAll();
    db[sheetName] = { data: parsedData, savedAt: Date.now() };
    this._write(this.DATA_KEY, db);
  },

  /** Get cached entry for one sheet (returns null if not found) */
  getSheet(sheetName) { return this.getAll()[sheetName] || null; },

  /** Is cached data older than EXPIRE_MS? */
  isStale(sheetName) {
    const e = this.getSheet(sheetName);
    if (!e || !e.savedAt) return true;
    return (Date.now() - e.savedAt) > this.EXPIRE_MS;
  },

  /** Names of all sheets that have cached data */
  getCachedSheetNames() { return Object.keys(this.getAll()); },

  /** Save the list of discovered sheet names */
  saveSheetList(list) { this._write(this.SHEETS_KEY, { list, savedAt: Date.now() }); },

  /** Get the saved sheet list */
  getSheetList() { return this._read(this.SHEETS_KEY); },

  /** Wipe all cached data (for debugging / manual reset) */
  clear() {
    localStorage.removeItem(this.DATA_KEY);
    localStorage.removeItem(this.SHEETS_KEY);
    console.log('[LocalDB] Cache cleared.');
  },
};

// ── ④ DATA MANAGER ──────────────────────────────────────────
const DataManager = {

  // ─────────────────────────────────────────────────────────
  // fetchRawSheet(sheetName)
  //
  // Fetches a sheet via Google's public gviz/tq JSON API.
  // No API key required – works for publicly shared sheets.
  // Returns a { cols, rows } table object from Google.
  // ─────────────────────────────────────────────────────────
  async fetchRawSheet(sheetName) {
    const url = [
      'https://docs.google.com/spreadsheets/d/',
      SHEET_ID,
      '/gviz/tq?tqx=out:json',
      '&sheet=', encodeURIComponent(sheetName),
      '&headers=0',  // All rows are data (none treated as headers)
    ].join('');

    // Abort request if it takes longer than 12 seconds
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);

    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const text = await res.text();

      // Google returns JSONP-like:  /*O_o*/\ngoogle.visualization.Query.setResponse({...});
      // We extract the JSON object between  setResponse(  and the final  )
      const start = text.indexOf('setResponse(') + 'setResponse('.length;
      const end   = text.lastIndexOf(')');
      if (start < 20 || end < 0) throw new Error('Unrecognised response format from Google Sheets.');

      const json = JSON.parse(text.substring(start, end));

      if (json.status !== 'ok') {
        const msg = json.errors?.[0]?.message || json.status;
        throw new Error(`Google Sheets error for "${sheetName}": ${msg}`);
      }

      return json.table;   // { cols: [...], rows: [...] }

    } finally {
      clearTimeout(timeout);
    }
  },

  // ─────────────────────────────────────────────────────────
  // Helpers: read a cell value from the table
  //   _cell → string / formatted value (or null)
  //   _num  → numeric value (or 0)
  //
  // ROW & COL INDICES ARE 0-BASED:
  //   Spreadsheet row 1 = index 0
  //   Spreadsheet col A = index 0, B = 1, C = 2 …
  // ─────────────────────────────────────────────────────────
  _cell(table, rowIdx, colIdx) {
    const row = table.rows[rowIdx];
    if (!row) return null;
    const cell = row.c[colIdx];
    if (!cell) return null;
    // Prefer formatted value (f) so numbers/dates look right; fall back to raw (v)
    return (cell.f !== null && cell.f !== undefined) ? cell.f : cell.v;
  },

  _num(table, rowIdx, colIdx) {
    const row = table.rows[rowIdx];
    if (!row) return 0;
    const cell = row.c[colIdx];
    if (!cell || cell.v === null || cell.v === undefined) return 0;
    if (typeof cell.v === 'number') return cell.v;
    // Handle locale-formatted strings like "85,25"
    return parseFloat(String(cell.v).replace(',', '.')) || 0;
  },

  // ─────────────────────────────────────────────────────────
  // parseSheet(table)
  //
  // Maps cell references to named fields.
  // Cell mapping (0-based):
  //   B2  = row 1,  col 1   → title
  //   B3  = row 2,  col 1   → month
  //   C25 = row 24, col 2   → total respondents
  //   D19 = row 18, col 3   → final score
  //   E19 = row 18, col 4   → final score text
  //   B15:J15 = row 14, cols 1-9 → aspect labels
  //   B16:J16 = row 15, cols 1-9 → aspect scores
  //   B17:J17 = row 16, cols 1-9 → aspect score texts
  // ─────────────────────────────────────────────────────────
  parseSheet(table) {
    const c = (r, col) => this._cell(table, r, col);
    const n = (r, col) => this._num(table, r, col);

    // Core report fields
    const title            = c(1, 1)  || 'Laporan IKM RSU Islam Klaten';
    const month            = c(2, 1)  || '';
    const totalRespondents = n(24, 2);            // C25
    const finalScore       = n(18, 3);            // D19
    const finalScoreText   = c(18, 4) || '';      // E19

    // Aspect data (9 aspects, B–J)
    const aspectLabels = Array.from({ length: 9 }, (_, i) => c(14, i + 1) || `Aspek ${i + 1}`); // B15:J15
    const aspectScores = Array.from({ length: 9 }, (_, i) => n(15, i + 1));                       // B16:J16
    const aspectTexts  = Array.from({ length: 9 }, (_, i) => c(16, i + 1) || '');                // B17:J17

    // Demographics (optional)
    let demographics = null;
    if (DEMO_CONFIG.enabled) {
      const readGroup = (cfg) => ({
        labels: cfg.labels,
        values: cfg.cells.map(([row, col]) => n(row, col)),
        colors: cfg.colors,
      });
      demographics = {
        gender:     readGroup(DEMO_CONFIG.gender),
        education:  readGroup(DEMO_CONFIG.education),
        occupation: readGroup(DEMO_CONFIG.occupation),
      };
    }

    return { title, month, totalRespondents, finalScore, finalScoreText, aspectLabels, aspectScores, aspectTexts, demographics };
  },

  // ─────────────────────────────────────────────────────────
  // getSheetData(sheetName, forceRefresh)
  //
  // Returns cached data if fresh (< 24 h old).
  // Fetches & saves fresh data otherwise (or if forceRefresh=true).
  // ─────────────────────────────────────────────────────────
  async getSheetData(sheetName, forceRefresh = false) {
    if (!forceRefresh && !LocalDB.isStale(sheetName)) {
      const cached = LocalDB.getSheet(sheetName);
      if (cached?.data) {
        console.log(`[DataManager] Using cached data for "${sheetName}"`);
        return { ...cached.data, _fromCache: true, _cachedAt: cached.savedAt };
      }
    }

    console.log(`[DataManager] Fetching fresh data for "${sheetName}"…`);
    const table = await this.fetchRawSheet(sheetName);
    const data  = this.parseSheet(table);
    LocalDB.saveSheet(sheetName, data);
    console.log(`[DataManager] Saved "${sheetName}" to local DB.`);
    return { ...data, _fromCache: false, _cachedAt: Date.now() };
  },

  // ─────────────────────────────────────────────────────────
  // discoverAvailableMonths()
  //
  // Fires 12 requests in parallel (one per Indonesian month).
  // Returns only the month names whose sheets exist in the spreadsheet.
  // ─────────────────────────────────────────────────────────
  async discoverAvailableMonths() {
    console.log('[DataManager] Probing all months in parallel…');
    const results = await Promise.allSettled(
      MONTH_NAMES.map(async (month) => {
        await this.fetchRawSheet(month);   // Throws if sheet not found
        return month;
      })
    );
    const available = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    console.log('[DataManager] Available months:', available);
    if (available.length > 0) LocalDB.saveSheetList(available);
    return available;
  },

  // ─────────────────────────────────────────────────────────
  // getAvailableSheets(forceRefresh)
  //
  // Returns sheet list from local cache first (fast).
  // Falls back to live discovery from Google Sheets.
  // ─────────────────────────────────────────────────────────
  async getAvailableSheets(forceRefresh = false) {
    if (!forceRefresh) {
      const saved = LocalDB.getSheetList();
      if (saved?.list?.length > 0) return saved.list;

      const cached = LocalDB.getCachedSheetNames();
      if (cached.length > 0) return cached;
    }
    return await this.discoverAvailableMonths();
  },

  // ─────────────────────────────────────────────────────────
  // refreshAllData(onProgress)
  //
  // Re-discovers available months AND re-fetches each one.
  // Calls onProgress({ current, total, sheet }) after each sheet.
  // Returns a summary of results.
  // ─────────────────────────────────────────────────────────
  async refreshAllData(onProgress) {
    const sheets  = await this.discoverAvailableMonths();
    const results = [];

    for (let i = 0; i < sheets.length; i++) {
      if (onProgress) onProgress({ current: i + 1, total: sheets.length, sheet: sheets[i] });
      try {
        const data = await this.getSheetData(sheets[i], true);
        results.push({ sheet: sheets[i], ok: true, data });
      } catch (e) {
        console.error(`[DataManager] Failed to refresh "${sheets[i]}":`, e.message);
        results.push({ sheet: sheets[i], ok: false, error: e.message });
      }
    }

    return { sheets, results };
  },
};

// ── ⑤ IKM SCORE UTILITIES ───────────────────────────────────
const IKM = {

  /**
   * IKM Score → Category mapping
   * Based on Permenpan RB No. 14 Tahun 2017
   *
   *   88.31 – 100   : A = Sangat Baik
   *   76.61 – 88.30 : B = Baik
   *   65.00 – 76.60 : C = Kurang Baik
   *   25.00 – 64.99 : D = Tidak Baik
   */
  getCategory(score) {
    const s = parseFloat(score);
    if (s >= 88.31) return { grade: 'A', label: 'Sangat Baik',  color: '#16a34a', bg: '#dcfce7' };
    if (s >= 76.61) return { grade: 'B', label: 'Baik',         color: '#2563eb', bg: '#dbeafe' };
    if (s >= 65.00) return { grade: 'C', label: 'Kurang Baik',  color: '#d97706', bg: '#fef3c7' };
    return              { grade: 'D', label: 'Tidak Baik',   color: '#dc2626', bg: '#fee2e2' };
  },

  /**
   * Calculate a linear regression trendline.
   * Input:  array of numbers  [y0, y1, y2, ...]
   * Output: array of trendline Y values (same length)
   */
  calcTrendline(data) {
    const n = data.length;
    if (n < 2) return [...data];
    const xMean = (n - 1) / 2;
    const yMean = data.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    data.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
    const slope     = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    return data.map((_, x) => Math.round((slope * x + intercept) * 100) / 100);
  },
};
