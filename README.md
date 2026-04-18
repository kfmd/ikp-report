# IKM Dashboard — RSU Islam Klaten

Dashboard Indeks Kepuasan Masyarakat (IKM) berbasis web yang membaca data dari Google Sheets dan menampilkan visualisasi interaktif.

---

## Struktur File

```
ikm-dashboard/
├── index.html   ← Halaman utama (buka ini)
├── style.css    ← Semua styling
├── app.js       ← Aplikasi React (JSX, diproses Babel)
├── db.js        ← Database lokal IndexedDB (cache offline)
└── README.md    ← Panduan ini
```

---

## Cara Menjalankan

> ⚠️ **Tidak bisa dibuka langsung dengan double-click** karena browser memblokir fetch dari `file://`. Gunakan salah satu cara di bawah.

### Cara 1 — VS Code Live Server (Rekomendasi)
1. Install ekstensi **Live Server** di VS Code
2. Buka folder `ikm-dashboard` di VS Code
3. Klik kanan `index.html` → **Open with Live Server**
4. Browser otomatis terbuka di `http://127.0.0.1:5500`

### Cara 2 — Python
```bash
cd ikm-dashboard
python -m http.server 8080
# Buka: http://localhost:8080
```

### Cara 3 — Node.js
```bash
cd ikm-dashboard
npx serve .
```

### Hosting Online
Upload semua file ke: Netlify, Vercel, GitHub Pages, cPanel, atau server Apache/Nginx.

---

## Google Sheets Setup

Agar data dapat dibaca otomatis:
1. Buka Google Sheets
2. Klik **Share** (Bagikan) → **Anyone with the link** → **Viewer**
3. Klik **Done**

Sheet ID sudah dikonfigurasi di `app.js` (variabel `SHEET_ID`).

---

## Menambah/Mengubah Sheet Periode

Di `app.js`, edit array `KNOWN_SHEETS`:

```js
const KNOWN_SHEETS = [
  'Juni 2025',
  'Juli 2025',
  // tambahkan nama sheet baru di sini
];
```

Nama harus **sama persis** dengan nama tab sheet di Google Sheets.

---

## Mapping Data (Cell Reference)

| Variabel | Cell | Keterangan |
|---|---|---|
| TITLE | B2 | Judul laporan |
| MONTH | B3 | Periode bulan |
| TOTAL RESPONDENTS | C25 | Jumlah responden |
| FINAL SCORE | D19 | Nilai IKM akhir |
| FINAL SCORE TEXT | E19 | Predikat (Baik, dll.) |
| SC-1 s/d SC-9 | B16:J16 | Nilai per aspek |
| SC-1-TXT s/d SC-9-TXT | B17:J17 | Label per aspek |

---

## Mode Offline

- Saat online: data diambil dari Google Sheets dan disimpan ke **IndexedDB** browser
- Saat offline: dashboard otomatis menampilkan data tersimpan terakhir
- Badge **"Cache"** muncul jika data berasal dari penyimpanan lokal
- Data disimpan per nama sheet — klik **Perbarui** untuk refresh manual

---

## Teknologi

- **React 18** via CDN — antarmuka interaktif
- **Chart.js 4** via CDN — grafik bar & doughnut
- **Babel Standalone** — mengubah JSX menjadi JavaScript
- **Plus Jakarta Sans** via Google Fonts — tipografi
- **IndexedDB** — cache offline lokal
- **Google Sheets CSV Export** — sumber data

---

Dibuat untuk RSU Islam Klaten
