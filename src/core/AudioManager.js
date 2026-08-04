// Prosedural audio sistemi — Web Audio API, heç bir xarici fayl yoxdur.
// Musiqi: chiptune/synthwave sekvenser. SFX: sintez olunmuş effektlər.
// Mühərrik: sürətə bağlı osilatorlar. Mute vəziyyəti localStorage-da qalır.
class AudioManagerImpl {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('apexMuted') === '1';
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
  sfx(name) {
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
  ];

  _startLofiFile() {
    this._lofiSynth = false; // fayl oxunmasa köhnə sintez versiyaya düşür
    const trk = AudioManagerImpl.LOFI_FILES[(this._lofiVar ?? 0) % AudioManagerImpl.LOFI_FILES.length];
    try {
      const el = new Audio(trk.src);
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
