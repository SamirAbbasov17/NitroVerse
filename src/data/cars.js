// 10 maşın — Kenney Car Kit (CC0) modelləri. model: public/models/cars/<model>.glb
// bodyColor UI/minimap üçün modelin real dominant rəngidir.
// stats 0-100: topSpeed (max sürət), accel (sürətlənmə), handling (dönmə), grip (yol tutumu)
export const CARS = [
  {
    id: 'blaze',
    name: 'Blaze GT',
    class: 'Formula',
    model: 'race',
    bodyColor: 0xff6a3d,
    accentColor: 0x2b2b33,
    stats: { topSpeed: 82, accel: 76, handling: 78, grip: 70, armor: 55 },
  },
  {
    id: 'titan',
    name: 'Titan Apex',
    class: 'Hyper',
    model: 'race-future',
    bodyColor: 0x4a6de5,
    accentColor: 0x20242e,
    stats: { topSpeed: 95, accel: 83, handling: 60, grip: 66, armor: 35 },
  },
  {
    id: 'inferno',
    name: 'Inferno GT',
    class: 'Sport',
    model: 'sedan-sports',
    bodyColor: 0xe8442e,
    accentColor: 0x33111f,
    stats: { topSpeed: 84, accel: 74, handling: 74, grip: 72, armor: 50 },
  },
  {
    id: 'venom',
    name: 'Venom RS',
    class: 'Hot Hatch',
    model: 'hatchback-sports',
    bodyColor: 0x2e9e5b,
    accentColor: 0x1a1f14,
    stats: { topSpeed: 74, accel: 82, handling: 82, grip: 68, armor: 55 },
  },
  {
    id: 'cruiser',
    name: 'Red Cruiser',
    class: 'Balanced',
    model: 'sedan',
    bodyColor: 0xd6452c,
    accentColor: 0x2a1608,
    stats: { topSpeed: 72, accel: 70, handling: 76, grip: 86, armor: 75 },
  },
  {
    id: 'ranger',
    name: 'Ranger 4x4',
    class: 'Offroad',
    model: 'suv',
    bodyColor: 0x2e8f62,
    accentColor: 0x20242e,
    stats: { topSpeed: 66, accel: 64, handling: 78, grip: 96, armor: 90 },
  },
  {
    id: 'goldrush',
    name: 'Goldrush',
    class: 'Luxury',
    model: 'suv-luxury',
    bodyColor: 0xf5a53a,
    accentColor: 0x332810,
    stats: { topSpeed: 82, accel: 72, handling: 72, grip: 78, armor: 65 },
  },
  {
    id: 'cargo',
    name: 'Cargo King',
    class: 'Van',
    model: 'van',
    bodyColor: 0x3f63d2,
    accentColor: 0x0e2a33,
    stats: { topSpeed: 70, accel: 64, handling: 74, grip: 96, armor: 95 },
  },
  {
    id: 'interceptor',
    name: 'Interceptor',
    class: 'Pursuit',
    model: 'police',
    bodyColor: 0xe8ecf4,
    accentColor: 0x20242e,
    stats: { topSpeed: 88, accel: 78, handling: 70, grip: 68, armor: 40 },
  },
  {
    id: 'taxi',
    name: 'Turbo Taxi',
    class: 'City',
    model: 'taxi',
    bodyColor: 0xf7b32b,
    accentColor: 0x33280f,
    stats: { topSpeed: 76, accel: 74, handling: 80, grip: 74, armor: 60 },
  },
];

// Rəngli variantlar — eyni CC0 modellər, fərqli boya (tint materialı klonlanır)
CARS.push(
  {
    id: 'lagoon', name: 'Laguna S', class: 'Sport', model: 'sedan-sports',
    tint: 0x21c9a8, bodyColor: 0x21c9a8, accentColor: 0x0e3a33,
    kit: { wing: 'lip', skirt: true },
    stats: { topSpeed: 83, accel: 72, handling: 77, grip: 74, armor: 48 },
  },
  {
    id: 'sunburst', name: 'Sunburst', class: 'Hot Hatch', model: 'hatchback-sports',
    tint: 0xffc21c, bodyColor: 0xffc21c, accentColor: 0x4a3505,
    kit: { wing: 'spoiler', exhaust: true },
    stats: { topSpeed: 76, accel: 80, handling: 82, grip: 72, armor: 45 },
  },
  {
    id: 'flamingo', name: 'Flamingo', class: 'Sedan', model: 'sedan',
    tint: 0xff5fa2, bodyColor: 0xff5fa2, accentColor: 0x4a1029,
    kit: { wing: 'lip', skirt: true, exhaust: true },
    stats: { topSpeed: 72, accel: 66, handling: 74, grip: 78, armor: 60 },
  },
  {
    id: 'sequoia', name: 'Sequoia 4x4', class: 'Offroad', model: 'suv',
    tint: 0x2e8b3a, bodyColor: 0x2e8b3a, accentColor: 0x0f2e14,
    kit: { rails: true, bar: true },
    stats: { topSpeed: 66, accel: 62, handling: 66, grip: 88, armor: 75 },
  },
  {
    id: 'crimson', name: 'Crimson Van', class: 'Van', model: 'van',
    tint: 0xc21f3a, bodyColor: 0xc21f3a, accentColor: 0x3d0a12,
    kit: { rails: true, skirt: true },
    stats: { topSpeed: 62, accel: 58, handling: 60, grip: 84, armor: 88 },
  },
  {
    id: 'midnight', name: 'Midnight LX', class: 'Lüks', model: 'suv-luxury',
    tint: 0x232c52, bodyColor: 0x38466e, accentColor: 0x11162b,
    kit: { rails: true, exhaust: true },
    stats: { topSpeed: 78, accel: 68, handling: 70, grip: 80, armor: 68 },
  },
  {
    id: 'violetta', name: 'Violetta R', class: 'Formula', model: 'race',
    tint: 0x8a3df0, bodyColor: 0x8a3df0, accentColor: 0x2a1148,
    kit: { pods: true, wing: 'lip' },
    stats: { topSpeed: 86, accel: 79, handling: 80, grip: 68, armor: 50 },
  },
  {
    id: 'frost', name: 'Frost X', class: 'Hyper', model: 'race-future',
    tint: 0x7fd4ff, bodyColor: 0x7fd4ff, accentColor: 0x2b3a4a,
    kit: { pods: true, skirt: true },
    stats: { topSpeed: 92, accel: 86, handling: 64, grip: 68, armor: 38 },
  }
);

export const CAR_MODELS = [...new Set(CARS.map((c) => c.model))];

// Thumbnail/skin açarı — boyanmış variantlar ayrıca görüntü alır
// Thumbnail açarı: model + boya + gövdə dəsti (dəst siluetı dəyişir)
export const carSkin = (c) => c.model
  + (c.tint != null ? '@' + c.tint.toString(16) : '')
  + (c.kit ? '+' + Object.entries(c.kit).map((e) => e.join('')).join('') : '');

export function getCarById(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}
