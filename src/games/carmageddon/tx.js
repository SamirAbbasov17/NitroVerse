// CARMAGEDDON — hekayə mətnlərinin tərcüməsi.
// Mətnlər kodda Azərbaycanca yazılır (mənbə dil); digər dillər üçün lüğət: az sətir → tərcümə
// (lang/ch1.<dil>.js, yalnız lazım olan dil yüklənir). Lüğətdə olmayan sətir Azərbaycanca qalır.
// Xüsusi isimlər (Ember, Milo, Hearth, The Syndicate, Hush, baronlar) tərcümə olunmur.
// Tam əhatəni tests/carmageddon-i18n.spec.js yoxlayır.
let dict = null;
const LOADERS = { en: () => import('./lang/ch1.en.js'), ru: () => import('./lang/ch1.ru.js'), tr: () => import('./lang/ch1.tr.js') };
export async function loadDict(lang) {
  dict = null;
  if (LOADERS[lang]) { try { dict = (await LOADERS[lang]()).default; } catch { dict = null; } }
}
export function T(az, vars = null) {
  let s = (dict && dict[az]) || az;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
