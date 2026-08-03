// ————— İMZA GÜCÜ (Signature ability) —————
// Hər maşının YARIŞDA BİR DƏFƏ işlədə biləcəyi öz xüsusi gücü.
// Yoldan götürülən power-uplardan fərqlidir və onlarla qarışmır.
//
// BALANS QAYDASI: hər güc təxminən EYNİ dəyəri verir, sadəcə fərqli yolla.
// Dəyər büdcəsi ~100 vahid (aşağıdakı `budget` şərhində göstərilib) və heç biri
// rəqibə birbaşa ZƏRƏR vurmur — yalnız özünü gücləndirir və ya qısa müddət
// maneə yaradır. Beləcə güclü maşın daha da güclənmir (qartopu effekti yoxdur).
//
// mech — həyata keçirmə mexanikası (GameplayScene tanıyır):
//   surge    · sürət partlayışı (boost)
//   trail    · arxada iz qoyur (sürüşkən sahə)
//   guard    · qorunma (zərbə/raket/itələmə)
//   handling · yol tutumu / yoldan kənar cəza
//   recover  · bərpa (təmir və ya geri qayıtma)
//   agility  · manevr (tullanma / sıçrayış)
//   utility  · köməkçi (maqnit)
//   wave     · ətrafı itələyən dalğa

import { getLang } from '../core/i18n.js';
import { ABILITY_TEXT } from './abilitiesI18n.js';

export const ABILITIES = {
  // ——— SÜRƏT PARTLAYIŞI ———
  blaze: {
    name: 'Alov İzi', icon: 'flametrail', color: 0xff6a2b,
    desc: 'Güclü sürət + arxada qalan alov izi təqibçiləri sürüşdürür',
    mech: 'surge', boost: 1.6, power: 1.08, trail: { life: 4.5, slip: 1.25, color: 0xff6a2b, look: 'fire' },
  }, // budget: 60 sürət + 40 maneə
  titan: {
    name: 'Titan İtkisi', icon: 'thrust', color: 0x4a6de5,
    desc: 'Ən güclü sürət partlayışı — düz yolda sıçrayış',
    mech: 'surge', boost: 2.1, power: 1.11,
  }, // budget: 100 xalis sürət
  interceptor: {
    name: 'Təqib Rejimi', icon: 'chase', color: 0xe8ecf4,
    desc: 'Nə qədər gerisənsə, bir o qədər güclü sürət verir',
    mech: 'surge', boost: 2.0, power: 1.07, comeback: 0.18,
  }, // budget: geridəsə 110, öndədirsə 70 — bərabərləşdirici
  sunburst: {
    name: 'Gün Alovu', icon: 'flare', color: 0xffc21c,
    desc: 'Sürət partlayışı + qısa toxunulmazlıq',
    mech: 'surge', boost: 1.25, power: 1.06, guard: 2.8,
  }, // budget: 65 sürət + 35 qorunma
  // ÖLÇÜLDÜ: boost 1.6/power 1.09 ilə sürət qazancı 38–39 m idi — titan-ın
  // (100% təmiz sürət etalonu) 36 m-indən çox, üstəlik 4 s toxunulmazlıq da
  // alırdı. İndi sürət hissəsi etalonun ~2/3-ü qədərdir.

  // ——— ARXADA İZ ———
  venom: {
    name: 'Zəhər Buludu', icon: 'venom', color: 0x2e9e5b,
    desc: 'Arxada zəhərli bulud qoyur — içinə girən idarəni itirir',
    mech: 'trail', trail: { life: 7.5, slip: 1.85, color: 0x2e9e5b, wide: 1.55, look: 'cloud' },
  },
  crimson: {
    name: 'Duman Pərdəsi', icon: 'smokewall', color: 0xc21f3a,
    desc: 'Sıx duman divarı — arxadakılar həm görmür, həm sürüşür',
    mech: 'trail', trail: { life: 6.5, slip: 1.6, color: 0x8a8f99, wide: 1.65, blind: true, look: 'cloud' },
  },
  frost: {
    name: 'Buz Cığırı', icon: 'icetrail', color: 0x7fd4ff,
    desc: 'Buz cığırı qoyur və özü sürüşmədən keçir',
    mech: 'trail', trail: { life: 8.0, slip: 1.6, color: 0x7fd4ff, wide: 1.2, look: 'ice' }, grip: 7,
  },

  // ——— QORUNMA ———
  sequoia: {
    name: 'Kök Salma', icon: 'root', color: 0x2e8b3a,
    desc: 'Uzun müddət raket, yağ və şimşəkdən toxunulmaz',
    mech: 'guard', guard: 5,
  },
  cargo: {
    name: 'Ağır Yük', icon: 'anchor', color: 0x3f63d2,
    desc: 'Kütlə artır — heç kim səni itələyə və çevirə bilmir',
    mech: 'guard', anchor: 11, guard: 2.0,
  },
  midnight: {
    name: 'Kölgə Rejimi', icon: 'cloak', color: 0x38466e,
    desc: 'Raketlər səni hədəf ala bilmir — radardan itirsən',
    mech: 'guard', cloak: 14.0,
  },

  // ——— İDARƏ ———
  lagoon: {
    name: 'Dalğa Sürüşü', icon: 'wave', color: 0x21c9a8,
    desc: 'Mükəmməl yol tutumu — dönüşlərdə heç sürüşmürsən',
    mech: 'handling', grip: 8.5, boost: 1.5, power: 1.13,
  },
  ranger: {
    name: 'Hər Yerdə Yol', icon: 'allterrain', color: 0x2e8f62,
    desc: 'Yoldan kənar cəza yoxdur — qısa yollardan keç',
    mech: 'handling', offroad: 6, grip: 4, boost: 1.4, power: 1.06,
  },

  // ——— BƏRPA ———
  cruiser: {
    name: 'İkinci Nəfəs', icon: 'secondwind', color: 0xd6452c,
    desc: 'Zədəni tam təmizləyir və qısa sürət verir',
    mech: 'recover', repair: true, boost: 1.0, power: 1.07,
  },
  violetta: {
    name: 'Vaxtı Geri Al', icon: 'rewind', color: 0x8a3df0,
    desc: '3 saniyə əvvəlki mövqeyinə qayıdır — səhvi ləğv edir',
    mech: 'recover', rewind: 3.0, boost: 1.2, power: 1.10,
  },

  // ——— MANEVR ———
  flamingo: {
    name: 'Yüngül Ayaq', icon: 'leap', color: 0xff5fa2,
    desc: 'Yüksək tullanış — mina və maneələrin üstündən aşır',
    mech: 'agility', leap: 1.0, guard: 2.4, boost: 0.9, power: 1.08,
  },
  taxi: {
    name: 'Qısa Yol', icon: 'shortcut', color: 0xf7b32b,
    desc: 'Ani irəli sıçrayış — sıxlıqdan bir anda çıxırsan',
    // dash impulsu + qısa tavan qaldırması (yoxsa impuls dərhal kəsilir)
    mech: 'agility', dash: 18, boost: 0.7, power: 1.09, guard: 1.8,
  },

  // ——— KÖMƏKÇİ ———
  goldrush: {
    name: 'Qızıl Toxunuş', icon: 'magnet', color: 0xf5a53a,
    desc: 'Yaxındakı bonusları özünə çəkir',
    mech: 'utility', magnet: { time: 9, radius: 26 },
  },

  // ——— DALĞA ———
  inferno: {
    name: 'Partlayış Dalğası', icon: 'shockwave', color: 0xe8442e,
    desc: 'Ətrafdakı rəqibləri kənara itələyir — yol açır',
    mech: 'wave', wave: { radius: 19, force: 44 },
  },
};

// Seçilmiş dilə uyğun ad/izah ilə qaytarır (az əsas fayldadır)
export function abilityFor(carId) {
  const a = ABILITIES[carId];
  if (!a) return null;
  const lang = getLang();
  const tr = lang !== 'az' ? ABILITY_TEXT[lang]?.[carId] : null;
  return tr ? { ...a, name: tr[0], desc: tr[1] } : a;
}
