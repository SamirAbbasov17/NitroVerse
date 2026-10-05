import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, autopilot } from './helpers.js';

// Bonus qutusu invariantı: nişan (ikon) həmişə öz işığının üstündədir və
// maqnit gücü bitəndən sonra götürülməmiş qutular öz yerinə qayıdır.
// Buq (istifadəçi rəyi): "Qızıl Toxunuş" maqniti yalnız işığı çəkirdi — ikonlar
// yerində qalır, 3 zolağın işığı bir nöqtəyə yığılırdı və geri qayıtmırdı.
test('bonus qutusu: maqnit ikonla işığı ayırmır, sonra qutular yerinə qayıdır', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await startMode(page, MODES.find((m) => m.name === 'race-desert').config);
  await page.waitForFunction(() => window.__active.raceManager?.state === 'racing', null, { timeout: 30_000 });

  // Oyunçuya maqnit gücünü ver (imza gücünün real update yolu işləyir) və
  // slotlarını doldur ki, qutular götürülməsin — yalnız çəkilmə müşahidə olunsun.
  const home = await page.evaluate(() => {
    const sc = window.__active;
    const me = sc.racers.find((r) => r.isPlayer);
    const filler = sc.powerups.boxes[0].type;
    me.items = [{ ...filler }, { ...filler }];
    sc.signature.used = true;
    sc.signature._magnetT = 60; // test özü söndürür
    sc.signature._magnetR = 26;
    return sc.powerups.boxes.map((b) => ({ x: b.mesh.position.x, z: b.mesh.position.z }));
  });
  await autopilot(page, true);

  // 20 saniyə maqnitlə sür (ilk qutu cərgələrindən keçir): hər 100 ms-də ölç
  let maxSplit = 0;
  let maxPull = 0;
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(100);
    const s = await page.evaluate((h) => {
      let split = 0;
      let pull = 0;
      window.__active.powerups.boxes.forEach((b, i) => {
        split = Math.max(split, Math.hypot(b.badge.position.x - b.mesh.position.x, b.badge.position.z - b.mesh.position.z));
        pull = Math.max(pull, Math.hypot(b.mesh.position.x - h[i].x, b.mesh.position.z - h[i].z));
      });
      return { split, pull };
    }, home);
    maxSplit = Math.max(maxSplit, s.split);
    maxPull = Math.max(maxPull, s.pull);
  }
  console.log(`maks ikon–işıq ayrılması ${maxSplit.toFixed(2)} m · maks çəkilmə ${maxPull.toFixed(2)} m`);
  expect(maxPull, 'maqnit qutuları çəkməlidir (test ssenarisi işləyir)').toBeGreaterThan(1);
  expect(maxSplit, 'ikon öz işığından ayrılmamalıdır').toBeLessThan(0.05);

  // Maqniti söndür — 4 saniyə sonra götürülməmiş qutular öz yerində olmalıdır
  await page.evaluate(() => { window.__active.signature._magnetT = 0; });
  await page.waitForTimeout(4000);
  const drift = await page.evaluate((h) => Math.max(...window.__active.powerups.boxes.map((b, i) => (
    b.active ? Math.hypot(b.mesh.position.x - h[i].x, b.mesh.position.z - h[i].z) : 0))), home);
  console.log(`maqnitdən sonra yerindən sürüşmə ${drift.toFixed(2)} m`);
  expect(drift, 'qutular öz yerinə qayıtmalıdır').toBeLessThan(0.05);
});
