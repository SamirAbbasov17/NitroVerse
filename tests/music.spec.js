import { test, expect } from '@playwright/test';
import { mergeJson, startMode, autopilot } from './helpers.js';

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
    // qarın üstündə sürüş: torpaqda tam sürət → asfaltda (0.3) → dayanıb (0) → tuneldə
    a.setSnowRoll(1); await new Promise((res) => setTimeout(res, 1500)); out.snowRoll = await measure(2000);
    a.setSnowRoll(0.3); await new Promise((res) => setTimeout(res, 1500)); out.snowRollRoad = await measure(1500);
    a.setSnowRoll(1, true); await new Promise((res) => setTimeout(res, 1500)); out.snowRollTunnel = await measure(1000);
    a.setSnowRoll(0); await new Promise((res) => setTimeout(res, 1500)); out.snowRollOff = await measure(1000);
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
  expect(r.snowRoll.db, 'qarda təkər səsi gəlir').toBeGreaterThan(r.after.db + 25);
  expect(r.snowRoll.db, 'qar xırçıltısı musiqidən (≈ −40 dB) ucadan deyil').toBeLessThan(-40);
  expect(r.snowRollRoad.db, 'asfaltda daha zəifdir').toBeLessThan(r.snowRoll.db - 6);
  expect(r.snowRollTunnel.db, 'tuneldə susur').toBeLessThan(r.snowRoll.db - 25);
  expect(r.snowRollOff.db, 'dayananda susur').toBeLessThan(r.snowRoll.db - 25);
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

// MUSİQİ PAKETLƏRİ (mağaza): hər paketin menyu və yarış treki həqiqətən çalınır, səviyyəsi
// standart sintez mövzusuna yaxındır (çox uca/sakit deyil) və paket çıxarılanda sintez qayıdır.
test('musiqi paketləri: çalınır, səviyyə uyğundur', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { localStorage.setItem('apexMuted', '0'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400);
  const r = await page.evaluate(async () => {
    const a = window.__audio;
    a.muted = false; a._ensure();
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
    let pack = null;
    a.packProvider = () => pack;
    for (const mode of ['menu', 'race']) {
      a.stopMusic(); a.playMusic(mode);
      await new Promise((res) => setTimeout(res, 1500));
      out[`synth-${mode}`] = { ...(await measure(5000)), file: !!a._packEl };
    }
    for (const id of Object.keys(a.constructor.PACKS)) {
      pack = id;
      for (const mode of ['menu', 'race']) {
        a.stopMusic(); a.playMusic(mode);
        // trekin ortasına keç (girişlər sakit olur) və yüklənməsini gözlə
        await new Promise((res) => setTimeout(res, 2500));
        try { if (a._packEl && a._packEl.duration > 40) a._packEl.currentTime = 30; } catch { /* boş */ }
        await new Promise((res) => setTimeout(res, 1200));
        out[`${id}-${mode}`] = { ...(await measure(5000)), file: !!a._packEl && !a._packFail };
      }
    }
    pack = null; a.refreshMusicPack();
    await new Promise((res) => setTimeout(res, 800));
    out.backToSynth = { file: !!a._packEl };
    return out;
  });
  mergeJson('music.json', 'packs', r);
  for (const [k, v] of Object.entries(r)) if (v.db != null) console.log(`${k.padEnd(16)} ${String(v.db).padStart(6)} dB · pik ${v.peak} · fayl ${v.file}`);
  const ref = r['synth-race'].db;
  for (const [k, v] of Object.entries(r)) {
    if (!k.startsWith('m_')) continue;
    expect.soft(v.file, `${k}: fayl çalınır`).toBe(true);
    expect.soft(v.db, `${k}: səs gəlir`).toBeGreaterThan(-60);
    expect.soft(Math.abs(v.db - ref), `${k}: sintez mövzusundan fərq (dB)`).toBeLessThan(12);
    expect.soft(v.peak, `${k}: kəsilmə yoxdur`).toBeLessThan(0.98);
  }
  expect(r.backToSynth.file, 'paket çıxarılanda sintezə qayıdır').toBe(false);
});

// MÜHƏRRİK, TƏKƏR, SƏS AYARLARI (Faza 4): yazılmış mühərrik döngələri yüklənir və çalınır,
// səviyyəsi köhnə sintezdən bir qədər yuxarıdır (çox uca deyil), sürət artdıqca ötürücü keçidində
// dövr DÜŞÜR (köhnədə düz qalxırdı), drift cığıltısı/torpaq/külək gəlir və kəsilir, musiqi və
// effekt sürgüləri öz şinini səsləndirir.
test('səs: yazılmış mühərrik, ötürücülər, təkər səsləri, ayrı səviyyələr', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => { try { localStorage.setItem('apexMuted', '0'); localStorage.removeItem('apexVolMusic'); localStorage.removeItem('apexVolFx'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400);
  const r = await page.evaluate(async () => {
    const a = window.__audio;
    a.muted = false; a.stopMusic(); a._ensure();
    await a.ctx.resume();
    const an = a.ctx.createAnalyser();
    an.fftSize = 8192;
    a.master.connect(an);
    const buf = new Float32Array(an.fftSize), spec = new Float32Array(an.frequencyBinCount);
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const db = async (ms) => {
      let sum = 0, n = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) { await sleep(40); an.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; n++; } }
      return +(20 * Math.log10(Math.sqrt(sum / n) || 1e-9)).toFixed(1);
    };
    // spektrin "ağırlıq mərkəzi" (Hz) — dövrün qalxıb-düşməsini izləmək üçün
    const centroid = () => {
      an.getFloatFrequencyData(spec);
      let num = 0, den = 0;
      const hzPer = a.ctx.sampleRate / an.fftSize;
      for (let i = 2; i < 400; i++) { const p = Math.pow(10, spec[i] / 10); num += p * i * hzPer; den += p; }
      return den ? num / den : 0;
    };
    const drive = async (speed, ms) => { const end = performance.now() + ms; while (performance.now() < end) { a.setEngine(speed, false); await sleep(16); } };
    const out = {};
    // 1) köhnə sintez
    localStorage.setItem('apexEngine', 'synth');
    a.startEngine();
    await drive(0.8, 900); out.synth = { db: 0 };
    { const p = drive(0.8, 2200); out.synth.db = await db(2000); await p; }
    a.stopEngine(); await sleep(500);
    // 2) yazılmış döngələr (yüklənməsini gözlə)
    localStorage.removeItem('apexEngine');
    a.startEngine();
    for (let i = 0; i < 60 && !a._engine?.rec; i++) { a.setEngine(0.2, false); await sleep(100); }
    out.rec = { loaded: !!a._engine?.rec, levels: {} };
    for (const sp of [0.1, 0.5, 0.8, 1.0]) {
      await drive(sp, 700);
      const p = drive(sp, 1700); out.rec.levels[sp] = await db(1500); await p;
    }
    // 3) ötürücülər: sürət 0 → 1, 6 saniyə; dövrün düşdüyü anları say
    await drive(0, 700);
    let prevRpm = 0, drops = 0, maxRpm = 0;
    const t0 = performance.now();
    const cents = [];
    while (performance.now() - t0 < 6000) {
      const sp = (performance.now() - t0) / 6000;
      a.setEngine(sp, false);
      const rpm = a._engine.rpm;
      if (rpm < prevRpm - 0.004 && !a.__dropping) { drops++; a.__dropping = true; } else if (rpm > prevRpm) a.__dropping = false;
      prevRpm = rpm; maxRpm = Math.max(maxRpm, rpm);
      if (cents.length < 400) cents.push(Math.round(centroid()));
      await sleep(16);
    }
    out.gears = { drops, maxRpm: +maxRpm.toFixed(2), centMin: Math.min(...cents.filter((x) => x > 0)), centMax: Math.max(...cents) };
    a.setEngine(0, false); await sleep(300);
    a.stopEngine(); await sleep(500);
    // 4) təkər / torpaq / külək (mühərriksiz) — cığıltı yazıdır, yüklənməsini gözlə
    for (let i = 0; i < 60 && !a._smp?.skid?.length; i++) await sleep(100);
    out.skidLoaded = !!a._smp?.skid?.length;
    out.silence = await db(600);
    a.setTyres(1, 0, 0); await sleep(500); out.squeal = await db(900);
    a.setTyres(0, 1, 0); await sleep(600); out.dirt = await db(900);
    a.setTyres(0, 0, 1); await sleep(800); out.wind = await db(900);
    a.setTyres(0, 0, 0); await sleep(900); out.tyresOff = await db(600);
    // 5) ayrı səviyyələr: effekt sürgüsü 0 → cığıltı susur; musiqi sürgüsü ona toxunmur
    a.setTyres(1, 0, 0); await sleep(400);
    a.setVolume('music', 0); await sleep(300); out.fxWithMusic0 = await db(700);
    a.setVolume('fx', 0); await sleep(300); out.fx0 = await db(700);
    a.setVolume('fx', 1); a.setVolume('music', 1); a.setTyres(0, 0, 0);
    return out;
  });
  mergeJson('music.json', 'engine', r);
  console.log(JSON.stringify(r));
  expect(r.rec.loaded, 'yazılmış mühərrik döngələri yükləndi').toBe(true);
  expect(r.rec.levels[0.8], 'mühərrik eşidilir').toBeGreaterThan(-50);
  expect(r.rec.levels[0.8] - r.synth.db, 'köhnə sintezə nisbətən fərq (dB)').toBeGreaterThan(-3);
  expect(r.rec.levels[0.8] - r.synth.db, 'həddən artıq uca deyil (dB)').toBeLessThan(12);
  expect(r.rec.levels[1.0], 'sürətdə daha uca').toBeGreaterThan(r.rec.levels[0.1]);
  expect(r.gears.drops, 'ötürücü keçidlərində dövr düşür (4 keçid)').toBeGreaterThanOrEqual(3);
  expect(r.skidLoaded, 'təkər cığıltısı yazısı yükləndi').toBe(true);
  expect(r.squeal, 'drift cığıltısı gəlir').toBeGreaterThan(r.silence + 20);
  expect(r.dirt, 'torpaq uğultusu gəlir').toBeGreaterThan(r.silence + 20);
  expect(r.wind, 'sürət küləyi (xışıltı) yoxdur').toBeLessThan(-80);
  expect(r.tyresOff, 'kəsiləndə susur').toBeLessThan(r.squeal - 25);
  expect(r.fxWithMusic0, 'musiqi sürgüsü effektə toxunmur').toBeGreaterThan(r.squeal - 3);
  expect(r.fx0, 'effekt sürgüsü 0 → susur').toBeLessThan(r.squeal - 25);
});

test('səs: toqquşma (boğuq, metalsız) və quş səsi (mühit)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { localStorage.setItem('apexMuted', '0'); localStorage.removeItem('apexVolMusic'); localStorage.removeItem('apexVolFx'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400);
  const r = await page.evaluate(async () => {
    const a = window.__audio;
    a.muted = false; a.stopMusic(); a._ensure();
    await a.ctx.resume();
    const an = a.ctx.createAnalyser();
    an.fftSize = 8192;
    a.master.connect(an);
    const buf = new Float32Array(an.fftSize);
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const meas = async (ms) => {
      let sum = 0, n = 0, peak = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) { await sleep(30); an.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; sum += buf[i] * buf[i]; n++; } }
      return { db: +(20 * Math.log10(Math.sqrt(sum / n) || 1e-9)).toFixed(1), peak: +peak.toFixed(3) };
    };
    for (let i = 0; i < 80 && !(a._smp?.birds?.length === 1); i++) await sleep(100);
    const out = { loaded: { keys: Object.keys(a._smp).join(','), birds: a._smp.birds.length } };
    const spec = new Float32Array(an.frequencyBinCount);
    await sleep(3000);   // musiqinin sönmə quyruğu bitsin
    out.silence = (await meas(500)).db;
    // zərbə: nümunə ilə və nümunəsiz (sintez ehtiyatı), zəif və güclü
    // zərbənin parlaqlığı: 2 kHz-dən yuxarı enerjinin payı (metal cingiltisi yuxarı tezliklərdədir)
    const hit = async (k, kind = 'impact') => {
      const p = meas(700); a.sfx(kind, k);
      let hi = 0, all = 0; const hz = a.ctx.sampleRate / an.fftSize;
      for (let q = 0; q < 6; q++) { await sleep(25); an.getFloatFrequencyData(spec); for (let i = 1; i < spec.length; i++) { const e = Math.pow(10, spec[i] / 10); all += e; if (i * hz > 2000) hi += e; } }
      const m = await p; await sleep(500); return { ...m, bright: +(hi / (all || 1)).toFixed(3) };
    };
    out.hitSoft = await hit(0.3);
    out.hitHard = await hit(1);
    out.scrape = await hit(0, 'scrape');
    // quş səsi: açılır, pauzada susur, sönür
    a.setAmbience(1); await sleep(2500); out.birds = (await meas(4000));
    a.setPaused(true); a._applyAmbience(); await sleep(3500); out.birdsPaused = (await meas(600)).db;
    a.setPaused(false); a._applyAmbience(); await sleep(2500);
    a.setVolume('fx', 0); await sleep(400); out.birdsFx0 = (await meas(600)).db; a.setVolume('fx', 1);
    a.setAmbience(0); await sleep(4000); out.birdsOff = (await meas(600)).db;
    // müqayisə üçün: mühərrik orta sürətdə
    a.startEngine();
    for (let i = 0; i < 60 && !a._engine?.rec; i++) { a.setEngine(0.6, false); await sleep(100); }
    { const end = performance.now() + 2200; const p = (async () => { await sleep(700); return meas(1400); })(); while (performance.now() < end) { a.setEngine(0.6, false); await sleep(16); } out.engine = (await p).db; }
    a.stopEngine();
    return out;
  });
  mergeJson('music.json', 'samples', r);
  console.log(JSON.stringify(r));
  expect(r.loaded, 'quş və təkər yazıları yüklənir; metal zərbə nümunələri çıxarılıb').toEqual({ keys: 'birds,skid', birds: 1 });
  expect(r.hitHard.db, 'güclü zərbə zəifdən ucadır').toBeGreaterThan(r.hitSoft.db + 3);
  expect(r.hitHard.peak, 'zərbə kəsilmir (clipping yoxdur)').toBeLessThan(0.98);
  expect(r.hitHard.bright, 'güclü zərbədə 2 kHz-dən yuxarı enerji azdır (cingilti yoxdur)').toBeLessThan(0.05);
  expect(r.scrape.bright, 'sürtünmə səsi də alçaqdır').toBeLessThan(0.05);
  expect(r.birds.db, 'quş səsi eşidilir').toBeGreaterThan(Math.max(r.silence + 15, -42));
  expect(r.birds.db, 'quş səsi mühərrikdən aşağıdır (arxa fon)').toBeLessThan(r.engine - 4);
  expect(r.birdsPaused, 'pauzada susur').toBeLessThan(r.birds.db - 20);
  expect(r.birdsFx0, 'effekt sürgüsü 0 → susur').toBeLessThan(r.birds.db - 20);
  expect(r.birdsOff, 'söndürüləndə susur').toBeLessThan(r.birds.db - 20);
});

test('səs: quş səsi yalnız təbiət trekində və zen gündüzündə açılır', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => { try { localStorage.setItem('apexMuted', '0'); } catch { /* boş */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__audio && !!window.__menu, null, { timeout: 60_000 });
  await page.mouse.click(700, 400);
  const amb = async (ms = 6000) => {
    await autopilot(page, true);
    await page.waitForTimeout(ms);
    return page.evaluate(() => ({ level: +(window.__audio._ambLevel || 0).toFixed(2), gain: +(window.__audio._amb?.g.gain.value || 0).toFixed(3) }));
  };
  const out = {};
  await startMode(page, { mode: 'race', trackId: 'alpine', carId: 'blaze', laps: 3, difficulty: 'normal' });
  out.alpine = await amb();
  await startMode(page, { mode: 'race', trackId: 'neon', carId: 'blaze', laps: 3, difficulty: 'normal' });
  out.neon = await amb();
  await startMode(page, { mode: 'race', trackId: 'autumn', carId: 'blaze', laps: 3, difficulty: 'normal' });
  out.autumn = await amb();
  await startMode(page, { mode: 'arena', trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' });
  out.arena = await amb();
  await startMode(page, { mode: 'free', trackId: 'desert', carId: 'blaze', laps: 3, difficulty: 'normal' });
  out.zen = await amb();
  out.zenNight = await page.evaluate(() => +(window.__active._dayNow?.night ?? -1).toFixed(2));
  mergeJson('music.json', 'ambience', out);
  console.log(JSON.stringify(out));
  expect(out.alpine.level, 'alp: quşlar').toBeCloseTo(0.8, 2);
  expect(out.alpine.gain, 'alp: səs açıqdır').toBeGreaterThan(0.15);
  expect(out.neon.level, 'neon şəhər: quş yoxdur').toBe(0);
  expect(out.neon.gain).toBeLessThan(0.01);
  expect(out.autumn.level, 'yağışlı payız: zəif').toBeCloseTo(0.35, 2);
  expect(out.arena.level, 'arena: quş yoxdur').toBe(0);
  if (out.zenNight < 0.2) expect(out.zen.level, 'zen gündüz: quşlar').toBeGreaterThan(0.3);
});
