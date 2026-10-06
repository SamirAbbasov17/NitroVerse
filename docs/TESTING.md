# Yoxlama qaydaları

**Qayda:** heç bir dəyişiklik ölçülmədən "hazırdır" sayılmır.

Testlər Playwright-dır və repo-dadır: `tests/`. Dev serveri (5173) özləri qaldırır, sistem Chrome-unu real GPU ilə (Metal) işlədirlər. Çıxışlar `tests/out/`-a yazılır (gitignore).

> Tarixçə: əvvəlki 16 skript scratchpad-də saxlanılırdı və itib. Yeni yoxlama **yalnız `tests/`-ə** yazılır.

## Əmrlər

| Əmr | Nə yoxlayır | Keçmə həddi | Müddət |
|---|---|---|---|
| `npm run check` | lint + build + smoke + xəta bildirişi + bonus qutusu | hamısı yaşıl | ~2.5 dəq |
| `npm run test:smoke` | 9 rejim/trek açılır, 8 s sürülür; menyu | **0 konsol xətası** | ~1.5 dəq |
| `npm run test:perf` | kadr xərci (update+render), kadr intervalı, draw call, üçbucaq → `tests/out/perf.json` | `docs/MODELS.md` büdcəsi | ~2.5 dəq |
| `npm run test:shots` | hər rejim 4 kadr, zen 4 gün vaxtı, pauza, 9 menyu ekranı × masaüstü/mobil, mobil HUD → `tests/out/shots/` | yoxdur — **kadrlara baxılır** | ~4 dəq |
| `npm run test:leak` | 18 səhnə dövrü — 3 tur (menyuya oyunun öz yolu ilə qayıdır) → `tests/out/leak.json` | 2-ci → 3-cü tur arasında artım yox | ~2.5 dəq |
| `npm run test:items` | bonus qutusu invariantı: ikon öz işığından ayrılmır; maqnitdən sonra qutular yerinə qayıdır | ayrılma < 0.05 m | ~30 s |
| `npm run test:feel` | sürüş modeli (v2 — yarış/zen; köhnə — arena/futbol): sürətlənmə, əyləc, sükan cavabı, drift, yoldan kənar, nitro — sabit addımla, maneəsiz → `tests/out/feel.json` | yoxdur — əvvəl/sonra müqayisə | ~5 s |
| `npm run test:overlap` | bərk obyektlərin bir-birinin içinə girməsi və yolun üstünə çıxması (6 trek + zen) → `tests/out/overlap.json` | 0 (zavod konteynerləri və uzaq fon dağları istisna) | ~1.5 dəq |
| `npm run test:zfight` | yanıb-sönən (eyni dərinlikdə üst-üstə düşən) səthlər: sürüş zamanı 36 baxış, hər biri iki dəfə render olunub müqayisə edilir → `tests/out/zfight/` (qırmızı = pozuntu) | ekranın < 0.05%-i | ~7 dəq |
| `npm run test:hitch` | kadr donması: zen-də gün vaxtı/hava/biom keçidləri + yarış/futbol/arena 45 s; hər kadrın update+render xərci → `tests/out/hitch.json` | 33 ms-dən uzun kadr 0 | ~6 dəq |
| `npm run test:errors` | avtomatik xəta bildirişi: klient tutur/təkrarlamır, server tək qeyddə sayır və e-poçt göndərmir | yaşıl | ~3 s |
| `npm run test:collide` | maneələrin içindən keçmə: hər trekdə yola ən yaxın 14 bərk obyektə tam qazla sürülür | içindən keçilən 0 | ~3 dəq |
| `npm run test:gameplay` | bonus götürmə/işlətmə · bot sürəti (3 trek: bonuslar sönülü, dövrə vaxtı asan > normal > çətin, yoldan kənar < 4%) · kamera şəffaflığı · pauza · pəncərə ölçüsü (4 rejim) · sürətli rejim keçidi → `tests/out/gameplay.json` | yaşıl | ~10 dəq |
| `npm run test:abilities` | 18 imza gücünün auditi: işə düşür, bir dəfə işləyir və vəd etdiyi təsir ölçülür (sürət/döngə/yoldan-kənar qazancı, qalxan, lövbər, kölgə, geri qayıdış, iz, dalğa, maqnit, tullanış) → `tests/out/abilities.json` | hər güc öz təsirini verir | ~2.5 dəq |
| `npm run test:pace` | maşın sürəti balansı: eyni sürücü 8 maşını sürür (`CARS=…` ilə dəyişir), dövrənin 60%-i → `tests/out/pace.json` | ən sürətli/ən yavaş fərqi < 10% | ~10 dəq |
| `npm run test:postfx` | render sonrası cila (masaüstü): hər rejimdə eyni dondurulmuş kadr cila bağlı/açıq → `tests/out/postfx/*-{off,on,nobloom}.png`; kadr vaxtı → `tests/out/postfx.json` | cila əsas görüntünü dəyişmir (orta piksel fərqi < 1.5); p99 < 22 ms; mobildə qat yoxdur | ~3.5 dəq |
| `npm run test:impact` | toqquşma hissi (yarış): maneəyə düz/sürtünərək zərbə, arxadan və yandan rəqibə təmas — qalan sürət, geri sıçrayış, ötürülən sürət; əks-əlaqə (hissəcik, kamera itələnməsi və qayıtma vaxtı) → `tests/out/impact.json` | geri sıçrayış < 6 m/s; sürtünmədə sürətin > 85%-i qalır; zəif toxunuş effektsiz; kamera < 0.7 s-də qayıdır | ~10 s |
| `npm run test:race-end` | yarışın sonu (oflayn): bot qalib → bildiriş və geri sayım, düymə → nəticə ekranı, vaxt bitəndə özü açılır, oyunçu qalibdirsə çıxmır, telefonda HUD-u örtmür → `tests/out/race-end-*.png` | 4 test yaşıl | ~20 s |
| `npm run test:online` | onlayn yarış, iki ayrı brauzer konteksti + yerli PeerJS broker (`peerserver/`, port 9123; canlı serverə toxunmur): host finişə çatır → qonaqda "uduzdun" → Enter → nəticə dərhal; bitirən maşın yerində qalır; heç kim bitirməsə host 30 s-dən sonra göndərir | 3 test yaşıl | ~25 s |
| `npm run test:damage` | silah zərəri (yarış): mina can aparır; raket/mina/güllə/şimşək zərəri; yüngül/orta/ağır maşında can və raketlə partlayışa qədər vuruş sayı; zərər fasiləsi silahı udmur → `tests/out/damage.json` | raket ≥ mina > şimşək; orta maşın 4 vuruş; ağır maşın daha çox dözür | ~15 s |
| `npm run test:zen-contact` | zen: (1) yoldan kənar sürüşdə hər təkərin görünən səthə batması; (2) maşın 5 mühitdə hər maneə növünə 2 bucaqdan sürülür, gövdənin modelin içinə girişi şüa ilə ölçülür → `tests/out/zen-contact.json` | kənarda təkər p99 < 0.2 m; ən dərin giriş < 0.35 m | ~7 dəq |
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

## Hələ yazılmamış yoxlamalar

| Yoxlama | Qeyd |
|---|---|
| Onlayn (iki brauzer prosesi): otaq yaratma + qoşulma + sinxron yarış | yerli PeerJS brokeri və ya canlı server tələb edir |
| Güc balansı (`ability-balance`, analitik) | Faza 2-də sürüş modeli dəyişəndən sonra |
| Zen/arena/futbolda maneə toqquşması | `test:collide` yalnız yarış treklərini əhatə edir |

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
