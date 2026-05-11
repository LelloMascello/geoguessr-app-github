/**
 * GeoQuest — server.js
 * Backend Express con better-sqlite3 e Multer per upload immagini
 */

const express   = require('express');
const multer    = require('multer');
const Database  = require('better-sqlite3');
const path      = require('path');
const fs        = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR  = path.join(__dirname, 'public');
const DB_PATH     = path.join(__dirname, 'database.db');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── Database ────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT    NOT NULL,
    lat        REAL    NOT NULL,
    lng        REAL    NOT NULL,
    name       TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('✅ Database SQLite pronto');

// ─── Demo Data ────────────────────────────────────────────────────────────────

function seedDemoData() {
  const { cnt } = db.prepare('SELECT COUNT(*) AS cnt FROM locations').get();
  if (cnt > 0) return;

  const demos = [
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Colosseo_2020.jpg/1200px-Colosseo_2020.jpg', lat: 41.8902, lng: 12.4922, name: 'Colosseo, Roma' },
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/640px-Camponotus_flavomarginatus_ant.jpg', lat: 48.8584, lng: 2.2945, name: 'Torre Eiffel, Parigi' },
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Empire_State_Building_%28aerial_view%29.jpg/800px-Empire_State_Building_%28aerial_view%29.jpg', lat: 40.7484, lng: -73.9856, name: 'Empire State Building, New York' },
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Above_Gotham.jpg/1200px-Above_Gotham.jpg', lat: 35.6586, lng: 139.7454, name: 'Tokyo Tower, Tokyo' },
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Sydney_Opera_House_Exterior_1.jpg/1200px-Sydney_Opera_House_Exterior_1.jpg', lat: -33.8568, lng: 151.2153, name: 'Opera House, Sydney' },
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/20140116_India_Gate_26045.jpg/1200px-20140116_India_Gate_26045.jpg', lat: 28.6129, lng: 77.2295, name: 'India Gate, Nuova Delhi' },
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg/1200px-Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg', lat: 27.9881, lng: 86.9250, name: 'Monte Everest' },
    { image_path: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Biig_ben_and_house_of_parliament.jpg/1200px-Biig_ben_and_house_of_parliament.jpg', lat: 51.4994, lng: -0.1245, name: 'Big Ben, Londra' },
  ];

  const stmt = db.prepare('INSERT INTO locations (image_path, lat, lng, name) VALUES (?, ?, ?, ?)');
  const tx   = db.transaction(items => items.forEach(d => stmt.run(d.image_path, d.lat, d.lng, d.name)));
  tx(demos);
  console.log(`🌍 Inseriti ${demos.length} luoghi demo`);
}

seedDemoData();

// ─── Multer ───────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file,  cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `location-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Solo immagini JPEG, PNG, GIF o WebP'));
  }
});

// ─── Haversine + Score ────────────────────────────────────────────────────────

const toRad = deg => deg * Math.PI / 180;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcScore(km) {
  if (km < 0.05) return 5000;
  return Math.max(0, Math.min(5000, Math.round(5000 * Math.exp(-km / 2000))));
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Immagine casuale (senza coordinate, per non fare il baro)
app.get('/api/random-image', (req, res) => {
  const excl = parseInt(req.query.exclude) || 0;
  const row  = excl
    ? db.prepare('SELECT * FROM locations WHERE id != ? ORDER BY RANDOM() LIMIT 1').get(excl)
    : db.prepare('SELECT * FROM locations ORDER BY RANDOM() LIMIT 1').get();

  if (!row) return res.status(404).json({ error: 'Nessuna immagine. Caricane una dall\'admin.' });

  const imageUrl = row.image_path.startsWith('http')
    ? row.image_path
    : `/uploads/${path.basename(row.image_path)}`;

  res.json({ id: row.id, imageUrl, name: row.name || null });
});

// Verifica risposta utente
app.post('/api/guess', (req, res) => {
  const { imageId, userLat, userLng } = req.body;
  if (!imageId || userLat == null || userLng == null)
    return res.status(400).json({ error: 'Parametri mancanti' });

  const lat = parseFloat(userLat), lng = parseFloat(userLng);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
    return res.status(400).json({ error: 'Coordinate non valide' });

  const row = db.prepare('SELECT * FROM locations WHERE id = ?').get(imageId);
  if (!row) return res.status(404).json({ error: 'Immagine non trovata' });

  const distanceKm = haversineKm(lat, lng, row.lat, row.lng);
  res.json({
    distanceKm: Math.round(distanceKm * 10) / 10,
    score:      calcScore(distanceKm),
    realLat:    row.lat,
    realLng:    row.lng,
    name:       row.name || 'Posizione sconosciuta'
  });
});

// Upload immagine + coordinate
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessuna immagine caricata' });

  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Coordinate non valide o fuori range' });
  }

  const name   = (req.body.name || '').trim() || null;
  const result = db.prepare('INSERT INTO locations (image_path, lat, lng, name) VALUES (?, ?, ?, ?)')
                   .run(req.file.filename, lat, lng, name);

  res.json({ success: true, id: result.lastInsertRowid, imageUrl: `/uploads/${req.file.filename}`, message: 'Caricato!' });
});

// Lista location (admin)
app.get('/api/locations', (_req, res) => {
  res.json(db.prepare('SELECT id, image_path, lat, lng, name, created_at FROM locations ORDER BY id DESC').all());
});

// Elimina location
app.delete('/api/locations/:id', (req, res) => {
  const row = db.prepare('SELECT image_path FROM locations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Non trovato' });

  db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
  if (!row.image_path.startsWith('http'))
    fs.unlink(path.join(UPLOADS_DIR, path.basename(row.image_path)), () => {});

  res.json({ success: true });
});

// ─── HTML Pages ───────────────────────────────────────────────────────────────

app.get('/',      (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File > 10 MB' });
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Errore server' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌍 GeoQuest avviato!`);
  console.log(`   Gioco → http://localhost:${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin\n`);
});

process.on('SIGINT', () => { db.close(); console.log('\n👋 Bye!'); process.exit(0); });
