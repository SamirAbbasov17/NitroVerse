// Rejim açılanda kamera İLK KADRDAN maşının yanındadır — "bir anlıq başqa yer görünür, sonra oyun"
// olmur (arenada kamera meydanın mərkəzindən maşına uçurdu). Ölçü: ilk kadrlarda kameranın oyunçu
// maşınına məsafəsi və bir kadrdakı ən böyük yerdəyişməsi.
import { test, expect } from '@playwright/test';
import { boot, MODES } from './helpers.js';

for (const name of ['race-desert', 'race-canyon', 'zen', 'football', 'arena']) {
  test(`başlanğıc kamerası: ${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await page.waitForTimeout(800);
    const r = await page.evaluate(async (cfg) => {
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      window.__menu.onStart(cfg);
      let sc = null;
      for (let i = 0; i < 600 && !sc; i++) { await frame(); const a = window.__active; if (a && a !== window.__showcase && a.playerCar && a.camera) sc = a; }
      let maxDist = 0, maxStep = 0, prev = null;
      for (let i = 0; i < 45; i++) {
        const c = sc.camera.position, p = sc.playerCar.position;
        maxDist = Math.max(maxDist, Math.hypot(c.x - p.x, c.z - p.z));
        if (prev) maxStep = Math.max(maxStep, Math.hypot(c.x - prev.x, c.z - prev.z));
        prev = { x: c.x, z: c.z };
        await frame();
      }
      return { maxDist: +maxDist.toFixed(1), maxStep: +maxStep.toFixed(1) };
    }, MODES.find((m) => m.name === name).config);
    console.log(`başlanğıc kamerası ${name}: maşına ən uzaq ${r.maxDist} m · bir kadrda ən böyük addım ${r.maxStep} m`);
    expect(r.maxDist, 'kamera ilk kadrdan maşının yanındadır').toBeLessThan(30);
    expect(r.maxStep, 'kamera sıçramır/uçmur').toBeLessThan(4);
  });
}

// KEÇİD ÖRTÜYÜ: menyu itəndən səhnə bir neçə kadr çəkənə qədər ekran örtülüdür; sonra örtük gedir.
test('başlanğıc: səhnənin ilk kadrları örtüyün arxasındadır, örtük sonra açılır', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  await page.waitForTimeout(800);
  const r = await page.evaluate(async (cfg) => {
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const covered = () => { const c = document.getElementById('scene-cover'); return !!c && !c.classList.contains('is-out'); };
    window.__menu.onStart(cfg);
    let bare = 0, age = 0, coveredFrames = 0, gone = -1;
    for (let i = 0; i < 240; i++) {
      await frame();
      const a = window.__active, game = !!a && a !== window.__showcase && !!a.playerCar;
      const menu = !!document.querySelector('.menu-panel');
      if (game) age++;
      if (covered()) coveredFrames++;
      if (!menu && !covered() && (!game || age < 3)) bare++;          // nə menyu, nə örtük, nə hazır səhnə
      if (game && gone < 0 && !document.getElementById('scene-cover')) gone = age;
    }
    return { bare, coveredFrames, gone };
  }, MODES.find((m) => m.name === 'arena').config);
  console.log('keçid örtüyü:', JSON.stringify(r));
  expect(r.bare, 'çılpaq (yarımhazır) kadr görünmür').toBe(0);
  expect(r.coveredFrames, 'örtük göstərildi').toBeGreaterThan(2);
  expect(r.gone, 'örtük ~0.5 s-də tam gedir').toBeGreaterThan(0);
  expect(r.gone).toBeLessThan(60);
});
