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

- **Postprocessing yalnız `src/core/PostFX.js`-dədir** (istifadəçi qərarı, 2026-10-05): masaüstündə söndürülə bilən bloom + rəng qradasiyası; mobildə qat yaradılmır və orada qayda dəyişməyib — effekt: bir dəfəlik həndəsə, additiv sprite, vertex rəngi, CSS overlay. Başqa keçid (SSAO, DOF, EffectComposer) əlavə etmə. Cila **əsas görüntünü dəyişməməlidir** — PostFX-ə və ya Three.js versiyasına toxunandan sonra `npm run test:postfx` (fayl başındakı "r160 hiyləsi" qeydini oxu). Trek preseti: `tracks.js` → `grade`; gündüz treklərində `bloomThreshold` ≥ 0.95 (səma ağarır).
- Cila açıq olanda bir kadrda 15 `renderer.render` çağırışı olur (səhnə + 13 bloom + son keçid); `renderer.info` hər çağırışda sıfırlanır. Ölçmə yalnız səhnə çağırışını sayır (`tests/helpers.js` → `measure`).
- İşıq sayı sabitdir (pool). İşıq əlavə etmək/silmək, **`light.visible` və ya `light.castShadow` dəyişmək** bütün materialların şeyderini yenidən kompilyasiya edir → 60–70 ms donma (zen-də ölçüldü). İşığı söndürmək üçün `intensity = 0`; kölgəni söndürmək üçün kölgə kamerasının `far`-ını `near`-a endir. Gizli gözləyən obyektlərin şeyderi səhnə açılanda `renderer.compile` ilə isidilir (`EndlessScene._warmShaders`, `GameplayScene._warmFx`). Yoxlama: `npm run test:hitch`.
- Statik dekor `MergeUtils` ilə birləşdirilir və ya `InstancedMesh`. Material **paylaşılır**; dəstə aid olanlar `userData.shared = true` (təmizlənəndə silinməsin).
- `MergeUtils` `receiveShadow`-u mənbədən qoruyur — birləşdirmədən sonra materialı/kölgəni yoxla (neon binaların qapqara çıxması buqu).
- Dinamik effektlər (tüstü, iz, sprite) pool-lanır. Kadr dövründə `new THREE.*` və ya `.clone()` yazma.
- Səhnədən çıxarkən hər şey `dispose()` olunur (`disposeObject3D`).
- Gecə ambient ≥ 0.5 — yoxsa flat-shaded iri üçbucaqlar sərt qara ləkə olur.
- Kölgə yalnız masaüstündə (`Game.js`: `shadowMap.enabled = !touch`).
- **Yol həmişə ən üstdədir:** heç bir dekor/relyef asfaltın üstünə çıxmır. Yerləşdirmədən əvvəl `_free(x, z, r)`.
- **Lay hündürlükləri** (yarış): yer −0.04 · sahil −0.012 · su +0.009 · şaxə yolu +0.012 · yol +0.02 · zolaq +0.05. Yeni yastı lay əlavə edəndə qonşusundan ən azı ~2 sm aralı qoy — 4–5 mm fərq uzaqda yanıb-sönür.
- İki qutunu eyni qalınlıqda üst-üstə qoyma (üzlər eyni müstəvidə qalır → z-fighting); biri digərindən nazik olsun. Yoxlama: `npm run test:zfight`.
- Dekor yerləşdirəndə `_free()` işlət — o, su zonasını (`keepOut`) da yoxlayır. Yoxlanan radius toqquşma siyahısına yazılan radiusla eyni olsun. Yoxlama: `npm run test:overlap`.
- Toqquşma radiusunu sabit yazma, modelin `Box3` ölçüsündən hesabla.
- Kontekst: şəhərdə ağac/qaya, alpdə neon, səhrada palma olmaz. Səpələnmiş "doldurucu" obyekt qoyma.

## Three.js

Versiya **r160**. API-ni yaddaşdan yazma — `context7` ilə r160 üçün yoxla (yeni versiyaların nümunələri burada işləməyə bilər).

## Yoxlama

Vizual dəyişiklikdən sonra `nitroverse-visual-check` skill-i: `npm run test:shots` → kadrlara bax → `npm run test:perf`.

## Trek palitrası — görünüş açarları (`src/data/tracks.js` → `palette`)

- `sunDir: [x, y, z]` — günəş işığının istiqaməti (standart 60/110/40). Səmadakı disk də bundan qurulur və kameranı izləyir (`Environment.celestial`); ayrıca günəş həndəsəsi əlavə etmə — iki günəş alınır.
- `sunSize`, `sunDisc` — diskin miqyası və rəngi (üfüqdə qarşıdan görünən günəş standart ölçüdə kadrı ağardır).
- `groundGain` — yer rənginin gücləndiricisi. Yer teksturası bozdur (xətti 0.28), ona görə palitra rəngi ~3.5 dəfə tünd çıxır; standart 1 köhnə görünüşdür.
- Kenney palma/ağac modelləri 190–340 üçbucaqdır (prosedural şam ~20) — sayını üçbucaq büdcəsi ilə hesabla.
