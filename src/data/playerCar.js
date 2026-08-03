// Oyunçunun seçdiyi kosmetikanı maşın datasına qoşur.
// Yalnız YERLİ oyunçuya tətbiq olunur (botlar/uzaqlar öz rənglərində qalır).
//
// GÖRÜNÜŞ QRUPU qarşılıqlı istisnadır: boya · naxışlı skin · əfsanəvi effekt —
// eyni anda yalnız biri işləyir (menyu da birini seçəndə digərlərini söndürür).
import { getCarById } from './cars.js';
import { cosmeticById, equippedCosmetics, equippedSkin, isCosmeticOwned } from './cosmetics.js';
import { auth } from '../net/Auth.js';

export function playerCarData(carId) {
  const base = getCarById(carId);
  const eq = equippedCosmetics(auth.profile);
  const pick = (id) => {
    const c = cosmeticById(id);
    if (!c || !isCosmeticOwned(id, auth.profile)) return null;
    return c;
  };
  const paint = pick(eq.paint);
  const rim = pick(eq.rim);
  const flame = pick(eq.flame);
  const cos = {};
  // stock/hex=null → maşının öz zavod rəngi və diskləri toxunulmaz qalır
  if (paint && !paint.stock && paint.hex != null) cos.paint = paint.hex;
  if (rim && !rim.stock) cos.rim = rim.hex;
  // Nitro alovu — həmişə var (standart mavi), nitro basanda görünür
  cos.flame = { hex: flame?.hex ?? 0x6fd2ff, rainbow: !!flame?.rainbow };
  // Finiş animasiyası — yarış bitəndə oynayır (bax core/FinishFx.js)
  const fin = pick(eq.finish);
  if (fin?.kind && fin.kind !== 'none') cos.finish = { kind: fin.kind, hex: fin.hex };

  // Maşına xas NAXIŞLI skin (boya dizaynı — animasiya yoxdur)
  const skinId = equippedSkin(carId, auth.profile);
  const skin = skinId ? pick(skinId) : null;
  if (skin?.pattern) {
    cos.skin = { pattern: skin.pattern, colA: skin.colA, colB: skin.colB };
    cos.paint = skin.colA; // gövdə əsas rəngə boyanır, naxış üstündən düşür
  } else if (eq.effect && eq.effect !== 'e_none') {
    // Əfsanəvi örtük (canlı, animasiyalı) — yalnız skin yoxdursa
    const fx = pick(eq.effect);
    if (fx?.kind && fx.kind !== 'none') cos.fx = { kind: fx.kind, hex: fx.hex, glow: fx.glow };
  }
  return { ...base, cosmetics: cos };
}
