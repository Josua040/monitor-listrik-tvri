/**
 * database.js
 * Inisialisasi koneksi SQLite menggunakan better-sqlite3.
 * File database: iot_monitor.db (disimpan di root folder project)
 *
 * Tabel dibuat otomatis (CREATE TABLE IF NOT EXISTS):
 *   - pln_log    : data monitoring PLN dari ESP32
 *   - genset_log : data monitoring genset dari ESP32
 */

const Database = require('better-sqlite3');
const path = require('path');

// Lokasi file database di root folder project
const DB_PATH = path.join(__dirname, 'iot_monitor.db');

// Buka (atau buat) file database
const db = new Database(DB_PATH);

// Aktifkan WAL mode untuk performa lebih baik saat write bersamaan
db.pragma('journal_mode = WAL');

// Buat tabel pln_log jika belum ada
db.exec(
  'CREATE TABLE IF NOT EXISTS pln_log (' +
  '  id          INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  sector_id   TEXT    NOT NULL,' +
  '  status      TEXT    NOT NULL,' +
  '  tegangan    REAL,' +
  '  durasi_mati REAL,' +
  '  waktu       TEXT    NOT NULL,' +
  '  diterima_at TEXT    NOT NULL' +
  ')'
);

// Buat tabel genset_log jika belum ada
db.exec(
  'CREATE TABLE IF NOT EXISTS genset_log (' +
  '  id             INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  arus_r         REAL,' +
  '  arus_s         REAL,' +
  '  daya_r         INTEGER,' +
  '  daya_s         INTEGER,' +
  '  status_pln     TEXT    NOT NULL,' +
  '  status_genset  TEXT    NOT NULL,' +
  '  waktu          TEXT    NOT NULL,' +
  '  diterima_at    TEXT    NOT NULL' +
  ')'
);

console.log('[DB] SQLite terhubung: ' + DB_PATH);

module.exports = db;