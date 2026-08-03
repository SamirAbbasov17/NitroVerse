// ═══════════════════════════════════════════════════════════
// OYUN BALANSI — bütün game-feel sabitləri bir yerdə.
// Sürəti/idarəni dəyişmək istəyirsənsə, yalnız bura toxun.
// ═══════════════════════════════════════════════════════════

export const TUNING = {
  car: {
    // maxSpeed = speedMin + (stat/100) * speedRange   → 22..45 u/s
    speedMin: 22,
    speedRange: 23,
    // engineForce = engineMin + (stat/100) * engineRange
    engineMin: 19,
    engineRange: 21,
    brakeForce: 44,
    reverseMax: 13,
    // turnRate = turnMin + (stat/100) * turnRange  (rad/s)
    turnMin: 1.5,
    turnRange: 1.5,
    // latFriction = gripMin + (stat/100) * gripRange (yüksək = sürüşkən)
    gripMin: 0.80,
    gripRange: 0.15,
    drag: 0.5,
    // Əl əyləcində sürət saxlama əmsalı (kadr başına, 60fps) — yarışda drift
    // sürəti demək olar itirmir
    driftScrub: 0.987,
    // Yoldan kənar yavaşlama əmsalı (60fps-də frame başına itki payı).
    // Tarazlıq sürəti ≈ max sürətin ~40%-i: cəza hiss olunur, amma sürünmə deyil
    offRoadDamp: 0.028,
    // Yüksək sürətdə sükan həssaslığının azalması (0..1)
    highSpeedSteerDamp: 0.45,
    // Sükan ramp sürətləri
    // 5.5 idi (~180 ms gecikmə): oyunçu 60 FPS-də belə "lag" hiss edirdi.
    // 8 → ~125 ms: cavab cəld, amma yumşaqlıq qalır (ani/kəskin deyil).
    steerRampIn: 8,
    steerRampOut: 11,
    // Spidometr: göstərilən km/s = sürət × bu əmsal
    kmhFactor: 5.5,
  },

  // ————— ARENA PROFİLİ —————
  // Arena 104 m radiuslu qapalı meydandır: yarış tənzimi orada "sürüşkən və
  // ağır" hiss verir — driftdən sonra maşın tam sürətlə uçur və manevr etmək
  // olmur. Bu əmsallar BÜTÜN maşınlara (bot və oyunçu) eyni tətbiq olunur.
  arena: {
    turnMul: 1.34,      // daha iti dönmə
    // gripCap 0.86 sürüşməni ÇOX tez öldürürdü — drift "əyləc" kimi hiss
    // olunurdu. 0.93 manevri saxlayır, amma yarışdakı qədər sürüşkən deyil.
    gripCap: 0.93,
    driftScrub: 0.983,  // 1 s driftdən sonra sürət ~70% (yarışda 81%)
    speedMul: 0.90,     // kiçik meydan üçün bir az aşağı tavan
  },

  boost: {
    time: 3.0,       // nitro müddəti (s)
    engineMul: 2.4,  // mühərrik gücü vurucusu — GÜCLÜ təkan
    speedMul: 1.45,  // max sürət vurucusu — nitro real hiss olunur
  },

  items: {
    respawn: 1.8,      // qutu respawn (s) — ability-lər tez-tez çıxır
    pickupR: 2.7,      // götürmə radiusu
    missileSpeed: 95,  // raket sürəti (u/s) — hədəfi cəld tutur
    missileLife: 6,    // raket maksimum ömrü (s)
    mineLife: 25,      // minanın trekdə qalma müddəti (s)
    mineRadius: 2.2,   // minanın partlama radiusu
    hitStun: 1.6,      // raket/mina dəyəndə təsir müddəti (s)
    slipTime: 1.4,     // (istifadəsiz — köhnə yağ mexanikası)
    shieldTime: 6,     // qalxan müddəti (s)
    boltStun: 0.9,     // şimşəyin mini-stun müddəti (s)
    boltRange: 65,     // şimşəyin təsir radiusu (böyük, amma bütün xəritə yox)
    boltDelay: 1.0,
    laserPeriod: 2.4,   // lazer dövrü (s): yanıq + sönük
    laserOn: 1.1,       // aktiv qalma müddəti
    laserWarn: 0.35,    // aktivdən əvvəl narıncı xəbərdarlıq
    respawnInvuln: 2.0, // partlayışdan sonra toxunulmazlıq    // xəbərdarlıq səsi → zərbə gecikməsi (qalxana vaxt)
    trishotSpeed: 72,  // üçlü atəş güllə sürəti (u/s)
    trishotStun: 0.5,  // güllə başına KİÇİK stun (s)
    trishotLife: 1.3,  // güllə ömrü (s) — ~90m menzil
    trishotSpread: 0.05, // güllələr arası bucaq (rad)
  },
};
