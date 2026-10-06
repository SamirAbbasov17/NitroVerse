import { audio } from './AudioManager.js';

// ————— ZƏRBƏ HİSSİ —————
// Oyunçu maşını nəyəsə (maneə, rəqib, trafik) dəyəndə əks-əlaqənin hamısı burada
// yığılır və ZƏRBƏNİN GÜCÜNƏ görə miqyaslanır: səs, təmas nöqtəsində qığılcım,
// toz, gövdənin silkələnməsi, kameranın zərbə istiqamətində itələnib yay kimi
// qayıtması, telefonda titrəmə. Zəif toxunuş demək olar hiss olunmur, güclü zərbə
// ağır hiss olunur. Kamera təsadüfi titrəmir (o, partlayış üçündür) — istiqamətli
// tək itələmə + kritik sönümlü yay axıcı oxunur.
const MIN = 3;        // m/s — bundan zəif yaxınlaşma zərbə sayılmır
const FULL = 27;      // m/s — tam güc
const OMEGA = 16;     // kamera yayının tezliyi (böyük = tez qayıdır)

export class ImpactFeel {
  // soft: zen rejimi — sakit əhval pozulmasın: boğuq səs, qığılcım əvəzinə toz, kamera
  // yarı güclə itələnir, telefon yalnız güclü zərbədə titrəyir.
  constructor(effects, { soft = false } = {}) {
    this.effects = effects;
    this.soft = soft;
    this.x = 0; this.z = 0;   // kameranın yerdəyişməsi (m)
    this.vx = 0; this.vz = 0;
    this._cool = 0;
    this._scrape = 0;
  }

  // car — oyunçu maşını; (nx, nz) — maneədən maşına doğru təmas normalı;
  // closing — normal boyunca yaxınlaşma sürəti (m/s, müsbət); slide — təmas səthi
  // boyunca sürət (m/s). Qaytarır: 0..1 güc (0 = zərbə sayılmadı).
  hit(car, nx, nz, closing, slide = 0) {
    const px = car.position.x - nx * 1.3, pz = car.position.z - nz * 1.3;
    if (closing < MIN) {
      // Söykənib sürüşmə: seyrək qığılcım + xəfif cızıltı
      if (slide > 12 && this._scrape <= 0) {
        this._scrape = 0.09;
        if (!this.soft) this.effects.spawnSparks({ x: px, y: 0.45, z: pz }, nx, nz, 2, 0.5);
        audio.sfx('scrape');
      }
      return 0;
    }
    if (this._cool > 0) return 0;
    this._cool = 0.14;
    const s = Math.min(1, (closing - MIN) / (FULL - MIN));
    if (this.soft) {
      audio.sfx('bump', s);
      this.effects.spawnSmoke({ x: px, y: 0.4, z: pz });
      if (s > 0.6) this.effects.spawnSparks({ x: px, y: 0.5, z: pz }, nx, nz, 3, 0.6);
    } else {
      audio.sfx('impact', s);
      this.effects.spawnSparks({ x: px, y: 0.5, z: pz }, nx, nz, 3 + Math.round(9 * s), 0.6 + s);
      if (s > 0.35) this.effects.spawnSmoke({ x: px, y: 0.4, z: pz });
    }
    car.jolt?.(nx, nz, this.soft ? s * 0.6 : s);
    // Kamera maşının getdiyi tərəfə (maneəyə doğru) itələnir, sonra qayıdır
    const k = (3 + 14 * s) * (this.soft ? 0.5 : 1);
    this.vx -= nx * k;
    this.vz -= nz * k;
    if (s > (this.soft ? 0.6 : 0.3)) { try { navigator.vibrate?.(8 + Math.round(30 * s)); } catch { /* dəstək yoxdur */ } }
    return s;
  }

  update(dt) {
    if (this._cool > 0) this._cool -= dt;
    if (this._scrape > 0) this._scrape -= dt;
    // Kritik sönümlü yay (yarım-implisit Eyler; dt ≤ 0.05-də sabitdir)
    this.vx += (-OMEGA * OMEGA * this.x - 2 * OMEGA * this.vx) * dt;
    this.vz += (-OMEGA * OMEGA * this.z - 2 * OMEGA * this.vz) * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  // Kamera qurulandan sonra çağırılır
  apply(camera) {
    camera.position.x += this.x;
    camera.position.z += this.z;
  }
}
