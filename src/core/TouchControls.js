// Mobil toxunma idarəsi — telefonda avtomatik görünür (landşaft rejimi).
// Sol: sükan ◀ ▶ · Sağ sütun: ▲ qaz (üstdə) / ▼ geri (altda),
// yanında ITEM (aktiv ability ikonu) / DRIFT, kənarda ⇆ keçid / ✕ atma.

export function isTouchDevice() {
  return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    'ontouchstart' in window;
}

export class TouchControls {
  constructor(root, input, { onPause, onUse, onUseSecond, onUseBack, onDiscard, onRescue, onCameraToggle, onSignature } = {}) {
    this.input = input;
    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.el.innerHTML = `
      <button class="tbtn tbtn--steer" data-t="left">◀</button>
      <button class="tbtn tbtn--steer" data-t="right">▶</button>
      <button class="tbtn tbtn--gas" data-t="gas">▲</button>
      <button class="tbtn tbtn--brake" data-t="brake">▼</button>
      <button class="tbtn tbtn--use" data-t="use"></button>
      <button class="tbtn tbtn--drift" data-t="drift">DRIFT</button>
      <button class="tbtn tbtn--small" data-t="swap" style="display:none"></button>
      <button class="tbtn tbtn--small tbtn--back" data-t="back" style="display:none">↩</button>
      <button class="tbtn tbtn--small tbtn--x" data-t="x" style="display:none">✕</button>
      <button class="tbtn tbtn--sig" data-t="sig" style="display:none"></button>
      <button class="tbtn tbtn--look" data-t="look">👁</button>
      <button class="tbtn tbtn--look" data-t="fpv" style="display:none">🎥</button>
      <button class="tbtn tbtn--rescue" data-t="rescue" disabled>🚩</button>
      <button class="tbtn touch__pause" data-t="pause">⏸</button>
    `;
    root.appendChild(this.el);
    // HUD-u mobil düzülüşə keçir
    root.querySelector('.hud')?.classList.add('touch-mode');

    const t = input.touch;
    // POINTER CAPTURE: barmaq düymədən sürüşüb çıxsa belə giriş KƏSİLMİR —
    // yalnız barmaq qaldırılanda buraxılır ("basıram amma getmir" şikayətinin həlli)
    const hold = (sel, on, off) => {
      const b = this.el.querySelector(sel);
      const start = (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch { /* boş */ }
        on();
        b.classList.add('is-on');
      };
      const end = () => { off(); b.classList.remove('is-on'); };
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('lostpointercapture', end);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    // CÜT DÜYMƏLƏR: barmağı qaldırmadan sürüşdürərək o biri tərəfə keçmək olur
    // (qaz↕əyləc, sol↔sağ) — sərhəd iki düymənin ortasıdır
    const pairHold = (selA, selB, valA, valB, setVal, axis) => {
      const a = this.el.querySelector(selA);
      const b = this.el.querySelector(selB);
      const update = (e) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        let onA;
        if (axis === 'x') {
          const mid = (Math.max(ra.right, rb.right) + Math.min(ra.left, rb.left)) / 2;
          onA = ra.left < rb.left ? e.clientX < mid : e.clientX >= mid;
        } else {
          const mid = (Math.max(ra.bottom, rb.bottom) + Math.min(ra.top, rb.top)) / 2;
          onA = ra.top < rb.top ? e.clientY < mid : e.clientY >= mid;
        }
        setVal(onA ? valA : valB);
        a.classList.toggle('is-on', onA);
        b.classList.toggle('is-on', !onA);
      };
      const clear = () => {
        setVal(0);
        a.classList.remove('is-on');
        b.classList.remove('is-on');
      };
      for (const btn of [a, b]) {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try { btn.setPointerCapture(e.pointerId); } catch { /* boş */ }
          update(e);
        });
        btn.addEventListener('pointermove', (e) => {
          if (btn.hasPointerCapture?.(e.pointerId)) update(e);
        });
        btn.addEventListener('pointerup', clear);
        btn.addEventListener('pointercancel', clear);
        btn.addEventListener('lostpointercapture', clear);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      }
    };
    pairHold('[data-t="gas"]', '[data-t="brake"]', 1, -1, (v) => { t.throttle = v; }, 'y');
    pairHold('[data-t="left"]', '[data-t="right"]', -1, 1, (v) => { t.steer = v; }, 'x');
    hold('[data-t="drift"]', () => { t.handbrake = true; }, () => { t.handbrake = false; });
    // 👁 basılı saxla = arxaya bax
    hold('[data-t="look"]', () => { t.lookBack = true; }, () => { t.lookBack = false; });

    const tap = (sel, cb) => {
      const b = this.el.querySelector(sel);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); cb(); });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    tap('[data-t="use"]', () => onUse?.());
    tap('[data-t="back"]', () => onUseBack?.()); // aktiv itemi ARXAYA at
    tap('[data-t="swap"]', () => onUseSecond?.()); // ikinci item birbaşa işlədilir
    tap('[data-t="x"]', () => onDiscard?.());
    tap('[data-t="rescue"]', () => onRescue?.()); // 🚩 yola qayıt (həmişə əlçatan)
    tap('[data-t="sig"]', () => onSignature?.());   // ✦ imza gücü (yarışda bir dəfə)
    tap('[data-t="pause"]', () => onPause?.());
    // 🎥 TPS/FPS keçidi — yalnız dəstəkləyən səhnələrdə görünür
    if (onCameraToggle) {
      const fb = this.el.querySelector('[data-t="fpv"]');
      fb.style.display = '';
      tap('[data-t="fpv"]', () => onCameraToggle());
    }

    this._aId = null;
    this._bId = null;
  }

  // Ability düymələrinin ikonlarını canlı yenilə.
  // Boş slot = boş çərçivə; ⇆ və ✕ yalnız mənası olanda görünür.
  // İmza gücü düyməsi — solda, nitro ölçüsündə (yarışda ən vacib düymələrdən)
  setSignature(ab, ready, iconURL) {
    const el = this.el.querySelector('[data-t="sig"]');
    if (!el) return;
    if (!ab) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (this._sigURL !== iconURL) {
      this._sigURL = iconURL;
      el.innerHTML = `<img src="${iconURL}" alt="${ab.name}" draggable="false" />`;
      el.style.setProperty('--sig', '#' + ab.color.toString(16).padStart(6, '0'));
      el.title = ab.name;
    }
    if (this._sigReady !== ready) {
      this._sigReady = ready;
      el.classList.toggle('is-used', !ready);
      el.disabled = !ready;
    }
  }

  setItems(active, other) {
    const aId = active ? active.id + ':' + (active.uses ?? '') : null;
    if (this._aId !== aId) {
      this._aId = aId;
      const el = this.el.querySelector('[data-t="use"]');
      const count = active?.uses > 0 ? `<b class="slot-count">${active.uses}</b>` : '';
      el.innerHTML = active
        ? (active.img ? `<img src="${active.img}" alt="${active.name}" draggable="false" />${count}` : active.icon + count)
        : '';
      el.classList.toggle('has-item', !!active);
      this.el.querySelector('[data-t="x"]').style.display = active ? '' : 'none';
    }
    // ↩ İKİ slotdan hər hansında arxaya atıla bilən item varsa görünür
    // (keşdən kənarda — ikinci slot dəyişəndə də yenilənsin)
    const canB = (it) => !!it && (it.id === 'missile' || it.id === 'trishot');
    const backVisible = canB(active) || canB(other);
    if (this._backVis !== backVisible) {
      this._backVis = backVisible;
      this.el.querySelector('[data-t="back"]').style.display = backVisible ? '' : 'none';
    }
    const bId = other?.id || null;
    if (this._bId !== bId) {
      this._bId = bId;
      const el = this.el.querySelector('[data-t="swap"]');
      el.innerHTML = other
        ? (other.img ? `<img src="${other.img}" alt="${other.name}" draggable="false" />` : other.icon)
        : '';
      el.classList.toggle('has-item', !!other);
      el.style.display = other ? '' : 'none';
    }
  }

  // 🚩 yalnız yoldan çıxanda aktivləşir
  setRescueEnabled(v) {
    if (this._rescueOn === v) return;
    this._rescueOn = v;
    const b = this.el.querySelector('[data-t="rescue"]');
    b.disabled = !v;
    b.classList.toggle('is-ready', v);
  }

  // Pauza/nəticə zamanı düymələri gizlət (üst-üstə düşməsin)
  setVisible(v) {
    this.el.style.display = v ? '' : 'none';
  }

  dispose() {
    this.el.remove();
    this.input.touch.steer = 0;
    this.input.touch.throttle = 0;
    this.input.touch.handbrake = false;
    this.input.touch.lookBack = false;
  }
}
