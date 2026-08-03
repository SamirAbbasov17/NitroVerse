# Mobil qaydalar

Oyunçuların böyük hissəsi telefondadır. Hər dəyişiklik mobil üçün də
yoxlanılmalıdır (`844×390`, `deviceScaleFactor 2`).

## Toxunma qatı — məlum tələ

`#ui-root > *{ pointer-events:auto }` ID spesifikliyi ilə
`.touch{pointer-events:none}`-u üstələyirdi → toxunma qatı BÜTÜN HUD
düymələrini bloklayırdı. Həll: `#ui-root > .touch` + `!important`.

**Mobil düymə testində `page.touchscreen.tap` işlət** — `el.click()`
hit-testi keçmir və bu tip buqları gizlədir.

## Yerləşdirmə

- `.touch__pause` yuxarı-sağda (mərkəz HUD-larla toqquşmasın)
- zen öz ⏸ düyməsinə malikdir → touch pauzanı silir
- `[data-t="fpv"]` sol-alt klasterdə (left:174 bottom:158) — mövqesiz
  tbtn (0,0)-a düşüb HUD çipləri ilə örtüşür
- Örtüşmə auditi: `mob-ui-audit.mjs` (4 rejim, overlapScan)

## Panel sığması

Alçaq ekranda (landşaft telefon) menyu paneli sürüşməməlidir:
`styles.css` sonunda `@media (max-height: 760px)` (sıx + hint gizli) və
`(max-height: 560px)` (desc/step gizli). `.mrow__desc` həmişə tək sətir
ellipsis.

## Performans

Mobildə kölgə söndürülür (`Game.js`: `shadowMap.enabled = !touch`).
CSS filtrlər yalnız `@media (pointer: fine)` altında (kompozisiya xərci).

Hədəf: **60 FPS**, draw call zen < 110.
