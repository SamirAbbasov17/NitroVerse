// İqtisadiyyat: başlanğıc maşınlar, qiymətlər, mükafatlar.
// QEYD: qiymət/mükafat TƏSDİQİ server tərəfdədir (netlify/functions/auth.mjs) —
// bu fayl UI göstərişi üçündür; iki siyahı sinxron saxlanılmalıdır.

// Qonaq + yeni hesab üçün açıq olan 5 başlanğıc maşın (siniflər üzrə balanslı)
// YALNIZ 4 maşın hamıya açıqdır (istifadəçi qərarı) — qalanı qızılla alınır
// və alış üçün hesab tələb olunur. Server siyahısı ilə SİNXRON saxla
// (server/api/auth.mjs → STARTER_CARS).
export const STARTER_CARS = ['blaze', 'taxi', 'cruiser', 'ranger'];

// Kilidli maşınların qiymətləri (qızıl)
export const CAR_PRICES = {
  venom: 300,     // əvvəl başlanğıc maşını idi — indi ən ucuz alınan
  lagoon: 350,
  sunburst: 380,
  flamingo: 420,
  sequoia: 480,
  crimson: 500,
  midnight: 600,
  violetta: 700,
  frost: 900,
  titan: 400,
  cargo: 450,
  inferno: 550,
  goldrush: 650,
  interceptor: 850,
};

// Yarış mükafatı (mövqeyə görə) × dövrə sayı
export const RACE_REWARDS = [60, 40, 30, 20, 15, 10];

// ÇƏTİNLİK ƏMSALI: asanda az, çətində çox qızıl — risk/mükafat balansı
export const DIFF_GOLD = { easy: 0.6, normal: 1, hard: 1.6 };

export function raceGold(position, laps, difficulty = 'normal') {
  const base = RACE_REWARDS[Math.min(position, RACE_REWARDS.length) - 1] ?? 0;
  const k = DIFF_GOLD[difficulty] ?? 1;
  return Math.round(base * Math.max(1, Math.min(5, laps)) * k);
}

export function isCarUnlocked(carId, profile) {
  if (STARTER_CARS.includes(carId)) return true;
  return !!profile?.cars?.includes(carId);
}
