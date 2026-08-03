// NitroVerse — tək prosesli istehsal serveri.
// Statik faylları verir + /api/{auth,rooms,social,report} endpointlərini işlədir.
// Anbar: SQLite (fayl). Xarici asılılıq yoxdur — `node server/index.mjs` kifayətdir.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { createGzip } from 'node:zlib';
import { openDb, makeGetStore } from './kv.mjs';
import { makeAuth } from './api/auth.mjs';
import { makeRooms } from './api/rooms.mjs';
import { makeSocial } from './api/social.mjs';
import { makeReport } from './api/report.mjs';

const PORT = Number(process.env.PORT || 8080);
const ROOT = process.env.STATIC_DIR || './dist';
const DB_FILE = process.env.DB_FILE || './data/karbon.db';

if (!process.env.AUTH_SECRET) {
  console.error('XƏTA: AUTH_SECRET dəyişəni təyin edilməyib (hesab tokenləri üçün).');
  process.exit(1);
}

const db = openDb(DB_FILE);
const getStore = makeGetStore(db);
const api = {
  '/api/auth': makeAuth(getStore),
  '/api/rooms': makeRooms(getStore),
  '/api/social': makeSocial(getStore),
  '/api/report': makeReport(getStore),
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
};
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.xml', '.txt']);

// Node request → Web Request (handler-lər Web API ilə yazılıb)
function toWebRequest(req, body) {
  const url = 'http://localhost' + req.url;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
}

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > 256 * 1024) { reject(new Error('too-large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);

    // ————— API —————
    if (api[path]) {
      const body = await readBody(req);
      const webRes = await api[path](toWebRequest(req, body));
      const buf = Buffer.from(await webRes.arrayBuffer());
      const h = {};
      webRes.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(webRes.status, h);
      res.end(buf);
      return;
    }

    // ————— Statik —————
    let rel = normalize(path).replace(/^(\.\.[/\\])+/, '');
    if (rel === '/' || rel === '\\') rel = '/index.html';
    let file = join(ROOT, rel);
    let st = await stat(file).catch(() => null);
    if (st?.isDirectory()) { file = join(file, 'index.html'); st = await stat(file).catch(() => null); }
    // SPA fallback — naməlum yol index.html-ə düşür
    if (!st) { file = join(ROOT, 'index.html'); st = await stat(file).catch(() => null); }
    if (!st) { res.writeHead(404); res.end('404'); return; }

    const ext = extname(file).toLowerCase();
    const immutable = /\/assets\//.test(file) || ['.mp3', '.glb', '.png', '.woff2'].includes(ext);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    };

    const wantsGzip = GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (wantsGzip) {
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers);
      createReadStream(file).pipe(createGzip()).pipe(res);
      return;
    }
    // Diapazon sorğuları (audio seek üçün vacibdir)
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = s ? Number(s) : 0;
      const end = e ? Math.min(Number(e), st.size - 1) : st.size - 1;
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    headers['Content-Length'] = st.size;
    headers['Accept-Ranges'] = 'bytes';
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'server' }));
  }
});

server.listen(PORT, () => {
  console.log(`NitroVerse serveri: http://localhost:${PORT}  (statik: ${ROOT}, baza: ${DB_FILE})`);
});
