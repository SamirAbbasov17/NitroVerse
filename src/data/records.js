// ŞƏXSİ REKORDLAR (yarış): hər trek üçün ən yaxşı dövrə və (dövrə sayına görə) ən yaxşı yarış vaxtı.
// Bu cihazda saxlanır (localStorage `apexRecords`) — hesaba bağlı deyil.
const KEY = 'apexRecords';
const MIN_LAP = 5;   // saniyə — bundan qısa "dövrə" ölçmə xətasıdır, rekord sayılmır

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function getRecords(trackId) {
  return load()[trackId] || null;
}

// Yarışın nəticəsini rekordlarla tutuşdurur və lazım olsa yeniləyir.
// Qaytarır: { bestLap, bestLapIdx, prevLap, newLap, prevRace, newRace } (saniyə; yoxdursa null).
export function updateRecords(trackId, laps, lapTimes, total) {
  const valid = (lapTimes || []).filter((v) => isFinite(v) && v >= MIN_LAP);
  if (!trackId || !valid.length) return null;
  const all = load();
  const rec = all[trackId] || { lap: null, race: {} };
  const bestLap = Math.min(...valid);
  const out = {
    bestLap, bestLapIdx: lapTimes.indexOf(bestLap),
    prevLap: rec.lap, newLap: rec.lap == null || bestLap < rec.lap - 0.004,
    prevRace: rec.race?.[laps] ?? null, newRace: false,
  };
  if (out.newLap) rec.lap = +bestLap.toFixed(3);
  // yarış rekordu yalnız bütün dövrələr tam bitibsə
  if (isFinite(total) && total > 0 && valid.length === laps) {
    out.newRace = out.prevRace == null || total < out.prevRace - 0.004;
    if (out.newRace) { rec.race = rec.race || {}; rec.race[laps] = +total.toFixed(3); }
  }
  if (out.newLap || out.newRace) {
    all[trackId] = rec;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* gizli rejim */ }
  }
  return out;
}
