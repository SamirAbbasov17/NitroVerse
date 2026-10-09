// ZEN — qar biomu: qalın, sıx qar (yarışdakı "Buz Zirvəsi" treki kimi). Ölçülür: qar yağırmı və nə qədər sıxdır,
// yerdəki örtük, qarlı dekor, performans (draw < 110; üçbucaq əvvəlkindən pis deyil); kadr çəkilir.
import { test, expect } from '@playwright/test';
import path from 'path';
import { boot, startMode, autopilot, measure, MODES, OUT, ensureDir } from './helpers.js';

const DIR = ensureDir(path.join(OUT, 'zen-snow'));
const TAG = process.env.SNOW_TAG || 'now';

test('zen qar biomu: sıx qar yağır, yer qalın örtülüdür, büdcə daxilindədir', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'zen').config);
  await page.evaluate(() => { const s = window.__active; s._setDayTime('day'); s._biomeOverride = 4; });
  await autopilot(page, true);
  await page.waitForTimeout(26_000);                       // biom keçidi, yeni yol hissələri, qarın yığılması
  const perf = await measure(page, 3000);
  const m = await page.evaluate(() => {
    const s = window.__active;
    return { rain: +s._weather.rain.toFixed(2), flakes: s._rain.mesh.visible ? s._rain.mesh.count : 0, snow: +(s._snow || 0).toFixed(2), auto: s._weatherOverride ?? 'auto', style: s.road.style?.id, decor: s.road.style?.decor.join(), fogNear: Math.round(s.scene.fog.near), fogFar: Math.round(s.scene.fog.far) };
  });
  Object.assign(m, { calls: perf.drawCallsP50, callsMax: perf.drawCalls, tris: perf.triangles, p99: perf.intervalP99, fps: perf.fps });
  console.log(`zen qar [${TAG}]:`, JSON.stringify(m));
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-a.png`) });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(DIR, `snow-${TAG}-b.png`) });
  expect(m.style, 'qar biomundayıq').toBe('snow');
  if (TAG !== 'before') expect(m.decor, 'meşə qarlı şam, qarlı qaya və buz kristalındandır (yaşıl şam yoxdur)').toMatch(/^(snowpine|snowrock|icecrystal)(,(snowpine|snowrock|icecrystal))*$/);
  if (TAG !== 'before') {
    expect(m.rain, 'qar biomunda həmişə qar yağır (güclü)').toBeGreaterThanOrEqual(0.8);
    expect(m.flakes, 'qar dənələri sıxdır').toBeGreaterThanOrEqual(1200);
    expect(m.snow, 'yer qalın qarla örtülüdür').toBeGreaterThanOrEqual(0.95);
    expect(m.calls, 'draw call büdcəsi (zen < 110)').toBeLessThan(110);
    // Üçbucaq: zen-in ümumi həddi 90 000-dir, amma zen bu həddi qar biomundan ƏVVƏL də aşırdı (eyni ölçmə ilə köhnə qar
    // biomu 95–106 min, draw 135–149 idi; yenisi 82–95 min, draw 97–106). Burada yalnız pisləşmənin olmadığı yoxlanır.
    expect(m.tris, 'üçbucaq: köhnə qar biomundan (95–106 min) pis deyil').toBeLessThan(100_000);
  }
  expect(errs).toEqual([]);
});
