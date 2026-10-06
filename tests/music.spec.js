import { test, expect } from '@playwright/test';
import { mergeJson } from './helpers.js';

// Prosedural musiqi (menyu/yarış): səs SƏVİYYƏSİ ölçülür — eşitmə əvəzi deyil, yalnız
// obyektiv hissə: səs çıxır və kəsilmir (clipping yoxdur). Musiqinin xoşagəlimli olub-
// olmadığını yalnız insan deyə bilər.
async function level(page, mode) {
  return page.evaluate(async (m) => {
    const a = window.__audio;
    a.muted = false;
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
  }, mode);
}

test('musiqi: menyu və yarış mövzusu səs verir, kəsilmir', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { localStorage.setItem('apexLang', 'az'); localStorage.setItem('apexMuted', '0'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400); // AudioContext üçün istifadəçi jesti
  const out = {};
  for (const mode of ['menu', 'race']) out[mode] = await level(page, mode);
  mergeJson('music.json', 'levels', out);
  for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(6)} pik ${v.peak} · RMS ${v.rmsDb} dB · ${v.state}`);
  for (const mode of ['menu', 'race']) {
    expect(out[mode].peak, `${mode}: səs çıxır`).toBeGreaterThan(0.03);
    expect(out[mode].peak, `${mode}: kəsilmə yoxdur (pik < 1)`).toBeLessThan(0.98);
  }
});

// Zen hava səsləri: yağış və qar səsi GƏLİR, hava açılanda SÖNÜR, göy gurultusu çalınır, kəsilmə yoxdur.
test('zen: yağış/qar səsi və göy gurultusu', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => { try { localStorage.setItem('apexMuted', '0'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400);
  const r = await page.evaluate(async () => {
    const a = window.__audio;
    a.muted = false; a.stopMusic(); a._ensure();
    await a.ctx.resume();
    const an = a.ctx.createAnalyser();
    an.fftSize = 2048;
    a.master.connect(an);
    const buf = new Float32Array(an.fftSize);
    const measure = async (ms) => {
      let sum = 0, n = 0, peak = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        await new Promise((res) => setTimeout(res, 40));
        an.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; n++; peak = Math.max(peak, Math.abs(buf[i])); }
      }
      return { db: +(20 * Math.log10(Math.sqrt(sum / n) || 1e-9)).toFixed(1), peak: +peak.toFixed(3) };
    };
    const out = {};
    a.setWeather(1, 0); await new Promise((res) => setTimeout(res, 2500)); out.rain = await measure(1500);
    a.setWeather(1, 0, true); await new Promise((res) => setTimeout(res, 1500)); out.rainTunnel = await measure(1200);
    a.setWeather(0, 1); await new Promise((res) => setTimeout(res, 3500)); out.snow = await measure(1500);
    a.setWeather(0, 0); await new Promise((res) => setTimeout(res, 4000)); out.after = await measure(1000);
    a.thunder(0.2); out.thunder = await measure(2500);
    return out;
  });
  mergeJson('music.json', 'weather', r);
  console.log(Object.entries(r).map(([k, v]) => `${k} ${v.db} dB (pik ${v.peak})`).join(' · '));
  expect(r.rain.db, 'yağış səsi gəlir').toBeGreaterThan(r.after.db + 30);
  expect(r.snow.db, 'qar səsi gəlir').toBeGreaterThan(r.after.db + 25);
  expect(r.rain.db, 'yağış musiqidən (≈ −40 dB) ucadan deyil').toBeLessThan(-41);
  expect(r.snow.db, 'qar yağışdan sakitdir').toBeLessThan(r.rain.db);
  expect(r.rainTunnel.db, 'tuneldə yağış zəifləyir').toBeLessThan(r.rain.db - 5);
  expect(r.after.db, 'hava açılanda səs sönür').toBeLessThan(r.rain.db - 25);
  expect(r.thunder.peak, 'göy gurultusu çalınır').toBeGreaterThan(0.02);
  for (const v of Object.values(r)) expect(v.peak, 'kəsilmə yoxdur').toBeLessThan(0.98);
});

// RECORD=1: mövzunu fayla yazır (tests/out/music/<rejim>.webm) — istinad treklərlə eyni
// alətlə (librosa) ölçüb müqayisə etmək üçün. Adi qaçışda işləmir.
test('musiqi: yazı (RECORD=1)', async ({ page }) => {
  test.skip(process.env.RECORD !== '1', 'yalnız RECORD=1 ilə');
  test.setTimeout(180_000);
  const fs = await import('node:fs');
  const path = await import('node:path');
  await page.addInitScript(() => { try { localStorage.setItem('apexMuted', '0'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400);
  fs.mkdirSync('tests/out/music', { recursive: true });
  for (const mode of ['menu', 'race']) {
    const b64 = await page.evaluate(async (m) => {
      const a = window.__audio;
      a.muted = false; a.stopMusic(); a._ensure();
      await a.ctx.resume();
      const dst = a.ctx.createMediaStreamDestination();
      a.musicGain.connect(dst);
      const rec = new MediaRecorder(dst.stream);
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      a.playMusic(m);
      rec.start();
      await new Promise((r) => setTimeout(r, 40_000));
      rec.stop();
      await new Promise((r) => { rec.onstop = r; });
      a.stopMusic(); a.musicGain.disconnect(dst);
      const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, mode);
    fs.writeFileSync(path.join('tests/out/music', `${mode}.webm`), Buffer.from(b64, 'base64'));
  }
});
