// Waypoint izləyən AI. Trek üzərində lookahead hədəfə tərəf sükan + döngələrdə yavaşlama.
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class AIController {
  constructor(car, { skill = 0.85, laneOffset = 0, brave = 1 } = {}) {
    this.car = car;
    this.brave = brave;   // çətinlik: döngədə qazı saxlama cəsarəti
    this.skill = skill;         // 0..1, throttle qabiliyyəti
    this.laneOffset = laneOffset;
    this.active = true;
    this._stuck = 0;
    this._recover = 0;
    this._startDelay = Math.random() * 0.8; // startda pilləli çıxış (tıxac olmasın)
  }

  update(dt, track) {
    if (!this.active) {
      this.car.update(dt, { throttle: 0, steer: 0, handbrake: true }, track);
      return;
    }

    const car = this.car;
    const speed = Math.abs(car.vF);

    // Pilləli start
    if (this._startDelay > 0) {
      this._startDelay -= dt;
      car.update(dt, { throttle: 0.3, steer: 0, handbrake: false }, track);
      return;
    }

    // İlişmə aşkarı → geri qaçış
    if (speed < 1.5) this._stuck += dt; else this._stuck = 0;
    if (this._stuck > 1.2) { this._recover = 0.7; this._stuck = 0; }

    // ————— YOLDAN ÇIXMA: AVTOMATİK QAYIDIŞ —————
    // Əvvəl yalnız qaz azalırdı və bot bəzən kənarda uzun müddət sürünürdü.
    // İndi mərkəz xəttinə nişan alır, sükan səlahiyyəti artır, uzun müddət
    // qayıda bilməsə yola qaytarılır (oyunçunun F düyməsi ilə eyni məntiq).
    if (!car.onRoad) this._off = (this._off || 0) + dt; else this._off = 0;
    if (this._off > 3.5) {
      this._off = 0;
      // wpHint köhnəlmiş ola bilər (maşın 40+ m kənarda) — ƏN YAXIN
      // nöqtəni tapıb ora qaytarırıq, yoxsa yenidən kənarda düşür
      // Trekin öz axtarışı (Car.update də bunu işlədir) — dəqiq və ucuz
      const ən = track.getNearest?.(car.position, car.wpHint)?.index ?? car.wpHint;
      car.wpHint = ən;
      // DİQQƏT: getWaypoint sadə obyekt qaytara bilər — `new p0.constructor`
      // Vector3 yaratmır və reset səssizcə işləmirdi (ölçüldü: qayıdış 10 s).
      const p0 = track.getWaypoint(ən, 0, 0);
      const p1 = track.getWaypoint(ən, 2, 0);
      const hədəf = car.position.clone();
      hədəf.set(p0.x, p0.y ?? car.position.y, p0.z);
      car.reset(hədəf, Math.atan2(p1.x - p0.x, p1.z - p0.z));
    }

    let drive;
    if (this._recover > 0) {
      this._recover -= dt;
      drive = { throttle: -1, steer: car.lateral > 0 ? -0.6 : 0.6, handbrake: false };
    } else {
      // Sürətə görə lookahead — METRLƏ (trek ölçüsündən asılı olmasın)
      const step = track.length / track.N;
      const aheadMeters = 9 + speed * 0.5;
      const ahead = Math.max(4, Math.round(aheadMeters / step));
      // Kənardaykən zolaq ofseti sıfırlanır — düz mərkəzə qayıdır
      const lane = this._off > 0.5 ? 0 : this.laneOffset;
      const target = track.getWaypoint(car.wpHint, ahead, lane);
      const dx = target.x - car.position.x;
      const dz = target.z - car.position.z;
      const desired = Math.atan2(dx, dz);
      const diff = angleDiff(desired, car.heading);

      // heading -= steer konvensiyası: hədəfə çatmaq üçün əks işarə
      // Kənarda sükan səlahiyyəti artır (0.5 → 0.32) ki, tez qayıtsın
      const steer = Math.max(-1, Math.min(1, -diff / (this._off > 0.5 ? 0.32 : 0.5)));

      // Döngə kəskinliyinə görə qaz
      const nextTarget = track.getWaypoint(car.wpHint, ahead * 2, 0);
      const ndx = nextTarget.x - car.position.x;
      const ndz = nextTarget.z - car.position.z;
      const nextDiff = Math.abs(angleDiff(Math.atan2(ndx, ndz), car.heading));
      // brave > 1 → döngədə daha az qaz buraxır (çətin botlar)
      const brave = this.brave || 1;
      let throttle = 1 - Math.min(0.65, nextDiff * 0.9 / brave);
      throttle *= this.skill;
      // Yoldan çıxıbsa yavaşla
      if (!car.onRoad) throttle = Math.min(throttle, 0.55);
      throttle = Math.max(0.28, throttle);

      drive = { throttle, steer, handbrake: false };
    }

    car.update(dt, drive, track);
  }
}
