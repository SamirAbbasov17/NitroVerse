// CARMAGEDDON — yuxarıdan baxışlı (top-down) gəzinti mühərriki.
// Dünya = bir xəritə şəkli + toqquşma fiqurları + varlıqlar (sakinlər, əşyalar, baxıla bilən yerlər).
// Kətan 480×270-dir, kamera oyunçunu izləyir. İdarə: oxlar / WASD, danışmaq — E / Enter / boşluq;
// telefonda ekrana toxunuş: ora yeriyir, sakinə və ya əşyaya toxunanda yanına gedib özü danışır.
// Varlıqlar və tapşırıq məntiqi ayrıca verilir (bax camp.js).
const W = 480, H = 270;
const SPEED = 64;              // px/s
const R = 6;                   // oyunçunun toqquşma radiusu
const REACH = 28;              // danışmaq / götürmək məsafəsi
const CHAR = 1.6;              // personaj miqyası — xəritədəki çadır və maşınlara uyğun boy (~29 px)

// Xəritədəki personaj (≈14×22 vahid, CHAR miqyası ilə): baş, saç, gövdə, yellənən qollar, iki kadr
// addım, göz qırpma və personaja xas detallar (look.feat): eynək, saqqal, bığ, önlük, qulaqcıq və s.
// dir: 0 aşağı (üzü bizə), 1 yuxarı (arxası), 2 sol, 3 sağ. t — vaxt (qırpma üçün).
export function drawChar(x, cx, cy, look, dir = 0, step = 0, small = false, t = 0) {
  const s = (small ? 0.8 : 1) * CHAR;
  const px = (dx, dy, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(cx + dx * s), Math.round(cy + dy * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
  const ink = '#1a0f14', f = new Set(look.feat || []), front = dir === 0, back = dir === 1, side = dir >= 2, sx = dir === 2 ? -1 : 1;
  const shade = look.shade || 'rgba(0,0,0,0.22)';
  x.fillStyle = 'rgba(20,8,10,0.3)'; x.fillRect(Math.round(cx - 5 * s), Math.round(cy - 1), Math.round(10 * s), 2);
  // ayaqlar: addımda biri qalxır
  const a = step ? 1 : 0;
  px(-3, -4, 2, 4 - a, look.legs); px(1, -4, 2, 3 + a, look.legs);
  px(-3, -1 - a, 2, 1, ink); px(1, -2 + a, 2, 1, ink);
  // gövdə (ponço enlidir)
  const wide = f.has('poncho') ? 1 : 0;
  px(-5 - wide, -11, 10 + wide * 2, 7, ink); px(-4 - wide, -10, 8 + wide * 2, 6, look.top);
  px(-4 - wide, -6, 8 + wide * 2, 1, shade);
  if (look.trim) px(-4 - wide, -7, 8 + wide * 2, 1, look.trim);
  if (f.has('apron') && front) { px(-2, -9, 4, 5, look.trim || '#c9a98a'); px(-2, -10, 1, 1, look.trim || '#c9a98a'); px(1, -10, 1, 1, look.trim || '#c9a98a'); }
  if (f.has('scarf') && !back) px(-3, -11, 6, 1, '#8a8a84');
  if (f.has('jacket') && front) px(0, -10, 1, 5, shade);
  // qollar: yeriyəndə yellənir
  if (!wide) { px(-6, -10 + a, 2, 5, ink); px(-5, -10 + a, 1, 4, look.top); px(4, -10 + (1 - a) * (step ? 1 : 0), 2, 5, ink); px(4, -10 + (1 - a) * (step ? 1 : 0), 1, 4, look.top); px(-5, -6 + a, 1, 1, look.skin); px(4, -6, 1, 1, look.skin); }
  // baş
  px(-4, -19, 8, 9, ink); px(-3, -18, 6, 7, look.skin);
  // saç
  if (back) { px(-3, -18, 6, 6, look.hair); if (look.long) px(-4, -17, 8, 9, look.hair); }
  else {
    px(-3, -18, 6, 2, look.hair);
    if (side) px(sx > 0 ? -3 : 1, -18, 2, 5, look.hair);
    if (look.long) { px(-4, -17, 1, 8, look.hair); px(3, -17, 1, 8, look.hair); if (side) px(sx > 0 ? -4 : 2, -16, 2, 8, look.hair); }
    if (f.has('afro')) { px(-5, -20, 10, 4, look.hair); px(-5, -17, 2, 4, look.hair); px(3, -17, 2, 4, look.hair); }
    // gözlər (qırpır)
    const blink = (t * 0.7 + (look.blink || 0)) % 3.2 < 0.12;
    if (!blink) { if (front) { px(-2, -15, 1, 1, ink); px(1, -15, 1, 1, ink); } else px(sx > 0 ? 1 : -2, -15, 1, 1, ink); }
    if (f.has('glasses') && front) { px(-3, -15, 2, 1, '#3a4660'); px(1, -15, 2, 1, '#3a4660'); px(-1, -15, 2, 1, ink); }
    if (f.has('moustache') && !back) px(front ? -2 : (sx > 0 ? 0 : -2), -13, front ? 4 : 2, 1, '#8a8a8a');
    if (f.has('beard') && !back) { px(-3, -13, 6, 3, '#f0f0f0'); px(-2, -10, 4, 1, '#f0f0f0'); }
    if (f.has('freckles') && front) px(-1, -14, 1, 1, '#c98a5a');
  }
  if (f.has('mohawk')) px(-1, -22, 2, 4, look.hair);
  if (f.has('goggles') && !back) { px(-3, -17, 6, 1, '#3a3430'); px(-3, -17, 2, 1, '#7ab8c8'); px(1, -17, 2, 1, '#7ab8c8'); }
  if (f.has('headphones')) { px(-5, -17, 1, 4, '#2a2a30'); px(4, -17, 1, 4, '#2a2a30'); px(-4, -20, 8, 1, '#2a2a30'); }
  if (f.has('headscarf')) { px(-4, -19, 8, 3, look.hat); px(-4, -17, 1, 5, look.hat); px(3, -17, 1, 5, look.hat); if (!back) px(3, -12, 1, 5, look.hair); }
  if (f.has('cap')) { px(-4, -20, 8, 3, look.hat); if (!back) px(side ? (sx > 0 ? 2 : -6) : -4, -17, side ? 4 : 8, 1, look.hat); }
  if (f.has('widehat')) { px(-7, -18, 14, 1, look.hat); px(-3, -21, 6, 3, look.hat); px(-3, -19, 6, 1, shade); }
  if (f.has('knit')) { px(-4, -20, 8, 3, look.hat); px(-1, -22, 2, 2, look.hat); px(-5, -17, 1, 4, look.hat); px(4, -17, 1, 4, look.hat); px(-6, -15, 1, 3, look.hair); px(5, -15, 1, 3, look.hair); }
}

export class World {
  // def: { map (şəkil), size, solids: [{x,y,w,h} | {cx,cy,r}], spawn: {x,y} }
  constructor(layer, canvas, def, hooks) {
    this.layer = layer; this.cv = canvas; this.cx = canvas.getContext('2d'); this.cx.imageSmoothingEnabled = false;
    this.def = def; this.hooks = hooks;
    this.p = { x: def.spawn.x, y: def.spawn.y, dir: 0, walk: 0 };
    this.ents = [];            // { id, x, y, kind: 'npc'|'item'|'spot', look?, small?, draw?, hidden?, r? }
    this.keys = new Set();
    this.goal = null;          // toxunuşla seçilmiş hədəf { x, y, ent? }
    this.busy = false;         // dialoq gedir — hərəkət dayanır
    this.t = 0;
    this._loop = this._loop.bind(this);
    this._kd = (e) => {
      if (this.busy || this.dead) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { this.keys.add(e.code); this.goal = null; e.preventDefault(); }
      else if (['KeyE', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); this.interact(); }
    };
    this._ku = (e) => this.keys.delete(e.code);
    this._tap = (e) => {
      if (this.busy || this.dead || e.target.closest('button')) return;
      const r = this.cv.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H;
      const wx = sx + this.camX, wy = sy + this.camY;
      // toxunulan yerin yaxınlığındakı varlıq (barmaq üçün geniş hədəf)
      let hit = null, best = 26;
      for (const en of this.ents) { if (en.hidden) continue; const d = Math.hypot(en.x - wx, (en.y - (en.kind === 'npc' ? 14 : 6)) - wy); if (d < best) { best = d; hit = en; } }
      this.goal = hit ? { x: hit.x, y: hit.y, ent: hit } : { x: wx, y: wy };
      this.keys.clear();
    };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
    layer.addEventListener('pointerdown', this._tap);
    this.camX = 0; this.camY = 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._loop);
  }

  add(en) { this.ents.push(en); return en; }
  get(id) { return this.ents.find((e) => e.id === id); }

  _blocked(x, y) {
    const S = this.def.size;
    if (x < R + 2 || y < R + 12 || x > S - R - 2 || y > S - R - 2) return true;
    for (const s of this.def.solids) {
      if (s.r) { if (Math.hypot(x - s.cx, y - s.cy) < s.r + R) return true; }
      else if (x > s.x - R && x < s.x + s.w + R && y > s.y - R && y < s.y + s.h + R) return true;
    }
    for (const en of this.ents) if (en.kind === 'npc' && !en.hidden && Math.hypot(x - en.x, y - en.y) < R + 7) return true;
    return false;
  }

  // ən yaxın əlçatan varlıq
  near() {
    let best = null, bd = REACH;
    for (const en of this.ents) { if (en.hidden) continue; const d = Math.hypot(en.x - this.p.x, en.y - this.p.y) - (en.r || 0); if (d < bd) { bd = d; best = en; } }
    return best;
  }

  interact(en = this.near()) {
    // dialoqu bağlayan düymə basışı həmin anda yenidən danışığı açmasın
    if (!en || this.busy || performance.now() < (this.coolUntil || 0)) return;
    // üzünü ona çevir
    const dx = en.x - this.p.x, dy = en.y - this.p.y;
    this.p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
    this.goal = null; this.keys.clear();
    this.hooks.onInteract(en);
  }

  _move(dt) {
    let vx = 0, vy = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) vx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) vx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) vy -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) vy += 1;
    if (!vx && !vy && this.goal) {
      const g = this.goal, dx = g.x - this.p.x, dy = g.y - this.p.y, d = Math.hypot(dx, dy);
      const stop = g.ent ? REACH - 4 + (g.ent.r || 0) : 3;
      if (d <= stop) { const en = g.ent; this.goal = null; if (en) this.interact(en); return; }
      vx = dx / d; vy = dy / d;
      g.t = (g.t || 0) + dt;
      if (g.t > 6) this.goal = null;               // çata bilmir (maneə) — əl çək
    }
    const m = Math.hypot(vx, vy);
    if (!m) { this.p.walk = 0; return; }
    vx /= m; vy /= m;
    this.p.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 2 : 3) : (vy < 0 ? 1 : 0);
    const nx = this.p.x + vx * SPEED * dt, ny = this.p.y + vy * SPEED * dt;
    let moved = false;
    if (!this._blocked(nx, this.p.y)) { this.p.x = nx; moved = true; }
    if (!this._blocked(this.p.x, ny)) { this.p.y = ny; moved = true; }
    if (moved) this.p.walk += dt; else if (this.goal) { this.goal.stuck = (this.goal.stuck || 0) + dt; if (this.goal.stuck > 0.7) { const en = this.goal.ent; this.goal = null; if (en && Math.hypot(en.x - this.p.x, en.y - this.p.y) < REACH * 2.2) this.interact(en); } }
  }

  _loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.busy) this._move(dt); else this.p.walk = 0;
    this.hooks.onTick?.(dt, this);
    this._draw();
  }

  _draw() {
    const x = this.cx, S = this.def.size, p = this.p;
    this.camX = Math.round(Math.max(0, Math.min(S - W, p.x - W / 2)));
    this.camY = Math.round(Math.max(0, Math.min(S - H, p.y - H / 2 - 10)));
    x.drawImage(this.def.map, this.camX, this.camY, W, H, 0, 0, W, H);
    x.save(); x.translate(-this.camX, -this.camY);
    this.hooks.onDrawUnder?.(x, this);
    // dərinliyə görə sıra (aşağıdakı öndədir)
    const list = [...this.ents.filter((e) => !e.hidden), { you: true, x: p.x, y: p.y }].sort((a, b) => a.y - b.y);
    const near = this.busy ? null : this.near();
    for (const en of list) {
      if (en.you) { drawChar(x, p.x, p.y, this.def.hero, p.dir, p.walk ? Math.floor(p.walk * 7) % 2 : 0, false, this.t); continue; }
      if (en.kind === 'npc') {
        // sakin oyunçu yaxınlaşanda üzünü ona çevirir; uşaqlar yerində hoppanır
        const dx = p.x - en.x, dy = p.y - en.y, d = Math.hypot(dx, dy);
        const dir = d < 60 ? (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0)) : (en.dir || 0);
        const bob = en.small ? -Math.round(Math.abs(Math.sin(this.t * 5 + en.x)) * 2) : 0;
        drawChar(x, en.x, en.y + bob, en.look, dir, 0, en.small, this.t + en.x);
      }
      else en.draw?.(x, en, this.t);
      if (en === near) {      // "danış / bax" işarəsi
        const by = en.y - (en.kind === 'npc' ? (en.small ? 36 : 43) : 20) + Math.round(Math.sin(this.t * 6) * 1.2);
        x.fillStyle = '#12080c'; x.fillRect(en.x - 4, by - 1, 9, 9);
        x.fillStyle = '#ffb53a'; x.fillRect(en.x - 3, by, 7, 7);
        x.fillStyle = '#12080c'; x.fillRect(en.x, by + 1, 1, 3); x.fillRect(en.x, by + 5, 1, 1);
      }
    }
    this.hooks.onDrawOver?.(x, this);
    x.restore();
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku);
    this.layer.removeEventListener('pointerdown', this._tap);
  }
}
