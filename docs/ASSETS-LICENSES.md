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
| `src/ui/icons.js` (interfeys ikonları, SVG) | Phosphor Icons — "fill" çəkisi (phosphoricons.com; `@phosphor-icons/core` 2.1.1) | MIT | 2026-10-08. Yalnız işlədilən ikonların SVG yolları fayla köçürülüb |
| `public/carmageddon/hero.png`, `hero-eyes.png` (Carmageddon baş qəhrəmanı, piksel portret) | AI: Draw Things, model FLUX.2 klein 4B (Apache 2.0), seed 4303, 768×1024, 4 addım, cfg 1. Prompt: "16-bit pixel art game character portrait, waist up, young woman post-apocalyptic race car driver, long flowing bright red hair blowing in the wind, green eyes, slight confident smile, scarred eyebrow, brown leather jacket with high collar, driving goggles on forehead, scarf, fingerless gloves, arms crossed, facing the viewer, crisp chunky pixels, dark outline, limited warm palette, flat solid teal background, no text" | öz işimiz (model çıxışı kommersiya istifadəsinə açıqdır) | 2026-10-08. 160×213-ə piksellənib, 56 rəng; gözlər və qaşlar əl ilə çəkilib. Üslub: `docs/CARMAGEDDON-STYLE.md` |
| `public/carmageddon/ch1/p1…p5.png`, `tent.png` (Carmageddon Fəsil 1: proloq kadrları və çadır fonu, 480×270) | AI: Draw Things, model FLUX.2 klein 4B (Apache 2.0), 1024×576, 4 addım, cfg 1; seed-lər: p1 6101 (xaraba şəhər), p2 6102 (karvan), p3 6113 (yeddi baron silueti + maskalı lider), p4 6104 (Hearth düşərgəsi), p5 6105 (dan vaxtı düşərgə), tent 6106. Prompt başlanğıcı: "16-bit pixel art game background, wide shot, limited palette, crisp pixels…". Son emal: 480×270-ə endirmə, 48 rəngə kvantlama. Mənbə: `art/carmageddon/ch1/` | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/milo-happy/neutral/pout.png` (Milo portreti, 80×80) | AI: Draw Things, FLUX.2 klein 4B, seed 5101, 512×512, 4 addım, cfg 1. Prompt: "16-bit pixel art game character portrait, head and shoulders, front view, a cheerful 13 year old boy with messy dark brown hair, freckles, an oil smudge on his cheek, big happy grin, oversized mechanic goggles hanging around his neck, patched olive green jacket…". Son emal: `pixelize.py` (80 px, 40 rəng); "neutral" və "pout" — eyni portretdə ağız əl ilə piksel-piksel dəyişdirilib | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/camp.webp` (Hearth düşərgəsinin yuxarıdan xəritəsi, 640×640) | AI: Draw Things, FLUX.2 klein 4B (Apache 2.0), seed 7101, 1024×1024, 4 addım, cfg 1. Prompt: "16-bit pixel art top-down RPG overworld map, orthographic overhead view like a classic JRPG town, a desert nomad camp on sandy ground: in the center a round stone campfire circle with log benches, north a big elder tent, west a fenced green vegetable garden next to a stone water well, east an open mechanic workshop with a buggy car…". Son emal: 640 px-ə endirmə, 64 rəng, itkisiz WebP | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/{wren,gus,clara,ray,amos,pip}-neutral.png` (Hearth sakinlərinin portretləri, 80×80) | AI: Draw Things, FLUX.2 klein 4B, 512×512, 4 addım, cfg 1; seed-lər: wren 5201, gus 5202, clara 5203, ray 5204, amos 5205, pip 5206. Prompt şablonu: "16-bit pixel art game character portrait, head and shoulders, front view, <personajın təsviri>, thick dark outline, limited palette, flat solid teal background, no text". Son emal: `pixelize.py` (80 px, 40 rəng). Mənbə: `art/carmageddon/ch1/` | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/e1,e2,a1…a4.png` (Carmageddon Fəsil 1: axşam ocağı və hücum kadrları, 480×270) | AI: Draw Things, FLUX.2 klein 4B (Apache 2.0), 1024×576, 4 addım, cfg 1; seed-lər: e1 6201 (ocaq başında yığıncaq), e2 6202 (dişli çarxdan açar halqası), a1 6203 (üfüqdə faralar), a2 6204 (mühasirə), a3 6205 (yanan düşərgə), a4 6206 (Hush). Prompt başlanğıcı: "16-bit pixel art game cutscene illustration, …, limited palette, crisp pixels…". Son emal: 480×270, 48 rəng | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/{judge,crude,butcher,rust,preacher,twins,jackal}-neutral.png` (yeddi baronun portreti, 80×80) | AI: Draw Things, FLUX.2 klein 4B, 512×512, 4 addım, cfg 1; seed-lər 5301–5307 (sıra ilə). Prompt şablonu sakinlərlə eynidir ("16-bit pixel art game character portrait, head and shoulders, front view, <təsvir>, thick dark outline, limited palette, flat solid teal background"). Son emal: `pixelize.py` (80 px, 40 rəng) | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/b1,b2,b3,b5,b6,b7.png`, `hush-neutral.png` (Carmageddon Fəsil 1: gecə səhnəsinin kadrları və Hush portreti) | AI: Draw Things, FLUX.2 klein 4B (Apache 2.0), 4 addım, cfg 1; kadrlar 1024×576, seed-lər: b1 6301 (Milo baqqinin yanında), b2 6302 (Butcher-in qapıdakı silueti), b3 6303 (yumruqda açar halqası), b5 6305 (Old Gus və partlayış), b6 6316 (Jackal-ın maşını alovdan çıxır), b7 6307 (oturacaqdakı maska); portret 512×512, seed 5308. Son emal: kadrlar 480×270 / 48 rəng, portret `pixelize.py` 80 px | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/z1,z2,z3.png` (Carmageddon Fəsil 1: son səhnənin kadrları, 480×270) | AI: Draw Things, FLUX.2 klein 4B (Apache 2.0), 1024×576, 4 addım, cfg 1; seed-lər: z1 6401 (boş yolda dayanan maşın), z2 6402 (tərk edilmiş bar), z3 6403 (Ember piştaxtanın dibində). Son emal: 480×270, 48 rəng | Öz generasiyamız — məhdudiyyətsiz | 2026-10-09 |
| `public/carmageddon/ch1/final.mp3` (Carmageddon Fəsil 1 final mahnısı «HEÇ KİM BİLMİR», 1:46) | Layihə sahibi (Samir Abbasov) tərəfindən verilib; fayl etiketinə görə Suno ilə yaradılıb (2026-09-19, id 1546d0d8-…). Mənbə: `art/carmageddon/audio/chapter-1-final.mp3` | **Yoxlanmalıdır:** Suno-da kommersiya istifadə hüququ yalnız ödənişli planda yaradılan treklərə verilir — ictimai/kommersiya buraxılışından əvvəl sahibi planı təsdiqləməlidir | 2026-10-09 |
| Carmageddon şriftləri: Black Ops One, Tiny5, Pixelify Sans | Google Fonts (işləmə vaxtı yüklənir, layihəyə daxil edilməyib) | SIL Open Font License 1.1 | 2026-10-08 |
