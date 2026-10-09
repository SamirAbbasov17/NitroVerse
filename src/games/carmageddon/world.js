// CARMAGEDDON — yuxarıdan baxışlı (top-down) gəzinti mühərriki.
// Dünya = bir xəritə şəkli + toqquşma fiqurları + varlıqlar (sakinlər, əşyalar, baxıla bilən yerlər).
// Kətan 480×270-dir, kamera oyunçunu izləyir. İdarə: oxlar / WASD, danışmaq — E / Enter / boşluq.
// Telefonda: barmağı sürüşdürəndə virtual çubuq (hər yerdən), qısa toxunuş — ora yol tapıb gedir (maneələrin
// ətrafından dolanır), sakinə/əşyaya toxunanda yanına gedib özü danışır; yaxında varlıq olanda əməl düyməsi çıxır.
// OBYEKTLƏR: toqquşma yalnız obyektin DİBİNDƏDİR (`back` — konturun yuxarıdan neçə faizi "arxa" sayılır). Arxa hissəyə
// girmək olar: onda obyekt fiqurun üstündən yenidən çəkilir (fiqur arxada qalır) və fiqurun solğun silueti görünür.
// EKRAN: kətan ekranı örtür və 16:9-dan fərqli pəncərədə kənarları kəsilir — kamera və nişanlar GÖRÜNƏN sahəyə görə
// hesablanır (bax visRect), ona görə heç nə ekrandan kənarda qalmır.
// Varlıqlar və tapşırıq məntiqi ayrıca verilir (bax camp.js).
import { drawSprite } from './sprites.js';

// Kətanın ekranda GÖRÜNƏN hissəsi (kətan koordinatında)
export function visRect(cv) {
  const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return { x0: 0, y0: 0, x1: cv.width, y1: cv.height };
  const kx = cv.width / r.width, ky = cv.height / r.height;
  return { x0: Math.max(0, -r.left) * kx, y0: Math.max(0, -r.top) * ky, x1: Math.min(cv.width, (innerWidth - r.left) * kx), y1: Math.min(cv.height, (innerHeight - r.top) * ky) };
}

const W = 480, H = 270;
const SPEED = 64, RUN = 112;   // px/s: yeriş və qaçış (Shift basılı; toxunuşda uzaq hədəfə özü qaçır)
const R = 6;                   // oyunçunun toqquşma radiusu
const REACH = 28;              // danışmaq / götürmək məsafəsi

// Çoxbucaqlı maneə (obyektin xəritədəki konturu): nöqtə içindədirsə və ya kənarına çox yaxındırsa — bağlıdır.
// Ehtiyat YANA genişdir (fiqurun yarım-eni ≈ 10 px — gövdəsi obyektin üstünə çıxmasın), ŞAQULİ dardır (ayaq obyektin
// dibinə qədər gələ bilir: arxasındakı obyekti fiqur təbii örtür, qabağındakına isə ayağı dəymir).
// Kontur obyektin görünən kənarı ilə çəkilib, ona görə ehtiyat oyunçunun tam radiusu yox, ayağının yarım-enidir.
const FEET = 3, SIDE = 10;
function boxOf(s) { if (!s.box) { const xs = s.poly.map((q) => q[0]), ys = s.poly.map((q) => q[1]); s.box = [Math.min(...xs) - SIDE, Math.min(...ys) - FEET, Math.max(...xs) + SIDE, Math.max(...ys) + FEET]; } return s.box; }
function inPoly(s, x, y) {
  const p = s.poly; boxOf(s);
  if (x < s.box[0] || y < s.box[1] || x > s.box[2] || y > s.box[3]) return false;
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi, t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / (dx * dx + dy * dy || 1)));
    const ex = (x - xi - dx * t) / SIDE, ey = (y - yi - dy * t) / FEET;
    if (ex * ex + ey * ey < 1) return true;
  }
  return inside;
}
// obyektin "dib xətti": ondan yuxarı (kiçik y) — arxa hissədir, oraya girmək olar
function baseY(s) { if (s.by == null) { const ys = s.poly.map((q) => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys); s.by = y0 + (s.back || 0) * (y1 - y0); } return s.by; }
const GRID = 8;

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
    this.dust = [];            // addım tozu
    this.speaker = null;       // indi danışan (id) — fiquru danışarkən hoppanır
    this._loop = this._loop.bind(this);
    this._kd = (e) => {
      this.shift = e.shiftKey;
      if (this.busy || this.dead) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { this.keys.add(e.code); this.goal = null; e.preventDefault(); }
      else if (['KeyE', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); this.interact(); }
    };
    this._ku = (e) => { this.shift = e.shiftKey; this.keys.delete(e.code); };
    // toxunuş / klik: ora get (yol tapılır); varlığın yaxınlığına toxunanda — onun yanına
    this.tapAt = (cx, cy) => {
      if (this.busy || this.dead) return;
      const r = this.cv.getBoundingClientRect();
      const wx = ((cx - r.left) / r.width) * W + this.camX, wy = ((cy - r.top) / r.height) * H + this.camY;
      let hit = null, best = 26;
      for (const en of this.ents) { if (en.hidden) continue; const d = Math.hypot(en.x - wx, (en.y - (en.kind === 'npc' ? 16 : 6)) - wy); if (d < best) { best = d; hit = en; } }
      this.goal = hit ? { x: hit.x, y: hit.y, ent: hit } : { x: wx, y: wy };
      this.goal.path = this._path(this.goal.x, this.goal.y);
      this.keys.clear();
    };
    // VİRTUAL ÇUBUQ (toxunuş): barmaq basılıb 10 px-dən çox sürüşəndə çubuq olur — istiqamət başlanğıc nöqtəsinə
    // görədir; sürüşmədən qaldırılan barmaq adi toxunuşdur.
    this.stick = null;
    const pad = (this.padEl = document.createElement('div')); pad.className = 'cgs__stick'; pad.innerHTML = '<i></i>'; pad.hidden = true; layer.appendChild(pad);
    const act = (this.actEl = document.createElement('button')); act.type = 'button'; act.className = 'cgs__act'; act.hidden = true; layer.appendChild(act);
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.interact(); });
    let tp = null;
    this._pd = (e) => {
      if (this.busy || this.dead || e.target.closest('button')) return;
      if (e.pointerType === 'mouse') { this.tapAt(e.clientX, e.clientY); return; }
      tp = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    };
    this._pm = (e) => {
      if (!tp || e.pointerId !== tp.id) return;
      const dx = e.clientX - tp.x, dy = e.clientY - tp.y, d = Math.hypot(dx, dy);
      if (!tp.moved && d < 10) return;
      tp.moved = true; this.goal = null;
      const lim = 46, k = Math.min(1, d / lim);
      this.stick = d > 4 ? { x: (dx / d) * k, y: (dy / d) * k } : null;
      pad.hidden = false; pad.style.left = tp.x + 'px'; pad.style.top = tp.y + 'px';
      pad.firstChild.style.transform = `translate(${(dx / (d || 1)) * Math.min(d, lim)}px, ${(dy / (d || 1)) * Math.min(d, lim)}px)`;
    };
    this._pu = (e) => {
      if (!tp || e.pointerId !== tp.id) return;
      if (!tp.moved) this.tapAt(tp.x, tp.y);
      tp = null; this.stick = null; pad.hidden = true;
    };
    this._blur = () => { this.keys.clear(); this.shift = false; this.stick = null; tp = null; pad.hidden = true; };          // pəncərə fokusdan çıxanda basılı düymə ilişib qalmasın
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('blur', this._blur);
    layer.addEventListener('pointerdown', this._pd); addEventListener('pointermove', this._pm); addEventListener('pointerup', this._pu); addEventListener('pointercancel', this._pu);
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.vis = { x0: 0, y0: 0, x1: W, y1: H };
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
      // çoxbucaqlı: yalnız dib hissəsi bağlıdır (dib xəttindən yuxarı — arxadır)
      if (s.poly) { if (y > baseY(s) - FEET && inPoly(s, x, y)) return true; }
      // dairə (çəllək, quyu, daş…): toqquşma obyektin DİBİNDƏKİ yastı ellipsdir — arxasına keçmək olur
      else if (s.r) { const ex = (x - s.cx) / (s.r + SIDE - 2), ey = (y - (s.cy + s.r * 0.3)) / (s.r * 0.5 + 3); if (ex * ex + ey * ey < 1) return true; }
      else if (x > s.x - R && x < s.x + s.w + R && y > s.y - R && y < s.y + s.h + R) return true;
    }
    for (const en of this.ents) if (en.kind === 'npc' && !en.hidden) { const ex = (x - en.x) / 17, ey = (y - en.y) / 8; if (ex * ex + ey * ey < 1) return true; }      // sakin: yandan fiqurlar üst-üstə minməsin
    return false;
  }

  // YOL TAPMA (toxunuş üçün): 8 px-lik torda enə axtarış; hədəf bağlıdırsa — ona ən yaxın çatıla bilən xana.
  // Nəticə düz xətlə görünən nöqtələrə qədər qısaldılır. Çatmaq mümkün deyilsə null.
  _path(tx, ty) {
    const S = this.def.size, N = Math.ceil(S / GRID), cell = (v) => Math.max(0, Math.min(N - 1, Math.floor(v / GRID)));
    const free = (i, j) => !this._blocked(i * GRID + GRID / 2, j * GRID + GRID / 2);
    const si = cell(this.p.x), sj = cell(this.p.y), prev = new Int32Array(N * N).fill(-1), q = [sj * N + si]; prev[q[0]] = q[0];
    let best = q[0], bd = Math.hypot(si * GRID + 4 - tx, sj * GRID + 4 - ty);
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = c % N, j = (c / N) | 0, d = Math.hypot(i * GRID + 4 - tx, j * GRID + 4 - ty);
      if (d < bd) { bd = d; best = c; }
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const k = y * N + x; if (prev[k] >= 0 || !free(x, y)) continue;
        if (a && b && (!free(i + a, j) || !free(i, j + b))) continue;      // künc kəsmək olmaz
        prev[k] = c; q.push(k);
      }
    }
    const pts = []; for (let c = best; c !== prev[c]; c = prev[c]) pts.push({ x: (c % N) * GRID + 4, y: ((c / N) | 0) * GRID + 4 });
    pts.reverse();
    if (bd < GRID && !this._blocked(tx, ty)) pts.push({ x: tx, y: ty });
    // qısaltma: görünən ən uzaq nöqtəyə birbaşa
    const los = (a, b) => { const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 3); for (let k = 1; k <= n; k++) if (this._blocked(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)) return false; return true; };
    const out = []; let cur = { x: this.p.x, y: this.p.y }, i = 0;
    while (i < pts.length) { let j = pts.length - 1; while (j > i && !los(cur, pts[j])) j--; out.push(pts[j]); cur = pts[j]; i = j + 1; }
    return out;
  }

  // ən yaxın əlçatan varlıq
  near() {
    let best = null, bd = REACH;
    for (const en of this.ents) { if (en.hidden || en.mute) continue; const d = Math.hypot(en.x - this.p.x, en.y - this.p.y) - (en.r || 0); if (d < bd) { bd = d; best = en; } }
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
    let analog = 1;
    if (!vx && !vy && this.stick) { vx = this.stick.x; vy = this.stick.y; analog = Math.max(0.45, Math.hypot(vx, vy)); this.goal = null; }
    if (!vx && !vy && this.goal) {
      const g = this.goal, dx = g.x - this.p.x, dy = g.y - this.p.y, d = Math.hypot(dx, dy);
      const stop = g.ent ? REACH - 4 + (g.ent.r || 0) : 3;
      if (d <= stop) { const en = g.ent; this.goal = null; if (en) this.interact(en); return; }
      // yol nöqtələri üzrə get (maneənin ətrafından); yol bitibsə — düz hədəfə
      while (g.path && g.path.length && Math.hypot(g.path[0].x - this.p.x, g.path[0].y - this.p.y) < 3.5) g.path.shift();
      if (g.path && g.path.length) { const w = g.path[0], wd = Math.hypot(w.x - this.p.x, w.y - this.p.y); vx = (w.x - this.p.x) / wd; vy = (w.y - this.p.y) / wd; }
      else if (g.ent || !g.path) { vx = dx / d; vy = dy / d; }
      else { this.goal = null; return; }           // yolun sonuna çatdıq (hədəfin özü bağlıdır) — dayan
      g.t = (g.t || 0) + dt;
      if (g.t > 14) this.goal = null;              // ehtiyat: çox uzun çəkirsə əl çək
    }
    const m = Math.hypot(vx, vy);
    if (!m) { this.p.walk = 0; this.p.run = false; return; }
    vx /= m; vy /= m;
    // qaçış: klaviaturada Shift; toxunuşla seçilmiş hədəf uzaqdadırsa (hədəfə çatanda yerişə keçir)
    const far = this.goal ? Math.hypot(this.goal.x - this.p.x, this.goal.y - this.p.y) : 0;
    const run = this.goal ? (this.p.run ? far > 34 : far > 84) : this.stick ? analog > 0.86 : !!this.shift;
    this.p.run = run;
    const SPD = run ? RUN : SPEED;
    this.p.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 2 : 3) : (vy < 0 ? 1 : 0);
    const nx = this.p.x + vx * SPD * dt, ny = this.p.y + vy * SPD * dt;
    let moved = false;
    if (!this._blocked(nx, this.p.y)) { this.p.x = nx; moved = true; }
    if (!this._blocked(this.p.x, ny)) { this.p.y = ny; moved = true; }
    if (moved) {
      // hər addımda ayağın dibindən kiçik toz qalxır
      const rate = run ? 6.5 : 4, st0 = Math.floor(this.p.walk * rate), st1 = Math.floor((this.p.walk + dt) * rate);
      if (st1 !== st0 && (run || st1 % 2 === 0)) for (let i = 0; i < (run ? 3 : 2); i++) this.dust.push({ x: this.p.x + (Math.random() - 0.5) * 6 - vx * 3, y: this.p.y - 1 - Math.random() * 2, a: 1, vx: -vx * 6 + (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 5 });
      this.p.walk += dt;
    } else if (this.goal) {
      // ilişdi (məs. yolu sakin kəsdi): bir dəfə yolu yenidən hesabla; yenə alınmasa dayan
      const g = this.goal; g.stuck = (g.stuck || 0) + dt;
      if (g.stuck > 0.35 && !g.retried) { g.retried = true; g.stuck = 0; g.path = this._path(g.x, g.y); }
      else if (g.stuck > 0.7) { const en = g.ent; this.goal = null; if (en && Math.hypot(en.x - this.p.x, en.y - this.p.y) < REACH * 2.2) this.interact(en); }
    }
  }

  // Gəzişən sakinlər (en.wander = radius): evinin ətrafında yavaş-yavaş yer dəyişir; oyunçu yaxındadırsa
  // və ya danışıq gedirsə dayanır.
  _wander(dt) {
    for (const en of this.ents) {
      if (!en.wander || en.hidden) continue;
      en.home ||= { x: en.x, y: en.y };
      const near = Math.hypot(this.p.x - en.x, this.p.y - en.y) < 46;
      en.wt = (en.wt ?? Math.random() * 3) - dt;
      if (this.busy || near) { en.walk = 0; continue; }
      if (en.wt <= 0) { en.wt = 1.5 + Math.random() * 3.5; const a = Math.random() * 6.283, r = Math.random() * en.wander; en.tgt = Math.random() < 0.35 ? null : { x: en.home.x + Math.cos(a) * r, y: en.home.y + Math.sin(a) * r * 0.6 }; }
      if (!en.tgt) { en.walk = 0; continue; }
      const dx = en.tgt.x - en.x, dy = en.tgt.y - en.y, d = Math.hypot(dx, dy);
      if (d < 1.5) { en.tgt = null; en.walk = 0; continue; }
      const sp = en.speed || 20, nx = en.x + (dx / d) * sp * dt, ny = en.y + (dy / d) * sp * dt;
      // maneəyə girmir (oyunçunun toqquşma yoxlaması, özü istisna)
      const self = en.kind; en.kind = 'moving';
      const free = !this._blocked(nx, ny);
      en.kind = self;
      if (!free) { en.tgt = null; en.walk = 0; continue; }
      en.x = nx; en.y = ny; en.walk = (en.walk || 0) + dt;
      en.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
    }
  }

  _loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.paused) return;                       // fasilə: dünya donur, kadr qalır
    this.t += dt;
    if (!this.busy) this._move(dt); else this.p.walk = 0;
    for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 14 * dt; d.a -= dt * 2.6; }
    while (this.dust.length && this.dust[0].a <= 0) this.dust.shift();
    this._wander(dt);
    this.hooks.onTick?.(dt, this);
    this._draw();
    // telefonda əməl düyməsi: yaxında danışmaq / baxmaq olan varlıq varsa
    if (this.touch) { const n = this.busy ? null : this.near(), k = n ? (n.kind === 'npc' ? 'talk' : 'look') : ''; if (this.actEl.dataset.k !== k) { this.actEl.dataset.k = k; this.actEl.hidden = !k; this.actEl.textContent = k === 'talk' ? '💬' : k === 'look' ? '🔍' : ''; } }
  }

  _draw() {
    const x = this.cx, S = this.def.size, p = this.p;
    // kamera GÖRÜNƏN sahənin ortasına görə; xəritənin kənarı görünən sahənin kənarına dirənir
    const v = (this.vis = visRect(this.cv));
    this.camX = Math.round(Math.max(-v.x0, Math.min(S - v.x1, p.x - (v.x0 + v.x1) / 2)));
    this.camY = Math.round(Math.max(-v.y0 - 8, Math.min(S - v.y1, p.y - (v.y0 + v.y1) / 2 - 10)));      // yuxarıda 8 px ehtiyat: xəritənin üst kənarında fiqurun başı kəsilməsin
    x.fillStyle = '#12080c'; x.fillRect(0, 0, W, H);
    x.save(); x.translate(-this.camX, -this.camY);
    x.drawImage(this.def.map, 0, 0);
    this.hooks.onDrawUnder?.(x, this);
    // dərinliyə görə sıra (aşağıdakı öndədir)
    const list = [...this.ents.filter((e) => !e.hidden), { you: true, x: p.x, y: p.y }].sort((a, b) => a.y - b.y);
    const near = this.busy ? null : this.near();
    for (const en of list) {
      if (en.you) {
        const fr = p.walk ? 2 + Math.floor(p.walk * (p.run ? 13 : 8)) % 4 : Math.floor(this.t * 1.4) % 2;
        const talk = this.speaker === 'ember' ? -Math.round(Math.abs(Math.sin(this.t * 14)) * 2) : 0;
        const py = p.y + talk - (p.run && p.walk && fr % 2 === 0 ? 1 : 0), blink = (this.t * 0.31) % 1 < 0.035;
        drawSprite(x, p.x, py, this.def.hero, p.dir, fr, blink);
        // ARXADA: fiqur obyektin dib xəttindən yuxarıdadırsa, obyekt onun üstündən yenidən çəkilir (xəritənin həmin
        // parçası kontur daxilində) və fiqurun solğun silueti qalır — oyunçu harada olduğunu itirmir
        let hid = false;
        for (const s of this.def.solids) {
          if (s.flat) continue;
          if (s.poly) {
            boxOf(s);
            if (p.y >= baseY(s) || p.x < s.box[0] - 6 || p.x > s.box[2] + 6 || p.y < s.box[1] - 2 || p.y - 46 > s.box[3]) continue;
            x.save(); x.beginPath(); s.poly.forEach(([qx, qy], i) => (i ? x.lineTo(qx, qy) : x.moveTo(qx, qy))); x.closePath(); x.clip();
          } else if (s.r) {
            const ar = s.r + 5;
            if (p.y >= s.cy + s.r * 0.3 || Math.abs(p.x - s.cx) > ar + 12 || p.y < s.cy - ar - 2) continue;
            x.save(); x.beginPath(); x.arc(s.cx, s.cy, ar, 0, 7); x.clip();
          } else continue;
          x.drawImage(this.def.map, p.x - 16, p.y - 48, 32, 52, p.x - 16, p.y - 48, 32, 52);
          x.restore(); hid = true;
        }
        if (hid) { x.globalAlpha = 0.42; drawSprite(x, p.x, py, this.def.hero, p.dir, fr, blink); x.globalAlpha = 1; }
        continue;
      }
      if (en.kind === 'npc') {
        // dayanan sakin oyunçu yaxınlaşanda üzünü ona çevirir; danışan hoppanır
        const dx = p.x - en.x, dy = p.y - en.y, d = Math.hypot(dx, dy);
        const dir = d < 60 && !en.walk ? (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0)) : (en.dir || 0);
        const fr = en.walk ? 2 + Math.floor(en.walk * 7) % 4 : Math.floor(this.t * 1.3 + (en.look.blink || 0)) % 2;
        const talk = this.speaker === en.id ? -Math.round(Math.abs(Math.sin(this.t * 14)) * 2) : 0;
        drawSprite(x, en.x, en.y + talk, en.look, dir, fr, ((this.t + (en.look.blink || 0) * 1.7) * 0.29) % 1 < 0.035);
      }
      else en.draw?.(x, en, this.t);
    }
    if (near) {             // əl çatır: sakin — danışıq köpüyü, əşya və baxış yeri — lupa (hamının üstündə çəkilir)
      const en = near;
      let top = en.y - (en.kind === 'npc' ? (en.look.kid ? 44 : 52) : 22);
      if (en.kind !== 'npc' && Math.abs(p.x - en.x) < 18 && top > p.y - 52 && top < p.y + 4) top = p.y - 56;      // Ember işarənin qabağındadırsa — başının üstünə qalxır
      const by = top + Math.round(Math.sin(this.t * 6) * 1.2), bx = Math.round(en.x);
      const I = '#12080c', A = '#ffb53a', WH = '#fff0d0', px = (dx, dy, w, h, c) => { x.fillStyle = c; x.fillRect(bx + dx, by + dy, w, h); };
      if (en.kind === 'npc') {
        px(-6, -1, 13, 9, I); px(-7, 0, 15, 7, I); px(-6, 0, 13, 7, WH);           // köpük
        px(-4, 8, 4, 2, I); px(-4, 10, 2, 1, I); px(-3, 7, 2, 2, WH);                                      // quyruq
        const d = Math.floor(this.t * 3) % 4; for (let i = 0; i < 3; i++) px(-4 + i * 4, 2 + (d === i ? -1 : 0), 2, 2, d === i ? A : I);   // üç nöqtə (yazır kimi)
      } else {
        px(-5, -2, 7, 9, I); px(-6, -1, 9, 7, I); px(-4, -1, 5, 7, A); px(-5, 0, 7, 5, A); px(-3, 0, 3, 5, WH); px(-4, 1, 5, 3, WH); px(-3, 1, 1, 1, '#ffffff');   // şüşə və çərçivə
        px(2, 5, 3, 3, I); px(3, 6, 3, 3, I); px(4, 7, 3, 3, I); px(3, 6, 1, 1, A); px(4, 7, 1, 1, A); px(5, 8, 1, 1, A);                                       // dəstək
      }
    }
    for (const d of this.dust) { x.fillStyle = `rgba(214,170,110,${Math.max(0, d.a * 0.8).toFixed(2)})`; x.fillRect(Math.round(d.x), Math.round(d.y), 2, 2); }
    this.hooks.onDrawOver?.(x, this);
    x.restore();
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('blur', this._blur);
    this.layer.removeEventListener('pointerdown', this._pd); removeEventListener('pointermove', this._pm); removeEventListener('pointerup', this._pu); removeEventListener('pointercancel', this._pu);
    this.padEl.remove(); this.actEl.remove();
  }
}
