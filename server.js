const express = require('express');
const cors = require('cors');
const path = require('path');

// Inisialisasi database SQLite — tabel dibuat otomatis jika belum ada
require('./database');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Server berjalan di http://localhost:${PORT}`);
  console.log(`📡 Endpoint PLN    : POST http://localhost:${PORT}/api/listrik`);
  console.log(`⚡ Endpoint Genset : POST http://localhost:${PORT}/api/genset`);
  console.log(`📊 Dashboard       : http://localhost:${PORT}`);
  console.log(`\n🔌 Sektor PLN yang didukung: sector_1 s/d sector_5\n`);
});

