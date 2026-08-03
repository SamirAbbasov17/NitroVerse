// Waypoint izləyən AI. Trek üzərində lookahead hədəfə tərəf sükan + döngələrdə yavaşlama.
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class AIController {
  constructor(car, { skill = 0.85, laneOffset = 0 } = {}) {
    this.car = car;
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

    let drive;
    if (this._recover > 0) {
      this._recover -= dt;
      drive = { throttle: -1, steer: car.lateral > 0 ? -0.6 : 0.6, handbrake: false };
    } else {
      // Sürətə görə lookahead — METRLƏ (trek ölçüsündən asılı olmasın)
      const step = track.length / track.N;
      const aheadMeters = 9 + speed * 0.5;
      const ahead = Math.max(4, Math.round(aheadMeters / step));
      const target = track.getWaypoint(car.wpHint, ahead, this.laneOffset);
      const dx = target.x - car.position.x;
      const dz = target.z - car.position.z;
      const desired = Math.atan2(dx, dz);
      const diff = angleDiff(desired, car.heading);

      // heading -= steer konvensiyası: hədəfə çatmaq üçün əks işarə
      const steer = Math.max(-1, Math.min(1, -diff / 0.5));

      // Döngə kəskinliyinə görə qaz
      const nextTarget = track.getWaypoint(car.wpHint, ahead * 2, 0);
      const ndx = nextTarget.x - car.position.x;
      const ndz = nextTarget.z - car.position.z;
      const nextDiff = Math.abs(angleDiff(Math.atan2(ndx, ndz), car.heading));
      let throttle = 1 - Math.min(0.65, nextDiff * 0.9);
      throttle *= this.skill;
      // Yoldan çıxıbsa yavaşla
      if (!car.onRoad) throttle = Math.min(throttle, 0.55);
      throttle = Math.max(0.28, throttle);

      drive = { throttle, steer, handbrake: false };
    }

    car.update(dt, drive, track);
  }
}
