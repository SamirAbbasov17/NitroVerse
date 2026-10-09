# CARMAGEDDON — Fəsil 1 (demo): layihə

Status: **fəsil başdan-sona oynanılır** (2026-10-09; kod: `src/games/carmageddon/` — chapter1, script, camp, night, duel, chase). Aşağıdakı mətn ilkin təklifdir; fərqlər: qaçışın mexanikaları `chase.js`-in başlığında, Old Gus-un fədakarlığı və Hush-un cümləsi `script.js`-də. Sahibinin verdiyi hekayə əsasında yazılıb; adlar, səhnələr və

Əlavələr (2026-10-09, tester keçidi): **fasilə menyusu** (Esc və ya sağ yuxarı künc düyməsi — "Davam et" / "Başlıq ekranı"; oynanışda tab gizlənəndə özü açılır); yaddaş mərhələləri `camp → evening → night → found → chase(sec)`; qaçışda can, yanacaq və nitro **hissədən hissəyə daşınır** (alt hədd: can 60, yanacaq 58, nitro 1); maşınlar, yol obyektləri və yer toxumaları piksel art vərəqlərindəndir (`cars.png`, `props.png`, `ground-*.webp`); mətnlər dörd dildə (`lang/ch1.*.js`).
mexanikalar təsdiq gözləyir. Üslub: `docs/CARMAGEDDON-STYLE.md` (piksel art, 480×270 kətan).

## Sahibinin verdiyi çərçivə (dəyişmir)

- Demo = "First Chapter". Dialoqlar visual novel kimi: hər hiss üçün ayrı portret; mətn hərf-hərf
  yazılır, kliklə dərhal tamamlanır, növbəti kliklə keçir; səs — Undertale tipli "mırıltı" danışıq.
- Oyun 2D piksel art, yuxarıdan baxış (top-down).
- Dünya: distopiya. **Nomadlar** mədəniyyət qurmağa çalışan qəbilədir. **Sindikat** (7 lider + qara,
  maskalı, mistik baş lider) onları darmadağın edir, hamını öldürür.
- Biz o qəbilənin adi üzvüyük, bir qardaşımız var. Əvvəl gündəlik həyat və kiçik tapşırıqlar
  (oyunçu insanlara bağlansın), sonra hücum: bütün liderləri dialoqlarda bir-bir görürük.
- Qardaş gözümüzün qabağında öldürülür. Biz qaçırıq, liderlərdən birinin maşınına tullanıb onu
  öldürürük; onun maskası intiqamımızın simvolu olur. Maşını oğurlayıb qaçırıq — sürüş oynanışı,
  maraqlı mexanikalarla; öləndə son yaddaş nöqtəsindən davam.
- Sonda tərk edilmiş bar tapırıq, yaralı halda yerə çökürük. Fəsil bitir.

## Adlar (xüsusi isimlər ingiliscədir — sahibinin qərarı, 2026-10-09)

Adlar bütün dillərdə eyni qalır (tərcümə olunmur). Konkret adlar mənim təklifimdir.

| Rol | Ad | Qeyd |
|---|---|---|
| Qəhrəman | **Ember** | Qırmızı saçına görə ləqəb ("köz"). 19 yaş, karvanın ən yaxşı sürücüsü. Sərt görünür, əslində yumşaqdır. |
| Qardaş | **Milo** | 13 yaş. Hər şeyi söküb yığır; Ember üçün motor düzəldir. |
| Qəbilə | **Nomads** | Köçəri karvan. |
| Düşərgə | **Hearth** | İlk dəfə bir yerdə qalıb əkin əkdikləri yer ("ocaq"). |
| Düşmən | **The Syndicate** | Yanacağı və yolları nəzarətdə saxlayır. Hearth yanacağı pulsuz paylaşır — təhlükə budur. |
| Baş lider | **Hush** | Qara geyim, hamar qara maska. Danışmır; onun yerinə başqaları danışır. Fəsildə tək bir cümləsi var. |

**Sindikatın yeddi baronu** (hər biri fərqli üslub, hər birinin giriş səhnəsi və bir replikası var):

1. **Butcher** — zirehli yük maşınları, zəncir və qarmaq. Kobud güc. Milonu o öldürür.
2. **Madam Crude** — ağ kostyum, zəriflik, yanacaq inhisarı. Hücumun səbəbini o izah edir.
3. **Doctor Rust** — cərrah önlüyü, qaz balonları. Sakit, maraqla baxır.
4. **Preacher** — atəşə sitayiş edən təriqət başçısı. Yandırır və "təmizləyir".
5. **The Twins** — iki motosikletçi, bir baron kürsüsü. Cümlələri bir-birinin sözünü tamamlayır.
6. **Judge** — çəkicli məmur. Hearth-ə "hökm" oxuyur; hər şeyi qanuni göstərir.
7. **Jackal** — sümük-metal maskalı ovçu, ən sürətli maşın. Qaçanları ovlayır. **Ember onu öldürür,
   maskasını və maşınını götürür.**

**Hearth sakinləri** (hər birinin kiçik tapşırığı və hekayəsi):

- **Granny Wren** — toxum bankının gözətçisi. Tapşırıq: küləyin səpələdiyi üç toxum kisəsini tap.
  Hekayə: şəhərləri xatırlayan son adam.
- **Old Gus** — mexanik. Tapşırıq: üç hissə gətir, baqqini yığ → qısa sürüş məşqi (idarəetməni
  öyrədir, sonrakı qaçış üçün).
- **Miss Clara** — uşaqlara oxumağı öyrədir. Tapşırıq: gizlənqaç oynayan balaca **Pip**-i tap.
- **Radio Ray** — rabitəçi. Tapşırıq: antenanı düzəlt. Efirdə qəribə danışıq eşidir (xəbərdarlıq).
- **Elder Amos** — ağsaqqal. Axşam ocaq başında çıxış edir: "Yol evimiz idi. İndi ev tikirik."
- **Milo** — axşam Emberə hədiyyə verir: öz düzəltdiyi dişli çarxdan açar halqası. Fəslin sonuna
  qədər Emberin əlində qalır.

## Səhnələr

**0. Proloq (sinematik, 5–6 piksel kadr + mətn).** Çöküş; yollar; The Syndicate; Hearth-in yaranması.
Son kadr: Hearth-in üstündə səhər. ~60 saniyə, keçmək olur.

**1. Hearth-də səhər (top-down gəzinti).** Ember çadırdan çıxır, Milo onu oyadır. Düşərgə: çadırlar,
su təmizləyicisi, bostan, emalatxana, radio dirəyi, ocaq yeri. Sakinlərlə danışıq və tapşırıqlar.
İrəliləmək üçün üç tapşırıq bəsdir, qalanı könüllüdür. ~12–15 dəqiqə.

**2. Axşam ocağı.** Hamı bir yerdə. Elder Amosun çıxışı, Milonun hədiyyəsi, zarafatlar. Radio Ray
qaçaraq gəlir: efir susub. Üfüqdə faralar.

**3. Hücum.** Baronlar bir-bir gəlir — hər biri öz kadrı, adı və replikası ilə (başlıq kartı).
Judge hökmü oxuyur. Hush əlini qaldırır. Qırğın birbaşa göstərilmir: siluetlər, alov, qaralan
ekran, səslər; tanıdığımız sakinlərin aqibəti qısa kadrlarla.

**4. Milo.** Ember Milonu axtarır (yanan düşərgədə qısa, gərgin top-down qaçış: alovdan və
patruldan yayın). Tapır. Butcher Milonu Emberin gözü qabağında öldürür. Ember tutulur, Hush ona baxır
və fəsildəki yeganə cümləsini deyir. Partlayış — Ember qurtulur.

**5. Jackal.** Ember qaçan Jackalın maşınına tullanır. Qısa döyüş (vaxtında basılan düymələr).
Jackal ölür. Ember maskanı götürür — taxmır, yanına qoyur. Sükan arxasına keçir.

**6. Qaçış (sürüş oynanışı, top-down).** Fəslin əsas hərəkət hissəsi, 5 hissə, hər hissənin
əvvəlində yaddaş nöqtəsi (öləndə oradan):

1. *Yanan düşərgə* — dar keçidlər, yıxılan dirəklər; idarəetməyə alışma.
2. *Kanyon* — təqibçilər yandan sıxır; onları qayaya vur və ya əyləcə basıb qabağa burax.
3. *Doctor Rustın dumanı* — yaşıl qaz buludları görünüşü bağlayır; fara ilə yol işarələrini izlə.
4. *Butcherın yük maşını* — qabaqda gedir, çəllək və zəncir atır; yayın, nitro ilə keç.
5. *Sınıq körpü* — The Twins qarmaq atır, driftlə qop; sonda körpüdən tullanış (sürət çatmalıdır).

Ümumi mexanikalar: can (maşının zədəsi), yanacaq sızır (yol boyu kanistr yığ), nitro, yan zərbə.
Maşın getdikcə dağılır — son hissədə tüstüləyir və sağa çəkir.

**7. Son.** Gecə, boş yol. Yanacaq bitir. Tərk edilmiş bar: "LAST STOP". Ember içəri girir,
piştaxtaya söykənir, yerə çökür. Əlində Milonun açar halqası, yanında Jackalın maskası.
Qaralan ekran: **"Fəsil 1 — son."**

## Qurulacaq sistemlər

- **Dialoq mühərriki:** hərf-hərf yazı, kliklə tamamlama, kliklə keçid, hisslərə görə portret,
  seçimlər, personaja görə fərqli tonda "mırıltı" səsi. Ssenari ayrıca data faylında.
- **Sinematik oynadıcı:** kadr + mətn + keçid.
- **Top-down mühərrik:** kafel xəritə, toqquşma, NPC ilə danışıq, tapşırıq jurnalı.
- **Sürüş oynanışı:** top-down maşın, təqibçilər, maneələr, yaddaş nöqtələri.
- **Yaddaş:** fəsildəki irəliləyiş brauzerdə saxlanır.
- **Art:** portretlər (təxminən 35: Ember 6 hiss, Milo 4, sakinlər 2–3, baronlar 1–2), sinematik
  kadrlar (~10), personaj və maşın spraytları, kafel dəsti. Draw Things (lokal, pulsuz) + mövcud
  pikselləşdirmə alətləri; hər asset `docs/ASSETS-LICENSES.md`-ə yazılır.

## Qurulma sırası (hər addım oynanıla bilən olur və göstərilir)

1. Dialoq mühərriki + proloq + Ember–Milo ilk söhbəti. Burada ton, portret üslubu və danışıq səsi
   təsdiqlənir.
2. Hearth düşərgəsi: gəzinti, sakinlər, tapşırıqlar.
3. Axşam ocağı + hücum + baronların girişi.
4. Milo, Jackal, maska.
5. Qaçış oynanışı (5 hissə, yaddaş nöqtələri).
6. Son səhnə, telefon uyğunlaşması, qalan dillər, tam yoxlama.

## Açıq qərarlar

- Konkret adlar (yuxarıdakı cədvəllər) — ingiliscə olması qərarlaşıb, adların özü təklifdir.
- Dialoq dili: əvvəl yalnız Azərbaycanca yazıb fəslin sonunda en/ru/tr əlavə etmək, yoxsa hər
  addımda dörd dil.
- Zorakılığın göstərilməsi: siluet/eyham (təklif) və ya açıq.
- "Carmageddon" adı başqasının ticarət nişanıdır — ictimai buraxılışdan əvvəl ad qərarı lazımdır.
