# NitroVerse

Brauzerdə işləyən oyun dünyası. **Tək oyun deyil** — içində çoxlu oyun olacaq.
Hazırda: 3D low-poly yarış oyunu (yarış — 9 trek, zen, futbol 3v3, arena, onlayn).
Hazırlanır: Carmageddon — hekayə əsaslı post-apokaliptik yarış, piksel art (hələlik başlıq ekranı). Sahibi: Samir Abbasov.

İstifadəçi ilə **Azərbaycan dilində** danış. Kod şərhləri və commit mesajları da Azərbaycan dilindədir.

## İş protokolu (pozulmaz)

Əvvəlki sessiyalarda oyun görülmədən dəyişdirilib və layihə korlanıb. Bunun təkrarlanmaması üçün:

1. **Əvvəl oxu və ölç.** Dəyişəcəyin davranışın kodunu oxu; vizual/performans işində əvvəlki vəziyyətin kadrını və rəqəmini götür.
2. **Hissi dəyişən işi əvvəl təklif et.** Oynanış hissi, kamera, fizika, görünüş, UI axını dəyişirsə — 2-3 cümləlik təklif yaz, təsdiq al, sonra başla. Buq düzəlişi və istifadəçinin konkret dediyi iş üçün təsdiq lazım deyil.
3. **Bir dəyişiklik → yoxla → commit.** `npm run check`, vizual işdə `npm run test:shots` və kadrlara **Read ilə bax**. Bir commit-də bir mövzu.
4. **"Hazırdır" yalnız sübutla.** Ölçmə nəticəsi və ya kadr olmadan "düzəldi/gözəl oldu" demə. Yoxlaya bilmədiyini açıq de.
5. **Aşkar qüsuru soruşmadan düzəlt.** Buq, sınıq görüntü, iç-içə keçən/yanıb-sönən obyekt, xəta tapdınsa — eyni sinifdən olanların hamısını axtar, düzəlt, ölç, commit et, sonra hesabat ver (istifadəçi: "düzəlməlidirsə düzəlt sadəcə"). Yeni xüsusiyyət və zövq/hiss dəyişikliyi bura aid deyil — onlar 2-ci bəndlə gedir.
6. **Push və deploy yalnız istifadəçi deyəndə.** (`nitroverse-deploy` skill-i)
7. **Öz işini tərifləmə.** Nəyin dəyişdiyini, nəyin ölçüldüyünü, nəyin qaldığını yaz.

## Əmrlər

```bash
npm run dev          # http://localhost:5173 (DEV qarmaqları aktiv)
npm run build        # → dist/
npm run lint         # eslint src tests
npm run check        # lint + build + smoke testi — hər dəyişiklikdən sonra
npm run test:smoke   # bütün rejimlər açılır, 0 konsol xətası
npm run test:perf    # kadr vaxtı, draw call, üçbucaq → tests/out/perf.json
npm run test:shots   # bütün rejim/trek/menyu kadrları → tests/out/shots/
npm run test:leak    # səhnə dövrlərində tekstura/geometriya sızması
npm run test:items   # bonus qutusu invariantı (ikon–işıq, maqnit)
npm run test:overlap # iç-içə keçən / yolun üstündəki obyektlər
npm run test:zfight  # yanıb-sönən səthlər (z-fighting) — ~7 dəq
npm run test:hitch   # kadr donması (şeyder kompilyasiyası və s.) — ~6 dəq
npm run test:abilities # 18 imza gücünün auditi
npm run test:pace    # maşınlar arası sürət balansı — ~10 dəq
npm run test:arena   # arena silahları, mina, lazer, vuruş sayğacı
npm run test:track-map # trek sxemi + həndəsə (yeni trek/şaxə çəkəndə)
npm run test:zen-contact # zen: təkərlər yerə, gövdə maneəyə girmir — ~7 dəq
LIVE_URL=http://… npx playwright test tests/live.spec.js  # canlı saytın tüstü yoxlaması (deploydan sonra)
npm run test:carmageddon # Carmageddon başlıq ekranı: açılır, qəhrəman canlıdır, telefonda sığır
npm run test:coach   # ilk yarış ipucları: görünür, itir, təkrarlanmır
npm run test:results # nəticə ekranı: dövrə vaxtları, şəxsi rekord, telefonda sığır
npm run test:settings # ayarlar ekranı: seçimlər tətbiq olunur, telefonda sığır
npm run test:session # bir hesab — bir cihaz: yeni giriş köhnə cihazı çıxarır (öz backend-i müvəqqəti qaldırır)
npm run test:feel-arena # arena/futbol sürüş rəqəmləri və bot davranışı (köhnə ↔ v2) — ~5 dəq
npm run test:feel    # sürüş modelinin rəqəmləri → tests/out/feel.json (fizika dəyişəndə əvvəl/sonra)
npm run serve:dev    # öz backend (SQLite) yerli
```

Testlər Playwright-dır (`tests/`, köməkçi: `tests/helpers.js`). Yeni yoxlama lazımdırsa scratchpad-ə yox, **`tests/`-ə yaz**.

## Arxitektura

Vanilla JS (ESM), Three.js r160, Vite 5. Framework və TypeScript yoxdur.

```
src/main.js          giriş nöqtəsi: platformanı qurur, oyunu açır
src/platform.js      bütün oyunların ortaq təməli: kətan, giriş, səs kilidi, hesab/sosial kimlik, bildirişlər
src/games/           oyunların siyahısı (index.js) və hər oyunun öz qovluğu
  racing/index.js    yarış oyunu: goMenu / startGame / startOnlineGame, nəticə, dəvət axını
  carmageddon/       2-ci oyun (hazırlanır): piksel başlıq ekranı; üslub — docs/CARMAGEDDON-STYLE.md
src/core/            Game.js (renderer+loop), səhnələr, audio, i18n, effektlər
  GameplayScene.js   yarış          EndlessScene.js   zen (sonsuz yol)
  FootballScene.js   futbol 3v3     ArenaScene.js     battle royale
  ShowcaseScene.js   menyu fonu
src/world/           TrackBuilder, EndlessRoad, Environment, NatureKit/CityKit
src/entities/        Car.js (arcade fizika: v2 model bütün rejimlərdə; zen/arena/futbol öz profili ilə — `car.tuneFeel`), Player/AI/Network controller
src/race/            RaceManager, PowerUpManager, SignatureAbility
src/net/             NetRoom (PeerJS P2P, host-avtoritativ), Auth, Social
src/ui/              Menu.js (bütün ekranlar _panel-dən keçir), HUD, Results
src/data/            tracks, cars, cosmetics, economy, balance
server/              öz backend: tək Node prosesi + SQLite (canlı: Hetzner)
netlify/functions/   eyni API-nin Netlify variantı (ehtiyat)
peerserver/          öz PeerJS signaling brokeri
art/                 2D işlərin mənbə faylları (oyuna daxil deyil)
```

Səhnə interfeysi: `{ scene, camera, update(dt), dispose() }` — `game.setActive()` köhnəni dispose edir.

DEV qarmaqları (yalnız `npm run dev`): `window.__menu` (`.onStart(config)` istənilən rejimi başladır), `__active` (aktiv səhnə, `.renderer.info`), `__showcase`, `__audio`, `__THREE`. Prod build-də yoxdur.

## Hədlər

- **Performans:** yarış draw call < 140, zen < 110, üçbucaq < 90 000, kadr p99 < 22 ms. Yeni effektdən sonra ölç.
- **Dil:** hər yeni mətn açarı 4 dildə — az/en/ru/tr (`src/core/i18n.js`).
- **Mobil:** oyunçuların çoxu telefondadır; hər UI dəyişikliyi 844×390-da yoxlanır.
- **Asset:** yalnız CC0 və ya açıq icazəli; hər xarici/AI asset `docs/ASSETS-LICENSES.md`-ə yazılır.
- **Onlayn protokol** dəyişəndə `src/net/NetRoom.js` → `PREFIX` artır.

Sahəyə aid ətraflı qaydalar `.claude/rules/`-dadır və uyğun fayla toxunanda özü yüklənir.

## Alətlər

MCP (`.mcp.json`): `chrome-devtools` (oyunu görmək, oynamaq, profil), `threejs-devtools` (canlı səhnə), `context7` (aktual kitabxana sənədi — Three.js API-ni yaddaşdan yazma, yoxla), `blender`, `drawthings`. Seçimlərin səbəbi və limitlər: `docs/TOOLS.md`.

Skill-lər: `nitroverse-playtest`, `nitroverse-visual-check`, `nitroverse-asset-pipeline`, `nitroverse-art-2d`, `nitroverse-deploy`, `threejs-*`.

## Sənədlər

`docs/UPGRADE-PLAN.md` (aktual upgrade planı — fazalar, qərarlar) · `docs/BASELINE.md` (ölçülmüş hazırkı vəziyyət) · `docs/DESIGN.md` · `docs/UI.md` · `docs/MOBILE.md` · `docs/MODELS.md` · `docs/TESTING.md` · `VISION.md` · `ROADMAP.md`
