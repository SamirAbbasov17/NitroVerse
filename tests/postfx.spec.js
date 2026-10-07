import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MODES, OUT, boot, startMode, drive, measure, ensureDir, mergeJson } from './helpers.js';

// Render sonrası cila (bloom + rəng qradasiyası, yalnız masaüstü — core/PostFX.js).
// Hər rejimdə EYNİ dondurulmuş kadr iki dəfə çəkilir (cila bağlı / açıq) → yan-yana
// baxmaq üçün `tests/out/postfx/<rejim>-{off,on}.png`; üstəlik hər iki halda kadr
// vaxtı ölçülür → `tests/out/postfx.json`.
const DIR = ensureDir(path.join(OUT, 'postfx'));

for (const m of MODES) {
  test(`postfx: ${m.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await startMode(page, m.config);
    expect(await page.evaluate(() => !!window.__game.post), 'masaüstündə cila qatı var').toBe(true);
    await drive(page, 7000);
    const res = {};
    for (const on of [false, true]) {
      await page.evaluate((v) => window.__game.post.setEnabled(v), on);
      await page.waitForTimeout(1200); // şeyderlər yeni hədəf üçün yığılsın
      res[on ? 'on' : 'off'] = await measure(page, 5000);
    }
    // Eyni kadr: səhnə dondurulur, yalnız cila dəyişir
    // sürət effektləri (bulanıqlıq, vinyet) dondurulmuş kadrda sönsün — burada cilanın ƏSAS görüntüsü ölçülür
    await page.evaluate(() => { window.__active.update = () => {}; window.__active.postMotion = { speed: 0, boost: 0 }; });
    await page.waitForTimeout(1500);
    for (const on of [false, true]) {
      await page.evaluate((v) => window.__game.post.setEnabled(v), on);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR, `${m.name}-${on ? 'on' : 'off'}.png`) });
    }
    // Üçüncü kadr: bloom sıfır + neytral qradasiya. Cila əsas görüntünü DƏYİŞMƏMƏLİDİR
    // (duman, şəffaf qatlar, rəng) — bu kadr "bağlı" kadrla piksel səviyyəsində tutuşdurulur.
    await page.evaluate(() => { window.__game.post.setGrade({ bloom: 0 }); });
    await page.waitForTimeout(300);
    const flat = await page.screenshot({ path: path.join(DIR, `${m.name}-nobloom.png`) });
    await page.evaluate(() => window.__game.post.setEnabled(false));
    await page.waitForTimeout(300);
    const off = await page.screenshot();
    const diff = await page.evaluate(async ([a, b]) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0);
        return cx.getImageData(0, 0, img.width, img.height).data;
      };
      const [x, y] = [await load(a), await load(b)];
      let sum = 0;
      let big = 0;
      for (let i = 0; i < x.length; i += 4) {
        const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
        sum += d;
        if (d > 12) big++;
      }
      const n = x.length / 4;
      return { mean: +(sum / n).toFixed(2), bigPct: +((big / n) * 100).toFixed(2) };
    }, [off.toString('base64'), flat.toString('base64')]);
    const row = {
      costOff: res.off.costP50, costOn: res.on.costP50,
      p99Off: res.off.intervalP99, p99On: res.on.intervalP99,
      fpsOff: res.off.fps, fpsOn: res.on.fps,
      baseDiffMean: diff.mean, baseDiffBigPct: diff.bigPct,
    };
    mergeJson('postfx.json', m.name, row);
    console.log(`${m.name.padEnd(13)} CPU ${row.costOff}→${row.costOn} ms · p99 ${row.p99Off}→${row.p99On} ms · fps ${row.fpsOff}→${row.fpsOn} · əsas fərq ort ${diff.mean} / >12: ${diff.bigPct}%`);
    // Cila kadr sürətini saxlamalıdır (60 Hz ekranda p99 büdcəsi 22 ms)
    expect.soft(diff.mean, 'cila əsas görüntünü dəyişmir (orta piksel fərqi)').toBeLessThan(1.5);
    expect.soft(diff.bigPct, 'fərqi > 12 olan piksellərin payı').toBeLessThan(1);
    expect.soft(row.p99On, 'cila açıq: kadr p99').toBeLessThan(22);
  });
}

test('postfx: mobildə cila qatı yaradılmır', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page);
  expect(await page.evaluate(() => window.__game.post)).toBeNull();
  await ctx.close();
});

// SÜRƏT HİSSİ (PostFX son keçidi): eyni dondurulmuş kadr — effektsiz, tam sürət, tam sürət + boost.
// Kadrlar: tests/out/postfx/speedfx-{off,speed,boost}.png. Ölçülən: kadrın mərkəzi (maşın, yolun
// qabağı) dəyişmir, kənarlar dəyişir; kadr xərci artmır.
test('postfx: sürət effektləri', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'race-alpine').config);
  await drive(page, 9000);
  const cost = {};
  for (const on of [false, true]) {
    await page.evaluate((v) => { window.__game.post.speedFx = v; }, on);
    await page.waitForTimeout(800);
    cost[on ? 'on' : 'off'] = (await measure(page, 4000)).costP99;
  }
  await page.evaluate(() => { window.__active.update = () => {}; });
  const shots = {};
  for (const [name, motion] of [['off', { speed: 0, boost: 0 }], ['speed', { speed: 1, boost: 0 }], ['boost', { speed: 1, boost: 1 }]]) {
    await page.evaluate((mo) => { window.__active.postMotion = mo; }, motion);
    await page.waitForTimeout(1600);
    shots[name] = await page.screenshot({ path: path.join(DIR, `speedfx-${name}.png`) });
  }
  const diff = await page.evaluate(async (imgs) => {
    const load = async (b64) => {
      const im = new Image();
      im.src = 'data:image/png;base64,' + b64;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      return x.getImageData(0, 0, c.width, c.height);
    };
    const A = await load(imgs.off);
    const out = {};
    for (const k of ['speed', 'boost']) {
      const B = await load(imgs[k]);
      const W = A.width, H = A.height;
      let cs = 0, cn = 0, es = 0, en = 0;
      for (let y = 0; y < H; y += 3) {
        for (let x = 0; x < W; x += 3) {
          // HUD (DOM) künclərdədir — kənar zolaq kimi yan ortalar götürülür
          const centre = Math.abs(x / W - 0.5) < 0.12 && Math.abs(y / H - 0.5) < 0.14;
          const edge = (x / W < 0.1 || x / W > 0.9) && y / H > 0.3 && y / H < 0.62;
          if (!centre && !edge) continue;
          const i = (y * W + x) * 4;
          const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3;
          if (centre) { cs += d; cn++; } else { es += d; en++; }
        }
      }
      out[k] = { centre: +(cs / cn).toFixed(2), edge: +(es / en).toFixed(2) };
    }
    return out;
  }, { off: shots.off.toString('base64'), speed: shots.speed.toString('base64'), boost: shots.boost.toString('base64') });
  mergeJson('postfx.json', 'speedfx', { cost, diff });
  console.log(`sürət effektləri: kadr xərci p99 bağlı ${cost.off} ms / açıq ${cost.on} ms · orta piksel fərqi (0–255) sürətdə mərkəz ${diff.speed.centre} kənar ${diff.speed.edge} · boost-da mərkəz ${diff.boost.centre} kənar ${diff.boost.edge}`);
  expect(diff.speed.centre, 'kadrın mərkəzi iti qalır').toBeLessThan(1.5);
  expect(diff.speed.edge, 'kənarlar sürətdə dəyişir').toBeGreaterThan(2);
  expect(diff.boost.edge, 'boost effekti daha güclüdür').toBeGreaterThan(diff.speed.edge);
  expect(cost.on, 'kadr xərci büdcədə (ms)').toBeLessThan(22);
});
