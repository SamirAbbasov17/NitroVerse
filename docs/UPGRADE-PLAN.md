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
| 1.1 | **İtmiş testlərin bərpası**: yolun üstündə obyekt (şüa testi), binaya/dirəyə girmə, bonus götürmə, AI çətinlik sırası, pauza/resize/sürətli keçid | 16 köhnə skriptdən yalnız 6-sı bərpa olunub; maqnit buqu kimi xətaları sən tapırsan, test yox | `npm run check`-ə daxil olur | M |
| 1.2 | **Klient xəta bildirişi**: tutulmamış JS xətası avtomatik `/api/report`-a getsin (rejim, trek, brauzer) | Xətalar yalnız sən oynayanda üzə çıxır; oyunçularda nə baş verdiyini bilmirik | süni xəta ilə test | S |
| 1.3 | **Zen donması** (60–74 ms) | Hər 12 saniyəlik ölçmədə 1 dəfə təkrarlandı — hiss olunan ilişmə | performans trace ilə səbəb → `test:perf` max < 20 ms | M |
| 1.4 | **Draw call**: futbol 400, kanyon 258, arena 221, riviera 207, zavod 198, zen 192, neon 175 | Sənəd büdcəsi 140/110; 9 rejimdən 7-si kənardadır. Əvvəlcə mobil profildə ölç, sonra ən ağırları birləşdir/instansla | `test:perf` büdcəsi yaşıl; kadrlar dəyişməyib | M |
| 1.5 | **Sabit fizika addımı** (60 Hz akkumulyator) | İndi fizika kadr vaxtı ilə irəliləyir (`dt` 50 ms-ə qədər): zəif telefonda maşın fərqli davranır, onlaynda oyunçular arası fərq yaranır | `test:feel` 30/60/120 FPS-də eyni rəqəm | M |
| 1.6 | **Görünən buqlar**: zen-də əyri binalar · menyu fonunda dirəyin kadrı kəsməsi (9 ekrandan 3-ü) · futbolda kameranın divarın içinə girməsi | `BASELINE.md` §3, kadrlarla | əvvəl/sonra kadr | S–M |
| 1.7 | Kod təmizliyi: i18n `t` kölgələnməsi (26 yer), istifadəsiz dəyişənlər | Sənəddə "tələ" kimi qeyd olunub, real buq mənbəyidir | lint 0 xəbərdarlıq | S |
| 1.8 | Musiqi lisenziyası: `public/music/` 24 mp3-ün mənbəyi | Heç yerdə qeyd yoxdur — **səndən cavab lazımdır** | `ASSETS-LICENSES.md` | — |

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

Təklif olunan istiqamət (hər biri ayrıca göstəriləcək və sən seçəcəksən):

| # | İş | Ölçü |
|---|---|---|
| 2.1 | 🔶 **Sürətlənmə əyrisi**: ilk 60% cəld, qalanı tədricən (tam sürətə ~5–6 s); nitro bu əyrinin üstündə hiss olunsun | S |
| 2.2 | 🔶 **Döngədə sürət**: sərt sükanda yüngül sürət itkisi (understeer) — düz xətt, əyləc və drift arasında real seçim yaransın | S |
| 2.3 | 🔶 **Drift yenidən**: idarə olunan sürüşmə (25–40°), sürətin 85–90%-i qalır, düz çıxışda kiçik təkan — arcade yarışların əsas "feel" mexanikası | M |
| 2.4 | 🔶 Qaz buraxma və əyləc: daha uzun süzmə, daha yumşaq əyləc | S |
| 2.5 | 🔶 Yoldan kənar cəzası: daha yumşaq giriş (~1.5 s), eyni tarazlıq | S |
| 2.6 | 🔶 **Maşın şəxsiyyəti**: statların real fərq yaratması (sürətlənmə, tutum, drift meyli) — 5 sinif fərqli sürülsün | M |
| 2.7 | 🔶 **Kamera**: döngəyə qabaqcadan baxış; rəqib maşın kameranın önünü tutanda şəffaflaşma (4 trekdə kadrı örtür); divara girməmə | M |
| 2.8 | AI: əvvəlcə ölç (dövrə vaxtı paylanması, səhvlər, yığılma), sonra təklif | M |
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

1. **Musiqi fayllarının mənbəyi** (1.8) — `public/music/` 24 mp3 haradan götürülüb?
2. **Three.js yenilənməsi** (6.3) — tələsmir, Faza 6-da qərar.
3. Bu siyahıda **olmayan**, səni narahat edən şeylər — plan ölçmələrə söykənir, sənin oynayarkən gördüklərin daha vacibdir.
