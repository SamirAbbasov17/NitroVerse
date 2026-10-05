---
name: nitroverse-visual-check
description: NitroVerse-də vizual dəyişiklikdən sonra kadr toplayıb analiz etmək və regresiya yoxlaması aparmaq üçün addımlar. Yeni model, işıq, effekt, səhnə və ya UI dəyişikliyi ediləndə işlədilir.
---

# Vizual yoxlama axını

Dəyişiklikdən **əvvəl** əvvəlki kadrları saxla (müqayisə üçün):

```bash
npm run test:shots && rm -rf tests/out/before && cp -r tests/out/shots tests/out/before
```

Dəyişiklikdən sonra:

1. `npm run check` — lint + build + smoke (0 konsol xətası)
2. `npm run test:shots` → `tests/out/shots/*.png`
   - `d-<rejim>-0start|1drive|2later|3later` masaüstü, `d-zen-tod-<dawn|day|dusk|night>`
   - `d-menu-*`, `m-menu-*` menyu ekranları (masaüstü / 844×390)
   - `m-<rejim>-hud` mobil HUD
   - Tək rejim: `npx playwright test tests/shots.spec.js -g "race-neon"`
3. **Kadrlara BAX** (Read tool) — dəyişən rejimin əvvəl/sonra cütünü yan-yana. Axtar:
   - yolun üstündə obyekt / relyef
   - qaranlıqda sərt qara ləkə (flat shading + aşağı ambient)
   - üst-üstə düşən obyektlər, z-fighting
   - səhnəyə uyğun olmayan model (şəhərdə ağac, səhrada palma)
   - boş, yastı, "plastik" səth; rəngsiz/ağappaq model
   - HUD mətninin fonla qarışması, kəsilən mətn, örtüşən düymə
4. `npm run test:perf` → `tests/out/perf.json`; `docs/BASELINE.md` ilə müqayisə et. Pisləşmə varsa de.
5. Səhnə quruluşu/yaddaş dəyişibsə `npm run test:leak`; UI dəyişibsə `npm run test:mobile`.
6. Statik kadr kifayət etmirsə (hərəkət, kamera, effekt) → `nitroverse-playtest` skill-i.

## Hesabat

İstifadəçiyə: nə dəyişdi, hansı kadrlara baxıldı, perf rəqəmləri (əvvəl → sonra), qalan qüsurlar. Baxmadığın kadr haqqında hökm vermə.

## Qırmızı xətlər

- Postprocessing pipeline əlavə etmə (`docs/DESIGN.md`) — yalnız istifadəçi qərarı ilə
- Səpələnmiş "doldurucu" obyekt qoyma — kontekst tələb olunur
- Ölçmədən "hazırdır" demə
