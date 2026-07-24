# Konteks Proyek — IoT Monitoring Web Server
> Dokumen ini berisi konteks lengkap proyek untuk digunakan sebagai referensi AI di Antigravity IDE.
> Baca seluruh dokumen ini sebelum mengerjakan task apapun.

---

## Gambaran Umum

Proyek ini adalah **web server monitoring mati listrik dan genset berbasis IoT** yang dikerjakan sebagai proyek magang di **TVRI (Televisi Republik Indonesia)**. Web ini berfungsi sebagai dashboard pemantauan real-time yang menerima data dari perangkat ESP32 yang dipasang di berbagai lokasi transmisi.

**Tidak ada sistem login** — dashboard dapat diakses langsung tanpa autentikasi.

---

## Status Proyek Saat Ini

### Sudah Selesai
- Web server Node.js + Express berjalan di lokal
- Dashboard monitoring PLN dengan 5 sektor (sector_1 s/d sector_5)
- Endpoint API PLN dan Genset lengkap (POST, GET, GET stats, DELETE)
- Dashboard dengan 5 tab: Dashboard, Grafik, Riwayat, Log, Genset
- Fitur export PDF menggunakan jsPDF + jsPDF-AutoTable
- Auto-refresh setiap 3 detik
- Format durasi mati dalam MM:SS
- Kode Arduino ESP32 (versi WiFi) yang sudah terhubung ke web server
- Fitur monitoring Genset lengkap (tab, kartu status, grafik, tabel log, export PDF)
- Lucide SVG icons menggantikan emoji
- Nama lokasi transmisi TVRI (Transmisi Manado, Makawemben, Boroko, Lirung, Tahuna)
- **Database SQLite permanen** menggunakan better-sqlite3 — data tidak hilang saat server restart
- **Header institusi PDF** — logo TVRI + nama kantor di semua file PDF yang dihasilkan (PLN dan Genset)
- **Dark mode profesional** — tema warna gelap TVRI (#0A0A0A/#111827) dengan aksen hijau (#22C55E) di seluruh dashboard dan semua 5 tab
- **Fitur NO SIGNAL** — indikator amber (#F59E0B) untuk sektor tidak kirim data >2 menit; tabel `sector_heartbeat`, badge wifi-off + info "Terakhir aktif: X menit lalu"

### Sedang Dikerjakan / Tahap Selanjutnya
- Deployment ke server TVRI (menunggu IP publik — belum dikerjakan)

---

## Stack Teknologi

```
Backend  : Node.js + Express.js
Frontend : HTML + CSS + Vanilla JavaScript (tanpa framework)
Database : SQLite via better-sqlite3 (file: iot_monitor.db)
Library  : Chart.js (grafik), jsPDF + jsPDF-AutoTable (export PDF), Lucide (SVG icons via CDN)
Port     : 3000
```

---

## Struktur Folder

```
iot-server-v5/
├── server.js              <- entry point, setup Express & middleware
├── database.js            <- inisialisasi SQLite, pembuatan tabel otomatis
├── iot_monitor.db         <- file database SQLite (auto-generated)
├── package.json
├── routes/
│   └── api.js             <- semua endpoint API (PLN & Genset), pakai SQLite
└── public/
    └── index.html         <- seluruh dashboard (HTML + CSS + JS dalam satu file)
```

---

## Database SQLite

File database: `iot_monitor.db` (dibuat otomatis di root project saat server pertama kali dijalankan).

Library: `better-sqlite3` (synchronous, ringan, tidak perlu server terpisah).

### Tabel pln_log
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | ID auto-increment |
| sector_id | TEXT NOT NULL | Sektor PLN (sector_1 s/d sector_5) |
| status | TEXT NOT NULL | ON atau OFF |
| tegangan | REAL | Tegangan dalam Volt (nullable) |
| durasi_mati | REAL | Durasi mati dalam menit (nullable) |
| waktu | TEXT NOT NULL | Waktu kejadian (YYYY-MM-DD HH:MM:SS) |
| diterima_at | TEXT NOT NULL | Waktu diterima server |

### Tabel sector_heartbeat (BARU — dibuat untuk fitur NO SIGNAL)
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| sector_id | TEXT PRIMARY KEY | Sektor PLN (sector_1 s/d sector_5) |
| last_seen | TEXT NOT NULL | Waktu terakhir data diterima (YYYY-MM-DD HH:MM:SS) |
| last_status | TEXT | Status terakhir sebelum NO SIGNAL (ON/OFF) |
| last_tegangan | REAL | Tegangan terakhir yang diterima |

### Tabel genset_log
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | ID auto-increment |
| arus_r | REAL | Arus phase R dalam Ampere (nullable) |
| arus_s | REAL | Arus phase S dalam Ampere (nullable) |
| daya_r | INTEGER | Daya phase R dalam Watt (nullable) |
| daya_s | INTEGER | Daya phase S dalam Watt (nullable) |
| status_pln | TEXT NOT NULL | Status PLN sensor genset (ON/OFF) |
| status_genset | TEXT NOT NULL | Status genset (ON/OFF) |
| waktu | TEXT NOT NULL | Waktu data (YYYY-MM-DD HH:MM:SS) |
| diterima_at | TEXT NOT NULL | Waktu diterima server |

### Catatan Database
- WAL (Write-Ahead Logging) mode diaktifkan untuk performa write yang lebih baik
- Tabel dibuat otomatis dengan CREATE TABLE IF NOT EXISTS saat server startup
- Tidak perlu setup manual atau migrasi
- File iot_monitor.db sudah diisi data test — jangan dihapus kecuali ingin reset data

---

## Endpoint API PLN (Jangan Diubah)

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | `/api/listrik` | Terima data dari ESP32 PLN |
| GET | `/api/listrik` | Ambil semua data (opsional: `?sector_id=sector_1`) |
| GET | `/api/listrik/stats` | Statistik per sektor |
| DELETE | `/api/listrik` | Hapus data (opsional: `?sector_id=sector_1`) |

### Format JSON PLN (POST /api/listrik)
```json
{
  "sector_id": "sector_1",
  "status": "ON",
  "tegangan": 220.5,
  "durasi_mati": 5.3,
  "waktu": "2026-07-14 10:47:12"
}
```

### Validasi PLN
- `sector_id` wajib, hanya menerima `sector_1` s/d `sector_5`
- `status` wajib, hanya menerima `ON` atau `OFF`
- `durasi_mati` disanitasi: max 1440 menit, dibulatkan 2 desimal
- `tegangan` disanitasi: max 300V, dibulatkan 1 desimal
- Data disimpan ke tabel `pln_log` di SQLite (permanen)

---

## Endpoint API Genset

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | `/api/genset` | Terima data dari ESP32 genset |
| GET | `/api/genset` | Ambil semua data genset |
| GET | `/api/genset/stats` | Statistik ringkas genset |
| DELETE | `/api/genset` | Hapus semua data genset |

### Format JSON Genset (POST /api/genset)
```json
{
  "waktu": "19/06/2026 13:58:32",
  "arus_r": 13.90,
  "arus_s": 13.36,
  "daya_r": 3058,
  "daya_s": 2940,
  "status_pln": "ON",
  "status_genset": "OFF"
}
```

### Validasi & Sanitasi Genset
- `status_pln` wajib, hanya menerima `ON` atau `OFF`
- `status_genset` wajib, hanya menerima `ON` atau `OFF`
- `arus_r` & `arus_s` disanitasi: max 100A, dibulatkan 2 desimal
- `daya_r` & `daya_s` disanitasi: max 100.000W, dibulatkan ke integer
- Format waktu dinormalisasi otomatis dari `DD/MM/YYYY HH:MM:SS` ke `YYYY-MM-DD HH:MM:SS`
- Data disimpan ke tabel `genset_log` di SQLite (permanen)

### Response GET /api/genset/stats
```json
{
  "success": true,
  "total": 120,
  "statusGensetTerakhir": "OFF",
  "statusPlnTerakhir": "ON",
  "waktuTerakhir": "13/7/2026, 15.00.00",
  "avgArusR": 13.90,
  "avgArusS": 13.36,
  "lastDayaR": 3058,
  "lastDayaS": 2940,
  "totalDayaTerakhir": 5998,
  "totalGensetOn": 5
}
```

---

## Fitur NO SIGNAL (Siap Diimplementasikan)

Fitur ini menambahkan indikator ketiga selain ON dan OFF untuk mendeteksi alat yang tidak mengirim data dalam batas waktu tertentu. Sudah disetujui oleh pihak TVRI.

### Spesifikasi
- **Timeout**: 2 menit — sektor dianggap NO SIGNAL jika tidak ada data masuk selama 2 menit
- **Heartbeat Arduino**: ESP32 mengirim data rutin setiap 1 menit meskipun tidak ada perubahan status PLN, untuk memastikan `last_seen` selalu terupdate
- **Warna indikator NO SIGNAL**: `#F59E0B` (amber/kuning) — sesuai skema warna dark mode yang sudah ada

### Status yang ditampilkan di kartu sektor
| Status | Warna | Kondisi |
|--------|-------|---------|
| ON | `#22C55E` hijau | Listrik normal, data masuk < 2 menit |
| OFF | `#EF4444` merah | Listrik mati, data masuk < 2 menit |
| NO SIGNAL | `#F59E0B` amber | Tidak ada data masuk > 2 menit |

### Informasi tambahan saat NO SIGNAL
- Tampilkan waktu terakhir data diterima, contoh: "Terakhir aktif: 5 menit lalu"
- Tampilkan status terakhir sebelum NO SIGNAL (ON atau OFF)

### Logika di backend (routes/api.js)
Setiap kali `POST /api/listrik` diterima:
1. Update tabel `sector_heartbeat` dengan `last_seen = waktu sekarang`
2. Simpan `last_status` dan `last_tegangan` dari data yang masuk

Di `GET /api/listrik/stats`:
- Hitung selisih waktu sekarang dengan `last_seen` per sektor
- Jika selisih > 2 menit → tandai sektor sebagai NO SIGNAL
- Sertakan `last_seen`, `last_status`, `lastTegangan`, dan `isOnline` (true/false) di response stats

### Logika di frontend (index.html)
- Kartu sektor membaca field `isOnline` dari response stats
- Jika `isOnline = false` → tampilkan badge NO SIGNAL warna amber
- Jika `isOnline = true` → tampilkan badge ON/OFF seperti biasa
- Tambahkan teks "Terakhir aktif: X menit lalu" di bawah kartu saat NO SIGNAL
- Summary bar "Sektor mati saat ini" juga hitung sektor yang NO SIGNAL

### Perubahan kode Arduino (esp32_monitor_wifi_dual.ino)
Tambahkan heartbeat di fungsi `loop()` — kirim data rutin setiap 1 menit:
```cpp
static unsigned long heartbeatTimer = 0;
if (millis() - heartbeatTimer > 60000) { // 60000ms = 1 menit
    heartbeatTimer = millis();
    kirimKeWebServer(statusPLN ? "ON" : "OFF", teganganAC, 0, rtc.now());
}
```
Heartbeat hanya kirim ke web server (tidak ke Google Sheets) agar tidak spam data ke Sheets.

---

## Nama Lokasi Transmisi (Sektor PLN)

ESP32 tetap mengirim `sector_1` s/d `sector_5` — jangan diubah. Nama ditampilkan via mapping `SECTOR_NAMES` di JavaScript frontend.

| sector_id (API & DB) | Nama Tampilan di Dashboard |
|---------------------|---------------------------|
| `sector_1` | Transmisi Manado |
| `sector_2` | Transmisi Makawemben |
| `sector_3` | Transmisi Boroko |
| `sector_4` | Transmisi Lirung |
| `sector_5` | Transmisi Tahuna |

---

## Icon Library

Proyek menggunakan **Lucide Icons** (SVG inline). CDN dimuat di `<head>`:
```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```
Icon digunakan sebagai SVG inline langsung di HTML — tidak perlu `lucide.createIcons()`.

---

## Skema Warna (Dark Mode)
Referensi mengikuti web internal teknik TVRI.

Background: `#0A0A0A` (utama) · `#0D1B2A` (nav/sidebar) · `#111827` (card)
Border & hover: `#1E2D3D` · `#2D3748`
Teks: `#F9FAFB` (utama) · `#9CA3AF` (sekunder) · `#6B7280` (muted)
Status ON / aksen primary: `#22C55E` (hijau)
Status OFF / danger: `#EF4444` (merah)
Warning / NO SIGNAL: `#F59E0B` (amber)
Tombol PDF: `#3B82F6` (biru)
Header nav & header PDF: `#0D1B2A`

---

## Aset PDF

File logo: `public/logo-tvri.jpg`

Header institusi TVRI ditampilkan di **halaman pertama** setiap file PDF (PLN maupun Genset):
- **Sisi kiri** — Logo TVRI (`logo-tvri.jpg`), tinggi ~18mm, dimuat via `fetch('/logo-tvri.jpg')` → `FileReader` → base64
- **Sisi kanan logo** — Teks tiga baris:
  - Baris 1 (bold): LEMBAGA PENYIARAN PUBLIK TELEVISI REPUBLIK INDONESIA
  - Baris 2 (bold): STASIUN SULAWESI UTARA
  - Baris 3: JL. TELEVISI, BANJER-TIKALA MANADO, SULAWESI UTARA 95125 INDONESIA
  - Baris 4: P (0431) 868001   F (0431) 860403   WWW.TVRI.GO.ID
- **Bawah header** — Garis pemisah tebal warna navy (#1E3A5F, tebal 0.8mm)
- Setelah garis: judul laporan, tanggal cetak, filter, lalu tabel-tabel

Implementasi di `public/index.html`:
- Fungsi `getLogoBase64()` — async, cache logo agar hanya fetch sekali per sesi
- Fungsi `gambarHeaderTVRI(doc, W, logoDataUrl)` — menggambar header dan mengembalikan posisi Y
- `exportPDF()` dan `exportPDFGenset()` — diubah menjadi `async`, keduanya memanggil `gambarHeaderTVRI`
- Footer halaman (nomor halaman) tetap ada di semua halaman

---

## Tampilan Dashboard (5 Tab)

### Tab Dashboard
- Summary bar: total kejadian, sektor mati, sektor normal, total durasi mati
- Kartu per sektor (5 kartu): status ON/OFF/NO SIGNAL, tegangan, total mati, total durasi
- Tabel 10 kejadian terbaru + Tombol Export PDF

### Tab Grafik
- Line chart tegangan per sektor (filter sektor & jumlah data)
- Bar chart jumlah mati per sektor
- Bar chart total durasi mati per sektor

### Tab Riwayat
- Sub-tab: Per Hari / Per Minggu / Per Bulan
- Bar chart + tabel ringkasan per periode

### Tab Log
- Tabel lengkap semua kejadian (filter sektor & status)
- Tombol Export PDF + Hapus Semua

### Tab Genset
- 4 kartu status + 4 kartu nilai arus/daya
- Banner Total Daya Gabungan (gradient navy-biru)
- Line chart Arus R & S + Line chart Daya R & S
- Tabel log genset + Tombol Export PDF + Hapus Data

---

## Aturan Pengembangan

- **Jangan ubah endpoint PLN yang sudah ada** — hanya tambahkan, jangan modifikasi
- **Jangan ubah apapun di public/index.html** kecuali ada fitur frontend baru
- **Jangan tambahkan sistem login** — dashboard harus langsung bisa diakses
- **Jangan ganti stack** — tetap Node.js + Express, Vanilla JS, Chart.js, jsPDF, SQLite
- **Jangan pakai framework frontend** (React/Vue) — tetap Vanilla JS
- Semua kode frontend tetap dalam satu file `public/index.html`
- Tambahkan komentar yang jelas di setiap fungsi/endpoint baru
- Semua label dan teks di dashboard menggunakan **Bahasa Indonesia**
- **Jangan pakai emoji** — gunakan Lucide SVG icon

---

## Cara Menjalankan Project

```bash
# Masuk ke folder project
cd iot-server-v5

# Install dependencies (hanya perlu sekali)
npm install

# Jalankan server (mode development)
npm run dev

# Buka dashboard
# http://localhost:3000
```

---

## Rencana ke Depan (Belum Dikerjakan)

- **Fitur anomali tegangan** — indikator undervoltage/overvoltage berdasarkan batas tegangan normal PLN
- **Deployment ke server TVRI** — menunggu IP publik dari tim IT TVRI
- **Monitoring Genset tambahan** — mungkin ada field tambahan dari tim IoT genset setelah alat selesai
- **Domain/HTTPS** — tergantung keputusan tim IT TVRI

---

## Catatan Tambahan

- Project ini dikerjakan oleh mahasiswa magang Informatika Unsrat (Universitas Sam Ratulangi Manado) di TVRI
- ESP32 monitoring PLN menggunakan WiFi (bukan LAN/Ethernet); ada juga versi LAN (W5500 Ethernet)
- Database SQLite menggunakan WAL mode — aman untuk concurrent read/write
- File `iot_monitor.db` berisi data permanen — backup file ini jika ingin menyimpan data
- Nama sektor di frontend menggunakan mapping `SECTOR_NAMES` — ESP32 tidak perlu diubah
- Alat IoT ditempatkan di daerah berbeda (setiap lokasi punya jaringan sendiri)
- Heartbeat Arduino hanya dikirim ke web server, tidak ke Google Sheets
