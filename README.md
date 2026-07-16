# IoT Monitor — Sistem Monitoring Mati Listrik & Genset
> Web server pemantauan real-time untuk monitoring status listrik PLN dan genset di lokasi transmisi TVRI Sulawesi Utara.

---

## Teknologi

- **Backend** — Node.js + Express.js
- **Frontend** — HTML + CSS + Vanilla JavaScript
- **Database** — SQLite via better-sqlite3
- **Charts** — Chart.js
- **PDF** — jsPDF + jsPDF-AutoTable

---

## Fitur

- Monitoring status listrik PLN real-time untuk 5 lokasi transmisi
- Monitoring genset (arus, daya, status)
- Dashboard dengan grafik, riwayat, dan log kejadian
- Export laporan PDF dengan header institusi TVRI
- Data tersimpan permanen via SQLite
- Auto-refresh setiap 3 detik

---

## Lokasi Transmisi

| Sektor | Lokasi |
|--------|--------|
| sector_1 | Transmisi Manado |
| sector_2 | Transmisi Makawemben |
| sector_3 | Transmisi Boroko |
| sector_4 | Transmisi Lirung |
| sector_5 | Transmisi Tahuna |

---

## Cara Menjalankan

**Prasyarat:** Node.js LTS ([nodejs.org](https://nodejs.org))

```bash
# Clone repository
git clone https://github.com/USERNAME/iot-monitor-tvri.git

# Masuk ke folder project
cd iot-monitor-tvri

# Install dependencies
npm install

# Jalankan server
npm run dev
```

Buka browser dan akses:
```
http://localhost:3000
```

---

## API Endpoint

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | `/api/listrik` | Terima data PLN dari ESP32 |
| GET | `/api/listrik` | Ambil data PLN |
| GET | `/api/listrik/stats` | Statistik per sektor |
| POST | `/api/genset` | Terima data genset dari ESP32 |
| GET | `/api/genset` | Ambil data genset |
| GET | `/api/genset/stats` | Statistik genset |

---

## Struktur Folder

```
iot-monitor-tvri/
├── server.js        ← Entry point
├── database.js      ← Inisialisasi SQLite
├── package.json
├── routes/
│   └── api.js       ← Semua endpoint API
└── public/
    ├── index.html   ← Dashboard
    └── logo-tvri.jpg
```

---

## Catatan

- Server harus tetap berjalan (`npm run dev`) selama ESP32 aktif mengirim data
- File database `iot_monitor.db` dibuat otomatis saat server pertama kali dijalankan
- Backup file `iot_monitor.db` secara berkala untuk menjaga data

---

*Proyek magang — Lembaga Penyiaran Publik TVRI Stasiun Sulawesi Utara*
