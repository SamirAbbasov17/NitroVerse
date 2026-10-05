# NitroVerse — əsas oyunun upgrade planı

Tarix: 2026-10-05 · Əsas: `docs/BASELINE.md` (ölçmə + 54 kadr) və `npm run test:feel` (sürüş modelinin rəqəmləri).
Bu sənəd `docs/PRO-PLAN.md`-i əvəz edir: oradakı ideyalar qalır, amma sıra ölçməyə görə yenidən qurulub.

Hədəf (istifadəçinin sözləri ilə): **daha axıcı oynanış · daha professional görüntü · daha xətasız oynanış · UI/UX**.

## Necə işləyəcəyik

- Hər faza ayrı budaqdır; hər maddə ayrı commit: **əvvəl ölç → dəyiş → yenidən ölç → kadra bax**.
- **Hissi və görünüşü dəyişən hər maddə əvvəlcə sənə göstərilir** (aşağıda 🔶 ilə işarələnib). Sürüş dəyişiklikləri üçün köhnə və yeni tənzim yan-yana oynanıla biləcək (`?feel=yeni` URL parametri) — sən oynayıb seçirsən, mən yox.
- Faza yalnız sən oynayıb "olar" deyəndə bağlanır. Deploy yalnız sən deyəndə.
- Ölçü: S = bir oturuş, M = bir neçə oturuş, L = böyük iş. Gün vədi vermirəm — əvvəlki planlardakı "1 gün" vədləri real deyildi.

---

## Faza 1 — Xətasızlıq və təməl

Görünüşü və hissi dəyişmir; sonrakı fazaların üstündə dayanacağı zəmini düzəldir.

| # | İş | Niyə (sübut) | Yoxlama | Ölçü |
|---|---|---|---|---|
| 1.1 | ✅ **Testlərin bərpası** — indi 13 dəst: smoke, perf, shots, leak, items, overlap, zfight, hitch, collide (maneələrin içindən keçmə, 6 trek × 14), gameplay (bonus, bot sürəti, pauza, ölçü dəyişmə, sürətli keçid), errors, mobile, feel. Yazılmayıb: onlayn (iki brauzer), zen/arena toqquşması | `docs/TESTING.md` | yaşıl | — |
| 1.2 | ✅ **Klient xəta bildirişi** — tutulmamış JS xətası avtomatik `/api/report`-a gedir (rejim adı, build, cihaz; ləqəbsiz). E-poçt göndərmir: eyni xəta bir qeyddə sayılır, admin qutusunda ən çox təkrarlanan yuxarıda görünür. Sessiyada ən çox 5, cihaz başına dəqiqədə 1 | `test:errors` | klient + server testi yaşıl | — |
| 1.3 | ✅ **Zen donması** — düzəldilib. Səbəb yol qurulması deyildi: gecə düşəndə günəşin `castShadow`-u söndürülür və bütün şeyderlər yenidən kompilyasiya olunurdu (61–70 ms); yağış/qar ilk görünəndə də kompilyasiya olunurdu (69 ms). Qalan: chunk qurulması 12 ms çəkir — masaüstündə problem deyil, zəif telefonda ölçülməlidir | `test:hitch` | 5 880 kadrda >20 ms: 2 → 0 | — |
| 1.4 | ✅ **Draw call** — 9 rejimdən 8-i büdcədə. Tüstü/qəlpə/qığılcım/konfeti instanslandı (futbolda qol anı 392 → 145, kanyon 274 → 130), küçə lampaları birləşdirildi (60 → 3), futbol tribunaları (72 → 24). **Qalan — zen 162 (büdcə 110):** yol parçası başına ~17 material; vertex rənginə keçid lazımdır | `test:perf` | zen istisna yaşıl | zen: M |
| 1.5 | ❎ **Sabit fizika addımı — lazım deyil (ölçüldü).** Fərziyyə yanlış çıxdı: maşın modeli 20–120 FPS arasında demək olar eyni davranır (2 s tam sükan: 163° / 159°; 200 m-də mövqe fərqi < 3 m; əyləc 13.6 / 14.4 m). Model artıq `pow(x, dt·60)` ilə yazılıb. 20 FPS-dən aşağıda oyun yavaşlayır (dt tavanı 50 ms) — qəsdəndir | ölçmə | — | — |
| 1.6 | ✅ **Görünən yerləşdirmə qüsurları** — düzəldilib: suyun içindəki obyektlər, göldən çıxan relyef, yanıb-sönən laylar və lövhələr, iç-içə dekor (yarış + zen), menyu fonunda dirək. ("Əyri binalar" və "futbol kamerası" səhv müşahidə çıxdı — `BASELINE.md` §3.) | `test:overlap`, `test:zfight` | yaşıl | — |
| 1.7 | ✅ **Kod təmizliyi** — lint 43 xəbərdarlıq → 0 (bundan sonra xəbərdarlıq `check`-i qırır). Təmizlik 2 real buq üzə çıxardı: qlobal çatda mesaj getməyəndə izah əvəzinə xəta atılırdı (`t` kölgələnməsi); çay sahili daşlarının hamısı eyni sahilə düşürdü (işlədilməyən `side`) | `npm run lint` | 0 | — |
| 1.8 | ✅ **Musiqi lisenziyası** — HoliznaCC0, CC0 1.0 Universal. Şübhəli 6 trekin albom səhifələri yoxlanıb; mənşə qeydi `public/music/LICENSE.txt` | `ASSETS-LICENSES.md` | — | — |

## Faza 2 — Sürüş hissi 🔶

Ən böyük "axıcılıq" qazancı buradadır. Ölçmə (`tests/out/feel.json`, 3 maşın):

| Ölçü | İndi | Nə deməkdir |
|---|---|---|
| 0 → 99% maksimum sürət | **1.75 s** (hər 3 maşında ±0.08 s) | Sürət dərhal tavana dəyir və orada qalır — sürətlənmə hissi yoxdur; "sürətlənmə" statı praktik olaraq heç nə dəyişmir |
| Tam qazla dönmə | sürət itkisi **0%**, radius 28–33 m | Əyləcə və ya driftə ehtiyac yoxdur — döngə bacarıq tələb etmir |
| Drift (1 s əl əyləci) | sürüşmə bucağı **86°**, irəli sürət 4–5%, bərpa **1.65 s** | Bu drift deyil, yana fırlanmadır; adi dönmədən həmişə zərərlidir (adi dönmə 1 s-də 75°, itkisiz) |
| Qazı buraxmaq | 2 s-də sürət 37%-ə düşür | Ayağı çəkmək güclü əyləc kimidir — sürüş "yapışqan" hiss olunur |
| Əyləc 225 → 0 | 0.77 s, 14 m | Çox kəskin; əyləc nöqtəsi anlayışı yoxdur |
| Yoldan kənar | 0.5 s-də 60%-ə, tarazlıq 38% | Kiçik səhv dərhal ağır cəzalanır |
| Maşınlar arası fərq | maks. sürət 210–241, qalanı demək olar eyni | 18 maşın oxşar sürülür |

### v2 modeli — ✅ STANDART (2026-10-05)

2.1–2.5 bir model kimi yazılıb (`TUNING.feel2`, `Car._driveV2`). İstifadəçi köhnə ilə yan-yana oynayıb (`?feel=2` keçidi) **yenini seçdi** — indi yarış və zen-də (oflayn və onlayn) standartdır; sınaq keçidi silinib, onlayn protokol v14-ə qaldırılıb. Arena və futbol hələ köhnə modeldədir (`legacyFeel`) — ayrıca tənzimlənəcək (2.10).

Ölçmə (`npm run test:feel`, Blaze GT):

| Ölçü | Köhnə | v2 |
|---|---|---|
| 0 → 50% / 90% / 99% sürət | 0.70 / 1.52 / 1.75 s | 0.78 / 2.48 / 4.08 s |
| Tam qazla tam sükan: saxlanılan sürət | 100% | 83% |
| Dönmə radiusu (tam sükan) | 27.6 m | 20.2 m |
| Drift 1 s: sürüşmə bucağı | 86° | 33° |
| Drift 1 s: saxlanılan ümumi sürət | 70% | 96% |
| Drift 1 s-də dönmə / adi dönmə | 116° / 75° | 111° / 80° |
| Drift çıxışı: 95% sürətə qayıdış | 1.65 s | 0.12 s (çıxış təkanı ilə) |
| Qazı buraxmaq: 2 s sonra sürət | 37% | 70% |
| Əyləc 225 → 0 | 0.77 s / 14 m | 1.35 s / 27.5 m |
| Yoldan kənar: 60%-ə düşmə / tarazlıq | 0.5 s / 38% | 1.5 s / 47% |
| Nitro: zirvəyə çatma | 0.32 s | 0.57 s |

Köhnə modeldə tutum statı tərsinə işləyirdi (yüksək "Tutum" = daha çox sürüşmə); v2-də yüksək tutum az sürüşür.

Təklif olunan istiqamət (hər biri ayrıca göstəriləcək və sən seçəcəksən):

| # | İş | Ölçü |
|---|---|---|
| 2.1 | ✅ **Sürətlənmə əyrisi**: ilk 60% cəld, qalanı tədricən (tam sürətə ~5–6 s); nitro bu əyrinin üstündə hiss olunsun | S |
| 2.2 | ✅ **Döngədə sürət**: sərt sükanda yüngül sürət itkisi (understeer) — düz xətt, əyləc və drift arasında real seçim yaransın | S |
| 2.3 | ✅ **Drift yenidən**: idarə olunan sürüşmə (25–40°), sürətin 85–90%-i qalır, düz çıxışda kiçik təkan — arcade yarışların əsas "feel" mexanikası | M |
| 2.4 | ✅ Qaz buraxma və əyləc: daha uzun süzmə, daha yumşaq əyləc | S |
| 2.5 | ✅ Yoldan kənar cəzası: daha yumşaq giriş (~1.5 s), eyni tarazlıq | S |
| 2.6 | 🔶 **Maşın şəxsiyyəti**: statların real fərq yaratması (sürətlənmə, tutum, drift meyli) — 5 sinif fərqli sürülsün | M |
| 2.7 | 🔶 **Kamera**: döngəyə qabaqcadan baxış; rəqib maşın kameranın önünü tutanda şəffaflaşma (4 trekdə kadrı örtür); divara girməmə | M |
| 2.8 | 🔶 **AI** — ilkin ölçmə (40 s, botların median irəliləyişi; yoldan kənar vaxt), oyunçu maşını kənara çəkilmiş: Səhra asan 0.86 / normal 1.12 / çətin 1.16 (çətin 7.5% kənarda) · Neon 0.65 / 0.97 / 1.00 (çətin 13.6% kənarda) · Kanyon 0.49 / 0.61 / 0.70 (çətin 10.1% kənarda). Yəni "çətin" normaldan cəmi 3–14% sürətlidir və vaxtının ~10%-ni yoldan kənarda keçirir. **Sınanıb və geri götürülüb:** əyriliyə görə döngə sürəti + əyləc — tək qaçışlarda nəticə səs-küydən ayrılmadı (bonus zərbələri və botların toqquşması yoldan çıxmanın əsas səbəbi ola bilər). Düzgün yol: əvvəl nəzarətli ölçmə (bonuslar sönülü, hər səviyyədən 5 qaçış, dövrə vaxtı), sonra dəyişiklik | M |
| 2.10 | 🔶 **Arena və futbol** — hələ köhnə sürüş modelindədir. v2-yə keçid ayrıca tənzim tələb edir (kiçik meydan, top fizikası, istifadəçinin tənzimlətdiyi futbol kamerası) | M |
| 2.9 | Toz/tüstü: iri "daş" çoxüzlülər əvəzinə yumşaq sprite hissəciklər; sürət hissi (yol kənarı axını, FOV) | S–M |

Yoxlama: `test:feel` rəqəmləri (hədəf dəyərlər 2.1-dən əvvəl birlikdə təsbit olunur) + sənin oynaman. Onlayn protokola toxunarsa `PREFIX` artır.

## Faza 3 — Görüntü 🔶

| # | İş | Niyə (kadr) | Ölçü |
|---|---|---|---|
| 3.1 | **Bədii bibliya**: hər trek üçün palitra + icazəli dekor siyahısı + 2–3 referans kadr; sən təsdiqləyirsən | Trekdən-trekə bədii dil dəyişir; bundan sonrakı hər iş buna söykənir | S |
| 3.2 | **Neon və Zavod**: qara siluet/qutu binalar → pəncərəli, işıqlı, formaca fərqli binalar (KayKit + Blender kitbash) | `d-race-neon-*`, `d-race-zavod-*` | M |
| 3.3 | **Uzaq fon**: hər trekdə eyni konus dağlar → trekə xas silsilə/siluet (2–3 lay) | bütün yarış kadrları | M |
| 3.4 | **Maşın görünüşü**: boyada mühit əksi (bir dəfəlik envmap), gecə/qürubda oxunaqlıq, fara/stop işıqları | `d-zen-tod-night`, `-dusk` | M |
| 3.5 | Hər trekə 2–3 landmark ("poster nöqtəsi") | orta lay boşdur | L |
| 3.6 | Arena: döşəmə kontrastı, bonus ikonu ölçüsü; yarışda yaxın ikon ölçüsü | `d-arena-*`, `d-race-zavod-1drive` | S |
| 3.7 | Zen gecə: su səthi, yol kənarı | `d-zen-tod-night` | S |

**İstifadəçinin əlavə tələbi (2026-10-05): modellər, ətraf mühit və filtrlər professional görünsün.** Bu faza ona görə genişləndirildi:

| # | İş | Niyə | Ölçü |
|---|---|---|---|
| 3.8 | **Maşın modelləri**: 10 Kenney gövdəsi 18 maşına paylanıb, fərq əsasən rəngdədir. Hər maşın üçün Blender-də detal keçidi (kənar əyriləri, fara/stop, spoyler, egzoz, şüşə), lazım olan siniflər üçün yeni CC0 gövdələr; qarajda siluet testi | Maşın ekranın mərkəzindədir — ən çox baxılan obyektdir | L |
| 3.9 | **Ətraf mühit modelləri**: prosedural qutu/konus dekorun (tribuna, bariyer, bina, dağ, qaya) vahid üslublu modellərlə əvəzlənməsi — CC0 dəstlər + Blender; hər trek üçün bədii bibliyadakı siyahı üzrə | Prosedural həndəsə "prototip" kimi oxunur | L |
| 3.10 | **Yer və yol səthi**: düz rəngli torpaq → səth variasiyası, yol kənarı keçidi, asfalt detalı | `d-race-*` kadrlarında yer boş və yastıdır | M |
| 3.11 | **Filtrlər və rəng qradasiyası**: hər trek üçün qradasiya preseti (LUT/əyri), bloom, yüngül vinyet; zen-in retro filtrləri yenidən (indiki CSS qatı əvəzinə render daxilində); söndürülə bilən | Görüntünün "bitmiş" hiss verməsi üçün ən ucuz böyük addım | M |
| 3.12 | **İşıq**: hər trek üçün günəş bucağı/rəngi/kölgə keyfiyyəti, gecə treklərində işıq mənbələrinin real parıltısı | Neon və Zavod tutqun və yastı işıqlanıb | M |

Sıra bu fazanın daxilində: 3.1 (bibliya) → 3.11 + 3.12 (filtr və işıq — bütün treklərə dərhal təsir edir) → 3.8 (maşınlar) → 3.2 / 3.3 / 3.9 / 3.10 (mühit, trek-trek) → qalanı. Hər trek ayrıca göstərilir və təsdiqlənir.

**Postprocessing (qərar verilib: bəli, yalnız masaüstündə).** İndiki qayda "heç vaxt" deyir (mobil FPS üçün). Masaüstündə kadr xərci 2–5 ms-dir, ehtiyat böyükdür. Təklif: **yalnız masaüstündə**, söndürülə bilən yüngül bloom + rəng qradasiyası; mobil olduğu kimi qalır. Bu, "professional görüntü" üçün ən ucuz böyük addımdır, amma qayda sənindir.

## Faza 4 — Səs 🔶

| # | İş | Niyə | Ölçü |
|---|---|---|---|
| 4.1 | **Mühərrik**: 3 ossilyatorlu sintez → yazılmış laylı döngələr (aşağı/orta/yüksək dövr), CC0 mənbədən | Hazırkı səs sintetik vızıltıdır; hissin böyük hissəsi səsdir | M |
| 4.2 | Təkər (səthə görə), drift cığırtısı, külək | drift yenidən qurulanda birlikdə | S–M |
| 4.3 | Toqquşma (şiddətə görə), bonus, UI səsləri — vahid dəst | | S |
| 4.4 | Mühit: zen (quş, külək), neon (şəhər), tunel əks-sədası | | S |
| 4.5 | Səs ayarları: musiqi / effekt ayrı sürgülər | İndi yalnız tam səssiz düyməsi var | S |

Mənbə: Kenney Audio, Sonniss GDC, Freesound (CC0). Hər fayl `ASSETS-LICENSES.md`-ə.

## Faza 5 — UI/UX 🔶

| # | İş | Niyə | Ölçü |
|---|---|---|---|
| 5.1 | **Dizayn sistemi**: şrift şkalası, 8 px şəbəkə, vahid ikon dəsti (emoji əvəzinə), düymə/kart komponentləri, keçid animasiyaları | Tipoqrafiya və ikonlar sistemsizdir; emoji hər cihazda fərqli görünür | M |
| 5.2 | **HUD**: boş qabiliyyət slotları (yer tutucu kimi görünür), sürət göstəricisi, mövqe dəyişmə animasiyası, sürətdə oxunaqlıq | `BASELINE.md` §3 | M |
| 5.3 | **İlk 60 saniyə**: ilk girişdə qısa sınaq sürüşü, idarə ipucları kontekstdə | Yeni oyunçu hər şeyi özü kəşf edir | M |
| 5.4 | **Ayarlar ekranı**: qrafika keyfiyyəti, səs, idarə, dil bir yerdə | Hazırda yoxdur | S |
| 5.5 | Mobil menyu: rejim siyahısında 5-ci sətrin gizlənməsi, "Xəta bildir" formunun kəsilməsi | `m-menu-modes`, `m-menu-bugreport` | S |
| 5.6 | Nəticə ekranı: dövrə vaxtları, ən yaxşı dövrə, şəxsi rekord | | S |
| 5.7 | Yüklənmə: JS 1.15 MB tək parça → rejimə görə bölmə; ilk ekrana qədər vaxt ölçülür | `BASELINE.md` §1 | S |

## Faza 6 — Platforma (Carmageddon-a hazırlıq)

| # | İş | Ölçü |
|---|---|---|
| 6.1 | Dörd səhnənin ortaq nüvəsi (maşın, kamera, HUD bazası, effektlər) — indi hər biri 1400–2000 sətir ayrıca yazılıb | L |
| 6.2 | Çox-oyunlu quruluş: `src/games/<ad>/` + ortaq hub (oyun seçimi); yarış oyunu ilk "oyun" olur | M |
| 6.3 | Three.js r160 → aktual: ayrıca budaqda, tam kadr müqayisəsi ilə (**qərar lazımdır**: risk var, qazanc — yeniliklər və düzəlişlər) | M |

---

## Tövsiyə olunan sıra

**1 → 2 → 5.2 (HUD) → 3 → 4 → 5 (qalanı) → 6**

Səbəb: Faza 1 qalan hər şeyin ölçülə bilməsi üçündür. Faza 2 "axıcı oynanış"ın özüdür və heç bir asset tələb etmir. Görüntü (3) ən çox əmək tələb edən hissədir və bədii bibliya təsdiqindən asılıdır. 6.1/6.2 Carmageddon başlamazdan əvvəl lazımdır, ondan tez yox.

## Qərarlar

Verilib (2026-10-05, istifadəçi):

| Qərar | Seçim |
|---|---|
| Sürüş istiqaməti (Faza 2) | **Arcade-drift** — tədrici sürətlənmə, döngədə yüngül itki, idarə olunan və mükafatlandırılan drift. Hər dəyişiklik köhnə ilə yan-yana oynanıb seçilir. |
| Postprocessing (Faza 3) | **Bəli, yalnız masaüstündə** — yüngül bloom + rəng qradasiyası, ayarlardan söndürülə bilən. Mobil toxunulmaz. `docs/DESIGN.md` qaydası Faza 3-də buna uyğun yenilənəcək. |
| Başlanğıc | **Faza 1 (xətasızlıq)**, sonra tövsiyə olunan sıra. |

Açıq qalır:

1. **Three.js yenilənməsi** (6.3) — tələsmir, Faza 6-da qərar.
2. Bədii istiqamət: Faza 3.1-də hər trek üçün referans kadrlarla seçim.
