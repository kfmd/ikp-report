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

## Menambah/Mengubah Sheet Periode

Di `app.js`, edit array `KNOWN_SHEETS`:

```js
const FALLBACK_SHEETS = [
  { name: 'Juni 2025', gid: 'IDSHEET1' },
  { name: 'Desember 2025', gid: 'IDSHEET2' },
];
```

Nama harus **sama persis** dengan nama tab sheet di Google Sheets. IDSHEET bisa dilihat dalam address bar setelah ganti sheet.

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

- **React 18**
- **Chart.js 4**
- **Babel Standalone**
- **IndexedDB**
- **Google Sheets CSV Export**

---

Dibuat untuk RSU Islam Klaten
