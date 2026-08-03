// Yarış məntiqi: geri sayım, dövrə sayımı, sıralama, vaxt, finiş.
const COUNTDOWN = 3; // saniyə (3-2-1 sonra GO)

export class RaceManager {
  constructor(racers, totalLaps) {
    this.racers = racers;
    this.totalLaps = totalLaps;
    this.elapsed = 0;
    this.state = 'countdown'; // countdown | racing | finished
    this.countdown = COUNTDOWN;
    this._lastShown = null;

    // Callback-lar (kənardan təyin edilir)
    this.onCountdown = null;   // (label:string) => void
    this.onLap = null;         // (racer) => void
    this.onFinish = null;      // (racer, position) => void
    this.onPlayerFinish = null;
    this.onComplete = null;

    this._finishOrder = 0;

    for (const r of this.racers) {
      // Grid start xəttinin ARXASINDADIR (t≈0.98) — ilk xətt keçidi dövrə
      // sayılmasın deyə -1-dən başlayır; xətti keçəndə 0 olur.
      r.lap = (r.car.trackT ?? 0) > 0.5 ? -1 : 0;
      r.maxLap = 0;
      r.lastT = r.car.trackT ?? 0;
      r.progress = 0;
      r.finished = false;
      r.finishTime = 0;
      r.lapStart = 0;
      r.lastLapTime = 0;
      r.position = 0;
      if (r.controller) r.controller.active = false; // geri sayım vaxtı kilidli
    }
  }

  update(dt, track) {
    if (this.state === 'wait') return; // onlayn: hamı hazır olana qədər
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      const label = this.countdown <= 0 ? 'GO' : String(n);
      if (label !== this._lastShown) {
        this._lastShown = label;
        this.onCountdown?.(label);
      }
      if (this.countdown <= 0) {
        this.state = 'racing';
        for (const r of this.racers) if (r.controller) r.controller.active = true;
      }
      return;
    }

    if (this.state === 'finished') return;

    this.elapsed += dt;

    for (const r of this.racers) {
      if (r.finished) { r.progress = this.totalLaps + 1; continue; }
      const t = r.car.trackT;
      const d = t - r.lastT;

      // YARIM DÖVRƏ NƏZARƏTİ (checkpoint əvəzi):
      // Dövrə yalnız trekin ORTASINDAN keçdikdən sonra sayılır. Bunsuz
      // `trackT` sıçrayışı (yaxın maşınla toqquşma, künc kəsmə, yol öz
      // yanından keçəndə nöqtə axtarışının atlanması) saxta "geri keçid"
      // yaradırdı və oyunçunun dövrəsi AZALIRDI — rəqibləri bir dövrə
      // dalayanda mövqe geri düşürdü (istifadəçi rəyi).
      if (t > 0.35 && t < 0.75) r._half = true;

      // SİMMETRİK sayma: geri keçid lap-ı azaldır — xətt üzərində
      // geri-irəli hiyləsi ilə pulsuz dövrə qazanmaq mümkün deyil
      if (d < -0.5 && r._half) {
        r._half = false;
        // İrəli keçid (t 1→0 sıçrayışı)
        r.lap++;
        // Start xəttinin ilk keçidi (grid arxadan gəlir) — dövrə vaxtı buradan başlasın
        if (r.lap === 0 && r.maxLap === 0) r.lapStart = this.elapsed;
        if (r.lap > r.maxLap) {
          r.maxLap = r.lap;
          r.lastLapTime = this.elapsed - r.lapStart;
          r.lapStart = this.elapsed;
          if (r.lap >= this.totalLaps) {
            r.finished = true;
            r.finishTime = this.elapsed;
            r.finishPos = ++this._finishOrder;
            this.onFinish?.(r, r.finishPos);
            if (r.isPlayer) this.onPlayerFinish?.(r);
          } else {
            this.onLap?.(r);
          }
        }
      } else if (d > 0.5 && r._half) {
        // Geri keçid (t 0→1 sıçrayışı) — irəli qayıdanda yenidən sayılacaq
        r._half = false;
        r.lap--;
      }
      r.lastT = t;
      r.progress = r.lap + t;
    }

    this._updateStandings();

    // Bütün yarışçılar bitibsə
    if (this.racers.every((r) => r.finished) && this.state !== 'finished') {
      this.state = 'finished';
      this.onComplete?.();
    }
  }

  _updateStandings() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    sorted.forEach((r, i) => (r.position = i + 1));
    this.standings = sorted;
  }

  getPlayer() {
    return this.racers.find((r) => r.isPlayer);
  }

  forceFinishRemaining() {
    // Oyunçu bitəndən sonra qalan AI-ları avtomatik bitir (nəticə üçün)
    const unfinished = this.racers.filter((r) => !r.finished)
      .sort((a, b) => b.progress - a.progress);
    for (const r of unfinished) {
      r.finished = true;
      r.finishTime = this.elapsed + (this.totalLaps - r.progress) * 8;
      r.finishPos = ++this._finishOrder;
    }
    this._updateStandings();
    this.state = 'finished';
    this.onComplete?.();
  }
}

export function formatTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
