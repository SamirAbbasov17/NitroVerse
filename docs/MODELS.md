# Modellər və asset boru xətti

## Mövcud dəstlər

| Dəst | Yol | İşlədilir | Lisenziya |
|---|---|---|---|
| Kenney Nature Kit | `public/models/nature/` (21 GLB) | zen biomları | CC0 |
| KayKit City Builder Bits | `public/models/city/` (12 gltf) | zen şəhər rayonları | CC0 |
| Kenney maşınlar | `public/models/cars/` | bütün rejimlər | CC0 |
| Prosedural | `src/core/AssetFactory.js` | trek elementləri | öz kodumuz |

## Yeni model əlavə etmə (addım-addım)

1. **Lisenziyanı yoxla** — yalnız CC0 və ya icazəli. Lisenziya faylını
   `public/models/<dəst>/` içinə kopyala.
2. **Formatı**: `.glb` üstünlükdür (tək fayl). `.gltf` işlədirsənsə `.bin`
   və tekstura eyni qovluqda olmalıdır (nisbi yol).
3. **Yükləyici sinfi**: `src/world/NatureKit.js` və ya `CityKit.js` üslubunda:
   - hündürlüyə görə normallaşdır, mərkəzləşdir, yerə otur
   - **TƏK paylaşılan material** (atlas teksturası) → chunk birləşməsi işləyir
   - `userData.shared = true` → səhnə təmizlənəndə silinməsin
4. **Paylaşılan nüsxə**: `sharedNature()` / `sharedCity()` — iki dəfə
   yükləmə yaddaşı iki dəfə yeyir.
5. **Əvvəlcədən yüklə**: `src/main.js` proqram açılanda dəstləri çağırır,
   yoxsa ilk chunk-lar prosedural (keyfiyyətsiz) modellərlə qurulur.
6. **Yerləşdirmə qaydası**: DESIGN.md → "Az, amma yerində" + kontekst.
   Yerləşdirməzdən əvvəl `_free(x,z,r)` ilə yer tutma yoxlaması.

## Toqquşma radiusu

**Sabit radius YAZMA.** Model ölçüsündən hesabla:

```js
const bb = new THREE.Box3().setFromObject(obj);
const s = bb.getSize(new THREE.Vector3());
const r = Math.max(2.4, Math.max(s.x, s.z) * 0.46);
```

Sabit 3.2 radius KayKit binaları üçün kiçik idi və maşın binanın içinə
girirdi (istifadəçi rəyi ilə tapıldı).

## Performans büdcəsi

| Ölçü | Hədd | Ölçmə |
|---|---|---|
| Draw call (yarış) | < 140 | `modes-perf.mjs` |
| Draw call (zen) | < 110 | `zen-perf.mjs` |
| Üçbucaq | < 90 000 | `modes-perf.mjs` |
| Kadr p99 | < 22 ms | `zen-frame.mjs` |
| Tekstura (14 dövr) | plato — sızma yox | `leak-check.mjs` |
