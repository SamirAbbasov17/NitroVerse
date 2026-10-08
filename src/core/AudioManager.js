import { assetBase } from '../net/apiBase.js';
// Prosedural audio sistemi — Web Audio API, heç bir xarici fayl yoxdur.
// Musiqi: chiptune/synthwave sekvenser. SFX: sintez olunmuş effektlər.
// Mühərrik: sürətə bağlı osilatorlar. Mute vəziyyəti localStorage-da qalır.
class AudioManagerImpl {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('apexMuted') === '1';
    try { localStorage.removeItem('apexMusicStyle'); } catch { /* gizli rejim */ } // köhnə sınaq seçimi
    this._musicMode = null;
    this._musicTimer = null;
    this._step = 0;
    this._nextT = 0;
    this._engine = null;
    // Səs ayarları: 0..1, localStorage-da qalır
    const rd = (k) => { const v = parseFloat(localStorage.getItem(k)); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; };
    this.vol = { music: rd('apexVolMusic'), fx: rd('apexVolFx') };
  }

  // kind: 'music' | 'fx' · v: 0..1
  setVolume(kind, v) {
    v = Math.max(0, Math.min(1, v));
    this.vol[kind] = v;
    try { localStorage.setItem(kind === 'music' ? 'apexVolMusic' : 'apexVolFx', String(v)); } catch { /* gizli rejim */ }
    const bus = kind === 'music' ? this.musicBus : this.fxBus;
    if (bus) bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      // İKİ ŞİN (Faza 4.5): musiqi və effektlər ayrıca səviyyələnir (səs ayarları — bax setVolume).
      // Effekt şininə hər şey düşür: sfx, mühərrik, təkər, külək, hava.
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.vol.music;
      this.musicBus.connect(this.master);
      this.fxBus = this.ctx.createGain();
      this.fxBus.gain.value = this.vol.fx;
      this.fxBus.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.17;
      this.musicGain.connect(this.musicBus);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.45;
      this.sfxGain.connect(this.fxBus);
      // Ağ küy buferi (partlayış, külək və s. üçün)
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._loadSamples();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    // Kontekst SONRADAN öz-özünə oyansa (Chrome media-nişan icazəsi, tam
    // ekran keçidi və s.) musiqi jestsiz də dərhal qurulsun — əvvəl yalnız
    // istifadəçi jestindəki resume() bunu edirdi.
    if (!this._stateHook) {
      this._stateHook = true;
      this.ctx.addEventListener?.('statechange', () => {
        if (this.ctx.state === 'running' && this._stalled) this.resume(true);
      });
    }
    return true;
  }

  // İlk istifadəçi jestindən sonra çağırılır (brauzer autoplay siyasəti).
  // XƏTA İDİ: kontekst DAYANDIRILMIŞ halda playMusic çağırılırdı, cədvəl
  // köhnə vaxtda qalırdı və jestdən sonra da səs gəlmirdi ("menyuda musiqi
  // yoxdur, nəyəsə klikləyəndə işləyir"). İndi kontekst oyananda cari
  // musiqi rejimi TƏMİZ yenidən qurulur.
  resume(force = false) {
    const wasSuspended = !this.ctx || this.ctx.state === 'suspended';
    this._ensure();
    if ((wasSuspended || force) && this._musicMode) {
      const mode = this._musicMode;
      this._musicMode = null;          // eyni rejimin yenidən qurulmasına icazə
      this._stalled = false;
      this.playMusic(mode);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('apexMuted', this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.04);
    return this.muted;
  }

  // ——— YAZILMIŞ NÜMUNƏLƏR (Faza 4.3 / 4.4) ———
  // Kiçik CC0 fayllar bir dəfə yüklənir (mənbələr: public/sfx/LICENSE.txt). Yüklənməsə və ya
  // hələ hazır deyilsə, səs sintez variantı ilə çalınır — heç nə səssiz qalmır.
  static SAMPLES = {
    birds: ['sfx/amb-birds.mp3'],
  };

  _loadSamples() {
    if (this._smp) return;
    this._smp = {};
    for (const [name, list] of Object.entries(AudioManagerImpl.SAMPLES)) {
      this._smp[name] = [];
      for (const src of list) {
        fetch(assetBase() + src).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))
          .then((buf) => { this._smp[name].push(buf); if (name === 'birds') this._applyAmbience(); })
          .catch(() => { /* sintez qalır */ });
      }
    }
  }

  // Nümunəni çal (varsa). Qaytarır: çalındımı.
  _sample(name, gain = 1, rate = 1) {
    const list = this._smp?.[name];
    if (!list?.length) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
    return true;
  }

  // MÜHİT SƏSİ: quş cəh-cəhi (zen — gündüz, yağışsız; təbiət trekləri). level 0..1.
  setAmbience(level = 0) {
    const l = Math.max(0, Math.min(1, level));
    if (l === this._ambLevel && (this._amb || !l)) return;
    this._ambLevel = l;
    if (!this.ctx || (!this._amb && this._ambLevel < 0.02)) return;
    if (!this._ensure()) return;
    this._applyAmbience();
  }

  _applyAmbience() {
    const buf = this._smp?.birds?.[0];
    if (!buf || !this.ctx) return;
    if (!this._amb) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(this.fxBus);
      src.start();
      this._amb = { src, g };
    }
    // arxa fon: musiqidən xeyli aşağı
    this._amb.g.gain.setTargetAtTime((this._pausedGame ? 0 : this._ambLevel || 0) * 0.3, this.ctx.currentTime, 0.8);
  }

  // YANINDAN KEÇMƏ (zen): maşının yanından ötən hava səsi — qısa, yumşaq "vuuş", keçən tərəfin
  // qulağında. side: −1 sol, +1 sağ; k 0..1 — nisbi sürətə görə güc (qarşıdan gələn daha güclü).
  passBy(side = 0, k = 0.5) {
    if (!this._ensure() || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.Q.value = 0.9;
    flt.frequency.setValueAtTime(420, t);
    flt.frequency.exponentialRampToValueAtTime(1100 + 500 * k, t + 0.14);
    flt.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.1 + 0.12 * k, t + 0.13);
    gn.gain.exponentialRampToValueAtTime(0.0008, t + 0.62);
    src.connect(flt); flt.connect(gn);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(side * 0.25, t);
      pan.pan.linearRampToValueAtTime(side * 0.8, t + 0.2);
      gn.connect(pan); pan.connect(this.sfxGain);
    } else gn.connect(this.sfxGain);
    src.start(t); src.stop(t + 0.7);
  }

  // ——— Sintez primitivləri ———
  _tone({ type = 'sine', f0 = 440, f1 = null, t, dur = 0.15, g = 0.2, dest = null, attack = 0.005 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(g, t + attack);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn);
    gn.connect(dest || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise({ t, dur = 0.3, g = 0.3, type = 'lowpass', f0 = 1000, f1 = null, q = 1, dest = null }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 != null) flt.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(g, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt);
    flt.connect(gn);
    gn.connect(dest || this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ——— Səs effektləri ———
  // k — güc (0..1), yalnız onu işlədən səslər üçün (zərbə)
  sfx(name, k = 1) {
    if (!this._ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click':
        // Yumşaq UI toxunuşu — dərin "tap" + incə parıltı
        this._tone({ type: 'sine', f0: 520, f1: 400, t, dur: 0.07, g: 0.12, attack: 0.002 });
        this._tone({ type: 'sine', f0: 1560, t, dur: 0.04, g: 0.03, attack: 0.001 });
        break;
      case 'count':
        // İsti, detune cütlü sayğac tonu
        this._tone({ type: 'triangle', f0: 440, t, dur: 0.16, g: 0.16, attack: 0.004 });
        this._tone({ type: 'triangle', f0: 442.5, t, dur: 0.16, g: 0.1, attack: 0.004 });
        this._tone({ type: 'sine', f0: 220, t, dur: 0.14, g: 0.1 });
        break;
      case 'go':
        // Başlama akkordu — üçlü + hava axını
        for (const [f, g] of [[440, 0.14], [554, 0.12], [659, 0.12], [880, 0.09]]) {
          this._tone({ type: 'triangle', f0: f, t, dur: 0.45, g, attack: 0.008 });
          this._tone({ type: 'triangle', f0: f * 1.004, t, dur: 0.45, g: g * 0.5, attack: 0.008 });
        }
        this._noise({ t, dur: 0.4, g: 0.1, type: 'bandpass', f0: 900, f1: 2600, q: 0.8 });
        break;
      case 'pickup':
        // Xoş üçpilləli zəng — sine yığını
        [[784, 0], [988, 0.06], [1319, 0.12]].forEach(([f, d]) => {
          this._tone({ type: 'sine', f0: f, t: t + d, dur: 0.18, g: 0.13, attack: 0.004 });
          this._tone({ type: 'sine', f0: f * 2, t: t + d, dur: 0.1, g: 0.03, attack: 0.004 });
        });
        break;
      case 'boost':
        this._noise({ t, dur: 0.55, g: 0.3, f0: 500, f1: 3500 });
        this._tone({ type: 'sawtooth', f0: 120, f1: 320, t, dur: 0.5, g: 0.12 });
        break;
      case 'shield':
        this._tone({ f0: 320, f1: 920, t, dur: 0.3, g: 0.16 });
        this._tone({ f0: 324, f1: 930, t, dur: 0.3, g: 0.1 });
        break;
      case 'missile':
        this._noise({ t, dur: 0.35, g: 0.25, f0: 2200, f1: 500 });
        this._tone({ type: 'sawtooth', f0: 650, f1: 180, t, dur: 0.5, g: 0.14 });
        break;
      case 'explosion':
        this._noise({ t, dur: 0.7, g: 0.5, f0: 1400, f1: 90 });
        this._tone({ f0: 110, f1: 32, t, dur: 0.6, g: 0.32 });
        break;
      case 'bolt':
        this._noise({ t, dur: 0.28, g: 0.32, type: 'highpass', f0: 1400 });
        this._tone({ type: 'square', f0: 1900, f1: 180, t, dur: 0.22, g: 0.14 });
        break;
      case 'slip':
        this._noise({ t, dur: 0.4, g: 0.25, type: 'bandpass', f0: 900, f1: 350, q: 2 });
        break;
      case 'oil':
        this._tone({ f0: 220, f1: 90, t, dur: 0.2, g: 0.18 });
        break;
      case 'lap':
        // Dövrə keçidi — iki isti zəng
        this._tone({ type: 'triangle', f0: 660, t, dur: 0.15, g: 0.15, attack: 0.005 });
        this._tone({ type: 'triangle', f0: 990, t: t + 0.14, dur: 0.24, g: 0.15, attack: 0.005 });
        this._tone({ type: 'sine', f0: 1320, t: t + 0.14, dur: 0.2, g: 0.05 });
        break;
      case 'finish':
        // Finiş fanfarı — yuvarlanan mažor akkord + parıltı
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this._tone({ type: 'triangle', f0: f, t: t + i * 0.09, dur: 0.7, g: 0.14, attack: 0.01 });
          this._tone({ type: 'triangle', f0: f * 1.004, t: t + i * 0.09, dur: 0.7, g: 0.07, attack: 0.01 });
        });
        this._tone({ type: 'sine', f0: 2093, t: t + 0.36, dur: 0.5, g: 0.04, attack: 0.02 });
        this._noise({ t: t + 0.05, dur: 0.55, g: 0.07, type: 'bandpass', f0: 1200, f1: 3400, q: 0.7 });
        break;
      case 'rescue':
        this._noise({ t, dur: 0.4, g: 0.2, f0: 300, f1: 2400 });
        break;
      case 'chat':
        // Yumşaq mesaj "pop"u
        this._tone({ type: 'sine', f0: 740, f1: 920, t, dur: 0.09, g: 0.1, attack: 0.003 });
        break;
      case 'discard':
        this._tone({ type: 'triangle', f0: 480, f1: 200, t, dur: 0.14, g: 0.11, attack: 0.004 });
        break;
      case 'boltmiss':
        // Şimşək boşa getdi — zəif, enən "fizzle"
        this._tone({ type: 'triangle', f0: 1100, f1: 110, t, dur: 0.35, g: 0.11, attack: 0.004 });
        this._noise({ t, dur: 0.2, g: 0.09, type: 'highpass', f0: 2600 });
        break;
      case 'warn':
        // Gələn raket xəbərdarlığı — iki cəld, yumru bip
        this._tone({ type: 'triangle', f0: 1300, t, dur: 0.08, g: 0.16, attack: 0.003 });
        this._tone({ type: 'triangle', f0: 1300, t: t + 0.14, dur: 0.08, g: 0.16, attack: 0.003 });
        break;
      case 'boltcast':
        // Şimşək yüklənməsi — qalxan üçün 1 saniyəlik xəbərdarlıq
        this._tone({ type: 'sawtooth', f0: 180, f1: 900, t, dur: 0.9, g: 0.13 });
        this._noise({ t: t + 0.1, dur: 0.75, g: 0.06, type: 'highpass', f0: 3200 });
        break;
      case 'trishot':
        // Üçlü atəş — yumru "thump-pew"
        this._tone({ type: 'triangle', f0: 900, f1: 480, t, dur: 0.08, g: 0.13, attack: 0.002 });
        this._noise({ t, dur: 0.06, g: 0.06, type: 'bandpass', f0: 2000, q: 1.5 });
        break;
      case 'impact': {
        // Toqquşma: gücə görə dərinləşən boğuq "gup" — gövdənin çəkisi. Metal cingiltisi YOXDUR:
        // yazılmış metal zərbələri (Kenney) və parlaq "cingilti" zolağı çıxarıldı — yarışda maşının
        // yanından keçəndə "cınk-cınk" verirdi (istifadəçi: "professional deyil, çox arcade").
        const g = 0.35 + 0.65 * k;
        this._tone({ type: 'sine', f0: 150 - 45 * k, f1: 44, t, dur: 0.18 + 0.12 * k, g: 0.3 * g, attack: 0.003 });
        this._noise({ t, dur: 0.08 + 0.08 * k, g: 0.12 * g, f0: 420 + 380 * k, f1: 140 });
        break;
      }
      case 'bump': {
        // Zen: yumşaq, boğuq toxunuş — metal cingiltisi və kəskin küy yoxdur
        const g = 0.3 + 0.5 * k;
        this._tone({ type: 'sine', f0: 130 - 30 * k, f1: 52, t, dur: 0.2 + 0.1 * k, g: 0.2 * g, attack: 0.006 });
        this._noise({ t, dur: 0.09 + 0.06 * k, g: 0.07 * g, f0: 520, f1: 160 });
        break;
      }
      case 'kick': {
        // Topa vuruş: dolğun "tup" (rezin top) + qısa hava şappıltısı; güc artdıqca dərinləşir
        const g = 0.4 + 0.6 * k;
        this._tone({ type: 'sine', f0: 210 - 60 * k, f1: 70, t, dur: 0.13 + 0.08 * k, g: 0.3 * g, attack: 0.002 });
        this._tone({ type: 'triangle', f0: 420, f1: 180, t, dur: 0.05, g: 0.08 * g, attack: 0.001 });
        this._noise({ t, dur: 0.05 + 0.05 * k, g: 0.1 * g, type: 'bandpass', f0: 1400, f1: 500, q: 1.2 });
        break;
      }
      case 'scrape':
        // söykənib sürüşmə: alçaq, yumşaq sürtünmə (əvvəl 3.2 kHz-lik nazik "tss" idi — saniyədə 11 dəfə)
        this._noise({ t, dur: 0.12, g: 0.05, f0: 520, f1: 260 });
        break;
      case 'tick':
        // Zərbə — qısa, dolu "thud"
        this._tone({ type: 'sine', f0: 300, f1: 140, t, dur: 0.11, g: 0.2, attack: 0.002 });
        this._noise({ t, dur: 0.05, g: 0.08, type: 'bandpass', f0: 1400, q: 1.2 });
        break;
    }
  }

  // ——— Mühərrik səsi (yalnız yerli oyunçu) ———
  // Dizayn: sub-oktava + yumşaq qatlar + amplitud LFO ("işləmə" pulsu),
  // aşağı rezonanslı filtr — dərin, sakit, peşəkar uğultu.
  // ——— YAZILMIŞ MÜHƏRRİK (Faza 4.1) ———
  // Üç real mühərrik döngəsi (aşağı / orta / yüksək dövr — domasx2, "racing car engine sound
  // loops", CC0, opengameart.org) dövrə görə bir-birinə keçir və hər biri dövrlə birlikdə
  // zilləşir. Dövr sürətdən ÖTÜRÜCÜLƏRLƏ hesablanır: hər ötürücüdə qalxır, keçiddə düşür —
  // sintez vızıltısında bu yox idi (tək ton sürətlə birlikdə düz qalxırdı).
  // Fayllar yüklənənə qədər (və ya yüklənməsə) köhnə sintez mühərrik işləyir.
  // Müqayisə üçün köhnəni saxlamaq: localStorage `apexEngine` = 'synth'.
  static ENGINE_LOOPS = [
    // Real maşın yazısı (Porsche 911 SC, salondan, sabit dövrlərdə — Sonniss GDC paketi, bax
    // public/sfx/LICENSE.txt). rpm: döngənin yazıldığı dövr; oyun dövrü qonşu iki döngə arasında
    // keçidlə və səsləndirmə sürəti ilə verilir. (Əvvəlki 0.5 s-lik oyun döngələri "matora
    // bənzəmirdi" — istifadəçi rəyi.)
    { src: 'sfx/eng-1100.wav', rpm: 1104 },
    { src: 'sfx/eng-2570.wav', rpm: 2570 },
    { src: 'sfx/eng-3610.wav', rpm: 3612 },
    { src: 'sfx/eng-5030.wav', rpm: 5028 },
  ];

  _loadEngineLoops() {
    if (this._engBufs || this._engLoading) return;
    this._engLoading = true;
    Promise.all(AudioManagerImpl.ENGINE_LOOPS.map((l) =>
      fetch(assetBase() + l.src).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))))
      .then((bufs) => {
        this._engBufs = bufs;
        if (this._engine && !this._engine.rec && !this._engine.forceSynth) { this.stopEngine(); this.startEngine(); }
      })
      .catch(() => { this._engLoading = false; /* sintez qalır */ });
  }

  // Maşının səs xarakteri: ağır maşın bəm, yüngül/sürətli maşın zil (0.82 … 1.2)
  setEngineVoice(stats) {
    const armor = stats?.armor ?? 50, top = stats?.topSpeed ?? 80;
    this._engVoice = Math.max(0.82, Math.min(1.2, 1 + (top - 80) * 0.008 - (armor - 50) * 0.005));
  }

  _startRecEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2500; tone.Q.value = 0.4;
    tone.connect(out); out.connect(this.fxBus);
    const layers = AudioManagerImpl.ENGINE_LOOPS.map((l, i) => {
      const src = ctx.createBufferSource();
      src.buffer = this._engBufs[i]; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(tone);
      src.start();
      return { src, g, rpm: l.rpm };
    });
    this._engine = { rec: true, out, tone, layers, rpm: 0.2, gear: 0, load: 0, prev: 0 };
  }

  startEngine() {
    if (!this._ensure() || this._engine) return;
    // STANDART: ilk (sintez) mühərrik səsi. İstifadəçi yazılmış variantları (oyun döngələri, sonra
    // Porsche yazısı) dinləyib ilk səsi üstün tutdu ("ən birinci olan daha yaxşı idi, belə çox qəribə
    // səs gəlir"). Yazılmış mühərrik yalnız müqayisə üçündür: localStorage `apexEngine` = 'rec'.
    const forceSynth = (() => { try { return localStorage.getItem('apexEngine') !== 'rec'; } catch { return true; } })();
    if (!forceSynth) {
      if (this._engBufs) { this._startRecEngine(); return; }
      this._loadEngineLoops();
    }
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 30;   // sub-oktava (dərinlik)
    const o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 60.4; // yumşaq detün qatı
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 220; flt.Q.value = 0.7;
    const gn = ctx.createGain(); gn.gain.value = 0;
    // Mühərrikin "işləmə" pulsu — amplitud modulyasiyası
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 12;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0;
    lfo.connect(lfoGain); lfoGain.connect(gn.gain);
    o1.connect(flt); o2.connect(flt); o3.connect(flt);
    flt.connect(gn); gn.connect(this.fxBus);
    o1.start(); o2.start(); o3.start(); lfo.start();
    this._engine = { o1, o2, o3, flt, gn, lfo, lfoGain, forceSynth };
  }

  // Oyun pauzasında mühərrik susur
  setPaused(p) {
    this._pausedGame = p;
    if (this._engine && this.ctx) {
      if (p && this._engine.rec) this._engine.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      else if (p) {
        this._engine.gn.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
        this._engine.lfoGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      }
      if (p) this.setTyres(0, 0, 0);
      this._applyAmbience();
      // davamda setEngine növbəti kadrda səviyyəni bərpa edir
    }
  }

  // Zen miksi (sonsuz sürüş): musiqi önə çıxır, mühərrik arxa fona düşür
  // ——— ZEN HAVA SƏSLƏRİ (prosedural, fayl yoxdur) ———
  // rain / snow: 0..1 güc; muffled: tuneldə (səs boğuqlaşır və zəifləyir).
  // Yağış: süzgəcli küy (şırıltı) + alçaq uğultu. Qar: sakit, yavaş dalğalanan külək.
  // Düyünlər bir dəfə qurulur, sonra yalnız səs səviyyəsi dəyişir.
  setWeather(rain = 0, snow = 0, muffled = false) {
    if (!this.ctx || (!this._wx && rain < 0.02 && snow < 0.02)) return;
    if (!this._ensure()) return;
    const ctx = this.ctx;
    if (!this._wx) {
      const bus = ctx.createGain();
      bus.gain.value = 1;
      const tone = ctx.createBiquadFilter(); // tunel boğuqluğu
      tone.type = 'lowpass'; tone.frequency.value = 12000;
      bus.connect(tone); tone.connect(this.fxBus);
      const layer = (type, freq, q) => {
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuf; src.loop = true;
        src.playbackRate.value = 0.9 + Math.random() * 0.2; // iki lay eyni naxışı təkrarlamasın
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(bus);
        src.start();
        return { f, g };
      };
      const hiss = layer('bandpass', 3200, 0.45);   // damcıların şırıltısı
      const body = layer('lowpass', 420, 0.5);      // yerə düşən yağışın uğultusu
      const wind = layer('bandpass', 420, 0.9);     // qar: sakit külək
      // küləyin yavaş dalğalanması
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
      const lg = ctx.createGain(); lg.gain.value = 170;
      lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
      this._wx = { tone, hiss, body, wind };
    }
    const W = this._wx, t = ctx.currentTime, k = muffled ? 0.35 : 1;
    // Səviyyə musiqidən AŞAĞI saxlanır (ölçüldü: musiqi ≈ −40 dB; yağış ≈ −43, qar ≈ −47) —
    // hava arxa fondur, mahnını örtmür.
    W.hiss.g.gain.setTargetAtTime(rain * 0.02 * k, t, 0.4);
    W.body.g.gain.setTargetAtTime(rain * 0.028 * k, t, 0.4);
    W.wind.g.gain.setTargetAtTime(snow * 0.04 * k + rain * 0.006, t, 0.6);
    W.tone.frequency.setTargetAtTime(muffled ? 700 : 12000, t, 0.25);
  }

  // ——— QARIN ÜSTÜNDƏ SÜRÜŞ (zen) ———
  // amount 0..1 = qar örtüyü × sürət × səth (torpaqda tam, asfaltda zəif). Qar təkərin
  // altında xırçıldayır: orta-yüksək zolaqlı küy + sıxılan qarın alçaq xışıltısı; səviyyəni
  // yavaş təsadüfi dalğa (10–16 Hz-ə qədər süzülmüş küy) dənəli edir ki, düz "şşş" olmasın.
  setSnowRoll(amount = 0, muffled = false) {
    if (!this.ctx || (!this._snowRoll && amount < 0.02)) return;
    if (!this._ensure()) return;
    const ctx = this.ctx;
    if (!this._snowRoll) {
      const out = ctx.createGain(); out.gain.value = 0;
      out.connect(this.fxBus);
      const grain = ctx.createGain(); grain.gain.value = 0.55;   // dənəlilik bu düyünün səviyyəsini oynadır
      grain.connect(out);
      const mk = (type, freq, q, lvl, rate) => {
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuf; src.loop = true; src.playbackRate.value = rate;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = lvl;
        src.connect(f); f.connect(g); g.connect(grain);
        src.start();
        return f;
      };
      const crunch = mk('bandpass', 2300, 0.9, 1, 1.07);
      mk('lowpass', 520, 0.6, 0.7, 0.83);
      // dənəlilik: çox yavaş çalınan küy → alçaq süzgəc → səviyyə modulyasiyası
      const ms = ctx.createBufferSource();
      ms.buffer = this._noiseBuf; ms.loop = true; ms.playbackRate.value = 0.012;
      const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 14;
      const mg = ctx.createGain(); mg.gain.value = 2.2;
      ms.connect(mf); mf.connect(mg); mg.connect(grain.gain);
      ms.start();
      this._snowRoll = { out, crunch, mf };
    }
    const R = this._snowRoll, t = ctx.currentTime;
    const a = Math.max(0, Math.min(1, amount));
    // Səviyyə hava səsi ilə eyni sırada (musiqidən aşağı); tuneldə qar yoxdur
    R.out.gain.setTargetAtTime(muffled || this._pausedGame ? 0 : a * 0.05, t, 0.18);
    R.crunch.frequency.setTargetAtTime(1900 + a * 900, t, 0.3);
    R.mf.frequency.setTargetAtTime(8 + a * 10, t, 0.3);
  }

  // Uzaq göy gurultusu: alçaq küy, bir neçə dalğa ilə sönür. dist 0 (yaxın) .. 1 (uzaq)
  thunder(dist = 0.5) {
    if (!this._ensure() || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 2.6 + Math.random() * 2;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(420 - dist * 220, t);
    f.frequency.exponentialRampToValueAtTime(55, t + dur);
    const g = ctx.createGain();
    const peak = 0.5 - dist * 0.3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.08 + dist * 0.25);
    // gurultunun "yuvarlanması": iki-üç zəifləyən dalğa
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(peak * 0.6, t + dur * 0.42);
    g.gain.exponentialRampToValueAtTime(peak * 0.15, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.fxBus);
    src.start(t); src.stop(t + dur + 0.1);
  }

  // ——— TƏKƏR, TORPAQ, KÜLƏK (Faza 4.2) ———
  // slip 0..1 — drift/sürüşmə (rezin cığıltısı) · dirt 0..1 — yoldan kənar uğultu · wind 0..1 — sürət küləyi.
  // Hamısı süzgəclənmiş küydür (yazılmış CC0 cığıltı tapılmadı — sintezdir); düyünlər bir dəfə qurulur.
  setTyres(slip = 0, dirt = 0, wind = 0) {
    if (!this.ctx || (!this._tyres && dirt < 0.02)) return;
    if (!this._ensure()) return;
    const ctx = this.ctx;
    if (!this._tyres) {
      const mk = (type, freq, q) => {
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.fxBus);
        src.start();
        return { f, g };
      };
      // DRİFT SƏSSİZDİR (istifadəçi qərarı, 2026-10-08): əvvəl sintez cığıltı, sonra yaş asfaltda real
      // təkər yazısı sınandı — ikisi də bəyənilmədi ("drift səsini də çıxar"). `slip` parametri qalır
      // ki, çağıranlar dəyişməsin; yeni səs yalnız əvvəlcə dinlədilib təsdiqlənəndən sonra qoşulsun.
      this._tyres = { dirt: mk('lowpass', 210, 0.6) };
    }
    const T = this._tyres, t = ctx.currentTime;
    const k = this._pausedGame ? 0 : (this._zenMix ? 0.35 : 1);
    T.dirt.g.gain.setTargetAtTime(dirt * 0.16 * k, t, 0.1);
    // Sürət küləyi (500–1400 Hz küy) ÇIXARILDI: sürüş boyu fasiləsiz xışıltı verirdi (istifadəçi:
    // "sürəndəki xışıltı səsi pisdir"). Sürət hissini mühərrik səsi daşıyır. `wind` parametri qalır
    // ki, çağıranlar dəyişməsin; real külək yazısı tapılsa bura qoşulacaq.
  }

  setZenMix(on) {
    this._zenMix = !!on;
    if (this.ctx) {
      this.musicGain.gain.setTargetAtTime(on ? 0.5 : 0.17, this.ctx.currentTime, 0.5);
    }
  }

  setEngine(speedT, boosting) {
    if (!this._engine || this._pausedGame) return;
    const e = this._engine;
    const t = this.ctx.currentTime;
    if (e.rec) {
      // ÖTÜRÜCÜLƏR: sürət aralığı 5 pilləyə bölünür; dövr pillənin içində 0.32 → 1 qalxır
      const G = [0, 0.16, 0.34, 0.54, 0.76, 1.001];
      let gi = 0;
      while (gi < 4 && speedT >= G[gi + 1]) gi++;
      const frac = (speedT - G[gi]) / (G[gi + 1] - G[gi]);
      const want = gi === 0 ? 0.16 + 0.84 * frac : 0.32 + 0.68 * frac;
      // dövr ani sıçramır: qalxma cəld, ötürücü keçidində düşmə bir az yavaş
      e.rpm += (want - e.rpm) * (want > e.rpm ? 0.22 : 0.12);
      // YÜK: sürət artırsa (qaz) mühərrik açıq və uca, düşürsə (qaz buraxılıb) boğuq
      const acc = speedT - e.prev; e.prev = speedT;
      e.load += ((acc > 0.0004 || boosting ? 1 : acc < -0.0004 ? 0 : 0.45) - e.load) * 0.08;
      const voice = this._engVoice || 1;
      // oyun dövrü (0..1) → real dövr: 1000 … 5300 dövr/dəq (maşının xarakteri ±, nitroda bir az yuxarı)
      const real = (1000 + e.rpm * 4300 + (boosting ? 250 : 0)) * voice;
      const Ls = e.layers;
      let hi = 1;
      while (hi < Ls.length - 1 && real > Ls[hi].rpm) hi++;
      const lo = hi - 1;
      // qonşu iki döngə arasında bərabər güclü keçid (dövrün loqarifminə görə)
      const x = Math.max(0, Math.min(1, Math.log(real / Ls[lo].rpm) / Math.log(Ls[hi].rpm / Ls[lo].rpm)));
      for (let i = 0; i < Ls.length; i++) {
        const w = i === lo ? Math.cos(x * Math.PI / 2) : i === hi ? Math.sin(x * Math.PI / 2) : 0;
        Ls[i].g.gain.setTargetAtTime(w, t, 0.05);
        Ls[i].src.playbackRate.setTargetAtTime(Math.max(0.5, Math.min(2, real / Ls[i].rpm)), t, 0.04);
      }
      // qaz buraxılanda səs bir az boğulur (yük), qaz veriləndə açılır
      e.tone.frequency.setTargetAtTime(1300 + e.rpm * 2200 + e.load * 4500, t, 0.08);
      // səviyyə köhnə sintez mühərriklə eyni sırada (ölçüldü: 0.8 sürətdə sintez −27 dB)
      // (yazılar −20 dBFS-ə normallaşdırılıb; əmsal elə seçilib ki, səviyyə əvvəlki ilə eyni qalsın)
      let g = (0.28 + e.rpm * 0.3) * (0.62 + 0.38 * e.load);
      if (this._zenMix) g *= 0.12;   // zen: mühərrik arxa fonda
      e.out.gain.setTargetAtTime(g, t, 0.07);
      return;
    }
    const tc = 0.08;
    const f = 42 + speedT * 95 + (boosting ? 22 : 0);
    e.o1.frequency.setTargetAtTime(f, t, tc);
    e.o2.frequency.setTargetAtTime(f / 2, t, tc);
    e.o3.frequency.setTargetAtTime(f * 1.006, t, tc);
    e.flt.frequency.setTargetAtTime(200 + speedT * 520, t, tc);
    let g = 0.016 + speedT * 0.042; // əvvəlkindən ~2.5x sakit
    if (this._zenMix) g *= 0.07; // zen: mühərrik güclə seçilən fon uğultusu
    e.gn.gain.setTargetAtTime(g, t, tc);
    e.lfo.frequency.setTargetAtTime(9 + speedT * 26, t, tc);
    e.lfoGain.gain.setTargetAtTime(g * 0.25, t, tc);
  }

  stopEngine() {
    this.setTyres(0, 0, 0);
    this.setAmbience(0);
    this._pausedGame = false; // növbəti oyun üçün sıfırla
    const e = this._engine;
    if (!e) return;
    this._engine = null;
    const t = this.ctx.currentTime;
    if (e.rec) {
      e.out.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => {
        for (const L of e.layers) { try { L.src.stop(); } catch { /* artıq dayanıb */ } }
        e.out.disconnect();
      }, 300);
      return;
    }
    e.gn.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      try { e.o1.stop(); e.o2.stop(); e.o3.stop(); e.lfo.stop(); } catch { /* boş */ }
    }, 400);
  }

  // ——— Musiqi (prosedural sekvenser, lookahead planlaması) ———
  playMusic(mode) {
    if (!this._ensure()) return;
    if (this._musicMode === mode) return;
    this.stopMusic();
    this._resolvePack();
    this._musicMode = mode;
    // Kontekst hələ kilidlidirsə qeyd et — oyananda (statechange) təmiz qurulacaq
    this._stalled = this.ctx.state !== 'running';
    this._step = 0;
    this._nextT = this.ctx.currentTime + 0.15;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 90);
    if ((mode === 'menu' || mode === 'race') && this._packList(mode)) this._startPackFile(mode);
    if (mode === 'lofi') {
      // Hər girişdə FƏRQLİ mahnı ilə başla (eyni trek təkrarlanmasın)
      const n = AudioManagerImpl.LOFI_FILES.length;
      let pick = Math.floor(Math.random() * n);
      if (pick === this._lofiVar) pick = (pick + 1) % n;
      this._lofiVar = pick;
      this._startLofiFile();
    }
  }

  stopMusic() {
    if (this._musicTimer) clearInterval(this._musicTimer);
    this._musicTimer = null;
    this._musicMode = null;
    this._stopLofiFile();
    this._stopPackFile();
  }

  // ——— MUSİQİ PAKETLƏRİ (mağaza: "Musiqi") ———
  // Menyu və yarış mövzusunun yerinə real yazılmış treklər çalınır. Paket seçilməyibsə
  // (və ya fayl oxunmasa) oyunun öz sintez mövzuları qalır — onlara toxunulmur.
  // Hamısı CC0 / ictimai mülkiyyət: HoliznaCC0 (freemusicarchive.org) və Musopen yazıları
  // (Wikimedia Commons). Mənbələr: public/music/LICENSE.txt.
  static PACKS = {
    m_lofi: {
      menu: ['music/morning-coffee.mp3', 'music/autumn.mp3'],
      race: ['music/new-shoes.mp3', 'music/moon-unit.mp3', 'music/summer-break.mp3'],
    },
    m_chip: {
      menu: ['music/packs/chip-adventure-begins-loop.mp3'],
      race: ['music/packs/chip-rising-hero.mp3', 'music/packs/chip-level-2.mp3'],
    },
    m_synth: {
      menu: ['music/packs/synth-morning-light.mp3'],
      race: ['music/packs/synth-city-in-the-rearview.mp3', 'music/packs/synth-retrospect.mp3'],
    },
    m_rock: {
      menu: ['music/packs/rock-classic.mp3'],
      race: ['music/packs/rock-punk.mp3', 'music/packs/rock-grunge.mp3'],
    },
    m_phonk: {
      menu: ['music/packs/phonk-phonk-ish.mp3'],
      race: ['music/packs/phonk-only-human.mp3', 'music/packs/phonk-pantheon.mp3'],
    },
    m_orch: {
      menu: ['music/packs/classic-night-on-bald-mountain.mp3'],
      race: ['music/packs/classic-hall-of-the-mountain-king.mp3', 'music/packs/classic-beethoven-symphony-5.mp3'],
    },
  };

  _packList(mode) {
    const P = this._pack && AudioManagerImpl.PACKS[this._pack];
    return P ? P[mode] : null;
  }

  // Hansı paket çalınmalıdır: mağazada önizləmə > oyunçunun taxdığı paket (packProvider —
  // main.js verir) > standart sintez (null).
  _resolvePack() {
    const id = this._previewPack ?? this.packProvider?.() ?? null;
    this._pack = id && AudioManagerImpl.PACKS[id] ? id : null;
  }

  // Seçim dəyişəndə (alındı / taxıldı / önizləmə) çalınan musiqini yenisinə keçir
  refreshMusicPack() {
    const before = this._pack;
    this._resolvePack();
    const mode = this._musicMode;
    if (before === this._pack || (mode !== 'menu' && mode !== 'race')) return;
    this.stopMusic();
    this.playMusic(mode);
  }

  // Mağazada dinləmə: paket alınmadan əvvəl menyuda çalınır. id = null → önizləmə bitir.
  previewPack(id) {
    this._previewPack = id || undefined;
    this.refreshMusicPack();
  }

  _startPackFile(mode) {
    const list = this._packList(mode);
    this._packFail = false;
    this._packIdx = ((this._packIdx ?? -1) + 1) % list.length;
    try {
      const el = new Audio(assetBase() + list[this._packIdx]);
      el.preload = 'auto';
      this._packEl = el;
      this._packNode = this.ctx.createMediaElementSource(el);
      // Fayllar −16 LUFS-ə normallaşdırılıb — sintez mövzusunun səviyyəsinə endirilir
      this._packGain = this._packGain || this.ctx.createGain();
      this._packGain.gain.value = 0.5;
      this._packNode.connect(this._packGain);
      this._packGain.connect(this.musicGain);
      el.onended = () => {
        if (this._packEl !== el || this._musicMode !== mode) return;
        this._stopPackFile();
        if (this._packList(mode)) this._startPackFile(mode);
      };
      el.onerror = () => { if (this._packEl === el) this._packFail = true; };   // sintezə düş
      el.play().catch(() => { if (this._packEl === el) this._packFail = true; });
    } catch {
      this._packFail = true;
    }
  }

  _stopPackFile() {
    if (this._packEl) {
      const el = this._packEl;
      this._packEl = null;
      el.onended = null;
      el.onerror = null;
      el.pause();
      el.src = '';
    }
    this._packNode?.disconnect();
    this._packNode = null;
  }

  // ——— Həqiqi lofi trekləri (HoliznaCC0 — "Lo-fi And Chill", CC0 1.0 ictimai mülkiyyət) ———
  // WebAudio musicGain-dən keçir → zen miksi və mute avtomatik tətbiq olunur.
  static LOFI_FILES = [
    { src: 'music/morning-coffee.mp3', name: 'Morning Coffee' },
    { src: 'music/tokyo-sunset.mp3', name: 'Tokyo Sunset' },
    { src: 'music/clouds-6.mp3', name: 'Clouds' },
    { src: 'music/bubbles-lofi.mp3', name: 'Bubbles' },
    { src: 'music/a-little-shade.mp3', name: 'A Little Shade' },
    { src: 'music/warm-fuzz.mp3', name: 'Warm Fuzz' },
    { src: 'music/autumn.mp3', name: 'Autumn' },
    { src: 'music/moon-unit.mp3', name: 'Moon Unit' },
    { src: 'music/cellar-door.mp3', name: 'Cellar Door' },
    { src: 'music/one-night.mp3', name: 'One Night In France' },
    { src: 'music/puppy-love.mp3', name: 'Puppy Love' },
    { src: 'music/shimmer-lofi.mp3', name: 'Shimmer' },
    { src: 'music/seasons-change.mp3', name: 'Seasons Change' },
    { src: 'music/wave-maker.mp3', name: 'Wave Maker' },
    { src: 'music/new-shoes.mp3', name: 'New Shoes' },
    { src: 'music/theta-frequency.mp3', name: 'Theta Frequency' },
    { src: 'music/calm-currents.mp3', name: 'Calm Currents' },
    { src: 'music/lucid-lofi.mp3', name: 'Lucid' },
    { src: 'music/ocean-memory.mp3', name: 'Ocean Memory' },
    { src: 'music/cold-salt-water.mp3', name: 'Cold Salt Water' },
    { src: 'music/currents-we-used-to-know.mp3', name: 'Currents We Used To Know' },
    { src: 'music/i-dont-understand-a-thing.mp3', name: "I Don't Understand A Thing" },
    { src: 'music/washed-up.mp3', name: 'Washed Up' },
    { src: 'music/roof-tops.mp3', name: 'Roof Tops' },
    // "Public Domain Lofi" albomundan (HoliznaCC0, CC0) — 2026-10-06 əlavəsi
    { src: 'music/birds.mp3', name: 'Birds' },
    { src: 'music/doodles.mp3', name: 'Doodles' },
    { src: 'music/tranquil-mindscape.mp3', name: 'Tranquil Mindscape' },
    { src: 'music/peaceful-drift.mp3', name: 'Peaceful Drift' },
    { src: 'music/ocean-breeze.mp3', name: 'Ocean Breeze' },
    { src: 'music/projector-screen.mp3', name: 'Projector Screen' },
    { src: 'music/summer-break.mp3', name: 'Summer Break' },
    { src: 'music/the-best-of-times.mp3', name: 'The Best Of Times' },
    { src: 'music/walking-away.mp3', name: 'Walking Away' },
    { src: 'music/down-time.mp3', name: 'Down Time' },
  ];

  _startLofiFile() {
    this._lofiSynth = false; // fayl oxunmasa köhnə sintez versiyaya düşür
    const trk = AudioManagerImpl.LOFI_FILES[(this._lofiVar ?? 0) % AudioManagerImpl.LOFI_FILES.length];
    try {
      const el = new Audio(assetBase() + trk.src);
      el.preload = 'auto';
      this._lofiEl = el;
      this._lofiNode = this.ctx.createMediaElementSource(el);
      this._lofiNode.connect(this.musicGain);
      // DİQQƏT: köhnə elementin error/ended-i CARİ vəziyyəti zəhərləməsin —
      // hər callback yalnız hələ də aktual elementdirsə işləyir
      el.onended = () => {
        if (this._musicMode === 'lofi' && this._lofiEl === el) this.nextLofiTrack();
      };
      el.onerror = () => { if (this._lofiEl === el) this._lofiSynth = true; };
      el.play().catch(() => { if (this._lofiEl === el) this._lofiSynth = true; });
    } catch {
      this._lofiSynth = true;
    }
  }

  _stopLofiFile() {
    if (this._lofiEl) {
      const el = this._lofiEl;
      this._lofiEl = null; // istinad əvvəl silinir — src='' xətası bizi vurmasın
      el.onended = null;
      el.onerror = null;
      el.pause();
      el.src = '';
    }
    this._lofiNode?.disconnect();
    this._lofiNode = null;
  }

  // Lofi trekləri arasında keçid (Endless rejimi ⏭ düyməsi)
  nextLofiTrack() {
    this._lofiVar = ((this._lofiVar ?? 0) + 1) % AudioManagerImpl.LOFI_FILES.length;
    this._step = 0;
    if (this._musicMode === 'lofi' && !this._lofiSynth) {
      this._stopLofiFile();
      this._startLofiFile();
      return AudioManagerImpl.LOFI_FILES[this._lofiVar].name;
    }
    return ['Gecə Yolu', 'Yağış Pəncərəsi', 'Səhər Dumanı'][this._lofiVar % 3];
  }

  _scheduleMusic() {
    if (!this._musicMode || !this.ctx) return;
    if (this._musicMode === 'lofi' && !this._lofiSynth) return; // fayl çalınır
    if (this._packEl && !this._packFail) return;                 // musiqi paketi çalınır
    const bpm = this._musicMode === 'race' ? 118 : this._musicMode === 'lofi' ? 74 : 82;
    const stepDur = 60 / bpm / 2; // 8-lik notlar
    while (this._nextT < this.ctx.currentTime + 0.3) {
      if (!this.muted) this._playStep(this._musicMode, this._step, this._nextT, stepDur);
      this._nextT += stepDur;
      this._step = (this._step + 1) % 64;
    }
  }

  _playStep(mode, s, t, dur) {
    const M = this.musicGain;
    const semis = (root, n) => root * Math.pow(2, n / 12);
    // Akkord gedişi: Am F C G (klassik, yadda qalan; hər 16 addım = 1 takt)
    const roots = [110, 87.31, 130.81, 98];
    const chordQ = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]]; // minor/major
    const ci = Math.floor(s / 16) % 4;
    const root = roots[ci];
    // İsti "pluck" — detune cütü + oktava altı sine (kvadrat dalğasız, yumru)
    const pluck = (f, tt, d, g, atk = 0.008) => {
      this._tone({ type: 'triangle', f0: f, t: tt, dur: d, g, dest: M, attack: atk });
      this._tone({ type: 'triangle', f0: f * 1.0045, t: tt, dur: d, g: g * 0.55, dest: M, attack: atk });
      this._tone({ type: 'sine', f0: f / 2, t: tt, dur: d * 0.8, g: g * 0.4, dest: M, attack: atk });
    };

    if (mode === 'lofi') {
      // ——— LOFI: 3 variant — caz akkordları, yumşaq beat, vinil cızıltısı ———
      const V = (this._lofiVar ?? 0) % 3; // sintez ehtiyatında yalnız 3 variant var
      const TRACKS = [
        { // Gecə Yolu — Am7 Dm7 Fmaj7 E7
          roots: [110, 73.42, 87.31, 82.41],
          chords: [[0, 3, 7, 10], [0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 10]],
          mel: [12, -1, 15, 14, -1, 12, -1, 10, -1, 12, -1, 7, -1, -1, 10, -1],
        },
        { // Yağış Pəncərəsi — Cmaj7 Am7 Dm7 G7
          roots: [130.81, 110, 73.42, 98],
          chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 3, 7, 10], [0, 4, 7, 10]],
          mel: [7, -1, 11, -1, 12, -1, 14, 12, -1, 11, -1, 7, -1, 4, -1, -1],
        },
        { // Səhər Dumanı — Fmaj7 G7 Em7 Am7
          roots: [87.31, 98, 82.41, 110],
          chords: [[0, 4, 7, 11], [0, 4, 7, 10], [0, 3, 7, 10], [0, 3, 7, 10]],
          mel: [16, -1, 14, -1, 12, -1, 11, -1, 12, 14, -1, 16, -1, -1, 19, -1],
        },
      ];
      const trk = TRACKS[V];
      const lci = Math.floor(s / 16) % 4;
      const lroot = trk.roots[lci];
      // Half-time yumşaq beat
      if (s % 16 === 0) this._tone({ f0: 110, f1: 44, t, dur: 0.22, g: 0.34, dest: M });
      if (s % 16 === 8) this._noise({ t, dur: 0.1, g: 0.06, type: 'bandpass', f0: 2200, dest: M }); // fırça snare
      if (s % 4 === 2) this._noise({ t, dur: 0.04, g: 0.025, type: 'highpass', f0: 8000, dest: M }); // incə hat
      // İsti bas (kök + kvinta)
      if (s % 8 === 0) this._tone({ type: 'triangle', f0: lroot, t, dur: dur * 6, g: 0.2, dest: M, attack: 0.03 });
      if (s % 16 === 12) this._tone({ type: 'triangle', f0: semis(lroot, 7), t, dur: dur * 3, g: 0.12, dest: M, attack: 0.03 });
      // Akkord (Rhodes hissi — triangle, yumşaq atak)
      if (s % 16 === 0 || s % 16 === 10) {
        for (const n of trk.chords[lci]) {
          this._tone({ type: 'triangle', f0: semis(lroot * 2, n), t: t + Math.random() * 0.03, dur: dur * 7, g: 0.05, dest: M, attack: 0.06 });
        }
      }
      // Melodiya — az, swing gecikməsi ilə
      if (s % 2 === 0) {
        const n = trk.mel[(s / 2) % 16];
        if (n >= 0 && Math.random() < 0.9) {
          this._tone({ type: 'sine', f0: semis(lroot * 2, n), t: t + (s % 4 === 2 ? dur * 0.18 : 0), dur: dur * 2.6, g: 0.075, dest: M, attack: 0.02 });
        }
      }
      // Vinil cızıltısı
      if (Math.random() < 0.5) {
        this._noise({ t: t + Math.random() * dur, dur: 0.012, g: 0.006 + Math.random() * 0.012, type: 'highpass', f0: 4000, dest: M });
      }
      return;
    }
    if (mode === 'race') {
      // (2026-10-06: istifadəçi dörd alternativi dinlədi və ORİJİNALI seçdi — "köhnəsi yaxşı idi".
      //  Bu mövzuya toxunma; dəyişiklik istənsə əvvəl yan-yana seçim ver.)
      // ——— YARIŞ: sürüşkən synthwave — dolu kick, backbeat snare, oktava bası, hook lead ———
      if (s % 4 === 0) this._tone({ f0: 140, f1: 44, t, dur: 0.16, g: 0.46, dest: M }); // dərin kick
      if (s % 8 === 4) { // snare (backbeat) — küy + gövdə
        this._noise({ t, dur: 0.13, g: 0.14, type: 'bandpass', f0: 1800, q: 0.9, dest: M });
        this._tone({ type: 'sine', f0: 190, f1: 120, t, dur: 0.09, g: 0.1, dest: M });
      }
      if (s % 4 === 2) this._noise({ t, dur: 0.07, g: 0.055, type: 'highpass', f0: 7500, dest: M }); // açıq hat
      else if (s % 2 === 0) this._noise({ t, dur: 0.025, g: 0.02, type: 'highpass', f0: 9000, dest: M }); // qapalı hat
      // Yuvarlanan oktava bası — triangle+saw qarışığı (isti amma sürücü)
      const bassPat = [0, 12, 0, 12, 0, 12, 10, 12];
      const bf = semis(root, bassPat[s % 8]);
      this._tone({ type: 'triangle', f0: bf, t, dur: dur * 0.85, g: 0.2, dest: M, attack: 0.004 });
      this._tone({ type: 'sawtooth', f0: bf, t, dur: dur * 0.85, g: 0.05, dest: M, attack: 0.004 });
      // Pad — hər taktda yumşaq akkord fonu
      if (s % 16 === 0) {
        for (const n of chordQ[ci]) {
          this._tone({ type: 'sawtooth', f0: semis(root * 2, n), t, dur: dur * 15, g: 0.026, dest: M, attack: 0.6 });
          this._tone({ type: 'sawtooth', f0: semis(root * 2, n) * 1.006, t, dur: dur * 15, g: 0.018, dest: M, attack: 0.6 });
        }
      }
      // HOOK: 2 taktlıq çağırış + 2 taktlıq cavab (yadda qalan riff)
      if (s % 2 === 0) {
        const call = [12, -1, 15, 17, -1, 15, 12, -1];
        const resp = [19, 17, 15, 12, 10, -1, 12, -1];
        const line = (ci % 2 === 0) ? call : resp;
        const n = line[(s / 2) % 8];
        if (n >= 0) pluck(semis(root * 2, n), t, dur * 1.6, 0.075, 0.006);
      }
      // 4 taktın sonunda qalxan keçid (riser)
      if (s >= 60) this._noise({ t, dur: dur, g: 0.015 + (s - 60) * 0.012, type: 'highpass', f0: 3000 + (s - 60) * 800, dest: M });
    } else {
      // ——— MENYU: imza mövzusu — half-time, isti pad, exo-lu pluck hook ———
      if (s % 8 === 0) this._tone({ f0: 120, f1: 46, t, dur: 0.2, g: 0.38, dest: M }); // yumşaq kick
      if (s % 16 === 8) { // yumşaq snare/clap
        this._noise({ t, dur: 0.12, g: 0.07, type: 'bandpass', f0: 1500, q: 0.8, dest: M });
        this._tone({ type: 'sine', f0: 175, f1: 115, t, dur: 0.08, g: 0.06, dest: M });
      }
      if (s % 8 === 4) this._noise({ t, dur: 0.05, g: 0.03, type: 'highpass', f0: 8500, dest: M }); // incə hat
      if (s % 4 === 0) {
        this._tone({ type: 'triangle', f0: root, t, dur: dur * 3.6, g: 0.2, dest: M, attack: 0.02 }); // isti bas
        this._tone({ type: 'sine', f0: root / 2, t, dur: dur * 3.2, g: 0.1, dest: M, attack: 0.02 }); // sub
      }
      if (s % 16 === 0) { // 7-li pad — dərin, kinolu
        const seventh = ci === 0 ? 10 : 11;
        for (const n of [...chordQ[ci], seventh]) {
          this._tone({ type: 'sawtooth', f0: semis(root * 2, n), t, dur: dur * 15, g: 0.03, dest: M, attack: 0.7 });
          this._tone({ type: 'sawtooth', f0: semis(root * 2, n) * 1.007, t, dur: dur * 15, g: 0.02, dest: M, attack: 0.7 });
        }
      }
      // İmza hook-u — pluck + zəif exo təkrarı (yadda qalan motiv)
      const mel = [12, -1, 15, -1, 19, -1, 17, 15, -1, 12, -1, 10, -1, 12, -1, -1];
      if (s % 2 === 0) {
        const n = mel[(s / 2) % 16];
        if (n >= 0) {
          const f = semis(root * 2, n);
          pluck(f, t, dur * 2.2, 0.085);
          pluck(f, t + dur * 3, dur * 1.6, 0.028); // exo
        }
      }
      // Hər 4 taktda bir yüksək parıltı (imza detalı)
      if (s === 48) this._tone({ type: 'sine', f0: semis(880, 0), t, dur: dur * 6, g: 0.035, dest: M, attack: 0.05 });
    }
  }
}

export const audio = new AudioManagerImpl();
