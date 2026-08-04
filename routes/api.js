const express = require('express');
const router  = express.Router();
const db      = require('../database');

const VALID_DEVICES  = ['sector_1', 'sector_2', 'sector_3', 'sector_4', 'sector_5'];
const VALID_GENSETS  = ['genset_1', 'genset_2', 'genset_3', 'genset_4', 'genset_5'];
const SECTOR_TO_GENSET = {
  sector_1: 'genset_1',
  sector_2: 'genset_2',
  sector_3: 'genset_3',
  sector_4: 'genset_4',
  sector_5: 'genset_5'
};

// ── Prepared Statements: PLN ─────────────────────────────────────────────────
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

// ── Prepared Statements: Heartbeat PLN ──────────────────────────────────────
const stmtUpsertHeartbeat = db.prepare(
  'INSERT INTO sector_heartbeat (sector_id, last_seen, last_status, last_tegangan) ' +
  'VALUES (@sector_id, @last_seen, @last_status, @last_tegangan) ' +
  'ON CONFLICT(sector_id) DO UPDATE SET ' +
  '  last_seen     = excluded.last_seen,' +
  '  last_status   = excluded.last_status,' +
  '  last_tegangan = excluded.last_tegangan'
);
const stmtGetHeartbeat = db.prepare('SELECT * FROM sector_heartbeat WHERE sector_id = ?');

// ── Prepared Statements: Genset ──────────────────────────────────────────────
const stmtInsertGenset = db.prepare(
  'INSERT INTO genset_log (arus_r, arus_s, daya_r, daya_s, status_pln, status_genset, durasi_aktif, waktu, diterima_at) ' +
  'VALUES (@arus_r, @arus_s, @daya_r, @daya_s, @status_pln, @status_genset, @durasi_aktif, @waktu, @diterima_at)'
);
const stmtSelectGenset      = db.prepare('SELECT * FROM genset_log ORDER BY id DESC');
const stmtCountGenset       = db.prepare('SELECT COUNT(*) AS total FROM genset_log');
const stmtLastGenset        = db.prepare('SELECT * FROM genset_log ORDER BY id DESC LIMIT 1');
const stmtAvgArusR          = db.prepare('SELECT AVG(arus_r) AS avg FROM genset_log WHERE arus_r IS NOT NULL');
const stmtAvgArusS          = db.prepare('SELECT AVG(arus_s) AS avg FROM genset_log WHERE arus_s IS NOT NULL');
const stmtCountGenOn        = db.prepare("SELECT COUNT(*) AS total FROM genset_log WHERE status_genset = 'ON'");
const stmtDeleteGenset      = db.prepare('DELETE FROM genset_log');
const stmtTotalDurasiAktif  = db.prepare(
  'SELECT COALESCE(SUM(durasi_aktif), 0) AS total FROM genset_log WHERE durasi_aktif > 0 AND durasi_aktif <= 1440'
);
const stmtLastDurasiAktif   = db.prepare(
  'SELECT durasi_aktif FROM genset_log WHERE durasi_aktif IS NOT NULL ORDER BY id DESC LIMIT 1'
);

// ── Prepared Statements: Heartbeat Genset ────────────────────────────────────
const stmtUpsertGensetHeartbeat = db.prepare(
  'INSERT INTO genset_heartbeat (genset_id, last_seen, last_status) ' +
  'VALUES (@genset_id, @last_seen, @last_status) ' +
  'ON CONFLICT(genset_id) DO UPDATE SET ' +
  '  last_seen   = excluded.last_seen,' +
  '  last_status = excluded.last_status'
);
const stmtGetGensetHeartbeat = db.prepare('SELECT * FROM genset_heartbeat WHERE genset_id = ?');

// ── POST /api/listrik ────────────────────────────────────────────────────────
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

  let durasi = durasi_mati != null ? parseFloat(Number(durasi_mati).toFixed(2)) : null;
  if (durasi != null && (isNaN(durasi) || durasi < 0 || durasi > 1440)) durasi = null;

  let teg = tegangan != null ? parseFloat(Number(tegangan).toFixed(1)) : null;
  if (teg != null && (isNaN(teg) || teg < 0 || teg > 300)) teg = null;

  const statusUpper = status.toUpperCase();
  const waktuVal    = waktu ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
  const diterimaAt  = new Date().toLocaleString('id-ID');
  const nowIso      = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const hbLama = stmtGetHeartbeat.get(sector_id);

  // Heartbeat: status tidak berubah dan tidak ada durasi mati baru
  const isHeartbeat = hbLama !== undefined
    && hbLama.last_status === statusUpper
    && (durasi == null || durasi === 0);

  stmtUpsertHeartbeat.run({ sector_id, last_seen: nowIso, last_status: statusUpper, last_tegangan: teg });

  if (isHeartbeat) {
    console.log('[HB] [' + diterimaAt + '] ' + sector_id.toUpperCase() + ' -> ' + statusUpper + ' | ' + teg + 'V');
    return res.status(200).json({
      success: true,
      message: 'Heartbeat diterima',
      heartbeat: true,
      data: { sector_id, status: statusUpper, tegangan: teg, durasi_mati: durasi, waktu: waktuVal, diterima_at: diterimaAt }
    });
  }

  const info = stmtInsertPln.run({ sector_id, status: statusUpper, tegangan: teg, durasi_mati: durasi, waktu: waktuVal, diterima_at: diterimaAt });
  const record = { id: info.lastInsertRowid, sector_id, status: statusUpper, tegangan: teg, durasi_mati: durasi, waktu: waktuVal, diterima_at: diterimaAt };

  const alasan = hbLama ? hbLama.last_status + '->' + statusUpper : 'pertama';
  console.log('[LOG] [' + diterimaAt + '] ' + sector_id.toUpperCase() + ' -> ' + record.status + ' | ' + record.tegangan + 'V | ' + record.durasi_mati + ' mnt (' + alasan + ')');
  return res.status(201).json({ success: true, message: 'Data berhasil disimpan', data: record });
});

// ── GET /api/listrik ─────────────────────────────────────────────────────────
router.get('/listrik', (req, res) => {
  const { sector_id } = req.query;
  const hasil = sector_id ? stmtSelectPlnBySector.all(sector_id) : stmtSelectPln.all();
  return res.json({ success: true, total: hasil.length, data: hasil });
});

// ── GET /api/listrik/stats ───────────────────────────────────────────────────
router.get('/listrik/stats', (req, res) => {
  const globalTotal = stmtCountPln.get().total;
  const NO_SIGNAL_TIMEOUT_MS = 2 * 60 * 1000;
  const now = Date.now();

  const statsPerDevice = VALID_DEVICES.map(function(sector_id) {
    const totalKejadian  = stmtCountBySector.get(sector_id).total;
    const totalMati      = stmtCountMati.get(sector_id).total;
    const last           = stmtLastPln.get(sector_id);
    const statusTerakhir = last ? last.status : null;
    const waktuTerakhir  = last ? last.diterima_at : null;
    const totalDurasi    = parseFloat(stmtTotalDurasi.get(sector_id).total.toFixed(2));

    const hb = stmtGetHeartbeat.get(sector_id);
    let isOnline = null, lastSeenStr = null, lastStatusHb = null, lastTegangan = null, menitTerakhir = null;

    if (hb) {
      lastSeenStr  = hb.last_seen;
      lastStatusHb = hb.last_status;
      lastTegangan = hb.last_tegangan;
      const selisihMs = now - new Date(hb.last_seen.replace(' ', 'T') + 'Z').getTime();
      menitTerakhir   = Math.floor(selisihMs / 60000);
      isOnline        = selisihMs <= NO_SIGNAL_TIMEOUT_MS;
    }

    return { sector_id, totalKejadian, totalMati, statusTerakhir, waktuTerakhir, totalDurasiMati: totalDurasi,
             isOnline, last_seen: lastSeenStr, last_status: lastStatusHb, lastTegangan, menitTerakhir };
  });

  return res.json({ success: true, globalTotal, sectors: statsPerDevice });
});

// ── DELETE /api/listrik ──────────────────────────────────────────────────────
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

// ── Helper: normalisasi format waktu genset DD/MM/YYYY → YYYY-MM-DD ─────────
function normalisasiWaktuGenset(waktu) {
  if (!waktu) return null;
  const match = String(waktu).match(/^(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}:\d{2}:\d{2})$/);
  return match ? match[3] + '-' + match[2] + '-' + match[1] + ' ' + match[4] : waktu;
}

// ── POST /api/genset ─────────────────────────────────────────────────────────
router.post('/genset', (req, res) => {
  const { waktu, arus_r, arus_s, daya_r, daya_s, status_pln, status_genset, durasi_aktif, genset_id } = req.body;

  if (!status_pln || !['ON', 'OFF'].includes(String(status_pln).toUpperCase()))
    return res.status(400).json({ success: false, message: 'Field "status_pln" wajib diisi (ON / OFF)' });
  if (!status_genset || !['ON', 'OFF'].includes(String(status_genset).toUpperCase()))
    return res.status(400).json({ success: false, message: 'Field "status_genset" wajib diisi (ON / OFF)' });

  let arusR = arus_r != null ? parseFloat(Number(arus_r).toFixed(2)) : null;
  if (arusR != null && (isNaN(arusR) || arusR < 0 || arusR > 100)) arusR = null;

  let arusS = arus_s != null ? parseFloat(Number(arus_s).toFixed(2)) : null;
  if (arusS != null && (isNaN(arusS) || arusS < 0 || arusS > 100)) arusS = null;

  let dayaR = daya_r != null ? Math.round(Number(daya_r)) : null;
  if (dayaR != null && (isNaN(dayaR) || dayaR < 0 || dayaR > 100000)) dayaR = null;

  let dayaS = daya_s != null ? Math.round(Number(daya_s)) : null;
  if (dayaS != null && (isNaN(dayaS) || dayaS < 0 || dayaS > 100000)) dayaS = null;

  let durasiAktif = durasi_aktif != null ? parseFloat(Number(durasi_aktif).toFixed(2)) : null;
  if (durasiAktif != null && (isNaN(durasiAktif) || durasiAktif < 0 || durasiAktif > 1440)) durasiAktif = null;

  const waktuNormal = normalisasiWaktuGenset(waktu) || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const diterimaAt  = new Date().toLocaleString('id-ID');
  const nowIso      = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const statusGenUpper = String(status_genset).toUpperCase();
  const statusPlnUpper = String(status_pln).toUpperCase();

  // Upsert heartbeat genset (gunakan genset_id dari body, default 'genset_1')
  const gId = genset_id && VALID_GENSETS.includes(genset_id) ? genset_id : 'genset_1';
  stmtUpsertGensetHeartbeat.run({ genset_id: gId, last_seen: nowIso, last_status: statusGenUpper });

  const info = stmtInsertGenset.run({
    arus_r: arusR, arus_s: arusS, daya_r: dayaR, daya_s: dayaS,
    status_pln: statusPlnUpper, status_genset: statusGenUpper,
    durasi_aktif: durasiAktif, waktu: waktuNormal, diterima_at: diterimaAt
  });

  const record = {
    id: info.lastInsertRowid, waktu: waktuNormal, arus_r: arusR, arus_s: arusS,
    daya_r: dayaR, daya_s: dayaS, durasi_aktif: durasiAktif,
    status_pln: statusPlnUpper, status_genset: statusGenUpper,
    diterima_at: diterimaAt
  };

  console.log('[GENSET] [' + diterimaAt + '] ' + gId + ' PLN=' + record.status_pln + ' | Genset=' + record.status_genset + ' | DurasiAktif=' + record.durasi_aktif + ' mnt');
  return res.status(201).json({ success: true, message: 'Data genset berhasil disimpan', data: record });
});

// ── GET /api/genset ──────────────────────────────────────────────────────────
router.get('/genset', (req, res) => {
  const data = stmtSelectGenset.all();
  return res.json({ success: true, total: data.length, data });
});

// ── GET /api/genset/stats ────────────────────────────────────────────────────
router.get('/genset/stats', (req, res) => {
  const total          = stmtCountGenset.get().total;
  const last           = stmtLastGenset.get();
  const totalGensetOn  = stmtCountGenOn.get().total;
  const avgArusRRaw    = stmtAvgArusR.get().avg;
  const avgArusSRaw    = stmtAvgArusS.get().avg;
  const totalDurAktif  = parseFloat(stmtTotalDurasiAktif.get().total.toFixed(2));
  const lastDurRow     = stmtLastDurasiAktif.get();

  const NO_SIGNAL_TIMEOUT_MS = 2 * 60 * 1000;
  const now = Date.now();

  // Stats per genset (isOnline berdasarkan heartbeat)
  const gensets = VALID_GENSETS.map(function(genset_id) {
    const hb = stmtGetGensetHeartbeat.get(genset_id);
    let isOnline = null, lastSeenStr = null, lastStatusHb = null, menitTerakhir = null;
    if (hb) {
      lastSeenStr  = hb.last_seen;
      lastStatusHb = hb.last_status;
      const selisihMs = now - new Date(hb.last_seen.replace(' ', 'T') + 'Z').getTime();
      menitTerakhir   = Math.floor(selisihMs / 60000);
      isOnline        = selisihMs <= NO_SIGNAL_TIMEOUT_MS;
    }
    return { genset_id, isOnline, last_seen: lastSeenStr, last_status: lastStatusHb, menitTerakhir };
  });

  return res.json({
    success: true,
    total,
    statusGensetTerakhir: last ? last.status_genset : null,
    statusPlnTerakhir:    last ? last.status_pln    : null,
    waktuTerakhir:        last ? last.diterima_at   : null,
    avgArusR:             avgArusRRaw != null ? parseFloat(avgArusRRaw.toFixed(2)) : null,
    avgArusS:             avgArusSRaw != null ? parseFloat(avgArusSRaw.toFixed(2)) : null,
    lastDayaR:            last ? last.daya_r : null,
    lastDayaS:            last ? last.daya_s : null,
    totalDayaTerakhir:    (last?.daya_r != null && last?.daya_s != null) ? last.daya_r + last.daya_s : null,
    totalGensetOn,
    lastDurasiAktif:      lastDurRow ? lastDurRow.durasi_aktif : null,
    totalDurasiAktif:     totalDurAktif,
    gensets
  });
});

// ── DELETE /api/genset ───────────────────────────────────────────────────────
router.delete('/genset', (req, res) => {
  const jumlah = stmtCountGenset.get().total;
  stmtDeleteGenset.run();
  return res.json({ success: true, message: 'Semua data genset dihapus (' + jumlah + ' record)' });
});

module.exports = router;