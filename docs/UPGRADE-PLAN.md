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
| 2.6 | ✅ **Maşın şəxsiyyəti** — statlar v2-də real fərq yaradır (`TUNING.feel2` "MAŞIN ŞƏXSİYYƏTİ"). Ölçmə (Blaze / Titan / Venom / Ranger / Cargo): 0→99% 4.05 / 3.58 / 3.65 / 4.87 / 4.87 s · dönmə radiusu 20 / 26 / 18 / 20 / 21 m · döngədə sürət 83 / 82 / 82 / 88 / 88% · drift bucağı 33 / 27 / 36 / 26 / 24° · yoldan kənar 47 / 47 / 47 / **79** / 47% (Offroad sinfi) · əyləc 27.5 / 29.3 / 25.1 / 26.1 / 28.1 m | — |
| 2.7 | ✅ **Kamera** — önü tutan rəqib yarı-şəffaf olur (test: `oynanış: kameranın önünü tutan rəqib şəffaflaşır`). Döngəyə qabaqcadan baxış **edilmədi**: yeni driftdə kadrlara baxıldı — kamera burun və hərəkət istiqamətinin arasında durur, maşın və yol görünür; istifadəçinin əvvəl tənzimlətdiyi davranışa toxunulmadı | — |
| 2.8 | ✅ **AI — dəyişiklik lazım olmadı (nəzarətli ölçmə).** Bonuslar və imza gücləri söndürülüb, yeni sürüş modeli ilə botların 1 dövrə median vaxtı (asan / normal / çətin): Səhra 41.8 / 34.2 / 30.7 s · Neon 50.0 / 38.5 / 34.4 s · Kanyon 70.7 / 56.9 / 50.9 s; yoldan kənar vaxt hər yerdə **0%**. Yəni sıra düzgündür (pillələr arası 10–22%) və botlar yolda qalır. Əvvəlki ölçmələrdəki xaos (10–18% yoldan kənar, "çətin ≈ normal") bonus zərbələrindən və köhnə modeldən gəlirdi, botların sürüşündən yox. Test: `oynanış: bot sürəti` (3 trek) | — |
| 2.11 | ✅ **İmza gücləri auditi** (`npm run test:abilities` — 18 gücün hər biri işə salınır və vəd etdiyi təsir ölçülür). Tapılıb düzəldilənlər: **Vaxtı Geri Al** maşını geri aparmırdı (0.4 m → 80 m; tarixçədən səhv qeyd götürülürdü) · **tutum gücləri** (Dalğa Sürüşü, Buz Cığırı, Hər Yerdə Yol) yeni modeldə döngədə heç nə qazandırmırdı (−1 m → +10…17 m / 3 s) · **Yüngül Ayaq** tullanışı yalnız görüntü idi — indi alçaq maneələrin və rəqiblərin üstündən keçir · **İkinci Nəfəs**-i bot işlədəndə oyunçunun canı dolurdu · **Təqib Rejimi** bot üçün oyunçunun mövqeyinə görə güclənirdi. Balans (hədəf ~bərabər dəyər, etalon Titan = 53 m düz qazanc): Dalğa Sürüşü zəiflədildi (sürət 39 → 24 m, tutum 8.5 → 6 s), Buz Cığırının öz tutumu 7 → 4 s, İkinci Nəfəs gücləndi (24 → 35 m + 1.5 s qalxan), Qısa Yol (23 → 34 m), Kök Salma qalxanı 5 → 8 s, Ağır Yük 11 → 14 s + qalxan 3.5 s, Kölgə 14 → 18 s + 2 s qalxan, Maqnit 9 → 12 s, Partlayış Dalğası güclü itələmə (rəqib ~18 m kənara) + qısa sürət | — |
| 2.12 | ✅ **Maşın sürəti balansı** (`npm run test:pace` — eyni sürücü, bonussuz). Ölçüldü: köhnə stat aralığı ilə dövrə sürəti maşınlar arasında **17–20%** fərqlənirdi (Titan ən sürətli, Crimson ən yavaş) — bunu heç bir güc bağlamırdı. Maksimum sürət aralığı sıxıldı (36–44 → 39–42 m/s), Crimson-un idarə/sürətlənməsi azca qaldırıldı. İndi fərq: Səhra 8% → Crimson düzəlişi ilə 5%, Kanyon 5%. Yavaş maşınların üstünlükləri qalır: döngədə sürət, zireh, yoldan kənar | — |
| 2.13 | ✅ **Kamera** — istifadəçi köhnə ilə yan-yana sınayıb yenini seçdi (`src/core/ChaseCam.js`): döngənin içinə baxır (~9°; köhnə 5–10° geri baxırdı), sürətdə 0.26 m alçaq; məsafə və baxış bucağı köhnə ilə eyni (ilk sınaqda əlavə geri çəkilmə maşını uzaqlaşdırırdı — çıxarıldı). Yarış + zen. Test: `oynanış: kamera döngəyə baxır` | — |
| 2.14 | 🔶 **Toqquşma hissi** (istifadəçi tələbi, 2026-10-06; `src/core/ImpactFeel.js`, `npm run test:impact`). Yarış: maneədən geri sıçrayış 15 → 3.6 m/s (30 m/s düz zərbə), sürtünmədə sürətin 87%-i qalır; maşın-maşın təmasında real impuls (arxadan vuran 34 → 26, vurulan 20 → 28 m/s; əvvəl 33.8 / 20.2). Əks-əlaqə gücə görə: səs (`impact`, `scrape`), qığılcım, toz, gövdə silkələnməsi, kameranın istiqamətli itələnməsi (pik 0.2 m, 0.38 s-də qayıdır), telefonda titrəmə. Zen: fizika dəyişmədi (əvvəl tənzimlənib), yalnız eyni əks-əlaqə qoşuldu. **Qalır:** sənin oynayıb qiymətləndirməyin (səsi və hissi mən eşidə/hiss edə bilmirəm); arena və futbol hələ köhnə əks-əlaqədədir. | |
| 2.15 | ✅ **Yarışın sonu** (istifadəçi tələbi, 2026-10-06; `npm run test:race-end`). Kimsə birinci finişə çatanda qalanlara "Yarışı uduzdun" bildirişi + 30 s geri sayım + "Yarışı bitir" düyməsi (4 dildə; telefonda göstəricilərlə pauza düyməsinin arasında). Oflayn: düymə və ya vaxtın bitməsi → nəticə ekranı (bitirməyənlərə vaxt yazılmır). Onlayn: bitirən oyunçunun maşını yerində qalır, `giveup` hadisəsi host-a gedir; hamı finişə çatıb/bitirib/ayrılıbsa və ya 30 s keçibsə host nəticəni göndərir (`PREFIX` v16). Zolaq yenidən dizayn olundu (geri sayım halqası, Enter qısa yolu). Finiş `done` hadisəsi ilə hamıya bildirilir. **Onlayn axın `npm run test:online` ilə yoxlanır** (2 oyunçu, yerli broker); 3+ oyunçu və real şəbəkə gecikməsi yoxlanmayıb. | |
| 2.16 | ✅ **Bot "Vaxtı Geri Al" gücünü yalnız bəlada işlədir** (vurulub / sürüşür / yoldan çıxıb). Əvvəl düz yolda işlədib 3 s geriyə — oyunçunun qabağına — teleport olurdu (istifadəçi rəyi). Gəliş nöqtəsi boş seçilir və halqa ilə işarələnir. Test: `oynanış: bot geri-qayıtma gücünü…`. | |
| 2.17 | ✅ **Qalxan bütün zərəri tutur** (lazer, maneə; əvvəl yalnız raket/mina/şimşək) və **can qutusu daha tez-tez düşür**: 2.4% → adi trekdə 4.8%, zavodda 9.1% (istifadəçi rəyi). `PREFIX` v17. Test: `oynanış: qalxan lazer zərərini tutur…`. | |
| 2.18 | ✅ **Silah zərəri və zirehə görə can** (istifadəçi tələbi, 2026-10-06; `TUNING.damage`, `npm run test:damage`). Raket 28, mina 26, güllə 10 (üçü 30), şimşək 12 (əvvəl hamısı 18). Can = 70 + zireh × 0.6 → 91…127 (əvvəl hamıda 100). Raketlə partlayış: yüngül/orta maşın 4, ən ağır 5 vuruş. Silah zərəri 0.5 s-lik zərər fasiləsinə düşmür (lazerdən dərhal sonra mina can aparmırdı; üçlü atəşin 3 gülləsindən 1-i sayılırdı). Botlar da şimşəkdən can itirir. `PREFIX` v18. **Yarış rejimi üçündür; arena ayrı sistemdir.** | |
| 2.10 | 🔶 **Arena və futbol** — hələ köhnə sürüş modelindədir. v2-yə keçid ayrıca tənzim tələb edir (kiçik meydan, top fizikası, istifadəçinin tənzimlətdiyi futbol kamerası) | M |
| 2.19 | 🔶 **Arena inkişafı** (istifadəçi tələbi, 2026-10-07; `npm run test:arena` — rəy gözlənilir). Əvvəl tək silah (raket) idi. Yeni: **üçlü atəş** (3×12, izləmir), **mina** (26, 4.6 m radius, 0.7 s-də qurulur, sahibinə yarı zərər), **şimşək** (14, ani, 46 m, yavaşladır); **mərkəzi lazer** (35-ci saniyədən fırlanan iki qol, 14 zərər); **vuruş sayğacı** (HUD + nəticə cədvəli), ikili vuruş / seriya elanı, vurma nişanı. Botlar hər silahı öz anında işlədir. Hücum payı ~45%-də saxlanıb (ilk variantda 60% idi — matç 39 s-də bitirdi). Bot-bot matç müddəti: 68–80 s (köhnə kod 75–113 s), ilk elenmə 39–49 s (köhnə 17–21 s). Onlayn: atəş hadisəsi silah növünü daşıyır, yerli oyunçunun atəşi də yayımlanır (əvvəl insanın raketi rəqibdə görünmürdü), `PREFIX` v20. **Onlayn yoxlandı** (`npm run test:online` → 'onlayn arena', iki brauzer, yerli broker): dörd silah qarşı tərəfdə görünür, zərər 30/12/14/26 və can hər iki tərəfdə eyni, mina hər iki tərəfdə silinir, elenmə və vuruş sayğacı sinxron | M |
| 2.9 | ✅ **Toz/tüstü** — düz üzlü "daşlar" əvəzinə yumşaq buludcuq; tüstü və təkər izi yalnız real driftdə (sürüşmə > ~20°) çıxır | — |

Yoxlama: `test:feel` rəqəmləri (hədəf dəyərlər 2.1-dən əvvəl birlikdə təsbit olunur) + sənin oynaman. Onlayn protokola toxunarsa `PREFIX` artır.

## Faza 3 — Görüntü 🔶

| # | İş | Niyə (kadr) | Ölçü |
|---|---|---|---|
| 3.1 | 🔶 qaralama yazıldı → `docs/ART-BIBLE.md`, təsdiq gözləyir. **Bədii bibliya**: hər trek üçün palitra + icazəli dekor siyahısı + 2–3 referans kadr; sən təsdiqləyirsən | Trekdən-trekə bədii dil dəyişir; bundan sonrakı hər iş buna söykənir | S |
| 3.2 | 🔶 **Neon 1-ci addım hazırdır (2026-10-06):** pəncərəli binalar (tək paylaşılan tekstura, 3 forma, dam haşiyəsi, antena işığı), uzaq siluet də işıqlı; draw call 78 → 74. **2-ci addım (istifadəçi rəyi: "ətraf boşdur, pəncərələr balacadır"):** yol boyu iki cərgə bitişik bina (ön cərgə vitrinli), üfüq halqası 70 → 120, pəncərə 1.35×1.9 → 2.0×2.7 m (uzaqda 2.6×); draw call 74, üçbucaq 60 → 74 min, 60 FPS. **3-cü addım:** landmarklar — 2 işıqlı estakada (ən düz yerlərdə, biri mavi, biri çəhrayı) və ən uzun düzün sonunda sürücüyə baxan 30×13 m ekran; iri parıldayan səthlərin gücü 2.2 → 1.1 (ağarırdı). Draw call median 79–83 (əvvəlki commit eyni qaçışda 82), üçbucaq 69–79 min, 60 FPS; kadrlar `d-race-neon-landmark*`. **Neon bədii bibliya üzrə tamamdır — sənin rəyini gözləyir.** Qalır: Zavod. **Neon və Zavod**: qara siluet/qutu binalar → pəncərəli, işıqlı, formaca fərqli binalar (KayKit + Blender kitbash) | `d-race-neon-*`, `d-race-zavod-*` | M |
| 3.2b | 🔶 **Riviera (2026-10-06, sənin rəyini gözləyir):** sahil xətti trekin cənub nöqtəsindən 24 m-ə gətirildi (əvvəl ≥ 67 m, dumanın arxasında); çimərlik, palma cərgəsi, körpücük + mayak, 5 yelkənli; alçaq gün batımı günəşi (`sunDir`, disk kameranı izləyir — sudakı əks düz altına düşür); yer rəngi açıldı (`groundGain`); şamlar palma ilə əvəzləndi; təpə-qəsəbə (3 halqa ağ ev + zəng qülləsi). Draw call median 127–153 (əvvəl 141–148), üçbucaq 83–89 min (büdcə 90 min — **sərhəddədir**), 60 FPS. Kadrlar: `d-race-riviera-view*`. **2-ci addım (rəy: "yenə boşdur, yol torpağın içinə girir"):** şaxə yolları relyefin altında qalırdı (0.6 m) — düzəldi və bütün treklərdə testlə qorunur; yol boyu səpələmə (`near`): 95 sərv, 130 kol, 16 palma + 11 üzüm bağı; dekor relyefə oturdulur (**bütün treklərdə** 45–91 obyekt 15 sm-dən çox havada/torpaqda idi). Draw call 144–150, üçbucaq 79–85 min. Qalır: konus dağlar, liman. Açıq: zen overlap testi 3 qaçışdan 1-də 2 üst-üstə düşmə verdi (zen koduna toxunulmayıb — araşdırılmalı). | |
| 3.2c | 🔶 **Zavod (2026-10-06, rəy gözlənilir):** tünd-göy qutular → sənaye tikililəri (mişar damlı sex, çən dəstəsi, ikiyamaclı anbar), yol boyu səpələmə; konus dağlar → sənaye silueti (soyutma qüllələri, bacalar, iri sexlər); landmarklar: portal kran + 3 boru estakadası yolun üstündə, əritmə sexi (narıncı parıltı); ambient 0.45 → 0.62, `groundGain` 4.5. Draw call median 133–138, üçbucaq 78 min, 60 FPS. Yol boyu düzəldi: `MergeUtils` qarışıq indeksli/indekssiz həndəsəni səssiz itirirdi. Kadrlar: `d-race-zavod-landmark*`. | |
| 3.2d | 🔶 **Səhra (2026-10-06, rəy gözlənilir):** konus dağlar → mesa və qaya sütunları (3 lay, açıq papaq); alçaq gün batımı günəşi (`sunDir`), açıq qum (`groundGain` 2.3); yol boyu kaktus/qaya/quru kol (110); landmarklar: yolun üstündə qaya tağı, tərk edilmiş yanacaqdoldurma məntəqəsi. Draw call median 80 (əvvəl 92), üçbucaq 64–67 min (əvvəl 59 min), 60 FPS. Kadrlar: `d-race-desert-landmark0`. | |
| 3.2e | 🔶 **Alp (2026-10-06, rəy gözlənilir):** eyni konuslar → kələ-kötür silsilə (massiv başına 2–4 iti zirvə, sabit qar xətti) + meşəli dağətəyi; çəmən açıldı (`groundGain` 2.1), sahil/daşlar yerin tonuna uyğunlaşdı; yol boyu şam/kol, 10 sıx meşə massivi, çiçək ləkələri; landmarklar: yolun üstündə taxta piyada körpüsü, göl kənarında kilsə. Draw call median 110–113 (əvvəl 114), üçbucaq 81–83 min (əvvəl 70 min; büdcə 90 min), 60 FPS. | |
| 3.2f | 🔶 **Kanyon (2026-10-06, rəy gözlənilir):** yol hər iki tərəfdən laylı qaya divarları arasında (trekin ~2/3-si, aralarında açıqlıqlar); üfüqdə enli tünd-qırmızı yaylalar; axşam günəşi (`sunDir`), yer açıldı (`groundGain` 2.3), ambient 0.8; landmarklar: yolun üstündə asma körpü (iki qaya qülləsi arasında), köhnə mədən (taxta qüllə, anbar, vaqonet); yol boyu qaya/kaktus/quru kol. Draw call median 6 qaçışda 97–109, bir qaçışda 163 (əvvəl 124; büdcə 140), üçbucaq 71–82 min (əvvəl 76 min), 60 FPS. **Bədii bibliyadakı 6 trekin hamısı işlənib.** | |
| 3.3 | **Uzaq fon**: hər trekdə eyni konus dağlar → trekə xas silsilə/siluet (2–3 lay) | bütün yarış kadrları | M |
| 3.4 | **Maşın görünüşü**: boyada mühit əksi (bir dəfəlik envmap), gecə/qürubda oxunaqlıq, fara/stop işıqları | `d-zen-tod-night`, `-dusk` | M |
| 3.5 | Hər trekə 2–3 landmark ("poster nöqtəsi") | orta lay boşdur | L |
| 3.6 | Arena: döşəmə kontrastı, bonus ikonu ölçüsü; yarışda yaxın ikon ölçüsü | `d-arena-*`, `d-race-zavod-1drive` | S |
| 3.7 | Zen gecə: su səthi, yol kənarı | `d-zen-tod-night` | S |

**İstifadəçinin əlavə tələbi (2026-10-05): modellər, ətraf mühit və filtrlər professional görünsün.** Bu faza ona görə genişləndirildi:

| # | İş | Niyə | Ölçü |
|---|---|---|---|
| 3.8 | **Maşın modelləri**: 10 Kenney gövdəsi 18 maşına paylanıb, fərq əsasən rəngdədir. Hər maşın üçün Blender-də detal keçidi (kənar əyriləri, fara/stop, spoyler, egzoz, şüşə), lazım olan siniflər üçün yeni CC0 gövdələr; qarajda siluet testi | Maşın ekranın mərkəzindədir — ən çox baxılan obyektdir | L |
| 3.8a | ✅ **Detal keçidi (18 maşının hamısı, 2026-10-07)** — `ModelLibrary._applyDetail`: Kenney palitra atlasından üç xəritə çıxır (fara isti ağ və stop qırmızı YANIR; şüşə tünd və parlaq; polis çırağı). Stop işığı əvvəl boya ilə birlikdə rənglənirdi — indi boyadan asılı deyil. Əlavə hissələr (qanad, rels, egzoz, bufer) gövdənin öz həndəsəsinə oturur (əvvəl sərhəd qutusunun faizi ilə — sedanda qanad havada, egzoz yerdə idi). Kadrlar: `npm run test:cars-sheet`. **Qalır (3.8b):** siniflərə uyğun yeni gövdələr — 10 gövdə hələ 18 maşına paylanıb | — | S |
| 3.8b | ✅ **Yeni gövdələr** (2026-10-07; istifadəçi sınaq kupesini bəyəndi). `tools/models/build_cars.py` parametrlərdən gövdə qurur və Kenney boru xəttinə düşən GLB yazır. 10 gövdə: coupe (Inferno GT), hyper (Titan Apex), gt (Laguna S), hatch (Sunburst), muscle (Flamingo), pickup (Sequoia 4x4), bus (Crimson Van), limo (Midnight LX), proto (Violetta R), concept (Frost X). İndi 18 maşının 18 fərqli gövdəsi var (əvvəl 10 gövdə + rəng). Prosedural əlavə dəst (`kit`) artıq işlədilmir. Kadr: `npm run test:cars-sheet` | — | L |
| 3.8c | 🔶 **Skinlər yenidən quruldu** (2026-10-07, istifadəçi: "eyni şeyin fərqli formaları olmasınlar, işlətmək üçün səbəb olsun" — rəy gözlənilir). **Əfsanəvi (6):** hamısı "tünd gövdə + parıltı" idi, buz≈elektrik, boşluq≈qalaktika. İndi hər birinin öz materialı (lava çatları · buz kristalı · qara üstündə ildırım · baxış bucağı ilə dəyişən xrom · mütləq qara + halqa · dumanlıq + axan ulduz) və TAM DƏSTİ var: arxada qalan iz (`fxTrail`), maşının altında yer işığı, drift tüstüsünün rəngi (`LEGENDARY_SET`). Təsvirdə vəd olunan "qığılcım / buz tozu" əvvəl ümumiyyətlə yox idi. **Maşına xas (36):** 8 ümumi naxış hash ilə paylanırdı (eyni kamuflyaj 5 maşında). İndi `CAR_SKINS` cədvəli: hər maşının xarakterindən çıxan 2 skin, 29 naxış (21-i yeni). Skin İD-ləri dəyişməyib — alınmış skinlər qalır, görünüşləri yenilənir. Polisdə skin bütün gövdəni boyayır. Adlar 4 dildə. Kadr: `tests/out/cars/{legendary,skins}.png` (`npx playwright test tests/cars-sheet.spec.js -g əfsanəvi`). **Zəif qalan:** "Köpəkbalığı" (Inferno) uzaqdan az oxunur | — | M |
| 3.8d | 🔶 **Mağaza genişləndi** (2026-10-07, istifadəçi tələbi — rəy gözlənilir). (1) **Musiqi paketləri** (`MUSIC`, `AudioManager.PACKS`): menyu + yarış/arena/futbol musiqisi — Lofi, Çiptyun, Sintveyv, Rok, Fonk, Məşhur klassika (Qriq, Bethoven, Musorqski); 15 yeni fayl, hamısı CC0 / ictimai mülkiyyət (`public/music/LICENSE.txt`). Standart sintez mövzuları toxunulmayıb və pulsuz seçimdir. Mağazada alınmamış paketə ilk toxunuş onu dinlədir. Ölçü: paketlər −35…−46 dB (sintez −40). (2) **Yer işığı** (8) və (3) **İz** (7) — əfsanəvi örtüksüz maşın üçün. (4) **Üçüncü (Pro) skin** hər maşına → 54 skin. Server qiymət cədvəli yenilənib (`server/api/auth.mjs`). Qaraj tabları alçaq ekranda üfüqi sürüşür. **Yoxlanmayıb:** real hesabla alış (server yerli işlədilməyib); musiqinin zövqə uyğunluğu — eşidə bilmirəm | — | M |
| 3.9 | **Ətraf mühit modelləri**: prosedural qutu/konus dekorun (tribuna, bariyer, bina, dağ, qaya) vahid üslublu modellərlə əvəzlənməsi — CC0 dəstlər + Blender; hər trek üçün bədii bibliyadakı siyahı üzrə | Prosedural həndəsə "prototip" kimi oxunur | L |
| 3.10 | **Yer və yol səthi**: düz rəngli torpaq → səth variasiyası, yol kənarı keçidi, asfalt detalı | `d-race-*` kadrlarında yer boş və yastıdır | M |
| 3.11 | **Filtrlər və rəng qradasiyası**: hər trek üçün qradasiya preseti (LUT/əyri), bloom, yüngül vinyet; zen-in retro filtrləri yenidən (indiki CSS qatı əvəzinə render daxilində); söndürülə bilən | Görüntünün "bitmiş" hiss verməsi üçün ən ucuz böyük addım | M |
| 3.12 | **İşıq**: hər trek üçün günəş bucağı/rəngi/kölgə keyfiyyəti, gecə treklərində işıq mənbələrinin real parıltısı | Neon və Zavod tutqun və yastı işıqlanıb | M |

Sıra bu fazanın daxilində: 3.1 (bibliya) → 3.11 + 3.12 (filtr və işıq — bütün treklərə dərhal təsir edir) → 3.8 (maşınlar) → 3.2 / 3.3 / 3.9 / 3.10 (mühit, trek-trek) → qalanı. Hər trek ayrıca göstərilir və təsdiqlənir.

### 3.11 gedişatı — cila qatı ✅ STANDART (2026-10-06, istifadəçi: "saxlayaq")

`src/core/PostFX.js`: yalnız masaüstündə bloom + trek başına rəng qradasiyası (`tracks.js` → `grade`). Mobildə qat yaradılmır.

- **Əsas görüntü dəyişmir.** Səhnə ekrana çəkildiyi kimi 8-bit MSAA hədəfə çəkilir, cila üstünə gəlir. `npm run test:postfx` bunu ölçür: bloom sıfır + neytral qradasiya ilə "bağlı" kadr arasında orta piksel fərqi 0.45–0.60 / 255 (9 rejim).
- **İlk iki cəhd rədd edildi** (kadrda görünüb): HDR hədəf uzaq planı soldururdu (duman ton xəritəsindən sonra qarışır); 8-bit hədəfdə isə r160 duman rəngini xətti verir və dağlar tündləşirdi — kadr müddətinə rəng kompensasiya olunur.
- **Xərc:** 9 rejimdə 60 FPS, p99 16.8 ms (cila bağlı ilə eyni); üstəlik 14 tam-ekran keçid (13 bloom + son keçid; səhnənin draw call sayına daxil deyil).
- **Məhdudiyyət:** bloom ekran parlaqlığına görə seçir, ona görə işıq mənbəyi ilə ağ boyanı (zolaq, bordür) ayıra bilmir. Gündüz treklərində hədd 0.95-dir (səma ağarmasın) və təsir zəifdir; ən çox neon və zavodda görünür.
- **Sınaq keçidi silindi** (istifadəçi seçdi). Söndürmək: `localStorage.apexPost = '0'`.
- **Qalır:** ayarlarda daimi açar (Faza 5), zen filtrlərinin render daxilinə köçürülməsi, vinyet, neon bordür parıltısının gücü (sənin rəyin).

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

**Vəziyyət (2026-10-07 — rəy gözlənilir; səsi eşidə bilmirəm, yalnız ölçürəm):**
- **4.1 ✅ Mühərrik:** üç yazılmış döngə (domasx2, CC0) dövrə görə keçir və zilləşir; dövr sürətdən 5 ötürücü ilə hesablanır (hər keçiddə düşür — sintezdə düz qalxırdı), qaz/buraxma tembri dəyişir, maşının xarakteri (ağır → bəm, sürətli → zil). Səviyyə köhnə ilə eyni sırada: −25…−29 dB (sintez −27). Köhnə sintez müqayisə üçün qalır: `localStorage.apexEngine = 'synth'`.
- **4.2 🔶 Təkər / torpaq / külək:** drift cığıltısı (−38 dB), yoldan kənar uğultu, sürət küləyi — **sintezdir** (süzgəcli küy): CC0 yazılmış cığıltı OpenGameArt və Commons-da tapılmadı (Freesound API açarı tələb edir). Əvvəl bu səslərin heç biri yox idi.
- **4.5 ✅ Səs ayarları:** menyuda 🔊 → Musiqi və Effektlər sürgüləri + səsi bağla (telefonda səsi bağlamağın yolu əvvəl yox idi). Eyni blok dörd rejimin pauza menyusundadır (`src/ui/SoundControls.js`).
- **4.3 / 4.4 ⬜** vahid effekt dəsti, mühit səsləri.
- Ölçmə: `npx playwright test tests/music.spec.js -g mühərrik`.

### Musiqi — yeni üslub 🔶 (istifadəçi dinləyib qərar verəcək)

- **1-ci variant rədd edildi (2026-10-06):** oynaq/şən sintez (major, 104–122 bpm, marimba). İstifadəçi: "şən olmasını yox, rahatladıcı, soul tipli istəyirəm; istinad mahnıları qətiyyən şən deyil".
- **2-ci variant rədd edildi (2026-10-06):** neo-soul sintezi (76/92 bpm, elektrik piano, hat). İstifadəçi: "files nisbətən yaxındır, amma o da lofidir; get mahnıları araşdır — adından mahnını necə bilə bilərsən".
- **3-cü variant (standart, `?music=walk`) — ölçməyə əsaslanır.** İstinad treklər (aksfx: "Big Walk Theme (Jumping Voices)", "Radio: Lobby" — Motif / Leitmotif / Refrain) librosa ilə analiz olundu. Tapıntı: Bandcamp etiketləri *electronic, choir, minimalism, vocal*; tembr tünd-isti (enerjinin ~99%-i 2 kHz-dən aşağı, hat yoxdur); mövzuda nəbzi zərb yox, səslər verir (perkussiv pay 0.21, ~117 bpm, B major); lobbi ~86 bpm, Eb/Bb major, dərin bas. Bizim mövzu eyni alətlə ölçülür:

  | | temp | ton | bas / orta / yuxarı-orta | dinamika |
  |---|---|---|---|---|
  | İstinad: mövzu | 117 | B major | 22 / 41 / 36 % | 12 dB |
  | Bizim: menyu | 117 | B major | 19 / 50 / 31 % | 14 dB |
  | İstinad: lobbi (Motif) | ~86 | Eb major | 16 / 69 / 14 % | 9 dB |
  | Bizim: yarış | 86 | Eb major | 12 / 78 / 9 % | 20 dB |

  Ölçülən oxşarlıq **eşidilən oxşarlıq demək deyil** — sintez olunmuş "xor" real səs yazısı kimi səslənmir. `RECORD=1 npx playwright test tests/music.spec.js -g yazı` mövzunu fayla yazır.
- **QƏRAR (2026-10-06): standart `classic`-dir.** İstifadəçi üç variantı dinlədi: "classic yaxşıdır, amma yarışdakı mahnını bir az dəyişdir — daha həzin, amma yarışa uyğun". Yarış mövzusu yenidən yazıldı: 118 → 112 bpm, Am–F–C–G → Am9–Fmaj7–Dm7–Em7, yumşaq snare, açıq hat yoxdur, enən uzun notlu melodiya + oktava aşağı "cavab". Ölçüldü: 112 bpm, A minor (r = 0.83). Menyu mövzusu dəyişmədi. `walk` sınaq kimi qalır (`?music=walk`).
- **Yarış mövzusu — "robotik/arkada olmasın" (2026-10-06):** çılpaq üçbucaq "pluck"lar və saat kimi dəqiq ritm çıxarıldı. Melodik səslər süzgəcli analoq-tipli sintezdir (`_synth`), əks-sədalı (`_raceBus`); melodiya leqatodur (sürüşmə + vibrato); vuruşların gücü/vaxtı azca dəyişir; hat çox zəifdir. Ölçüldü (əvvəl → indi): perkussiv pay 0.64 → 0.38, dinamika 21 → 10.6 dB, 500 Hz–2 kHz payı 4 → 17 %; temp 112, A minor dəyişmədi.
- **Yarış mövzusu — yekun istiqamət (2026-10-06):** süzgəcli sintez variantı da rədd edildi ("çox elektrondur; menyudakı musiqi yaxşıdır"). İndi yarış **menyu mövzusunun eyni səs palitrası** ilə çalınır (isti pluck + exo, 7-li pad, yumşaq kik/snare, dəyirmi bas): temp 96, Am7–Fmaj7–Dm7–Em7, enən melodiya. `_synth` / `_raceBus` silindi. Dərs: istifadəçinin bəyəndiyi mövcud səsdən çıxış et, yeni tembr icad etmə.
- **YEKUN (2026-10-06): yarış musiqisi ORİJİNALA qaytarıldı** ("classic-ə gətir, köhnəsi yaxşı idi"). Kod Faza 3-dən əvvəlki commit (`0981e6d`) ilə sətir-sətir eynidir (yoxlanıb): Am–F–C–G, 118 bpm. Menyu da orijinaldır. Bu fazadan musiqidə qalan yalnız: zen-ə 10 yeni lofi trek, `?music=walk|files` sınaq seçimləri.
- **`walk` və `files` seçimləri silindi** (istifadəçi, 2026-10-06). Musiqi kodu orijinaldır + zen-in 10 yeni treki.

### Zen səsləri ✅ (2026-10-06)

Prosedural hava səsi (`AudioManager.setWeather`, `thunder`): yağışda şırıltı + uğultu (≈ −43 dB), qarda sakit külək (≈ −47 dB), tuneldə boğuqlaşır (−15 dB), güclü yağışda 22–60 s-də bir uzaq göy gurultusu (əvvəl qısa işıq). Səviyyə musiqidən (≈ −40 dB) aşağıdır. Zen toqquşması yumşaqdır (`ImpactFeel soft`): boğuq `bump` səsi, qığılcım əvəzinə toz, kamera yarı güclə. Test: `npm run test:music`.

### Zen buqları — yer və tunel 🔶 (2026-10-06)

İstifadəçi: "zen-də bəzən nəsə iç-içə keçir (məs. tuneldə), hərdən maşın yerin dibinə girir". `npm run test:zen-ground` maşının fiziki hündürlüyünü görünən səthlə tutuşdurur.

- **Maşın torpaqda batırdı:** hündürlük yer meshindən yox, düyünlərdən yenidən hesablanırdı (bixətti), mesh isə xana başına 2 üçbucaqdır. Ölçüldü: 1.2–1.6 m batma. İndi `_meshGroundY` görünən meshin öz təpələrindən oxuyur (600 təsadüfi nöqtədə fərq 0). Qalan: dik yamacda ≤ 0.3 m (nümunələrin 0.3–1.5 %-i).
- **Çiyindən torpağa keçid:** 2 m → 0.7 m (kəsikdə maşın 0.4 m asılı qalırdı).
- **Tunel portalı:** üst tir yol BOYU qoyulmuşdu (fırlanma səhvi) — zolağın ortasının üstündən tünd paz kimi sallanırdı; silsilənin uc qapağı tunelin ağzının içindən keçirdi (narıncı üçbucaqlar). Hər ikisi düzəldi (kadrlar: `d-zen-tunel-*`).
- **İkinci tur (istifadəçi: "hələ də yerə girir, maneəyə dəyəndə qismən içinə girir, tunelin üstündə dağ varmış kimidir")** — `npm run test:zen-contact`:
  - *Təkərlər:* maşın yol nöqtəsinin hündürlüyündə otururdu, asfalt isə 8 sm yuxarıdadır (yolda təkər 11 sm batırdı); yoldan kənarda yalnız mərkəz oxunurdu və maşın yan meyldə düz qalırdı (təkər 0.35–0.45 m batırdı); burun əyilməsi dünya x oxu ətrafında idi (yol şərqə/qərbə gedəndə yoxuşda maşın yana yatırdı); `heightAtPos` nöqtədən geridə səhv seqmenti uzadırdı. İndi `_seatCar` dörd təkərin altındakı səthdən hündürlük + pitch + roll hesablayır. Ölçü: yolda p50 0.01–0.02 m, kənarda p99 0.07–0.14 m.
  - *Maneələr:* maşın tək 1.5 m dairə idi (burun 2.2 m irəlidədir) → dirəkdə 0.4–0.5 m, yayılmış qayada 1.2 m içəri girirdi. İndi gövdə 6 dairədir, bina/ev/hasar yönlü düzbucaqlıdır, təbiət obyektinin forması modelin aşağı 1.4 m-indən çıxarılır (ağacda gövdə, çətir yox). Trafik: mərkəzlərarası sabit 3.3 m əvəzinə gövdə–gövdə. Ölçü: ən dərin giriş 0.53/1.22 m → 0.14–0.20 m. Hasar və kənd evi test marşrutuna düşmədi — ölçülməyib.
  - *Tunelin dağı:* hər chunk-da ayrıca qurulan alçaq prizma idi (tikişlərdə 16 m boşluq). İndi bütöv, portaldan içəri qalxan, ±70 m enində dağdır; portal çərçivəsi yalnız həqiqi uclarda.
- **Açıq:** zen overlap testi ~7 qaçışdan 1-də qırılır (bir dəfə 2 iç-içə obyekt, bir dəfə yolun üstündə 7) — təkrarlaya bilmədim; test indi nümunələri çap edir. Zen üçbucaq sayı 92–96 min (büdcə 90 min).

### Üç yeni trek ✅ (2026-10-07, istifadəçi tələbi)

Buz Zirvəsi (`frost`), Payız Meşəsi (`autumn`), Vulkan (`lava`) — hər biri şaxə yolları ilə, fərqli üslubda (bax `docs/ART-BIBLE.md`). Trek datası genişləndi: `weather` (snow/rain/embers — `src/world/Weather.js`), `distantStyle`, `hills`, `snowCaps`, `palette.mountain/foothill`, `river.glow`, `hazards.blockKind` (ice/basalt), `hazards.gateKind: 'fire'`, `hazards.ice` (buz ləkələri → `Car._iceT`).

| Trek | Uzunluq | Şaxə | Draw call | Üçbucaq | p99 |
|---|---|---|---|---|---|
| frost | 1790 m | 2 | 101 | 86 min | 6.4 ms |
| autumn | 1860 m | 3 | 129 | 84 min | 7.2 ms |
| lava | 1735 m | 2 | 123 | 70 min | 6.8 ms |

Yan təsir (yaxşı): dekor rəngləri təpəyə yazılır və maneələrin tərpənməyən hissələri birləşdirilir — Zavod 138 → 95, Riviera 166 → 142 draw call. Onlayn `PREFIX` v19. Trek adları və təsvirləri 4 dildədir (`trk.<id>`, `trk.<id>.d`). Vulkanın yeri və işığı açıldı (əvvəl demək olar qara idi). Kadr sürəti: cila açıq/bağlı 60 fps, p99 16.8 ms (yeni 3 trek + alp). Mobil emulyasiya (844×390, cila və kölgə yox): frost 128 draw call / 92 min üçbucaq, autumn 135 / 89 min, lava 95 / 80 min, CPU p99 < 4 ms; HUD kadrlarına baxıldı. **Yoxlanmayıb:** onlayn yarış yeni treklərdə; real telefon (yalnız emulyasiya).

### PC: sürət hissi üçün ekran effektləri 🔶 (2026-10-07, istifadəçi tələbi — rəy gözlənilir)

Araşdırma (arkada yarışlarında sürət hissini nə verir): (1) kənarların radial bulanması — ən güclü siqnal; (2) boost anında rəng ayrılması; (3) sürətlə sıxılan vinyet; (4) FOV artımı və döngəyə baxan kamera — artıq var (`ChaseCam.js`, istifadəçi seçib); (5) sürət xətləri — var. 1–3 `PostFX`-in son keçidinə əlavə olundu (əlavə render keçidi yoxdur). Yarış tam güc, arena/futbol 0.7, zen 0.5.

Ölçü (`npm run test:postfx` → 'sürət effektləri'): kadrın mərkəzində fərq 0, kənarda orta piksel fərqi 10.4 (sürət) / 14.5 (boost); CPU kadr xərci effektlə artmır (p99 5–8 ms aralığında, açıq/bağlı fərqi ölçmə səs-küyündən kiçikdir). Söndürmə: `localStorage.apexSpeedFx = '0'`. **Qalır:** sənin oynayıb qiymətləndirməyin (güc zövq məsələsidir); ayarlar menyusunda açar (Faza 5).

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
