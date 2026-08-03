# Yoxlama qaydaları

**Qayda:** heç bir dəyişiklik ölçülmədən "hazırdır" sayılmır. Skriptlər
scratchpad-dədir və `node <ad>.mjs` ilə işə düşür (dev server 5173-də).

## Əsas dəst

| Skript | Nə yoxlayır | Keçmə həddi |
|---|---|---|
| `full-modes.mjs` | 11 rejim/trek/çətinlik | 60 FPS · 0 xəta |
| `modes-perf.mjs` | draw call / üçbucaq | MODELS.md büdcəsi |
| `road-raycast.mjs` | zen yolunun üstündə obyekt | **0 pozuntu** |
| `track-onroad.mjs` | 6 yarış trekində yolun üstü | 0 (zavod konteynerləri istisna) |
| `zen-frame.mjs` | kadr vaxtı paylanması | p99 < 22 ms · 33 ms üstü 0 |
| `box-invariant.mjs` | bonus qutusu görünüş invariantı | 0 pozuntu |
| `pickup-test.mjs` | item/pad/imza gücü götürmə | hamısı true |
| `building-collide.mjs` | binaya girmə | içəri girmə yox |
| `overlap-test.mjs` | dekor kəsişməsi | iri kəsişmə 0 (dağlar istisna) |
| `tunnel-test.mjs` | tunel divarı | ≤ hədd + 0.1 m |
| `small-obs.mjs` | dirək/nişan toqquşması | keçən 0 |
| `diff-test.mjs` | çətinlik + AI yola qayıdış | asan<normal<çətin |
| `leak-check.mjs` | 14 səhnə dövrü | tekstura plato |
| `edge-suite.mjs` | pauza/resize/oflayn/sürətli keçid | hamısı sağ qalır |
| `mob-ui-audit.mjs` | mobil örtüşmə | 0 |
| `ability-balance.mjs` | güc balansı (analitik) | yayılma < 1.3× |

## Vizual analiz

`visual-sweep.mjs` — bütün treklər/rejimlər/gün vaxtları üzrə kadr toplayır
(`sweep/`). **Kadrlara BAXMADAN** "gözəl oldu" demək olmaz.

Yoxlama siyahısı: yolun üstündə obyekt · qaranlıqda sərt ləkə · üst-üstə
düşən obyekt · kontekstə uyğun olmayan model · boş/yastı sahə.

## Tələlər (təcrübədən)

- Prod build-də **DEV qarmaqları yoxdur** (`window.__menu` və s.) — server
  testlərində UI klikləri işlət (`[data-mode="online"]` kimi seçicilər).
- Teleport testi bəzi buqları gizlədir — **real sürüşlə** yoxla
  (yer meshi yalnız hərəkətdə yenilənir).
- `car.lateral` fizikadan ƏVVƏL hesablanır; klampdan sonrakı dəyəri
  `road.getNearest(car.position)` ilə təzə hesabla.
- Onlayn testdə iki səhifəni eyni brauzerdə tab kimi açma — gizli tabda
  `requestAnimationFrame` donur. İki ayrı `puppeteer.launch`.
