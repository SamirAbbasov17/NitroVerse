import { test, expect } from '@playwright/test';
import { MODES, boot, startMode, drive, measure, gpuName, carState, mergeJson } from './helpers.js';

// Büdcə: docs/MODELS.md. Zen üçün draw call həddi daha sərtdir.
const BUDGET = {
  drawCalls: (name) => (name === 'zen' ? 110 : 140),
  triangles: 90_000,
  costP99: 22,
};

for (const m of MODES) {
  test(`perf: ${m.name}`, async ({ page }) => {
    await boot(page);
    await startMode(page, m.config);
    // Geri sayım + istiləşmə (shader kompilyasiyası, ilk chunk-lar) ölçüyə düşməsin
    await drive(page, 8000);
    const r = await measure(page, 12_000);
    const st = await carState(page);
    r.speed = Math.round(st?.speed ?? 0);
    r.onRoad = st?.onRoad ?? null;
    r.gpu = await gpuName(page);
    // Uğursuz testdən sonra worker yenidən başlayır — nəticə fayla dərhal yazılır
    mergeJson('perf.json', m.name, r);
    console.log(`${m.name.padEnd(14)} fps ${r.fps} | xərc p50 ${r.costP50} p99 ${r.costP99} max ${r.costMax} ms | `
      + `interval p99 ${r.intervalP99} >33ms ${r.over33} | draw ${r.drawCalls} tri ${r.triangles}`);
    expect.soft(r.drawCalls, 'draw call büdcəsi').toBeLessThan(BUDGET.drawCalls(m.name));
    expect.soft(r.triangles, 'üçbucaq büdcəsi').toBeLessThan(BUDGET.triangles);
    expect.soft(r.costP99, 'kadr xərci p99 (ms)').toBeLessThan(BUDGET.costP99);
  });
}
