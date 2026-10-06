import { assetBase } from '../net/apiBase.js';
// Prosedural audio sistemi — Web Audio API, heç bir xarici fayl yoxdur.
// Musiqi: chiptune/synthwave sekvenser. SFX: sintez olunmuş effektlər.
// Mühərrik: sürətə bağlı osilatorlar. Mute vəziyyəti localStorage-da qalır.
class AudioManagerImpl {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('apexMuted') === '1';
    // Menyu/yarış musiqisinin üslubu (müqayisə üçün ünvana ?music=… yaz; seçim yadda qalır):
    //   classic — synthwave sintezi (STANDART: istifadəçi 2026-10-06-da üç variantı dinləyib bunu seçdi)
    //   walk    — "Big Walk" tipli minimalist xor sintezi (sınaq, seçilmədi)
    //   files   — yazılmış treklər: zen-in lofi siyahısı menyuda və yarışda da çalınır
    try {
      const q = new URLSearchParams(location.search).get('music');
      if (['classic', 'walk', 'files'].includes(q)) localStorage.setItem('apexMusicStyle', q);
      const st = localStorage.getItem('apexMusicStyle');
      this.musicStyle = ['walk', 'files'].includes(st) ? st : 'classic';
    } catch { this.musicStyle = 'classic'; }
    this._musicMode = null;
    this._musicTimer = null;
    this._step = 0;
    this._nextT = 0;
    this._engine = null;
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.17;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.45;
      this.sfxGain.connect(this.master);
      // Ağ küy buferi (partlayış, külək və s. üçün)
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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
        // Toqquşma: gücə görə dərinləşən "thud" + qısa xırıltı; güclü zərbədə metal cingiltisi
        const g = 0.35 + 0.65 * k;
        this._tone({ type: 'sine', f0: 170 - 50 * k, f1: 46, t, dur: 0.16 + 0.12 * k, g: 0.26 * g, attack: 0.002 });
        this._noise({ t, dur: 0.07 + 0.12 * k, g: 0.2 * g, f0: 900 + 1600 * k, f1: 180 });
        if (k > 0.5) this._noise({ t: t + 0.012, dur: 0.16, g: 0.12 * k, type: 'bandpass', f0: 2600, f1: 900, q: 3 });
        break;
      }
      case 'scrape':
        this._noise({ t, dur: 0.09, g: 0.05, type: 'bandpass', f0: 3200, f1: 1800, q: 2 });
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
  startEngine() {
    if (!this._ensure() || this._engine) return;
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
    flt.connect(gn); gn.connect(this.master);
    o1.start(); o2.start(); o3.start(); lfo.start();
    this._engine = { o1, o2, o3, flt, gn, lfo, lfoGain };
  }

  // Oyun pauzasında mühərrik susur
  setPaused(p) {
    this._pausedGame = p;
    if (this._engine && this.ctx) {
      if (p) {
        this._engine.gn.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
        this._engine.lfoGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      }
      // davamda setEngine növbəti kadrda səviyyəni bərpa edir
    }
  }

  // Zen miksi (sonsuz sürüş): musiqi önə çıxır, mühərrik arxa fona düşür
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
    this._pausedGame = false; // növbəti oyun üçün sıfırla
    if (!this._engine) return;
    const e = this._engine;
    e.gn.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => {
      try { e.o1.stop(); e.o2.stop(); e.o3.stop(); e.lfo.stop(); } catch { /* boş */ }
    }, 400);
    this._engine = null;
  }

  // ——— Musiqi (prosedural sekvenser, lookahead planlaması) ———
  playMusic(mode) {
    if (!this._ensure()) return;
    // 'files' üslubunda menyu və yarış da lofi fayl siyahısını çalır (keçiddə kəsilmir)
    if (this.musicStyle === 'files') mode = 'lofi';
    if (this._musicMode === mode) return;
    this.stopMusic();
    this._musicMode = mode;
    // Kontekst hələ kilidlidirsə qeyd et — oyananda (statechange) təmiz qurulacaq
    this._stalled = this.ctx.state !== 'running';
    this._step = 0;
    this._nextT = this.ctx.currentTime + 0.15;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 90);
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
    const walk = this.musicStyle !== 'classic';
    const bpm = this._musicMode === 'lofi' ? 74
      : this._musicMode === 'race' ? (walk ? 86 : 112) : (walk ? 117 : 82);
    const stepDur = 60 / bpm / 2; // 8-lik notlar
    while (this._nextT < this.ctx.currentTime + 0.3) {
      if (!this.muted) this._playStep(this._musicMode, this._step, this._nextT, stepDur);
      this._nextT += stepDur;
      this._step = (this._step + 1) % 64;
      if (this._step === 0) this._loopN = (this._loopN || 0) + 1; // bölmə növbəsi üçün
    }
  }

  // ——— "SƏS" SİNTEZİ: sözsüz vokal parçası ("ba / da / u") ———
  // Mişar dalğası iki formant süzgəcindən keçir (sait rəngi) + başlanğıcda qısa
  // aşağıdan-yuxarı sürüşmə — insan səsinə oxşar qısa heca. Menyu/yarış mövzusundakı
  // "tullanan səslər" bununla çalınır.
  _voice({ f0, t, dur = 0.16, g = 0.1, vowel = 'a', dest = null, attack = 0.012, from = null }) {
    const ctx = this.ctx;
    const F = { a: [820, 1180], o: [460, 820], u: [330, 760], e: [520, 1750] }[vowel] || [820, 1180];
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + attack);
    env.gain.setValueAtTime(g, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // iki azca köksüz mənbə — tək səs yox, kiçik xor
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      // from: əvvəlki notdan sürüşərək gəlir; yoxdursa qısa aşağıdan giriş
      o.frequency.setValueAtTime(from || f0 * 0.95, t);
      o.frequency.exponentialRampToValueAtTime(f0, t + (from ? 0.06 : 0.03));
      o.connect(env);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    for (const [k, fq] of F.entries()) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = 6;
      const fg = ctx.createGain();
      fg.gain.value = k ? 0.5 : 1;
      env.connect(bp); bp.connect(fg); fg.connect(dest || this.musicGain);
    }
  }

  // ——— "ANALOQ" SƏS: iki azca köksüz mişar dalğası → zərflə açılıb-bağlanan alçaq-keçid
  // süzgəc → yumşaq atak/buraxılış. İstəyə görə vibrato və əvvəlki notdan sürüşmə (leqato).
  // Çılpaq üçbucaq/kvadrat osilyatorun "8-bit / arkada" tembrinin əvəzi: yarış mövzusu
  // bununla çalınır (istifadəçi rəyi: "robotik, arkada tipli olmasın").
  _synth({ f0, t, dur, g = 0.08, cutoff = 1400, attack = 0.02, release = 0.25, vibrato = 0, from = null, dest = null }) {
    const ctx = this.ctx;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 0.9;
    flt.frequency.setValueAtTime(cutoff * 2.4, t);
    flt.frequency.exponentialRampToValueAtTime(cutoff, t + Math.max(0.05, dur * 0.4));
    const env = ctx.createGain();
    const end = t + dur;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + attack);
    env.gain.setValueAtTime(g * 0.85, Math.max(t + attack, end - release * 0.4));
    env.gain.exponentialRampToValueAtTime(0.0008, end + release);
    flt.connect(env);
    env.connect(dest || this.musicGain);
    let lfoG = null;
    if (vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      lfoG = ctx.createGain();
      lfoG.gain.setValueAtTime(0, t);
      lfoG.gain.linearRampToValueAtTime(vibrato, t + Math.min(0.35, dur * 0.6)); // vibrato notun ortasında açılır
      lfo.connect(lfoG);
      lfo.start(t);
      lfo.stop(end + release + 0.05);
    }
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      if (from) {
        o.frequency.setValueAtTime(from, t);
        o.frequency.exponentialRampToValueAtTime(f0, t + 0.07);
      } else o.frequency.setValueAtTime(f0, t);
      if (lfoG) lfoG.connect(o.detune);
      o.connect(flt);
      o.start(t);
      o.stop(end + release + 0.05);
    }
  }

  // Yarış mövzusunun çıxış zənciri: yumşaq alçaq-keçid (kəskin yuxarılar yumşalır) + qısa
  // əks-səda — notlar quru və "kompüter" kimi kəsilmir, havada qalır.
  _raceBus() {
    if (this._rb) return this._rb;
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.4;
    const dl = ctx.createDelay(1);
    dl.delayTime.value = 0.268; // 112 bpm-də 8-lik nota
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    const wet = ctx.createGain(); wet.gain.value = 0.24;
    inp.connect(lp); lp.connect(this.musicGain);
    lp.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(wet); wet.connect(this.musicGain);
    this._rb = inp;
    return inp;
  }

  // "Walk" mövzusunun çıxış zənciri: hər şey YUMŞAQ ALÇAQ-KEÇİD süzgəcdən (parlaq yuxarı
  // tezliklər yoxdur) və qısa əks-sədadan keçir — isti, bir az boğuq, havalı.
  _walkBus() {
    if (this._wb) return this._wb;
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2300; lp.Q.value = 0.5;
    const dl = ctx.createDelay(1);
    dl.delayTime.value = 0.34;
    const fb = ctx.createGain(); fb.gain.value = 0.36;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    inp.connect(lp); lp.connect(this.musicGain);
    lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(this.musicGain);
    this._wb = inp;
    return inp;
  }

  // Menyu/yarış mövzusu — 3-cü variant (2026-10-06): istinad treklərinin ÖLÇÜLMÜŞ
  // xüsusiyyətlərinə görə. İlk iki variant adına görə təxmin idi (1: oynaq/şən, 2: neo-soul)
  // və rədd edildi. "Big Walk Theme (Jumping Voices)" və "Radio: Lobby" (aksfx) analiz
  // olundu (librosa; yalnız ölçmə — səs/sempl/melodiya götürülməyib):
  //   • tembr TÜND və İSTİDİR: enerjinin ~99%-i 2 kHz-dən aşağıdadır (hat/şeyker yoxdur);
  //   • nəbz zərbdən yox, SƏSLƏRDƏN gəlir (perkussiv pay 0.21): ~117 bpm-də 8-lik
  //     hecalar, minimalist — az not, çox təkrar, laylar tədricən əlavə olunur;
  //   • ton major-dur (B / Eb), amma şən deyil: yavaş harmoniya, dərin sub bas;
  //   • lobbi trekləri ~86 bpm, basın payı 34–52%, yumşaq dərin vuruş.
  // mode: 'race' → lobbi tipli (86 bpm, sub bas + isti akkordlar + seyrək səs motivi);
  //        digəri → mövzu tipli (117 bpm, pulslanan/tullanan xor səsləri, zərbsiz başlayır).
  _playStepWalk(mode, s, t, dur) {
    const M = this._walkBus();
    const semis = (root, n) => root * Math.pow(2, n / 12);
    const L = this._loopN || 0;      // 64 addımlıq dövrənin nömrəsi
    const layer = L % 8;             // laylar 0→7 yığılır, sonra yenidən seyrəlir
    const k8 = s % 8, k = s % 16;

    if (mode === 'race') {
      // ——— LOBBİ TİPİ: Eb major, 86 bpm ———
      const roots = [77.78, 65.41, 103.83, 58.27];                   // Eb, C, Ab, Bb
      const tones = [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 11], [0, 5, 7, 10]];
      const ci = Math.floor(s / 16) % 4;
      const root = roots[ci];
      const sub = root > 70 ? root / 2 : root;
      // sub bas: nöqtəli, dərin
      if (k === 0) this._tone({ type: 'sine', f0: sub, t, dur: dur * 5, g: 0.13, dest: M, attack: 0.02 });
      if (k === 6) this._tone({ type: 'sine', f0: sub, t, dur: dur * 1.6, g: 0.09, dest: M, attack: 0.02 });
      if (k === 10) this._tone({ type: 'sine', f0: semis(sub, 7), t, dur: dur * 3, g: 0.085, dest: M, attack: 0.02 });
      // yumşaq dərin vuruş + taxta toxunuşu (yuxarı tezlik yoxdur)
      if (layer >= 1) {
        if (k === 0 || k === 8) this._tone({ f0: 78, f1: 40, t, dur: 0.22, g: 0.13, dest: M });
        if (k === 6 && layer >= 3) this._tone({ f0: 70, f1: 42, t, dur: 0.16, g: 0.07, dest: M });
        if (k === 4 || k === 12) this._tone({ type: 'sine', f0: 310, f1: 210, t, dur: 0.05, g: 0.035, dest: M, attack: 0.002 });
      }
      // isti akkord layı (150–500 Hz), yavaş açılır
      if (k === 0 || k === 8) {
        for (const n of tones[ci]) {
          this._tone({ type: 'triangle', f0: semis(root * 2, n), t, dur: dur * 8.5, g: k ? 0.075 : 0.1, dest: M, attack: 0.28 });
          this._tone({ type: 'sine', f0: semis(root * 4, n), t, dur: dur * 9, g: 0.06, dest: M, attack: 0.4 });
        }
      }
      // kəsilməyən fon (kök + kvinta): notlar arasında boşluq qalmasın
      if (k === 0) for (const n of [0, 7]) this._tone({ type: 'sine', f0: semis(root * 2, n), t, dur: dur * 17, g: 0.05, dest: M, attack: 0.8 });
      // seyrək səs motivi: kvinta → oktava → nona sıçrayışları, sürüşərək
      if (layer >= 2) {
        const line = [-1, -1, 7, -1, 12, -1, -1, -1, -1, 7, -1, 14, 12, -1, -1, -1];
        const n = line[k];
        if (n >= 0) {
          const f = semis(root * 2, n);
          this._voice({ f0: f, t, dur: dur * (k === 4 || k === 12 ? 2.4 : 1.2), g: 0.2, attack: 0.05, vowel: k % 3 ? 'o' : 'u', from: this._lastVoiceF || null, dest: M });
          this._lastVoiceF = f;
        }
        if (k === 0) this._lastVoiceF = null;
      }
      return;
    }

    // ——— MÖVZU TİPİ: B major pentatonika, 117 bpm, pulslanan xor ———
    const B = 123.47; // B2
    // Hər səs öz qısa naxışını təkrarlayır; iki not arasında (kvinta/oktava) "tullanır".
    // Laylar tədricən daxil olur — musiqi yavaş-yavaş dolur.
    const V = [
      { from: 0, vow: 'a', g: 0.17, pat: [16, -1, 16, 28, -1, 16, -1, 28] },   // D#4 ↔ D#5
      { from: 1, vow: 'o', g: 0.15, pat: [-1, 19, -1, 19, 31, -1, 19, -1] },   // F#4 ↔ F#5
      { from: 2, vow: 'a', g: 0.13, pat: [21, -1, -1, 21, -1, 26, -1, -1] },  // G#4, C#5
      { from: 4, vow: 'o', g: 0.15, pat: [12, -1, -1, -1, 24, -1, -1, -1] },   // B3 ↔ B4
      { from: 5, vow: 'u', g: 0.1, pat: [-1, -1, 33, -1, -1, -1, 28, -1] },  // yuxarı əks-səda
    ];
    for (const v of V) {
      if (layer < v.from) continue;
      const n = v.pat[k8];
      if (n >= 0) this._voice({ f0: semis(B, n), t, dur: dur * 0.85, g: v.g, attack: 0.02, vowel: v.vow, dest: M });
    }
    // dərin bas: yavaş dəyişir (B – G# – E – F#), ilk dövrədən sonra girir
    if (layer >= 1 && k === 0) {
      const bass = [61.74, 51.91, 82.41, 92.5][Math.floor(s / 16) % 4];
      this._tone({ type: 'sine', f0: bass, t, dur: dur * 14, g: 0.075, dest: M, attack: 0.08 });
      this._tone({ type: 'sine', f0: bass * 2, t, dur: dur * 12, g: 0.05, dest: M, attack: 0.1 });
    }
    // sabit isti fon (B – F# – C#)
    if (k === 0) for (const n of [12, 19, 26]) this._tone({ type: 'triangle', f0: semis(B, n), t, dur: dur * 16.5, g: 0.06, dest: M, attack: 1.0 });
    // yumşaq dərin vuruş yalnız dolu hissədə
    if (layer >= 3 && (k8 === 0)) this._tone({ f0: 74, f1: 40, t, dur: 0.2, g: 0.09, dest: M });
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
    if (this.musicStyle !== 'classic') { this._playStepWalk(mode, s, t, dur); return; }
    if (mode === 'race') {
      // ——— YARIŞ: həzin, isti, "canlı" (2026-10-06, 3-cü düzəliş) ———
      // Gediş: Am9 – Fmaj7 – Dm7 – Em7, 112 bpm, sürücü dörd-vuruş kik qalır.
      // Əvvəlki variant çılpaq üçbucaq/kvadrat "pluck"larla və saat kimi dəqiq ritmlə
      // çalınırdı — istifadəçi: "robotik, arkada tipli olmasın". İndi:
      //   • bütün melodik səslər süzgəcli "analoq" sintezdir (_synth), əks-sədalı;
      //   • melodiya leqatodur: notdan-nota sürüşür, uzun notlarda vibrato açılır;
      //   • vuruşların gücü və vaxtı azca dəyişir (insan ifası kimi), hat çox zəifdir.
      const R = this._raceBus();
      const rRoots = [110, 87.31, 73.42, 82.41];                       // A, F, D, E
      const rCh = [[0, 3, 7, 10, 14], [0, 4, 7, 11], [0, 3, 7, 10], [0, 3, 7, 10]];
      const rRoot = rRoots[ci];
      const hum = () => (Math.random() - 0.5) * 0.012;                 // ±6 ms
      const vel = (v) => v * (0.88 + Math.random() * 0.24);            // ±12%
      // Zərb: dəyirmi kik, yumşaq "fırça" snare, çox zəif hat
      if (s % 4 === 0) this._tone({ f0: 118, f1: 42, t, dur: 0.2, g: vel(0.32), dest: M, attack: 0.004 });
      if (s % 8 === 4) {
        this._noise({ t: t + hum(), dur: 0.16, g: vel(0.05), type: 'bandpass', f0: 1100, q: 0.6, dest: R });
        this._tone({ type: 'sine', f0: 170, f1: 120, t, dur: 0.12, g: vel(0.07), dest: R });
      }
      if (s % 16 === 14) this._noise({ t: t + hum(), dur: 0.07, g: 0.02, type: 'bandpass', f0: 1100, q: 0.6, dest: R }); // xəyal vuruşu
      if (s % 2 === 1) this._noise({ t: t + hum(), dur: 0.04, g: vel(0.01), type: 'highpass', f0: 6000, dest: R });
      // Bas: isti, uzun; hər taktda bir dəfə oktavaya toxunur
      const bassPat = [0, -1, 0, -1, 0, -1, 12, 7];
      const bn = bassPat[s % 8];
      if (bn >= 0) {
        const bf = semis(rRoot, bn);
        this._tone({ type: 'sine', f0: bf, t, dur: dur * 1.9, g: vel(0.14), dest: M, attack: 0.012 });
        this._synth({ f0: bf, t: t + hum(), dur: dur * 1.6, g: vel(0.038), cutoff: 320, attack: 0.012, release: 0.12, dest: R });
      }
      // Sürücü nəbz: boğuq, qısa notlar (kök/kvinta) — "arpecio" yox, gitara susdurması kimi
      {
        const acc = [1, 0.45, 0.7, 0.5][s % 4];
        const pn = s % 8 === 6 ? 7 : 0;
        this._synth({ f0: semis(rRoot * 2, pn), t: t + hum(), dur: dur * 0.5, g: vel(0.022 * acc), cutoff: 620, attack: 0.006, release: 0.08, dest: R });
      }
      // Pad: geniş, yavaş açılan akkord
      if (s % 16 === 0) {
        for (const n of rCh[ci]) {
          this._synth({ f0: semis(rRoot * 2, n), t, dur: dur * 15, g: 0.017, cutoff: 780, attack: 0.9, release: 1.2, dest: R });
        }
      }
      // Melodiya (A minor; A3 = 220 Hz-dən yarımtonla): enən, leqato, vibratolu
      const MEL = [
        [19, -1, -1, 17, 15, -1, 12, -1],   // Am:  E  .  .  D  C  .  A  .
        [15, -1, -1, 12, -1, 10, 12, -1],   // F:   C  .  .  A  .  G  A  .
        [20, -1, 19, 17, -1, -1, 12, -1],   // Dm:  F  .  E  D  .  .  A  .
        [19, -1, 17, 14, -1, -1, -1, -1],   // Em:  E  .  D  B  (saxlanır)
      ];
      if (s % 2 === 0) {
        const idx = (s / 2) % 8;
        const n = MEL[ci][idx];
        if (n >= 0) {
          const answer = (this._loopN || 0) % 2 === 1;                 // ikinci keçid: oktava aşağı, sakit
          const f = semis(220, n - (answer ? 12 : 0));
          // notun uzunluğu: növbəti nota qədər (sükutlar da daxil) — aralar boş qalmır
          let len = 1;
          while (idx + len < 8 && MEL[ci][idx + len] === -1) len++;
          this._synth({
            f0: f, t: t + hum(), dur: dur * 2 * len * 0.96, g: vel(answer ? 0.045 : 0.06),
            cutoff: answer ? 1100 : 1700, attack: 0.03, release: 0.3,
            vibrato: len >= 2 ? 9 : 0, from: this._lastLeadF || null, dest: R,
          });
          this._lastLeadF = f;
        }
        if (idx === 0 && n < 0) this._lastLeadF = null;
      }
      if (s === 0) this._lastLeadF = null; // hər 8 taktda ilk not təmiz girir
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
