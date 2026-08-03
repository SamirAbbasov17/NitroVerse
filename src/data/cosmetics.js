// Kosmetik mağaza: boya · disk · nitro alovu · drift tüstüsü.
// QEYD: qiymət təsdiqi SERVER tərəfdədir (server/api/auth.mjs) —
// bu fayl UI göstərişi üçündür, iki siyahı sinxron saxlanılmalıdır.
// Kosmetika oyun balansına TOXUNMUR — yalnız görünüş (pay-to-win yoxdur).

// ————— BOYA: istənilən maşına tətbiq olunur —————
// hex: null → maşının öz zavod rəngi saxlanılır (hər maşında fərqlidir).
export const PAINTS = [
  { id: 'p_stock', name: 'Zavod rəngi', hex: null, price: 0, stock: true },
  { id: 'p_racered', name: 'Yarış qırmızısı', hex: 0xe0342c, price: 120 },
  { id: 'p_midnight', name: 'Gecə mavisi', hex: 0x1e3a8a, price: 120 },
  { id: 'p_mint', name: 'Nanə', hex: 0x38d9a9, price: 120 },
  { id: 'p_sand', name: 'Səhra qumu', hex: 0xd9a441, price: 120 },
  { id: 'p_plum', name: 'Gavalı', hex: 0x7c3aed, price: 160 },
  { id: 'p_coral', name: 'Mərcan', hex: 0xff6b6b, price: 160 },
  { id: 'p_forest', name: 'Meşə', hex: 0x1f7a44, price: 160 },
  { id: 'p_ice', name: 'Buz', hex: 0xa8e6ff, price: 200 },
  { id: 'p_carbon', name: 'Karbon', hex: 0x23262e, price: 220 },
  { id: 'p_lime', name: 'Neon yaşıl', hex: 0xa3e635, price: 240 },
  { id: 'p_magenta', name: 'Neon çəhrayı', hex: 0xff2fb9, price: 260 },
  { id: 'p_gold', name: 'Qızıl', hex: 0xffc63a, price: 400 },
  { id: 'p_chrome', name: 'Xrom', hex: 0xdfe6ef, price: 450 },
  { id: 'p_royal', name: 'Kral bənövşəyi', hex: 0x4c1d95, price: 500 },
];

// ————— DİSKLƏR: təkər rəngi —————
export const RIMS = [
  { id: 'r_stock', name: 'Zavod diskləri', hex: 0x2a2d35, price: 0, stock: true },
  { id: 'r_silver', name: 'Gümüş', hex: 0xc8ccd4, price: 90 },
  { id: 'r_gold', name: 'Qızıl disk', hex: 0xe8b04b, price: 180 },
  { id: 'r_red', name: 'Qırmızı', hex: 0xd8382f, price: 140 },
  { id: 'r_cyan', name: 'Firuzəyi', hex: 0x2ad4ff, price: 160 },
  { id: 'r_lime', name: 'Turşməzə', hex: 0xb6f13b, price: 160 },
  { id: 'r_violet', name: 'Bənövşəyi', hex: 0x9b5cff, price: 200 },
  { id: 'r_black', name: 'Mat qara', hex: 0x14161b, price: 220 },
];

// ————— NİTRO ALOVU: nitro basanda egzozdan çıxan alov —————
// (Nitro "izi" lenti geri götürüldü — oyunda yaxşı görünmürdü.)
export const FLAMES = [
  { id: 'f_stock', name: 'Standart', hex: 0x6fd2ff, price: 0, stock: true, desc: 'Mavi nitro alovu' },
  { id: 'f_ember', name: 'Köz', hex: 0xff7a2b, price: 160, desc: 'Narıncı-qırmızı od' },
  { id: 'f_toxic', name: 'Zəhər', hex: 0x8ef04a, price: 180, desc: 'Neon yaşıl alov' },
  { id: 'f_frost', name: 'Şaxta', hex: 0x9be8ff, price: 180, desc: 'Buz mavisi soyuq alov' },
  { id: 'f_magenta', name: 'Neon çəhrayı', hex: 0xff4fd0, price: 220, desc: 'Parlaq çəhrayı' },
  { id: 'f_gold', name: 'Qızıl', hex: 0xffd24a, price: 300, desc: 'İsti qızılı alov' },
  { id: 'f_rainbow', name: '🌈 Spektr', hex: 0xff4df0, rainbow: true, price: 520, desc: 'Rəngi axan spektr' },
];

// ————— FİNİŞ ANİMASİYALARI: yarışı bitirəndə oynayan qeyd effekti —————
// Oyunçunun "imza qələbəsi" — bax core/FinishFx.js
export const FINISHES = [
  { id: 'w_none', name: 'Yoxdur', kind: 'none', hex: 0x9aa3b2, price: 0, stock: true,
    desc: 'Adi finiş (yalnız konfet)' },
  { id: 'w_firering', name: '🔥 Alov dalğası', kind: 'firering', hex: 0xff6a2b, price: 350,
    desc: 'Maşından yayılan od halqaları və qığılcım' },
  { id: 'w_goldrain', name: '🪙 Qızıl yağış', kind: 'goldrain', hex: 0xffd257, price: 450,
    desc: 'Göydən tökülən qızıl parıltılar' },
  { id: 'w_pillar', name: '🔦 İşıq sütunu', kind: 'pillar', hex: 0x37b8ff, price: 550,
    desc: 'Göyə qalxan işıq sütunu və halqalar' },
  { id: 'w_starspiral', name: '✨ Ulduz burulğanı', kind: 'starspiral', hex: 0xb44bff, price: 700,
    desc: 'Spiral şəklində qalxan ulduzlar' },
  { id: 'w_fireworks', name: '🎆 Atəşfəşanlıq', kind: 'fireworks', hex: 0xff3d8a, price: 900,
    desc: 'Göydə açılan dörd rəngli partlayış' },
];

// ————— ƏFSANƏVİ EFFEKTLƏR: canlı, animasiyalı gövdə örtükləri —————
// Hər biri maşının materialını hər kadr dəyişdirir (nəbz, parıltı, rəng axını).
// Bunlar bütün maşınlara uyğun gəlir və ən bahalı kosmetikadır.
// QEYD: 'e_none' SİYAHIDA YOXDUR — aktiv örtüyə basmaq onu çıxarır.
// Daxildə 'e_none' hələ də "söndürülmüş" dəyəridir (server və playerCar).
export const EFFECTS = [
  {
    id: 'e_fire', name: '🔥 Alovlu', kind: 'fire', hex: 0xff5a1a, glow: 0xff9a2b, price: 900,
    desc: 'Gövdə od kimi nəbz vurur, arxadan qığılcım qalır',
  },
  {
    id: 'e_ice', name: '❄️ Buz', kind: 'ice', hex: 0x8fd8ff, glow: 0xdcf4ff, price: 900,
    desc: 'Şaxta örtüyü, soyuq parıltı və buz tozu',
  },
  {
    id: 'e_volt', name: '⚡ Elektrik', kind: 'volt', hex: 0x35e0ff, glow: 0xd6faff, price: 1100,
    desc: 'Cərəyan titrəyişi — qeyri-müntəzəm çaxnaşma',
  },
  {
    id: 'e_holo', name: '🌈 Holoqram', kind: 'holo', hex: 0xff4df0, glow: 0x66f0ff, price: 1400,
    desc: 'Rəng spektri gövdə boyunca axır',
  },
  {
    id: 'e_void', name: '🕳 Boşluq', kind: 'void', hex: 0x1a1030, glow: 0x7a3cff, price: 1600,
    desc: 'Qara gövdə, bənövşəyi kənar işığı',
  },
  {
    id: 'e_galaxy', name: '✨ Qalaktika', kind: 'galaxy', hex: 0x2b1b6b, glow: 0xffd9f2, price: 2000,
    desc: 'Ulduz tozu — ən nadir örtük',
  },
];

// ————— MAŞINA XAS SKİNLƏR: əl ilə çəkilmiş BOYA NAXIŞLARI —————
// Əfsanəvi örtüklərdən tam fərqli məhsul: animasiya və parıltı YOXDUR,
// yalnız iki rəngli boya dizaynı (bax core/PaintPatterns.js).
// RƏNG QAYDASI: hər iki rəng PARLAQ və AÇIQ olmalıdır. Tünd bazalar oyun
// məsafəsində qaralıb bir-birinə qarışırdı (istifadəçi rəyi) — indi hər dizaynın
// öz canlı çaları var və səkkizi səkkiz ayrı rəng ailəsindəndir.
const SKIN_DESIGNS = [
  { pattern: 'stripes', name: 'Yarış zolağı', a: 0x2f6fe0, b: 0xffffff },
  { pattern: 'sweep', name: 'Yan ox', a: 0xff4d3d, b: 0xfff2d6 },
  { pattern: 'camo', name: 'Kamuflyaj', a: 0x4e9c2a, b: 0xf7e9b5 },
  { pattern: 'checker', name: 'Şahmat lenti', a: 0x22c9d6, b: 0x10304a },
  { pattern: 'twotone', name: 'İki ton', a: 0x8a3df0, b: 0xffe14d },
  { pattern: 'flames', name: 'Alov rəsmi', a: 0x5b2fd6, b: 0xffa832 },
  { pattern: 'blocks', name: 'Piksel keçid', a: 0x1fc48c, b: 0x0d3350 },
  { pattern: 'rally', name: 'Ralli dairəsi', a: 0xff3d8b, b: 0xffffff },
];
const SKIN_PRICES = [420, 620];

// Maşın id → 2 imza dizaynı (determinist: eyni maşın həmişə eyni cütü alır)
export function carSkinsFor(carId) {
  let h = 0;
  for (let i = 0; i < carId.length; i++) h = (h * 31 + carId.charCodeAt(i)) >>> 0;
  // DİQQƏT: `h >> 5` İŞARƏLİ sürüşmədir — hash 2^31-i keçəndə (məs. 'midnight')
  // mənfi çıxır və indeks mənfi olurdu → qarajda "Skinlər" tabı ÇÖKÜRDÜ.
  // İşarəsiz sürüşmə + təhlükəsiz modul. Digər maşınlarda nəticə DƏYİŞMİR
  // (h < 2^31 üçün >> və >>> eynidir).
  const N = SKIN_DESIGNS.length;
  const mod = (n, m) => ((n % m) + m) % m;
  const iA = mod(h, N);
  const iB = mod(iA + 1 + mod(h >>> 5, N - 1), N);
  return [SKIN_DESIGNS[iA], SKIN_DESIGNS[iB]].map((d, i) => ({
    id: `sk_${carId}_${d.pattern}`,
    name: d.name,
    pattern: d.pattern,
    hex: d.a,
    glow: d.b,      // UI nümunəsində ikinci rəng kimi işlənir
    colA: d.a,
    colB: d.b,
    price: SKIN_PRICES[i],
    car: carId,
    group: 'skin',
  }));
}

export const COSMETIC_GROUPS = [
  { key: 'paint', title: 'Boya', icon: '🎨', items: PAINTS },
  { key: 'rim', title: 'Disklər', icon: '⚙️', items: RIMS },
  { key: 'flame', title: 'Nitro alovu', icon: '🔥', items: FLAMES },
  { key: 'finish', title: 'Finiş', icon: '🎆', items: FINISHES },
  { key: 'effect', title: 'Əfsanəvi', icon: '✨', items: EFFECTS },
];

// Siyahıda GÖRÜNMƏYƏN, amma daxildə işlənən dəyərlər ("söndürülmüş" halı).
// Aktiv örtüyə basmaq effekti çıxarır → bu id yazılır.
const HIDDEN = [{ id: 'e_none', name: 'Yoxdur', kind: 'none', hex: 0x9aa3b2, price: 0, group: 'effect' }];

// id → obyekt (bütün qruplar + gizli dəyərlər + maşın skinləri)
const ALL = new Map();
for (const g of COSMETIC_GROUPS) for (const it of g.items) ALL.set(it.id, { ...it, group: g.key });
for (const h of HIDDEN) ALL.set(h.id, h);

export function cosmeticById(id) {
  if (ALL.has(id)) return ALL.get(id);
  // sk_<carId>_<fx> — maşına xas skin
  if (typeof id === 'string' && id.startsWith('sk_')) {
    const carId = id.slice(3, id.lastIndexOf('_'));
    return carSkinsFor(carId).find((s) => s.id === id) || null;
  }
  return null;
}

// Pulsuz (default) elementlər hamıya açıqdır
export const FREE_COSMETICS = [...ALL.values()].filter((c) => c.price === 0).map((c) => c.id);

export function isCosmeticOwned(id, profile) {
  if (!id || FREE_COSMETICS.includes(id)) return true;
  return !!profile?.cosmetics?.includes(id);
}

// Seçilmiş kosmetika: hesabda profildən, qonaqda localStorage-dan
export function equippedCosmetics(profile) {
  const eq = profile?.equip || {};
  // skin: maşına bağlıdır → açar `skin_<carId>`

  const ls = (k) => {
    try { return localStorage.getItem('apexEquip_' + k) || null; } catch { return null; }
  };
  // Köhnə saxlamalar: `p_racered` əvvəllər pulsuz standart idi, indi zavod rəngidir
  const paint = eq.paint ?? ls('paint');
  return {
    paint: paint === 'p_racered' && !profile?.cosmetics?.includes('p_racered') ? 'p_stock' : paint,
    rim: eq.rim ?? ls('rim'),
    flame: eq.flame ?? ls('flame'),
    finish: eq.finish ?? ls('finish'),
    effect: eq.effect ?? ls('effect'),
  };
}

// Seçilmiş maşın skini (maşına görə ayrıca saxlanır)
export function equippedSkin(carId, profile) {
  const eq = profile?.equip || {};
  let ls = null;
  try { ls = localStorage.getItem('apexEquip_skin_' + carId); } catch { /* qonaq */ }
  return eq['skin_' + carId] ?? ls;
}
