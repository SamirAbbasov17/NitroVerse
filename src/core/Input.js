// Klaviatura idarəetməsi. Davamlı vəziyyət (getDrive) + diskret düymələr (bind).
const DRIVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
]);

export class Input {
  constructor() {
    this.down = new Set();
    this.binds = new Map(); // code -> [callbacks]
    this.enabled = true;
    // Mobil toxunma idarəsi (TouchControls yazır, getDrive birləşdirir)
    this.touch = { steer: 0, throttle: 0, handbrake: false, lookBack: false };

    this._onKeyDown = (e) => {
      // Mətn sahəsində yazarkən oyun idarəsi qarışmasın (məs. ad daxil edərkən W/A/S/D)
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (DRIVE_KEYS.has(e.code)) e.preventDefault();
      if (this.down.has(e.code)) return; // repeat-ları at
      this.down.add(e.code);
      const cbs = this.binds.get(e.code);
      if (cbs && this.enabled) cbs.forEach((cb) => cb());
    };
    this._onKeyUp = (e) => {
      this.down.delete(e.code);
    };
    this._onBlur = () => this.down.clear();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  // Diskret düymə üçün callback (məs. pauza, restart)
  bind(code, cb) {
    if (!this.binds.has(code)) this.binds.set(code, []);
    this.binds.get(code).push(cb);
  }

  isDown(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  // Sürmə vəziyyəti (klaviatura + toxunma birləşir)
  getDrive() {
    if (!this.enabled) return { throttle: 0, steer: 0, handbrake: false };
    const up = this.isDown('ArrowUp', 'KeyW');
    const dn = this.isDown('ArrowDown', 'KeyS');
    const lf = this.isDown('ArrowLeft', 'KeyA');
    const rt = this.isDown('ArrowRight', 'KeyD');
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    return {
      throttle: clamp((up ? 1 : 0) - (dn ? 1 : 0) + this.touch.throttle),
      steer: clamp((rt ? 1 : 0) - (lf ? 1 : 0) + this.touch.steer),
      handbrake: this.isDown('Space') || this.touch.handbrake,
    };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.binds.clear();
    this.down.clear();
  }
}
