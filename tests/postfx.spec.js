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
    await page.evaluate(() => { window.__active.update = () => {}; });
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
