// Uzaq (şəbəkə) oyunçunun maşını — SNAPSHOT İNTERPOLYASİYASI.
// Paketlər vaxt damğası ilə bufferə yığılır; maşın kiçik gecikmə ilə
// iki paket ARASINDA xətti hərəkət etdirilir → titrəmə yoxdur.
const DELAY = 0.15;       // render gecikməsi (s) — ~2 paket intervalı
const MAX_EXTRAP = 0.25;  // paket itkisində maksimum ekstrapolyasiya (s)

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class NetworkController {
  constructor(car) {
    this.car = car;
    this.active = true; // RaceManager toxunur; interpolyasiya həmişə gedir
    this.buf = [];      // {t, x, z, h, v}
  }

  // Şəbəkədən yeni vəziyyət
  push(m) {
    this.buf.push({
      t: performance.now() / 1000,
      x: m.p[0],
      z: m.p[1],
      h: m.h,
      v: m.v || 0,
    });
    if (this.buf.length > 24) this.buf.shift();
    if (m.b) this.car.boostTimer = 0.4;   // alov görünsün
    if (m.sh) this.car.shieldTimer = 0.4; // qalxan görünsün
  }

  update(dt, track) {
    const c = this.car;
    const buf = this.buf;

    if (buf.length > 0) {
      const rt = performance.now() / 1000 - DELAY; // render vaxtı

      // rt-ni əhatə edən snapshot cütünü tap
      let a = null, b = null;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t <= rt) { a = buf[i]; b = buf[i + 1] || null; break; }
      }
      if (!a) a = buf[0]; // ilk paketlər hələ "gələcəkdədir"

      let x, z, h, v;
      if (b) {
        // İki paket arasında xətti interpolyasiya
        const span = b.t - a.t;
        const u = span > 0.0001 ? Math.min(1.3, Math.max(0, (rt - a.t) / span)) : 1;
        x = a.x + (b.x - a.x) * u;
        z = a.z + (b.z - a.z) * u;
        h = a.h + wrapAngle(b.h - a.h) * u;
        v = a.v + (b.v - a.v) * u;
      } else {
        // Paket itkisi — son istiqamətlə qısa ekstrapolyasiya
        const et = Math.max(0, Math.min(rt - a.t, MAX_EXTRAP));
        x = a.x + Math.sin(a.h) * a.v * et;
        z = a.z + Math.cos(a.h) * a.v * et;
        h = a.h;
        v = a.v;
      }

      const dist = Math.hypot(x - c.position.x, z - c.position.z);
      if (dist > 25) {
        // Çox uzaq (rescue / uzun paket itkisi) — teleport
        c.position.x = x;
        c.position.z = z;
        c.heading = h;
      } else {
        // İnterpolyasiya onsuz da hamardır — yalnız qalıq küyü söndürən cəld düzəliş
        const k = 1 - Math.exp(-dt * 18);
        c.position.x += (x - c.position.x) * k;
        c.position.z += (z - c.position.z) * k;
        c.heading += wrapAngle(h - c.heading) * k;
      }
      c.vF = v;
    }

    // Vizual
    c.root.position.copy(c.position);
    c.root.rotation.y = c.heading;
    c._spin += (c.vF * dt) / c.wheelRadius;
    for (const w of c.wheels) w.rotation.x = c._spin;
    c.boostTimer = Math.max(0, c.boostTimer - dt);
    if (c._flames) c._flames.visible = c.boostTimer > 0;
    c.shieldTimer = Math.max(0, c.shieldTimer - dt);
    c._shield.visible = c.shieldTimer > 0;

    // Trek proqresi (dövrə sayımı + canlı sıralama üçün)
    const near = track.getNearest(c.position, c.wpHint);
    c.wpHint = near.index;
    c.trackT = near.t;
    c.lateral = near.lateral;
    c.onRoad = near.onRoad;
  }
}
