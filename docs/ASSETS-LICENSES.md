# Asset lisenziya jurnalı

Oyuna daxil olan **hər** xarici və ya AI ilə yaradılmış fayl burada qeyd olunur. Qeydsiz asset commit olunmur. Qaydalar: `.claude/rules/assets.md`.

## 3D modellər

| Dəst | Yol | Mənbə | Lisenziya | Lisenziya faylı |
|---|---|---|---|---|
| Kenney Car Kit 3.1 | `public/models/cars/` (10 GLB + `Textures/`) | kenney.nl | CC0 | `public/models/KENNEY-LICENSE.txt` |
| Kenney Nature Kit | `public/models/nature/` (21 GLB) | kenney.nl | CC0 | `public/models/KENNEY-LICENSE.txt` (Car Kit mətni — Nature Kit üçün ayrıca fayl yoxdur) |
| KayKit City Builder Bits | `public/models/city/` (12 gltf + bin + `colormap.png`) | kaylousberg.itch.io | CC0 | `public/models/city/KAYKIT-LICENSE.txt` |
| Prosedural | `src/core/AssetFactory.js` və s. | öz kodumuz | — | — |

## Musiqi

| Fayllar | Mənbə | Lisenziya | Status |
|---|---|---|---|
| `public/music/*.mp3` (24 trek, ~50 MB) | **HoliznaCC0** — [Free Music Archive](https://freemusicarchive.org/music/holiznacc0/); əvvəlki sessiyada Claude tərəfindən endirilib | CC0 1.0 Universal | ✅ Təsdiqlənib (2026-10-05). "OCEAN MEMORY ( Lo-fi Chill )" (5 trek) və "Summer Air ( Lo-fi )" (`roof-tops`) albom səhifələrində lisenziya CC0 1.0 Universal göstərilir; qalan 18 trek sənətçinin CC0 toplularındandır (hər biri ayrıca səhifədən yoxlanmayıb — sənətçi bütün HoliznaCC0 arxivini CC0 elan edib). Mənşə qeydi: `public/music/LICENSE.txt` |
| Menyu/yarış musiqisi | `src/core/AudioManager.js` (sintez) | öz kodumuz | OK |

## Şriftlər

| Şrift | Mənbə | Lisenziya |
|---|---|---|
| Russo One, Rajdhani | Google Fonts | SIL OFL 1.1 |

## AI ilə yaradılanlar

Oyuna daxil olan AI assetləri bura yazılır: fayl, model, prompt, seed, tarix, servis şərtləri.

| Fayl | Model / servis | Prompt (qısa) | Seed | Tarix | Lisenziya qeydi |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

`art/carmageddon/` (Pollinations ilə sınaqlar, 2026-08) oyuna **daxil deyil** və rədd edilmiş cəhd kimi saxlanılır.

## Yeni sətir əlavə etmə qaydası

1. Lisenziyanı mənbə səhifəsində oxu (CC0 / açıq kommersiya icazəsi). Əmin deyilsənsə — işlətmə.
2. Dəstin lisenziya faylını qovluğuna kopyala.
3. Yuxarıdakı uyğun cədvələ sətir yaz.
4. CC BY kimi atribusiya tələb edən lisenziya yalnız istifadəçi razıdırsa; oyun daxili "Kreditlər"ə də əlavə olunmalıdır.

## 2026-10-06 əlavələri

| Asset | Mənbə | Lisenziya | Qeyd |
|---|---|---|---|
| `public/music/{birds,doodles,tranquil-mindscape,peaceful-drift,ocean-breeze,projector-screen,summer-break,the-best-of-times,walking-away,down-time}.mp3` | HoliznaCC0 — "Public Domain Lofi", freemusicarchive.org/music/holiznacc0/public-domain-lofi/ | CC0 1.0 (albom səhifəsində, 2026-10-06 yoxlanıb) | Zen rejiminin lofi siyahısına əlavə; 320 → 96 kbps yenidən kodlanıb. Treklər dinlənilməyib — yalnız etiketlərinə (Happy / Peaceful / Chill) görə seçilib. |
| Menyu və yarış musiqisi ("walk" üslubu — sakit soul, 2-ci variant) | Öz kodumuz — `AudioManager._playStepWalk`, `_voice` (WebAudio sintezi) | Layihənin özününkü | Üslub istinadı: "Big Walk" oyununun musiqisi (aksfx). Heç bir səs faylı, sempl və ya melodiya götürülməyib; harmoniya və motivlər özümüzündür. |
| `public/models/cars/{coupe,hyper,gt,hatch,muscle,pickup,bus,limo,proto,concept}.glb` (10 maşının gövdəsi) | Öz işimiz — `tools/models/build_cars.py` (gövdə skriptlə qurulur). Təkərlər Kenney Car Kit-dən (`sedan-sports.glb`) köçürülür, tekstura Kenney `colormap.png` | Gövdə: layihənin özününkü · təkər və atlas: CC0 (Kenney) | 2026-10-07. AI generasiyası yoxdur. Gövdə 300–480 üçbucaq, təkərlərlə ~1700 |
| `public/music/packs/{rock,synth,chip,phonk}-*.mp3` (12 trek — mağazanın musiqi paketləri) | HoliznaCC0 — "Rock Montage", "We Drove All Night", "Chiptunes", "Phonk - Aura Farming" (freemusicarchive.org/music/holiznacc0/…) | CC0 1.0 | 2026-10-07. Albom səhifələrində CC0 yazılıb (yoxlandı). 96 kbps-ə yenidən kodlaşdırılıb, −16 LUFS, maks. 200 s |
| `public/music/packs/classic-*.mp3` (3 trek — "Məşhur klassika" paketi) | Wikimedia Commons, Musopen yazıları: Qriq "In the Hall of the Mountain King", Bethoven 5-ci simfoniya (I), Musorqski "Night on Bald Mountain" | İctimai mülkiyyət (Commons lisenziya sahəsi: "Public domain") | 2026-10-07. Fayl səhifələri `public/music/LICENSE.txt`-dədir. Musopen atribusiya xahiş edir (tələb etmir) — orada qeyd olunub |
| `public/sfx/amb-birds.mp3` (quş səsi — zen və təbiət trekləri) | "Park ambiences" (park_ambience_birds.wav), opengameart.org/content/park-ambiences | CC0 1.0 | 2026-10-07. 30 s parça, döngə üçün ucları çarpaz keçidlə birləşdirilib, −23 LUFS |
| `public/sfx/eng-{1100,2570,3610,5030}.wav` (mühərrik döngələri) | Pole Position Production — "Porsche 911 SC 1981", Sonniss #GameAudioGDC 2016 (ftpmirror.your.org/pub/misc/sonniss2016/individual/) | Sonniss GDC Bundle License (pulsuz, kommersiya və redaktə icazəli, müəllif göstərmək tələb olunmur; ayrıca səs faylı kimi yaymaq olmaz) — sonniss.com/gdc-bundle-license | 2026-10-08. Sabit dövr hissələri kəsilib döngəyə çevrilib, 22 kHz mono |
| `public/sfx/tyre-skid.wav` (təkər cığıltısı) | Pole Position — "Skids & Screeches Tarmac", Sonniss #GameAudioGDC 2018 | eyni | 2026-10-08. 1.9 s döngə, 450 Hz yüksək keçid |
