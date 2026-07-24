const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'iot_monitor.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

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

// Menyimpan waktu terakhir data diterima per sektor (fitur NO SIGNAL)
db.exec(
  'CREATE TABLE IF NOT EXISTS sector_heartbeat (' +
  '  sector_id     TEXT PRIMARY KEY,' +
  '  last_seen     TEXT NOT NULL,' +
  '  last_status   TEXT,' +
  '  last_tegangan REAL' +
  ')'
);

console.log('[DB] SQLite terhubung: ' + DB_PATH);

module.exports = db;