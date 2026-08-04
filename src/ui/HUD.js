import { formatTime } from '../race/RaceManager.js';
import { t } from '../core/i18n.js';

const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');

// Oyun içi HUD: sürət, dövrə, mövqe, vaxt, minimap, geri sayım, pauza.
export class HUD {
  constructor(root, { mode, totalLaps, trackPoints, branchLines = [], curbColor = 0x34e0ff, canRestart = true, onResume, onRestart, onQuit, onLobby = null, onRescue }) {
    this.root = root;
    this.mode = mode;
    this.totalLaps = totalLaps;
    this.curbColor = curbColor;
    this.canRestart = canRestart;
    this.onResume = onResume;
    this.onRestart = onRestart;
    this.onQuit = onQuit;
    this.onLobby = onLobby;
    this.onRescue = onRescue;

    this._branchLines = branchLines;
    this._computeMap(trackPoints);
    this._build();
  }

  _build() {
    const raceChips = this.mode === 'race'
      ? `
        <div class="hud-chip"><div class="hud-chip__label">Dövrə</div><div class="hud-chip__value" id="hud-lap">1<small>/${this.totalLaps}</small></div></div>
        <div class="hud-chip"><div class="hud-chip__label">Mövqe</div><div class="hud-chip__value" id="hud-pos">–</div></div>
        <div class="hud-chip"><div class="hud-chip__label">Xal</div><div class="hud-chip__value" id="hud-score">0</div></div>`
      : '';
    this.root.innerHTML = `
      <div class="hud">
        <div class="hud__topleft">
          ${raceChips}
          <div class="hud-chip"><div class="hud-chip__label">Vaxt</div><div class="hud-chip__value" id="hud-time">0:00.00</div></div>
        </div>
        <canvas id="minimap" width="164" height="164"></canvas>
        <div class="hud__item" id="hud-item">
          <div class="hud__item-icon" id="hud-item-icon"></div>
          <div class="hud__item-key">E</div>
          <div class="hud__item-x" title="Ability-ni at">X</div>
        </div>
        <div class="hud__item2" id="hud-item2" title="R — slotlar arası keçid">
          <div class="hud__item2-icon" id="hud-item2-icon"></div>
          <div class="hud__item2-key">R</div>
        </div>
        <div class="hud__sig" id="hud-sig" style="display:none">
          <div class="hud__sig-icon" id="hud-sig-icon"></div>
          <div class="hud__sig-key">G</div>
          <div class="hud__sig-name" id="hud-sig-name"></div>
        </div>
        <div class="hud__gear" id="hud-gear">1</div>
        <div class="hud__speed">
          <div class="hud__speed-num" id="hud-speed">0</div>
          <div class="hud__speed-unit">km/s</div>
        </div>
        <div class="hud__missile-warn" id="hud-missile-warn">🚀 RAKET GƏLİR!</div>
        <div class="hud__hp" id="hud-hp" style="display:none"><i id="hud-hp-fill"></i></div>
        <button class="hud__rescue" id="hud-rescue">
          <span class="hud__rescue-warn">⚠</span> Yoldan çıxdın — yola qayıt <kbd>F</kbd>
        </button>
        <div id="hud-overlay"></div>
      </div>`;

    this.el = {
      lap: this.root.querySelector('#hud-lap'),
      pos: this.root.querySelector('#hud-pos'),
      time: this.root.querySelector('#hud-time'),
      speed: this.root.querySelector('#hud-speed'),
      gear: this.root.querySelector('#hud-gear'),
      overlay: this.root.querySelector('#hud-overlay'),
      sig: this.root.querySelector('#hud-sig'),
      sigIcon: this.root.querySelector('#hud-sig-icon'),
      sigName: this.root.querySelector('#hud-sig-name'),
      item: this.root.querySelector('#hud-item'),
      itemIcon: this.root.querySelector('#hud-item-icon'),
      item2: this.root.querySelector('#hud-item2'),
      item2Icon: this.root.querySelector('#hud-item2-icon'),
      rescue: this.root.querySelector('#hud-rescue'),
    };
    this.el.rescue.onclick = () => this.onRescue?.();
    this.canvas = this.root.querySelector('#minimap');
    this.ctx = this.canvas.getContext('2d');
  }

  // Slot renderi (keş yox — real DOM vəziyyəti yoxlanılır, ikon "itmir")
  _renderSlot(slotEl, iconEl, item, cacheKey) {
    if (!slotEl) return;
    if (item) {
      const key = item.id + ':' + (item.uses ?? '');
      const needsRender = this[cacheKey] !== key || iconEl.childElementCount === 0;
      if (needsRender) {
        this[cacheKey] = key;
        slotEl.classList.add('has-item');
        const count = item.uses > 0 ? `<b class="slot-count">${item.uses}</b>` : '';
        iconEl.innerHTML = (item.img
          ? `<img src="${item.img}" alt="${item.name}" draggable="false" />`
          : `<span>${item.icon}</span>`) + count;
        slotEl.title = item.name;
      }
    } else if (this[cacheKey] !== null || iconEl.childElementCount > 0) {
      this[cacheKey] = null;
      slotEl.classList.remove('has-item');
      iconEl.innerHTML = '';
    }
  }

  // Dəymə xalı: çip yenilənir + "+N" uçan yazı
  addScore(pts, total) {
    const el = this.root.querySelector('#hud-score');
    if (el) {
      el.textContent = total;
      el.classList.remove('score-bump');
      void el.offsetWidth; // animasiyanı yenidən işə sal
      el.classList.add('score-bump');
    }
    const pop = document.createElement('div');
    pop.className = 'score-pop';
    pop.textContent = '+' + pts;
    this.root.querySelector('.hud')?.appendChild(pop);
    setTimeout(() => pop.remove(), 1100);
  }

  // Can zolağı (Zavod xəritəsi)
  // İmza gücü nişanı: hazır → parlaq, işlədilib → sönük
  setSignature(ab, ready, iconURL) {
    const el = this.el.sig;
    if (!el) return;
    if (!ab) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (this._sigIcon !== iconURL) {
      this._sigIcon = iconURL;
      this.el.sigIcon.innerHTML = `<img src="${iconURL}" alt="" draggable="false" />`;
      this.el.sigName.textContent = ab.name;
      el.style.setProperty('--sig', '#' + ab.color.toString(16).padStart(6, '0'));
    }
    el.classList.toggle('is-used', !ready);
  }

  setHP(hp, max) {
    const bar = this.root.querySelector('#hud-hp');
    if (!bar) return;
    bar.style.display = '';
    const k = Math.max(0, Math.min(1, hp / max));
    const fill = bar.querySelector('#hud-hp-fill');
    fill.style.width = (k * 100) + '%';
    fill.style.background = k > 0.5 ? '#46d47e' : k > 0.25 ? '#ffb02e' : '#ff5040';
    bar.classList.remove('hp-flash');
    void bar.offsetWidth;
    if (k < 1) bar.classList.add('hp-flash');
  }

  // Gələn raket xəbərdarlığı
  setMissileWarning(visible, text = '🚀 RAKET GƏLİR!') {
    const el = this.root.querySelector('#hud-missile-warn');
    if (!el) return;
    if (visible && el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-visible', visible);
  }

  // "Yola qayıt" düyməsini göstər/gizlət — səbəb: 'offroad' | 'wrongway'
  setRescue(visible, reason = 'offroad') {
    if (this._rescueShown === visible && this._rescueReason === reason) return;
    this._rescueShown = visible;
    this._rescueReason = reason;
    if (visible) {
      this.el.rescue.innerHTML = reason === 'wrongway'
        ? '<span class="hud__rescue-warn">⛔</span> Səhv istiqamətdə gedirsən — yola qayıt <kbd>F</kbd>'
        : '<span class="hud__rescue-warn">⚠</span> Yoldan çıxdın — yola qayıt <kbd>F</kbd>';
    }
    this.el.rescue.classList.toggle('is-visible', visible);
    this.el.rescue.classList.toggle('is-wrongway', visible && reason === 'wrongway');
  }

  _computeMap(points) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of [...points, ...this._branchLines.flat()]) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    this.mapPoints = points;
    const pad = 16;
    const size = 164;
    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;
    const scale = Math.min((size - pad * 2) / spanX, (size - pad * 2) / spanZ);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    this._toMap = (x, z) => [
      size / 2 + (x - cx) * scale,
      size / 2 + (z - cz) * scale,
    ];

    // PERFORMANS: trek konturu BİR DƏFƏ offscreen kanvasa çəkilir
    // (hər kadrda 600 nöqtəlik path çəkmək əvəzinə drawImage)
    this._mapBase = document.createElement('canvas');
    this._mapBase.width = this._mapBase.height = size;
    const b = this._mapBase.getContext('2d');
    b.beginPath();
    points.forEach((p, i) => {
      const [x, y] = this._toMap(p.x, p.z);
      if (i === 0) b.moveTo(x, y); else b.lineTo(x, y);
    });
    b.closePath();
    b.lineWidth = 6;
    b.strokeStyle = 'rgba(255,255,255,0.10)';
    b.stroke();
    b.lineWidth = 2;
    b.strokeStyle = hexCss(this.curbColor);
    b.stroke();
    // Şaxə yolları — nazik, yarışəffaf
    for (const line of this._branchLines) {
      b.beginPath();
      line.forEach((p, i) => {
        const [x, y] = this._toMap(p.x, p.z);
        if (i === 0) b.moveTo(x, y); else b.lineTo(x, y);
      });
      b.lineWidth = 4;
      b.strokeStyle = 'rgba(255,255,255,0.08)';
      b.stroke();
      b.lineWidth = 1.4;
      b.globalAlpha = 0.75;
      b.strokeStyle = hexCss(this.curbColor);
      b.stroke();
      b.globalAlpha = 1;
    }
  }

  update(data) {
    if (this.el.speed) this.el.speed.textContent = data.speedKmh;
    if (this.el.gear) this.el.gear.textContent = Math.min(6, 1 + Math.floor(data.speedKmh / 42));
    if (this.el.time) this.el.time.textContent = formatTime(data.time);
    if (this.mode === 'race') {
      // innerHTML yalnız dəyər dəyişəndə yazılır — hər kadr parse etməsin
      const lapV = Math.min(data.lap, this.totalLaps);
      if (this.el.lap && this._lastLapV !== lapV) {
        this._lastLapV = lapV;
        this.el.lap.innerHTML = `${lapV}<small>/${this.totalLaps}</small>`;
      }
      if (this.el.pos) {
        if (this._lastPosV !== data.position) {
          this._lastPosV = data.position;
          this.el.pos.innerHTML = `${data.position}<small>/${data.totalCars}</small>`;
        }
        // Mövqe dəyişəndə vurğu: yüksəliş yaşıl, eniş qırmızı
        if (this._lastPos !== undefined && data.position !== this._lastPos) {
          const cls = data.position < this._lastPos ? 'pos-up' : 'pos-down';
          this.el.pos.classList.remove('pos-up', 'pos-down');
          void this.el.pos.offsetWidth;
          this.el.pos.classList.add(cls);
        }
        this._lastPos = data.position;
      }
    }
    // İki ability slotu: böyük = aktiv (E ilə işlədilir), kiçik = ehtiyat (Q ilə keçid)
    if (this.el.item) {
      const items = data.items || [];
      const idx = data.itemIdx || 0;
      const active = items[idx] || null;
      const other = items.length > 1 ? items[1 - idx] : null;
      this._renderSlot(this.el.item, this.el.itemIcon, active, '_slotA');
      this._renderSlot(this.el.item2, this.el.item2Icon, other, '_slotB');
    }
    if (this.el.speed) this.el.speed.classList.toggle('is-boosting', !!data.boosting);
    this._drawMinimap(data.cars);
  }

  _drawMinimap(cars) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 164, 164);
    ctx.drawImage(this._mapBase, 0, 0); // öncədən çəkilmiş kontur
    // Maşın nöqtələri
    if (cars) {
      for (const c of cars) {
        const [x, y] = this._toMap(c.x, c.z);
        ctx.beginPath();
        ctx.arc(x, y, c.isPlayer ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = hexCss(c.color);
        ctx.fill();
        if (c.isPlayer) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
      }
    }
  }

  showCountdown(label) {
    const go = label === 'GO';
    this.el.overlay.innerHTML = `<div class="countdown"><div class="countdown__num ${go ? 'go' : ''}">${label}</div></div>`;
    clearTimeout(this._cdT);
    this._cdT = setTimeout(() => {
      // Yalnız hələ də countdown göstərilirsə təmizlə — pauza menyusunu SİLMƏ
      if (this.el.overlay && this.el.overlay.querySelector('.countdown')) {
        this.el.overlay.innerHTML = '';
      }
    }, go ? 900 : 950);
  }

  showToast(text) {
    const host = this.root.querySelector('.hud');
    if (!host) return; // HUD artıq sökülüb (səhnədən çıxılıb)
    host.querySelectorAll('.toast').forEach((el) => el.remove()); // üst-üstə düşməsin
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    host.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  setPaused(paused) {
    if (!paused) { this.el.overlay.innerHTML = ''; return; }
    // Onlaynda "Yenidən" yoxdur — restart yalnız offline-dadır;
    // onlaynda əvəzinə "Otağa qayıt" (bağlantı qalır) təklif olunur
    const restartBtn = this.canRestart ? `<button class="btn" data-restart>${t('ui.again')}</button>` : '';
    const lobbyBtn = (!this.canRestart && this.onLobby)
      ? `<button class="btn" data-lobby>${t('pause.backRoom')}</button>` : '';
    this.el.overlay.innerHTML = `
      <div class="pause">
        <div class="screen__heading">⏸</div>
        <div class="btn-row">
          <button class="btn btn--primary" data-resume>${t('pause.resume')}</button>
          ${restartBtn}
          ${lobbyBtn}
          <button class="btn btn--ghost" data-quit>${this.canRestart ? t('pause.menu') : t('res.leaveRoom')}</button>
        </div>
      </div>`;
    this.el.overlay.querySelector('[data-resume]').onclick = () => this.onResume?.();
    const rb = this.el.overlay.querySelector('[data-restart]');
    if (rb) rb.onclick = () => this.onRestart?.();
    const lb = this.el.overlay.querySelector('[data-lobby]');
    if (lb) lb.onclick = () => this.onLobby?.();
    this.el.overlay.querySelector('[data-quit]').onclick = () => this.onQuit?.();
  }

  destroy() {
    clearTimeout(this._cdT);
    this.root.innerHTML = '';
  }
}
