// CARMAGEDDON — hekayə mətnlərinin tərcüməsi.
// Mətnlər kodda Azərbaycanca yazılır (mənbə dil); digər dillər üçün lüğət: az sətir → tərcümə
// (lang/ch1.<dil>.js, yalnız lazım olan dil yüklənir). Lüğətdə olmayan sətir Azərbaycanca qalır.
// Xüsusi isimlər (Ember, Milo, Hearth, The Syndicate, Hush, baronlar) tərcümə olunmur.
// Tam əhatəni tests/carmageddon-i18n.spec.js yoxlayır.
let dict = null;
const LOADERS = { en: () => import('./lang/ch1.en.js'), ru: () => import('./lang/ch1.ru.js'), tr: () => import('./lang/ch1.tr.js') };
export async function loadDict(lang) {
  dict = null;
  // lüğət yüklənməsə bütün hekayə Azərbaycanca çıxardı — bir dəfə də cəhd et (zəif şəbəkə), alınmasa konsola yaz
  for (let i = 0; i < 2 && LOADERS[lang] && !dict; i++) { try { dict = (await LOADERS[lang]()).default; } catch (e) { dict = null; if (i) console.error('Carmageddon: lüğət yüklənmədi —', lang, e); } }
}
// Tərcüməsi tapılmayan sətirlər (başqa dildə Azərbaycanca çıxacaqdı) — tests/carmageddon-lang-run.spec.js bunları tutur
export const missed = new Set();
export function T(az, vars = null) {
  if (dict && !(az in dict)) missed.add(az);
  let s = (dict && dict[az]) || az;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

if (import.meta.env?.DEV) window.__cgMissed = missed;
