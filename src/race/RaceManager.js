// Yarış məntiqi: geri sayım, dövrə sayımı, sıralama, vaxt, finiş.
const COUNTDOWN = 3; // saniyə (3-2-1 sonra GO)

// SEKTORLAR (nəzarət nöqtələri): trek 12 bərabər hissəyə bölünür və hissələr SIRA ilə keçilməlidir.
// Əvvəl dövrə "trekin ortasından keçdi" şərti ilə sayılırdı: yoldan kənarla başqa hissəyə kəsdirən
// və ya xətdən geri gedib qayıdan oyunçu dövrə və mövqe qazanırdı (oyunçu rəyi). İndi buraxılmış
// sektor varsa proqres orada dayanır; dövrə yalnız bütün sektorlar sıra ilə keçiləndə sayılır.
// Trekin öz qısayolları (şaxələr, t0→t1) qanunidir — üstündəki maşına aradakı sektorlar sayılır.
export const SECTORS = 12;
const secOf = (t) => Math.min(SECTORS - 1, Math.max(0, Math.floor(t * SECTORS)));

export class RaceManager {
  constructor(racers, totalLaps, track = null) {
    this.track = track;
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
      // Qriddən gələnin İLK keçidi qanunidir — yarım-dövrə qapısı açıq
      // başlamalıdır. Əks halda ilk keçid sayılmır, progress bir dövrə
      // aşağı düşür və startdan saniyələr sonra sıralama qarışırdı
      // (P1→P6 "sıçrayışı" — istifadəçi rəyi).
      r.sec = secOf(r.car.trackT ?? 0);   // sıra ilə çatdığı son sektor
      r.cut = false;                      // təsdiqlənmiş hissədən irəlidədir (sektor buraxıb)
      r._cutT = 0;
      r.maxLap = 0;
      r.progress = 0;
      r.finished = false;
      r.finishTime = 0;
      r.lapStart = 0;
      r.lastLapTime = 0;
      r.lapTimes = [];       // bitirilmiş dövrələrin vaxtı (nəticə ekranı, şəxsi rekord)
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
      const K = SECTORS, s = secOf(t);
      // Qısayol (şaxə): t0-dakı sektora çatmış maşın şaxənin üstündədirsə, t1-ə qədərki sektorlar sayılır
      if (this.track?.branches?.length) {
        const br = this.track.getBranchNearest(r.car.position)?.branch;
        if (br) {
          const s0 = secOf(br.t0), s1 = secOf(br.t1);
          const span = (s1 - s0 + K) % K, into = (r.sec - s0 + 1 + K) % K;
          if (span > 0 && into <= span) r.sec = (s1 - 1 + K) % K;
        }
      }
      let rel = (s - r.sec + K) % K;       // 0 öz sektorunda · 1 növbəti · 2…K/2 irəlidə (kəsib) · qalanı geridə
      // Botlar qəsdən kəsmir: zərbə ilə başqa hissəyə atılan bot 2 s-dən sonra olduğu yerdən davam edir
      // (yoxsa buraxdığı sektora qayıtmağı bilmir və yarışı heç vaxt bitirmir)
      const ahead = rel >= 2 && rel <= K / 2;
      r._cutT = ahead ? r._cutT + dt : 0;
      if (ahead && !r.isPlayer && !r.isRemote && r._cutT > 2) { r.sec = (s - 1 + K) % K; rel = 1; }
      if (rel === 1) {
        r.sec = s; rel = 0;
        if (s === 0) {
          // Start xəttinin keçidi — bütün sektorlar sıra ilə keçilib
          r.lap++;
          // İlk keçid (grid arxadan gəlir) — dövrə vaxtı buradan başlasın
          if (r.lap === 0 && r.maxLap === 0) r.lapStart = this.elapsed;
          if (r.lap > r.maxLap) {
            r.maxLap = r.lap;
            r.lastLapTime = this.elapsed - r.lapStart;
            r.lapTimes.push(r.lastLapTime);
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
        }
      }
      r.cut = rel >= 2 && rel <= K / 2;
      // Sıralama üçün proqres: kəsibsə təsdiqlənmiş sektorun sonunda dayanır; geridədirsə real yeri
      // (xəttin arxasına qayıdıbsa bir dövrə aşağı)
      if (rel === 0) r.progress = r.lap + t;
      else if (r.cut) r.progress = r.lap + (r.sec + 1) / K - 1e-4;
      else r.progress = r.lap + t - (s > r.sec ? 1 : 0);
    }

    this._updateStandings();

    // Bütün yarışçılar bitibsə
    if (this.racers.every((r) => r.finished) && this.state !== 'finished') {
      this.state = 'finished';
      this.onComplete?.();
    }
  }

  // Kəsmiş oyunçunun qayıtmalı olduğu yer: buraxdığı ilk sektorun başlanğıcı (trek üzrə t)
  resumeT(r) {
    return ((r.sec + 1) % SECTORS) / SECTORS;
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

  // dnf = true: yarış vaxtından əvvəl bitirildi (oyunçu uduzub bitirdi) — qalanların
  // vaxtı təxmini hesablanır (sıra üçün), amma nəticədə göstərilmir.
  forceFinishRemaining(dnf = false) {
    // Oyunçu bitəndən sonra qalan AI-ları avtomatik bitir (nəticə üçün)
    const unfinished = this.racers.filter((r) => !r.finished)
      .sort((a, b) => b.progress - a.progress);
    for (const r of unfinished) {
      r.finished = true;
      r.finishTime = this.elapsed + (this.totalLaps - r.progress) * 8;
      r.dnf = dnf;
      r.finishPos = ++this._finishOrder;
    }
    this._updateStandings();
    this.state = 'finished';
    this.onComplete?.();
  }
}

export function formatTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--';
  // yüzdəbirlərə yuvarlaqlaşdırılır (əvvəl kəsilirdi: 101.30 s "1:41.29" çıxırdı)
  const cs = Math.round(sec * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const ms = cs % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
