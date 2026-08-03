// İqtisadiyyat: başlanğıc maşınlar, qiymətlər, mükafatlar.
// QEYD: qiymət/mükafat TƏSDİQİ server tərəfdədir (netlify/functions/auth.mjs) —
// bu fayl UI göstərişi üçündür; iki siyahı sinxron saxlanılmalıdır.

// Qonaq + yeni hesab üçün açıq olan 5 başlanğıc maşın (siniflər üzrə balanslı)
export const STARTER_CARS = ['blaze', 'taxi', 'cruiser', 'ranger', 'venom'];

// Kilidli maşınların qiymətləri (qızıl)
export const CAR_PRICES = {
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

export function raceGold(position, laps) {
  const base = RACE_REWARDS[Math.min(position, RACE_REWARDS.length) - 1] ?? 0;
  return base * Math.max(1, Math.min(5, laps));
}

export function isCarUnlocked(carId, profile) {
  if (STARTER_CARS.includes(carId)) return true;
  return !!profile?.cars?.includes(carId);
}
