import { test, expect } from '@playwright/test';
import { mergeJson } from './helpers.js';

// Prosedural musiqi (menyu/yarış): səs SƏVİYYƏSİ ölçülür — eşitmə əvəzi deyil, yalnız
// obyektiv hissə: səs çıxır, kəsilmir (clipping yoxdur) və yeni üslub köhnəsindən kəskin
// uca/alçaq deyil. Musiqinin xoşagəlimli olub-olmadığını yalnız insan deyə bilər.
async function level(page, mode, style) {
  return page.evaluate(async ({ mode: m, style: st }) => {
    const a = window.__audio;
    a.muted = false;
    a.musicStyle = st;
    a.stopMusic();
    a._ensure();
    await a.ctx.resume();
    const an = a.ctx.createAnalyser();
    an.fftSize = 2048;
    a.musicGain.connect(an);
    a.playMusic(m);
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    let sum = 0;
    let n = 0;
    const end = performance.now() + 9000;
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 40));
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; sum += buf[i] * buf[i]; n++; }
    }
    a.stopMusic();
    a.musicGain.disconnect(an);
    const rms = Math.sqrt(sum / n);
    return { peak: +peak.toFixed(3), rmsDb: +(20 * Math.log10(rms || 1e-9)).toFixed(1), state: a.ctx.state };
  }, { mode, style });
}

test('musiqi: yeni üslub səs verir, kəsilmir, köhnə ilə eyni səviyyədədir', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { localStorage.setItem('apexLang', 'az'); localStorage.setItem('apexMuted', '0'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400); // AudioContext üçün istifadəçi jesti
  const out = {};
  for (const mode of ['menu', 'race']) {
    for (const style of ['classic', 'walk']) out[`${mode}-${style}`] = await level(page, mode, style);
  }
  mergeJson('music.json', 'levels', out);
  for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(14)} pik ${v.peak} · RMS ${v.rmsDb} dB · ${v.state}`);
  for (const mode of ['menu', 'race']) {
    const w = out[`${mode}-walk`], c = out[`${mode}-classic`];
    expect(w.peak, `${mode}: səs çıxır`).toBeGreaterThan(0.03);
    expect(w.peak, `${mode}: kəsilmə yoxdur (pik < 1)`).toBeLessThan(0.98);
    expect(Math.abs(w.rmsDb - c.rmsDb), `${mode}: köhnə üslubla səviyyə fərqi (dB)`).toBeLessThan(6);
  }
});
