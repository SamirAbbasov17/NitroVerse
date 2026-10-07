import fs from 'node:fs';
import path from 'node:path';

export const OUT = path.resolve('tests/out');
export const TRACKS = ['desert', 'neon', 'alpine', 'canyon', 'riviera', 'zavod', 'frost', 'autumn', 'lava'];

// Hər rejimin başlanğıc konfiqurasiyası (Menu.onStart-a gedən obyekt).
export const MODES = [
  ...TRACKS.map((trackId) => ({
    name: `race-${trackId}`,
    config: { mode: 'race', trackId, carId: 'blaze', laps: 3, difficulty: 'normal' },
  })),
  { name: 'zen', config: { mode: 'free', trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' } },
  { name: 'football', config: { mode: 'football', trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' } },
  { name: 'arena', config: { mode: 'arena', trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' } },
];

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Konsol xətalarını toplayır. Yerli DEV-də backend yoxdur — /api və PeerJS
// broker sorğularının uğursuzluğu gözləniləndir və xəta sayılmır.
export function collectErrors(page) {
  const errors = [];
  const ignore = /\/api\/|peerjs|\/peer\/|net::ERR_|Failed to load resource|favicon/i;
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (!ignore.test(text)) errors.push(`console: ${text}`);
  });
  return errors;
}

// Oyunu açır və menyu hazır olana qədər gözləyir.
// POST=0 mühit dəyişəni render sonrası cilanı (bloom + qradasiya) söndürür —
// "əvvəl/sonra" kadrları və ölçmələri üçün.
export async function boot(page, { lang = 'az', post = process.env.POST !== '0' } = {}) {
  await page.addInitScript(({ l, post: p }) => {
    try {
      localStorage.setItem('apexLang', l);
      localStorage.setItem('apexMuted', '1');
      localStorage.setItem('apexPost', p ? '1' : '0');
    } catch { /* gizli rejim */ }
  }, { l: lang, post });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__menu && !!window.__showcase, null, { timeout: 60_000 });
}

// Menyudan keçmədən rejimi birbaşa başladır və səhnə qurulana qədər gözləyir.
export async function startMode(page, config) {
  await page.evaluate((c) => window.__menu.onStart(c), config);
  await page.waitForFunction(
    () => window.__active && window.__active !== window.__showcase && !!window.__active.scene,
    null, { timeout: 60_000 },
  );
}

// Avtopilot: oyunçu maşınını yol boyu sürür. Girişi `input.touch` üzərindən verir,
// yəni real PlayerController → Car.update yolundan keçir (teleport/hiylə yoxdur).
// Trek (yarış) və sonsuz yol (zen) üçün mərkəz xəttini izləyir; yol olmayan
// futbolda topu qovur, arenada mərkəz ətrafında dövr edir. İlişəndə geri çəkilir.
export async function autopilot(page, on = true) {
  await page.evaluate((enable) => {
    cancelAnimationFrame(window.__apRaf || 0);
    const sc0 = window.__active;
    if (!enable) {
      if (sc0?.input) { sc0.input.touch.steer = 0; sc0.input.touch.throttle = 0; }
      return;
    }
    const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    const t0 = performance.now();
    let stuckSince = 0;
    let reverseUntil = 0;
    const tick = () => {
      const sc = window.__active;
      const car = sc?.playerCar;
      if (!sc || sc === window.__showcase || !car || !sc.input) return;
      const speed = Math.abs(car.vF || 0);
      let target;
      if (sc.track?.getWaypoint) {
        const tr = sc.track;
        const step = tr.length / tr.N;
        const idx = tr.getNearest(car.position, car.wpHint).index;
        target = tr.getWaypoint(idx, Math.max(4, Math.round((9 + speed * 0.5) / step)), 0);
      } else if (sc.road?.getNearest) {
        const rd = sc.road;
        const li = rd.getNearest(car.position, car.wpHint).index - rd.base;
        const a = rd.points[li];
        const b = rd.points[Math.min(rd.points.length - 1, li + 1)];
        const seg = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z)); // nöqtələr arası məsafə (m)
        const ahead = Math.max(2, Math.round((10 + speed * 0.45) / seg));
        target = rd.points[Math.min(rd.points.length - 1, li + ahead)];
      } else if (sc.ball?.position) {
        target = sc.ball.position; // futbol: topu qov
      } else {
        // arena: mərkəz ətrafında 25 m radiuslu dairə üzrə hərəkət edən nöqtə
        const a = (performance.now() - t0) / 4000;
        target = { x: Math.sin(a) * 25, z: Math.cos(a) * 25 };
      }
      const diff = wrap(Math.atan2(target.x - car.position.x, target.z - car.position.z) - car.heading);
      let steer = Math.max(-1, Math.min(1, -diff / 0.5)); // heading -= steer konvensiyası
      let throttle = Math.max(0.35, 1 - Math.min(0.6, Math.abs(diff) * 1.2));
      // Divara ilişibsə 0.9 s geri çəkil
      const now = performance.now();
      if (speed < 1.5) stuckSince ||= now; else stuckSince = 0;
      if (stuckSince && now - stuckSince > 1500) { reverseUntil = now + 900; stuckSince = 0; }
      if (now < reverseUntil) { throttle = -1; steer = diff > 0 ? 0.7 : -0.7; }
      sc.input.touch.steer = steer;
      sc.input.touch.throttle = throttle;
      window.__apRaf = requestAnimationFrame(tick);
    };
    window.__apRaf = requestAnimationFrame(tick);
  }, on);
}

// Avtopilotla `ms` müddət sürür — yer meshi və chunk-lar yalnız hərəkətdə yenilənir.
export async function drive(page, ms) {
  await autopilot(page, true);
  await page.waitForTimeout(ms);
}

// Oyunçu maşınının vəziyyəti (sürət km/s deyil, daxili vahid; yolda olub-olmaması).
export async function carState(page) {
  return page.evaluate(() => {
    const car = window.__active?.playerCar;
    return car ? { speed: Math.abs(car.vF || 0), onRoad: car.onRoad !== false } : null;
  });
}

// GPU-nun real olduğunu yoxlamaq üçün (SwiftShader-də performans rəqəmləri etibarsızdır).
export async function gpuName(page) {
  return page.evaluate(() => {
    const gl = window.__active?.renderer?.getContext?.() || document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'naməlum';
  });
}

// `ms` müddətində ölçür: kadr intervalı (rAF), CPU kadr xərci (update+render),
// draw call və üçbucaq. Səhnənin update və renderer.render metodlarını müvəqqəti sarıyır.
export async function measure(page, ms) {
  return page.evaluate(async (dur) => {
    const sc = window.__active;
    const r = sc.renderer;
    const intervals = [];
    const costs = [];
    let calls = 0;
    const callList = []; // kadr başına — partlayış/hissəcik anları maks-ı şişirdir, median sabit yükdür
    let tris = 0;
    let t0 = 0;
    const origUpdate = sc.update;
    const origRender = r.render;
    // Cila açıq olanda bir kadrda bir neçə `render` çağırışı olur (səhnə + bloom +
    // son keçid, hamısı tam-ekran dördbucaq). Sayğac hər çağırışda sıfırlanır, ona görə
    // yalnız SƏHNƏ çağırışı sayılır — rəqəmlər cilasız ölçmələrlə müqayisə olunur.
    // Xərc isə kadrın son çağırışına qədər ölçülür (cilanın CPU payı da daxildir).
    let cur = null;
    const flush = () => { if (cur) costs.push(cur.cost); cur = null; };
    sc.update = function (dt) { flush(); t0 = performance.now(); return origUpdate.call(this, dt); };
    r.render = function (s, c) {
      const out = origRender.call(this, s, c);
      if (s === sc.scene) {
        calls = Math.max(calls, r.info.render.calls);
        callList.push(r.info.render.calls);
        tris = Math.max(tris, r.info.render.triangles);
      }
      if (t0) cur = { cost: performance.now() - t0 };
      return out;
    };
    let last = performance.now();
    const end = last + dur;
    await new Promise((res) => {
      const tick = (now) => {
        intervals.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    flush();
    delete sc.update; // prototip metoduna qayıt
    if (sc.update !== origUpdate) sc.update = origUpdate;
    r.render = origRender;
    const q = (arr, p) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.floor(s.length * p))];
    };
    const round = (v) => Math.round(v * 100) / 100;
    intervals.shift();
    return {
      frames: intervals.length,
      fps: round(1000 / (intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length))),
      intervalP50: round(q(intervals, 0.5)),
      intervalP99: round(q(intervals, 0.99)),
      intervalMax: round(Math.max(0, ...intervals)),
      over33: intervals.filter((v) => v > 33).length,
      costP50: round(q(costs, 0.5)),
      costP99: round(q(costs, 0.99)),
      costMax: round(Math.max(0, ...costs)),
      drawCalls: calls,
      drawCallsP50: q(callList, 0.5),
      triangles: tris,
      geometries: r.info.memory.geometries,
      textures: r.info.memory.textures,
      pixelRatio: r.getPixelRatio(),
    };
  }, ms);
}

export async function memoryInfo(page) {
  return page.evaluate(() => {
    const r = (window.__active || window.__showcase).renderer;
    return { geometries: r.info.memory.geometries, textures: r.info.memory.textures };
  });
}

export function writeJson(name, data) {
  ensureDir(OUT);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

// Bir açarı mövcud JSON faylına əlavə edir (testlər ayrı worker-lərdə işləyə bilər).
export function mergeJson(name, key, value) {
  ensureDir(OUT);
  const file = path.join(OUT, name);
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* ilk yazı */ }
  data[key] = value;
  data._date = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
