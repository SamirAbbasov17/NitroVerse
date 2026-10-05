---
paths:
  - "src/core/*Scene.js"
  - "src/core/Effects.js"
  - "src/core/Game.js"
  - "src/core/AssetFactory.js"
  - "src/core/MergeUtils.js"
  - "src/world/**"
---

# Render və səhnə qaydaları

Mənbə: `docs/DESIGN.md`, `docs/MODELS.md`. Ziddiyyət olsa onlar üstündür.

## Büdcə (ölç: `npm run test:perf`)

| Ölçü | Hədd |
|---|---|
| Draw call | yarış < 140 · zen < 110 |
| Üçbucaq | < 90 000 |
| Kadr p99 | < 22 ms; 33 ms-dən böyük sıçrayış qəbul edilmir |
| Tekstura | səhnə dövrlərində plato (`npm run test:leak`) |

## Qaydalar

- **Postprocessing pipeline yoxdur** (EffectComposer, bloom, SSAO). Effekt: bir dəfəlik həndəsə, additiv sprite, vertex rəngi, CSS overlay. **İstisna (istifadəçi qərarı, 2026-10-05):** Faza 3-də yalnız masaüstündə, ayarlardan söndürülə bilən yüngül bloom + rəng qradasiyası əlavə olunacaq (`docs/UPGRADE-PLAN.md`). O faza başlayana qədər və mobildə qayda qüvvədədir.
- İşıq sayı sabitdir (pool). İşıq əlavə etmək/silmək shader-i yenidən kompilyasiya edir → kadr donması.
- Statik dekor `MergeUtils` ilə birləşdirilir və ya `InstancedMesh`. Material **paylaşılır**; dəstə aid olanlar `userData.shared = true` (təmizlənəndə silinməsin).
- `MergeUtils` `receiveShadow`-u mənbədən qoruyur — birləşdirmədən sonra materialı/kölgəni yoxla (neon binaların qapqara çıxması buqu).
- Dinamik effektlər (tüstü, iz, sprite) pool-lanır. Kadr dövründə `new THREE.*` və ya `.clone()` yazma.
- Səhnədən çıxarkən hər şey `dispose()` olunur (`disposeObject3D`).
- Gecə ambient ≥ 0.5 — yoxsa flat-shaded iri üçbucaqlar sərt qara ləkə olur.
- Kölgə yalnız masaüstündə (`Game.js`: `shadowMap.enabled = !touch`).
- **Yol həmişə ən üstdədir:** heç bir dekor/relyef asfaltın üstünə çıxmır. Yerləşdirmədən əvvəl `_free(x, z, r)`.
- Toqquşma radiusunu sabit yazma, modelin `Box3` ölçüsündən hesabla.
- Kontekst: şəhərdə ağac/qaya, alpdə neon, səhrada palma olmaz. Səpələnmiş "doldurucu" obyekt qoyma.

## Three.js

Versiya **r160**. API-ni yaddaşdan yazma — `context7` ilə r160 üçün yoxla (yeni versiyaların nümunələri burada işləməyə bilər).

## Yoxlama

Vizual dəyişiklikdən sonra `nitroverse-visual-check` skill-i: `npm run test:shots` → kadrlara bax → `npm run test:perf`.
