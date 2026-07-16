const express = require('express');
const router  = express.Router();
const db      = require('../database');

const VALID_DEVICES = ['sector_1', 'sector_2', 'sector_3', 'sector_4', 'sector_5'];

// ════════════════════════════════════════════════════════════════
// PREPARED STATEMENTS — PLN
// ════════════════════════════════════════════════════════════════
const stmtInsertPln = db.prepare(
  'INSERT INTO pln_log (sector_id, status, tegangan, durasi_mati, waktu, diterima_at) ' +
  'VALUES (@sector_id, @status, @tegangan, @durasi_mati, @waktu, @diterima_at)'
);
const stmtSelectPln           = db.prepare('SELECT * FROM pln_log ORDER BY id DESC');
const stmtSelectPlnBySector   = db.prepare('SELECT * FROM pln_log WHERE sector_id = ? ORDER BY id DESC');
const stmtCountPln            = db.prepare('SELECT COUNT(*) AS total FROM pln_log');
const stmtCountBySector       = db.prepare('SELECT COUNT(*) AS total FROM pln_log WHERE sector_id = ?');
const stmtCountMati           = db.prepare("SELECT COUNT(*) AS total FROM pln_log WHERE sector_id = ? AND status = 'OFF'");
const stmtLastPln             = db.prepare('SELECT status, diterima_at FROM pln_log WHERE sector_id = ? ORDER BY id DESC LIMIT 1');
const stmtTotalDurasi         = db.prepare(
  'SELECT COALESCE(SUM(durasi_mati), 0) AS total ' +
  'FROM pln_log WHERE sector_id = ? AND durasi_mati > 0 AND durasi_mati <= 1440'
);
const stmtDeletePln           = db.prepare('DELETE FROM pln_log');
const stmtDeletePlnBySector   = db.prepare('DELETE FROM pln_log WHERE sector_id = ?');
const stmtCountDeleteBySector = db.prepare('SELECT COUNT(*) AS total FROM pln_log WHERE sector_id = ?');

// ════════════════════════════════════════════════════════════════
// PREPARED STATEMENTS — GENSET
// ════════════════════════════════════════════════════════════════
const stmtInsertGenset = db.prepare(
  'INSERT INTO genset_log (arus_r, arus_s, daya_r, daya_s, status_pln, status_genset, waktu, diterima_at) ' +
  'VALUES (@arus_r, @arus_s, @daya_r, @daya_s, @status_pln, @status_genset, @waktu, @diterima_at)'
);
const stmtSelectGenset = db.prepare('SELECT * FROM genset_log ORDER BY id DESC');
const stmtCountGenset  = db.prepare('SELECT COUNT(*) AS total FROM genset_log');
const stmtLastGenset   = db.prepare('SELECT * FROM genset_log ORDER BY id DESC LIMIT 1');
const stmtAvgArusR     = db.prepare('SELECT AVG(arus_r) AS avg FROM genset_log WHERE arus_r IS NOT NULL');
const stmtAvgArusS     = db.prepare('SELECT AVG(arus_s) AS avg FROM genset_log WHERE arus_s IS NOT NULL');
const stmtCountGenOn   = db.prepare("SELECT COUNT(*) AS total FROM genset_log WHERE status_genset = 'ON'");
const stmtDeleteGenset = db.prepare('DELETE FROM genset_log');

// ════════════════════════════════════════════════════════════════
// ENDPOINT PLN
// ════════════════════════════════════════════════════════════════

// POST /api/listrik
router.post('/listrik', (req, res) => {
  const { sector_id, status, tegangan, durasi_mati, waktu } = req.body;

  if (!sector_id)
    return res.status(400).json({ success: false, message: 'Field "sector_id" wajib diisi (sector_1 s/d sector_5)' });
  if (!VALID_DEVICES.includes(sector_id))
    return res.status(400).json({ success: false, message: 'sector_id tidak valid. Gunakan: ' + VALID_DEVICES.join(', ') });
  if (!status)
    return res.status(400).json({ success: false, message: 'Field "status" wajib diisi (ON / OFF)' });
  if (!['ON', 'OFF'].includes(status.toUpperCase()))
    return res.status(400).json({ success: false, message: 'Nilai status harus ON atau OFF' });

  // Sanitasi durasi_mati
  let durasi = durasi_mati != null ? parseFloat(Number(durasi_mati).toFixed(2)) : null;
  if (durasi != null && (isNaN(durasi) || durasi < 0 || durasi > 1440)) durasi = null;

  // Sanitasi tegangan
  let teg = tegangan != null ? parseFloat(Number(tegangan).toFixed(1)) : null;
  if (teg != null && (isNaN(teg) || teg < 0 || teg > 300)) teg = null;

  const waktuVal   = waktu ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
  const diterimaAt = new Date().toLocaleString('id-ID');

  const info = stmtInsertPln.run({
    sector_id,
    status: status.toUpperCase(),
    tegangan: teg,
    durasi_mati: durasi,
    waktu: waktuVal,
    diterima_at: diterimaAt
  });

  const record = {
    id: info.lastInsertRowid,
    sector_id,
    status: status.toUpperCase(),
    tegangan: teg,
    durasi_mati: durasi,
    waktu: waktuVal,
    diterima_at: diterimaAt
  };

  console.log('[' + diterimaAt + '] ' + sector_id.toUpperCase() + ' -> ' + record.status + ' | ' + record.tegangan + 'V | ' + record.durasi_mati + ' mnt');
  return res.status(201).json({ success: true, message: 'Data berhasil disimpan', data: record });
});

// GET /api/listrik
router.get('/listrik', (req, res) => {
  const { sector_id } = req.query;
  const hasil = sector_id
    ? stmtSelectPlnBySector.all(sector_id)
    : stmtSelectPln.all();
  return res.json({ success: true, total: hasil.length, data: hasil });
});

// GET /api/listrik/stats
router.get('/listrik/stats', (req, res) => {
  const globalTotal = stmtCountPln.get().total;

  const statsPerDevice = VALID_DEVICES.map(function(sector_id) {
    const totalKejadian  = stmtCountBySector.get(sector_id).total;
    const totalMati      = stmtCountMati.get(sector_id).total;
    const last           = stmtLastPln.get(sector_id);
    const statusTerakhir = last ? last.status : null;
    const waktuTerakhir  = last ? last.diterima_at : null;
    const totalDurasi    = parseFloat(stmtTotalDurasi.get(sector_id).total.toFixed(2));
    return { sector_id, totalKejadian, totalMati, statusTerakhir, waktuTerakhir, totalDurasiMati: totalDurasi };
  });

  return res.json({ success: true, globalTotal, sectors: statsPerDevice });
});

// DELETE /api/listrik
router.delete('/listrik', (req, res) => {
  const { sector_id } = req.query;
  if (sector_id) {
    const jumlah = stmtCountDeleteBySector.get(sector_id).total;
    stmtDeletePlnBySector.run(sector_id);
    return res.json({ success: true, message: 'Data ' + sector_id + ' dihapus (' + jumlah + ' record)' });
  }
  const jumlah = stmtCountPln.get().total;
  stmtDeletePln.run();
  return res.json({ success: true, message: 'Semua data dihapus (' + jumlah + ' record)' });
});

// ════════════════════════════════════════════════════════════════
// HELPER — Normalisasi format waktu genset
// Input : "DD/MM/YYYY HH:MM:SS"
// Output: "YYYY-MM-DD HH:MM:SS"
// ════════════════════════════════════════════════════════════════
function normalisasiWaktuGenset(waktu) {
  if (!waktu) return null;
  var match = String(waktu).match(/^(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}:\d{2}:\d{2})$/);
  if (match) {
    return match[3] + '-' + match[2] + '-' + match[1] + ' ' + match[4];
  }
  return waktu;
}

// ════════════════════════════════════════════════════════════════
// ENDPOINT GENSET
// ════════════════════════════════════════════════════════════════

// POST /api/genset
router.post('/genset', (req, res) => {
  const { waktu, arus_r, arus_s, daya_r, daya_s, status_pln, status_genset } = req.body;

  if (!status_pln || !['ON', 'OFF'].includes(String(status_pln).toUpperCase()))
    return res.status(400).json({ success: false, message: 'Field "status_pln" wajib diisi (ON / OFF)' });
  if (!status_genset || !['ON', 'OFF'].includes(String(status_genset).toUpperCase()))
    return res.status(400).json({ success: false, message: 'Field "status_genset" wajib diisi (ON / OFF)' });

  // Sanitasi arus_r
  let arusR = arus_r != null ? parseFloat(Number(arus_r).toFixed(2)) : null;
  if (arusR != null && (isNaN(arusR) || arusR < 0 || arusR > 100)) arusR = null;

  // Sanitasi arus_s
  let arusS = arus_s != null ? parseFloat(Number(arus_s).toFixed(2)) : null;
  if (arusS != null && (isNaN(arusS) || arusS < 0 || arusS > 100)) arusS = null;

  // Sanitasi daya_r
  let dayaR = daya_r != null ? Math.round(Number(daya_r)) : null;
  if (dayaR != null && (isNaN(dayaR) || dayaR < 0 || dayaR > 100000)) dayaR = null;

  // Sanitasi daya_s
  let dayaS = daya_s != null ? Math.round(Number(daya_s)) : null;
  if (dayaS != null && (isNaN(dayaS) || dayaS < 0 || dayaS > 100000)) dayaS = null;

  const waktuNormal = normalisasiWaktuGenset(waktu) || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const diterimaAt  = new Date().toLocaleString('id-ID');

  const info = stmtInsertGenset.run({
    arus_r: arusR,
    arus_s: arusS,
    daya_r: dayaR,
    daya_s: dayaS,
    status_pln: String(status_pln).toUpperCase(),
    status_genset: String(status_genset).toUpperCase(),
    waktu: waktuNormal,
    diterima_at: diterimaAt
  });

  const record = {
    id: info.lastInsertRowid,
    waktu: waktuNormal,
    arus_r: arusR,
    arus_s: arusS,
    daya_r: dayaR,
    daya_s: dayaS,
    status_pln: String(status_pln).toUpperCase(),
    status_genset: String(status_genset).toUpperCase(),
    diterima_at: diterimaAt
  };

  console.log('[GENSET] [' + diterimaAt + '] PLN=' + record.status_pln + ' | Genset=' + record.status_genset + ' | Arus R=' + record.arus_r + 'A S=' + record.arus_s + 'A | Daya R=' + record.daya_r + 'W S=' + record.daya_s + 'W');
  return res.status(201).json({ success: true, message: 'Data genset berhasil disimpan', data: record });
});

// GET /api/genset
router.get('/genset', (req, res) => {
  const data = stmtSelectGenset.all();
  return res.json({ success: true, total: data.length, data });
});

// GET /api/genset/stats
router.get('/genset/stats', (req, res) => {
  const total = stmtCountGenset.get().total;
  const last  = stmtLastGenset.get();

  const statusGensetTerakhir = last ? last.status_genset : null;
  const statusPlnTerakhir    = last ? last.status_pln : null;
  const waktuTerakhir        = last ? last.diterima_at : null;

  var avgArusRRaw = stmtAvgArusR.get().avg;
  var avgArusSRaw = stmtAvgArusS.get().avg;
  var avgArusR    = avgArusRRaw != null ? parseFloat(avgArusRRaw.toFixed(2)) : null;
  var avgArusS    = avgArusSRaw != null ? parseFloat(avgArusSRaw.toFixed(2)) : null;

  var lastDayaR        = last ? last.daya_r : null;
  var lastDayaS        = last ? last.daya_s : null;
  var totalDayaTerakhir = (lastDayaR != null && lastDayaS != null) ? lastDayaR + lastDayaS : null;

  var totalGensetOn = stmtCountGenOn.get().total;

  return res.json({
    success: true,
    total,
    statusGensetTerakhir,
    statusPlnTerakhir,
    waktuTerakhir,
    avgArusR,
    avgArusS,
    lastDayaR,
    lastDayaS,
    totalDayaTerakhir,
    totalGensetOn
  });
});

// DELETE /api/genset
router.delete('/genset', (req, res) => {
  var jumlah = stmtCountGenset.get().total;
  stmtDeleteGenset.run();
  return res.json({ success: true, message: 'Semua data genset dihapus (' + jumlah + ' record)' });
});

module.exports = router;