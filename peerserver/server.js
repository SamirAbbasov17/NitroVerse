// ————— NitroVerse PeerJS BROKER —————
// Oyunun onlayn rejimi WebRTC ilə işləyir: oyunçular BİRBAŞA bir-birinə
// qoşulur, bu server yalnız "tanışlıq" (signaling) mərhələsində iştirak edir —
// otaq kodunu ID-yə bağlayır və SDP mübadiləsini ötürür. Oyun trafiki
// (mövqe, hadisələr) buradan KEÇMİR, ona görə server çox yüngüldür.
//
// NİYƏ ÖZ SERVERİMİZ: pulsuz ictimai broker (0.peerjs.com) sabit deyil —
// yüklənmə zamanı bağlantı qurulmaya bilər. Bu instans yalnız bizimdir.
import express from 'express';
import { ExpressPeerServer } from 'peer';
import http from 'node:http';

const PORT = Number(process.env.PORT || 9000);
const PATH = process.env.PEER_PATH || '/peer';
const KEY = process.env.PEER_KEY || 'nitroverse';

const app = express();

// Sağlamlıq yoxlaması — hostinq platformaları və monitorinq üçün
// Aktiv müştərilər ÖZÜMÜZ sayırıq: kitabxana realm-ı xaricə açmır
const live = new Set();
let peak = 0, totalConnections = 0;

app.get('/health', (_req, res) => {
  res.json({
    ok: true, service: 'nitroverse-peer',
    aktiv: live.size, pik: peak, ümumi: totalConnections,
    otaq: [...live].filter((id) => id.startsWith('apex-drift-')).length,
    uptime: Math.round(process.uptime()),
    yaddaş: Math.round(process.memoryUsage().rss / 1048576) + ' MB',
  });
});
app.get('/', (_req, res) => res.type('text').send('NitroVerse PeerServer · /health'));

const server = http.createServer(app);

const peerServer = ExpressPeerServer(server, {
  path: '/',
  key: KEY,
  // Ölü bağlantılar tez təmizlənsin (oyunçu tabı bağlayanda otaq asılı qalmasın)
  alive_timeout: 30000,
  expire_timeout: 10000,
  concurrent_limit: 5000,
  allow_discovery: false,   // otaq siyahısı sızmasın
});

// CORS: oyun başqa domendən (Netlify) yüklənir
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.use(PATH, peerServer);

peerServer.on('connection', (client) => {
  live.add(client.getId());
  totalConnections++;
  if (live.size > peak) peak = live.size;
  console.log(`[+] ${client.getId()} · aktiv=${live.size} · pik=${peak}`);
});
peerServer.on('disconnect', (client) => {
  live.delete(client.getId());
  console.log(`[-] ${client.getId()} · aktiv=${live.size}`);
});
peerServer.on('error', (e) => console.error('[peer xətası]', e?.message || e));

server.listen(PORT, () => {
  console.log(`NitroVerse PeerServer · port ${PORT} · yol ${PATH} · açar ${KEY}`);
});
