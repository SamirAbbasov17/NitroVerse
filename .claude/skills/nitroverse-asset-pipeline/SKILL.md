---
name: nitroverse-asset-pipeline
description: NitroVerse-ə yeni 3D model, tekstura və ya səs əlavə etmək üçün boru xətti — mənbə seçimi, lisenziya yoxlaması, Blender headless hazırlıq, GLB optimizasiya, oyuna qeydiyyat və büdcə testi. Yeni maşın, dekor, bina, landmark, səs effekti və ya istənilən xarici/AI asset oyuna daxil ediləndə işlədilir.
---

# Asset boru xətti

## 1. Mənbə (bu sıra ilə)

1. Layihədə olan dəstlər: `public/models/{cars,nature,city}` (Kenney, KayKit — CC0)
2. Digər CC0 dəstlər: kenney.nl, quaternius.com, kaylousberg.itch.io (KayKit), poly.pizza (CC0 filtri), polyhaven.com (tekstura/HDRI), ambientcg.com
3. Blender-də mövcud hissələrdən kitbash və ya sadə modelləmə (`blender` MCP və ya headless skript)
4. Yalnız sonda AI 3D (Hunyuan3D, Tripo) — tək landmark/hero obyekt üçün. Çıxış adətən ağır və stil baxımından fərqlidir; decimate + palitraya uyğun yenidən rəngləmə tələb edir.

Səs: Kenney Audio, Sonniss GDC paketləri, freesound.org (yalnız CC0 filtri). `ffmpeg` ilə mono/stereo, normalizasiya, `.mp3`/`.ogg`.

Stil testi: model flat-shaded low-poly-dirmi, siluet mövcud dəstlərlə yanaşı durur-mu? Durmursa işlətmə.

## 2. Lisenziya

Faylı endirməzdən əvvəl lisenziyanı oxu. Qəbul: CC0, açıq kommersiya icazəsi. CC BY yalnız istifadəçi atribusiyaya razıdırsa. Qeyri-kommersiya, "yalnız şəxsi istifadə", naməlum → rədd. `docs/ASSETS-LICENSES.md`-ə sətir əlavə et; dəstin lisenziya faylını qovluğuna kopyala.

## 3. Hazırlıq (Blender headless)

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/prep_model.py -- \
  --in mənbə.glb --out tests/out/assets/ad.glb --height 6.0 --pivot bottom --thumb tests/out/assets/ad.png
```

- `--height` hədəf hündürlük (m); `--pivot bottom` yerə oturdur; `--ratio 0.5` yalnız ağır modeldə (aşağı poliqonlu modeli korlayır).
- Çap olunan üçbucaq/material sayını qeyd et. Hədəf: dekor < 600 üçbucaq, bina < 2 500, maşın < 6 000, 1–2 material.
- `--thumb` kadrına **bax** — dağılmış həndəsə, tərs normal, itmiş material.
- İnteraktiv düzəliş lazımdırsa `blender` MCP (Blender açıq və addon qoşulu olmalıdır).

## 4. Optimizasiya

```bash
npx gltf-transform optimize giriş.glb çıxış.glb --compress false --texture-size 512
npx gltf-transform inspect çıxış.glb
```

`--compress meshopt|draco` **işlətmə** — oyunun `GLTFLoader`-ində dekoder qoşulmayıb, model yüklənməz. (Dekoder əlavə etmək ayrıca qərardır.)

## 5. Oyuna daxil etmə

- Fayl → `public/models/<dəst>/`
- Yükləyici: `src/world/NatureKit.js` / `CityKit.js` / `src/core/ModelLibrary.js` üslubunda — normallaşdır, tək paylaşılan material, `userData.shared = true`
- `src/main.js`-də əvvəlcədən yüklə (yoxsa ilk kadrlar prosedural modellə qurulur)
- Toqquşma radiusu `Box3`-dən hesablanır, sabit yazılmır
- Yerləşdirmə: `_free(x, z, r)`; yolun üstünə heç nə

## 6. Yoxlama

`npm run check` → `npm run test:shots` (kadra bax) → `npm run test:perf` (büdcə: `docs/MODELS.md`) → `npm run test:leak`.

Böyük ikili fayl (>5 MB) commit etməzdən əvvəl istifadəçidən soruş.
