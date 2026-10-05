import { test, expect } from '@playwright/test';
import { boot, startMode, MODES } from './helpers.js';
import { makeReport } from '../server/api/report.mjs';

// ————— Klient: tutulmamış xəta tutulur, rejim adı əlavə olunur, təkrar göndərilmir —————
test('xəta bildirişi (klient): tutulur, təkrarlanmır, səs-küy süzülür', async ({ page }) => {
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'race-desert').config);
  await page.evaluate(() => {
    const boom = () => { throw new Error('test-xətası-123'); };
    for (let i = 0; i < 3; i++) setTimeout(boom, 0);                       // eyni xəta 3 dəfə
    setTimeout(() => { Promise.reject(new Error('test-vəd-456')); }, 0);  // vəd rəddi
    setTimeout(() => { throw new Error('ResizeObserver loop limit exceeded'); }, 0); // səs-küy
  });
  await page.waitForTimeout(400);
  const reports = await page.evaluate(() => window.__errReports || []);
  expect(reports.map((r) => r.message).sort()).toEqual(['Uncaught Error: test-xətası-123', 'test-vəd-456'].sort());
  const r = reports.find((x) => x.message.includes('123'));
  expect(r.kind).toBe('auto');
  expect(r.meta.mode).toBe('GameplayScene');
  expect(r.stack).toContain('boom');
});

// ————— Server: saxlanır, imzaya görə sayılır, e-poçt getmir, admin siyahısında görünür —————
function memStore() {
  const m = new Map();
  return {
    get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, String(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    delete: async (k) => { m.delete(k); },
    _m: m,
  };
}
const post = (h, body) => h(new Request('http://x/api/report', { method: 'POST', body: JSON.stringify(body) })).then((r) => r.json().then((j) => ({ status: r.status, ...j })));

test('xəta bildirişi (server): tək qeyd + sayğac, tezlik həddi, e-poçtsuz', async () => {
  const store = memStore();
  let mailed = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { mailed++; return new Response('{}'); };
  try {
    const h = makeReport(() => store, { AUTH_SECRET: 's', RESEND_API_KEY: 'k', REPORT_TO: 'a@b.c' });
    const err = { kind: 'auto', message: 'TypeError: x is undefined', stack: 'TypeError: x is undefined\n    at foo (index-abc.js:1:2)', meta: { mode: 'ArenaScene' } };
    expect((await post(h, { ...err, cid: 'c1' })).stored).toBe(true);
    expect((await post(h, { ...err, cid: 'c1' })).status).toBe(429);        // eyni cihaz, 1 dəq içində
    expect((await post(h, { ...err, cid: 'c2' })).stored).toBe(true);       // başqa cihaz — eyni imza
    expect((await post(h, { ...err, message: 'RangeError: başqa', cid: 'c3' })).stored).toBe(true);
    const keys = [...store._m.keys()].filter((k) => k.startsWith('e/'));
    expect(keys.length).toBe(2);                                            // iki fərqli imza
    const counts = keys.map((k) => JSON.parse(store._m.get(k)).count).sort();
    expect(counts).toEqual([1, 2]);
    expect(mailed).toBe(0);                                                 // avtomatik xəta e-poçt göndərmir
    expect((await post(h, { kind: 'auto', message: 'x' })).status).toBe(400);
  } finally { globalThis.fetch = realFetch; }
});
