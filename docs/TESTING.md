# Yoxlama qaydaları

**Qayda:** heç bir dəyişiklik ölçülmədən "hazırdır" sayılmır.

Testlər Playwright-dır və repo-dadır: `tests/`. Dev serveri (5173) özləri qaldırır, sistem Chrome-unu real GPU ilə (Metal) işlədirlər. Çıxışlar `tests/out/`-a yazılır (gitignore).

> Tarixçə: əvvəlki 16 skript scratchpad-də saxlanılırdı və itib. Yeni yoxlama **yalnız `tests/`-ə** yazılır.

## Əmrlər

| Əmr | Nə yoxlayır | Keçmə həddi | Müddət |
|---|---|---|---|
| `npm run check` | lint + build + smoke | hamısı yaşıl | ~2 dəq |
| `npm run test:smoke` | 9 rejim/trek açılır, 8 s sürülür; menyu | **0 konsol xətası** | ~1.5 dəq |
| `npm run test:perf` | kadr xərci (update+render), kadr intervalı, draw call, üçbucaq → `tests/out/perf.json` | `docs/MODELS.md` büdcəsi | ~2.5 dəq |
| `npm run test:shots` | hər rejim 4 kadr, zen 4 gün vaxtı, pauza, 9 menyu ekranı × masaüstü/mobil, mobil HUD → `tests/out/shots/` | yoxdur — **kadrlara baxılır** | ~4 dəq |
| `npm run test:leak` | 18 səhnə dövrü — 3 tur (menyuya oyunun öz yolu ilə qayıdır) → `tests/out/leak.json` | 2-ci → 3-cü tur arasında artım yox | ~2.5 dəq |
| `npm run test:items` | bonus qutusu invariantı: ikon öz işığından ayrılmır; maqnitdən sonra qutular yerinə qayıdır | ayrılma < 0.05 m | ~30 s |
| `npm run test:feel` | sürüş modeli: sürətlənmə, əyləc, sükan cavabı, drift, yoldan kənar, nitro — sabit addımla, maneəsiz → `tests/out/feel.json` | yoxdur — əvvəl/sonra müqayisə | ~5 s |
| `npm run test:overlap` | bərk obyektlərin bir-birinin içinə girməsi və yolun üstünə çıxması (6 trek + zen) → `tests/out/overlap.json` | 0 (zavod konteynerləri və uzaq fon dağları istisna) | ~1.5 dəq |
| `npm run test:zfight` | yanıb-sönən (eyni dərinlikdə üst-üstə düşən) səthlər: sürüş zamanı 36 baxış, hər biri iki dəfə render olunub müqayisə edilir → `tests/out/zfight/` (qırmızı = pozuntu) | ekranın < 0.05%-i | ~7 dəq |
| `npm run test:mobile` | 844×390-da HUD düymələrinin örtüşməsi və ekrandan çıxması | 0 | ~30 s |

Tək test: `npx playwright test tests/shots.spec.js -g "race-neon"`.
Brauzeri görərək: `npx playwright test tests/smoke.spec.js --headed`.

## Köməkçilər (`tests/helpers.js`)

- `boot(page)` — oyunu açır, menyunu gözləyir (dil az, səs bağlı)
- `startMode(page, config)` — `window.__menu.onStart(config)` ilə rejimi birbaşa başladır
- `drive(page, ms)` / `autopilot(page)` — yolu izləyən avtopilot (real giriş yolu ilə: `input.touch`)
- `measure(page, ms)` — kadr intervalı, CPU kadr xərci, draw call, üçbucaq, yaddaş sayğacları
- `collectErrors(page)` — konsol xətaları (yerli `/api` və PeerJS şəbəkə xətaları istisna)
- `MODES` — bütün rejim konfiqurasiyaları

## Hələ bərpa olunmamış yoxlamalar

Köhnə dəstdən bunlar itib və yenidən yazılmayıb — lazım olan sahəyə toxunanda `tests/`-ə əlavə et:

| Köhnə skript | Nə yoxlayırdı |
|---|---|
| `building-collide` / `small-obs` / `tunnel-test` | binaya/dirəyə/tunel divarına girmə |
| `pickup-test` | item/pad/imza gücü götürmə |
| `diff-test` | çətinlik sırası (asan < normal < çətin), AI yola qayıdış |
| `edge-suite` | pauza/resize/oflayn/sürətli keçid |
| `ability-balance` | güc balansı (analitik) |
| onlayn (iki brauzer) | otaq yaratma + qoşulma |

## Vizual analiz

`npm run test:shots` → kadrlara **Read ilə bax**. Baxmadan "gözəl oldu" demək olmaz. Axın: `nitroverse-visual-check` skill-i.

Yoxlama siyahısı: yolun üstündə obyekt · qaranlıqda sərt ləkə · üst-üstə düşən obyekt · kontekstə uyğun olmayan model · boş/yastı sahə · HUD oxunaqlığı.

Hərəkət və hiss üçün statik kadr bəs etmir → `nitroverse-playtest` skill-i (chrome-devtools MCP).

## Tələlər (təcrübədən)

- Prod build-də **DEV qarmaqları yoxdur** (`window.__menu` və s.) — server testlərində UI klikləri işlət (`[data-mode="online"]` kimi seçicilər).
- Teleport testi bəzi buqları gizlədir — **real sürüşlə** yoxla (yer meshi yalnız hərəkətdə yenilənir).
- `car.lateral` fizikadan ƏVVƏL hesablanır; klampdan sonrakı dəyəri `road.getNearest(car.position)` ilə təzə hesabla.
- Onlayn testdə iki səhifəni eyni brauzerdə tab kimi açma — gizli tabda `requestAnimationFrame` donur. İki ayrı brauzer prosesi.
- Mobil düymə testində `page.touchscreen.tap` işlət — `el.click()` hit-testi keçmir.
- Performans testləri tək worker ilə işləyir (GPU paylaşılmır). Test zamanı maşında ağır iş (Draw Things, Blender render) getməsin — rəqəmlər korlanır.
- Kadr **intervalı** vsync-ə bağlıdır (60 Hz → 16.7 ms); real yük üçün **xərc** (update+render CPU vaxtı) rəqəminə bax. GPU vaxtı ayrıca ölçülmür — şübhə varsa chrome-devtools performans trace.
- Headless Chrome-da test güclü masaüstü GPU-dadır. Mobil performans üçün CPU throttle ilə ayrıca ölç.
