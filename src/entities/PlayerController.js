// Oyunçu maşınını klaviatura ilə idarə edir.
export class PlayerController {
  constructor(car, input) {
    this.car = car;
    this.input = input;
    this.active = true;
  }

  update(dt, track) {
    const drive = this.active ? this.input.getDrive() : { throttle: 0, steer: 0, handbrake: true };
    this.car.update(dt, drive, track);
  }
}
