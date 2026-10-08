---
paths:
  - "src/ui/**"
  - "src/styles.css"
  - "src/core/i18n.js"
  - "src/core/TouchControls.js"
  - "index.html"
---

# UI qaydaları

Mənbə: `docs/UI.md`, `docs/MOBILE.md`.

- Bütün menyu ekranları `Menu._panel({step, stepLabel, title, sub, body, nav, hint, foot})`-dan keçir. Yeni ekran üçün ayrıca qab yazma.
- Mod sətrinə klik özü növbəti ekrana keçir ("Davam et" yoxdur). Yarışda Geri bir addım geri, digər rejimlərdə ana menyuya.
- **Modal yoxdur** (istifadəçi qərarı) — zen mühit idarəsi HUD düymələridir.
- **4 dil məcburidir:** yeni açar az/en/ru/tr-in dördündə yazılır. Sərt kodlanmış mətn yazma, `t(key, {vars})`.
- `t` adlı lokal dəyişən i18n funksiyasını kölgələyir — map/loop parametrini `tr`, `it` adlandır.
- İstifadəçi mətnini HTML-ə qoyanda `esc()`.
- **İkonlar:** `src/ui/icons.js` — `icon('ad')` (Phosphor "fill", MIT). Mətnə yazılan tanınan emoji avtomatik həmin dəstdən ikona çevrilir (`installIconizer`); yeni nişan lazımdırsa eyni dəstdən əlavə et, başqa üslub qarışdırma. Oyunçu mətni (çat, DM) çevrilmir; çevrilməməli qaba `data-noicon` qoy.
- Font: Russo One (başlıq), Rajdhani (mətn). Rəng: `--accent`, `--good` CSS dəyişənləri — yeni sərt rəng yazma.

## Mobil

- Yoxlama ölçüsü **844×390**, `deviceScaleFactor 2`. Hər UI dəyişikliyi burada da kadrla yoxlanır.
- Toxunma testində `page.touchscreen.tap` işlət, `el.click()` hit-testi keçmir.
- `#ui-root > *{pointer-events:auto}` ID spesifikliyi ilə `.touch`-u üstələyir — toxunma qatı `#ui-root > .touch` + `!important` ilə həll olunub, pozma.
- Alçaq ekranda panel sürüşməməlidir: `@media (max-height: 760px)` və `(max-height: 560px)` blokları `styles.css` sonundadır.
- CSS filtrlər yalnız `@media (pointer: fine)` altında.
- Şaquli siyahıda `btn--primary` `flex:1` almasın (düymə əzilməsi buqu).

## Yoxlama

`npm run test:shots` menyu ekranlarını masaüstü və mobil ölçüdə çəkir — kadrlara bax.
