# Baseline — oyunun ölçülmüş hazırkı vəziyyəti

Tarix: **2026-10-05** · commit `5f50949` üzərində (oyun koduna toxunulmayıb)
Maşın: MacBook Air M5, 16 GB · Chrome headless, real GPU (ANGLE Metal) · 1280×720, pixelRatio 1
Üsul: `npm run test:*` — maşını yolu izləyən avtopilot sürür (real giriş yolu ilə).

Bu sənəd hökm deyil, **başlanğıc nöqtəsidir**: upgrade planı bu rəqəmlərə və kadrlara söykənəcək, hər dəyişiklik bunlarla müqayisə olunacaq. Yenidən ölçmək: `npm run test:perf && npm run test:shots`.

## 1. Sabitlik

| Yoxlama | Nəticə |
|---|---|
| Smoke (9 rejim/trek + menyu) | 10/10 keçdi, **0 konsol xətası** |
| Yaddaş sızması (18 səhnə dövrü) | keçdi — tekstura 1-ci turda 24→44, sonra **44-də plato**; geometriya 47–74 arası, artım yox |
| Mobil HUD örtüşməsi (844×390, 4 rejim) | 0 örtüşmə, 0 ekrandan kənar düymə |
| Build | keçir; JS tək parça **1 155 KB** (gzip 330 KB) — kod bölünməsi yoxdur |
| Lint | 0 xəta, **41 xəbərdarlıq**: 26 `no-shadow` (əksəri i18n `t` funksiyasının kölgələnməsi), 13 istifadəsiz dəyişən, 2 faydasız mənimsətmə |

Yoxlanmayıb: onlayn (iki brauzer), toqquşma/şüa testləri, AI çətinlik sırası, balans — köhnə skriptlər itib (`docs/TESTING.md`).

## 2. Performans

| Rejim | FPS | Kadr xərci p50 / p99 / max (ms) | >33 ms kadr | Draw call | Üçbucaq |
|---|---|---|---|---|---|
| race-desert | 58.8 | 2.1 / 3.8 / 6.1 | 3 | 96 | 52 666 |
| race-neon | 59.3 | 2.4 / 3.9 / 5.5 | 2 | **175** | 55 080 |
| race-alpine | 59.6 | 2.6 / 4.6 / 6.3 | 1 | 110 | 53 253 |
| race-canyon | 60 | 2.4 / 4.3 / 10.5 | 0 | **258** | 65 186 |
| race-riviera | 59.8 | 2.4 / 4.2 / 4.7 | 1 | **207** | 69 117 |
| race-zavod | 58.7 | 2.9 / 5.3 / 6.4 | 4 | **198** | 67 074 |
| zen | 59.8 | 1.7 / 7.6 / **60.7** | 1 | **192** | **93 339** |
| football | 60 | 2.7 / 4.3 / 4.7 | 0 | **400** | 23 470 |
| arena | 60 | 3.2 / 4.8 / 5.6 | 0 | **221** | 25 942 |

Qalın = `docs/MODELS.md` büdcəsindən kənar (yarış < 140, zen < 110 draw call; < 90 000 üçbucaq).

Oxunuşu:
- **CPU kadr xərci aşağıdır** (p99 < 8 ms) — bu maşında ehtiyat böyükdür.
- **Draw call sənəddəki büdcədən 9 rejimdən 7-də yüksəkdir.** Sayğaca kölgə keçidi də daxildir (masaüstündə kölgə aktivdir), köhnə ölçmə üsulu məlum deyil. Ya büdcə yenidən təyin olunmalıdır, ya da səhnələr optimallaşdırılmalıdır — mobil ölçmə ilə qərar verilməlidir.
- **Futbol 400 draw call** — 23 min üçbucaq üçün çoxdur; birləşdirilməmiş çoxlu kiçik obyekt əlamətidir.
- **Zen-də 60–74 ms donma** hər ölçmədə 1 dəfə təkrarlandı (chunk yaradılması ehtimalı) — hiss olunan ilişmədir.
- Yarışda 12 saniyədə 1–4 kadr 33 ms-i keçir (xərc deyil, interval) — səbəbi araşdırılmayıb.
- Ölçülməyib: GPU vaxtı, mobil/zəif cihaz, onlayn.

## 3. Vizual müşahidələr

Mənbə: `tests/out/shots/` (54 kadr). Statik kadrlardan görünənlərdir; hərəkətdə təsdiq üçün playtest lazımdır.

**Səhnə**
1. **Zen: şəhər binaları əyri dayanır** — KayKit binaları şaquli deyil, yana əyilib (`d-zen-1drive`, `m-zen-hud`); səbəbi araşdırılmayıb.
2. **Neon: binalar qapqara siluetdir** — pəncərə işığı az, səth detalı yoxdur; yer də qaradır (`d-race-neon-*`).
3. **Zavod: "binalar" teksturasız tünd-göy qutulardır**, mühit tutqun boz-qəhvəyidir (`d-race-zavod-*`).
4. **Dağlar bütün treklərdə eyni konus formasındadır**, düz rəngli — fon təkrarlanır.
5. **Toz/tüstü hissəcikləri iri boz çoxüzlü "daş" kimi oxunur** (`d-race-alpine-2later`, `d-race-zavod-2later`).
6. **Zen gecə/qürub: maşın demək olar ki, qara siluetdir**; gecə kadrında yolun hər iki tərəfi düz göy sudur (`d-zen-tod-night`, `-dusk`).
7. Arena: döşəmə çox tünddür, kontrast aşağıdır; bonus ikonları maşından iridir.
8. Yarışda yaxın bonus ikonu ekranın ~dörddə birini tutur (`d-race-zavod-1drive`).

**Kamera**
9. **Rəqib maşınlar kameranın önünü tutur** — arxadan gələn/yanaşan bot kadrın böyük hissəsini örtür (`d-race-alpine-1drive`, `-3later`, `d-race-canyon-3later`, `d-race-zavod-3later`).
10. Futbolda divara yaxın kamera divarın içindən göstərir (`m-football-hud`).
11. **Menyu fonu: finiş tağının dirəyi kadrı kəsir** — 9 ekrandan 3-də qara sütun görüntünü bölür (`d-menu-auth`, `-online`, `-signup`; mobil `m-menu-signup`).

**HUD / UI**
12. Yarışda sürət 6.7 saniyədə 225-ə çatır və orada qalır; zen-də 147-də sabitdir — sürət artımı hissi qısadır.
13. Boş qabiliyyət slotları tünd boz kvadratdır — yer tutucu kimi görünür.
14. Mobil menyu: rejim siyahısında 5-ci sətir (Onlayn) görünmür, sürüşdürmək lazımdır; "Xəta bildir" formunun aşağısı kəsilir.
15. Riviera: avtopilot 13-cü saniyədə yoldan çıxdı və 8+ saniyə 38–40 km/s ilə kənarda qaldı (`d-race-riviera-2later`, `-3later`) — yoldan çıxmanın cəzası ağır ola bilər; avtopilotun xətası da ola bilər, playtest ilə yoxlanmalıdır.

## 4. Kod və layihə

- Three.js **r160** (aktual r186) · Vite 5 · TypeScript və test yox idi (indi `tests/` var).
- Ən böyük fayllar: `styles.css` 2 310 · `EndlessScene.js` 2 018 · `Menu.js` 1 706 · `EndlessRoad.js` 1 626 · `ArenaScene.js` 1 454 · `GameplayScene.js` 1 449 · `FootballScene.js` 1 417 sətir. Dörd oyun səhnəsi ortaq nüvəsiz, ayrı-ayrı yazılıb.
- `public/music/` 50 MB (24 mp3) — **lisenziya mənbəyi qeyd olunmayıb** (`docs/ASSETS-LICENSES.md`).
- `README.md`-dəki canlı link Netlify-dır; `server/` Hetzner-də ayrıca yayımlanır.

## 5. Bu baseline-ın hədləri

- Avtopilot insan deyil: hiss (giriş gecikməsi, drift, kamera rahatlığı) ölçülməyib.
- Tək güclü masaüstü GPU-da ölçülüb; oyunçuların çoxu telefondadır.
- Vizual müşahidələr mənim kadrlardan oxuduqlarımdır — istifadəçinin öz narazılıq siyahısı ilə tutuşdurulmalıdır.
