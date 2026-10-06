# Bədii bibliya — QARALAMA (təsdiq gözləyir)

Faza 3.1. Məqsəd: hər trekin öz bədii dili olsun və sonrakı hər görüntü işi (modellər, yer, uzaq fon, işıq) buna söykənsin. **Bu sənəd təsdiqlənənə qədər heç bir trekin görünüşü dəyişdirilmir.**

Mənbə: `src/data/tracks.js` (indiki palitra və dekor) + 2026-10-06 kadrları (`tests/out/shots-off/d-race-*`, `tests/out/postfx/pair-*`). "İndi nə pisdir" bəndləri kadrda gördüyümdür; "Təklif" bəndləri mənim fikrimdir — dəyiş, sil, əlavə et.

## Ümumi qaydalar (bütün treklər)

- **Üslub:** low-poly, düz rəngli səthlər, tekstura yalnız yolda. Realistik tekstura və ya fərqli üslublu hazır model qarışdırılmır.
- **Üç plan:** yaxın (yol kənarı: bariyer, post, lövhə) · orta (trekə xas tikili/təbiət, landmark) · uzaq (siluet). İndi bütün treklərdə orta plan boş, uzaq plan eyni konus dağlardır.
- **Uzaq fon:** hər trekdə fərqli siluet. Eyni konusun rəngini dəyişmək kifayət deyil.
- **Rəng:** hər trekdə 1 əsas, 1 köməkçi, 1 vurğu rəngi. Vurğu rəngi bordürdə və işıqlarda təkrarlanır, başqa yerdə işlədilmir.
- **Kontekst:** dekor siyahısında olmayan obyekt həmin trekə qoyulmur.

## Treklər

### Səhra — "Sunset Desert"
- **Kimlik:** isti qum düzləri, gün batımı, açıq üfüq.
- **Palitra (indiki, qalsın):** səma `#f7b26a → #ffd9a0` · yer `#d99b57` · duman `#f2b47a` · vurğu (bordür) `#ff7a2f`.
- **İndi nə pisdir:** dağların hamısı eyni narıncı konusdur; yer tam yastı və tək rənglidir; kaktuslar tünd yaşıl ləkə kimi oxunur.
- **Dekor (icazəli):** kaktus, qaya, qum təpəsi, kərpic ev, yel dəyirmanı, yol lövhəsi, şin yığını. **Olmaz:** şam, fənər dirəyi, bina.
- **Təklif:** uzaq fon — konus əvəzinə yastı zirvəli mesa silsiləsi (2 lay, uzaq lay dumanda açıq); landmark — qaya tağı (yolun üstündən) və tərk edilmiş yanacaqdoldurma məntəqəsi; yer — qum ləpələri və yol kənarında daş-çınqıl zolağı.

### Neon — "Neon City Night"
- **Kimlik:** gecə şəhəri, yaş asfalt, reklam işıqları.
- **Palitra (indiki, qalsın):** səma `#0d1330 → #231750` · yer `#181d3a` · vurğu (bordür) `#34e0ff`, ikinci vurğu çəhrayı.
- **İndi nə pisdir:** binaların çoxu qara siluetdir, pəncərə işığı azdır; yol kənarı boş qaranlıqdır; şəhər "yaşamır". Bloomdan sonra işıqlar parıldayır, amma işıqlı səth özü azdır.
- **Dekor (icazəli):** göydələn (pəncərəli), reklam lövhəsi, fənər, körpü/estakada, dayanacaq, neon tağ. **Olmaz:** ağac, qaya, dağ.
- **Təklif:** binalara pəncərə şəbəkəsi (emissiv, 3–4 rəng) və dam işıqları; 3 fərqli bina forması (pilləli, qüllə, enli); landmark — yolun üstündən keçən işıqlı estakada və böyük ekranlı meydan; uzaq fon — dağ yox, sıx şəhər silueti.

### Alp — "Alpine Forest"
- **Kimlik:** sərin dağ havası, şam meşəsi, göl.
- **Palitra (indiki):** səma `#8fd4ff → #d8f1ff` · yer `#3f8f4e` · duman `#bfe6ff` · vurğu (bordür) ağ.
- **İndi nə pisdir:** dağlar eyni konusdur (qar papaqlı); çəmən kadrda çox tünd və yastı çıxır; ağaclar seyrək görünür — "meşə" hissi yoxdur.
- **Dekor (icazəli):** şam, qaya, taxta ev, yel dəyirmanı, taxta hasar, körpü, göl. **Olmaz:** kaktus, neon, bina.
- **Təklif:** yer rəngini açmaq (çəmən daha canlı yaşıl) və çiçəkli ləkələr; şamları dəstə-dəstə yığmaq (meşə massivi), tək-tək səpməmək; uzaq fon — kələ-kötür silsilə (iti zirvələr, qar xətti); landmark — taxta körpü və göl kənarında kilsə/dağ evi.

### Kanyon — "Qızıl Kanyon"
- **Kimlik:** qırmızı qayalar arasında dolanbac dərə, axşam.
- **Palitra (indiki, qalsın):** səma `#86385e → #f29a5c` · yer `#a85a3e` · duman `#c76d52` · vurğu (bordür) `#ffb02e`.
- **İndi nə pisdir:** "kanyon" hissi yoxdur — yol açıq düzdədir, divarlar yoxdur; uzaqda eyni iti konuslar.
- **Dekor (icazəli):** qaya (iri), kaktus, qum təpəsi, daş ev, asma körpü, mədən qurğusu. **Olmaz:** şam, fənər, bina.
- **Təklif:** yol boyu hündür qaya divarları (dərə hissi, performans üçün birləşdirilmiş); uzaq fon — laylı yastı yaylalar; landmark — asma körpü və köhnə mədən qülləsi.

### Riviera — "Riviera Sunset"
- **Kimlik:** sahil qəsəbəsi, dəniz, gün batımı.
- **Palitra (indiki):** səma `#5a4a9e → #ff9a6a` · yer `#e0bd86` · duman `#e8a37e` · vurğu (bordür) `#27e6c8`.
- **İndi nə pisdir:** kadrda dəniz və qəsəbə demək olar görünmür — yastı qəhvəyi düz, şamlar və bir çadır var; "sahil" oxunmur. Yer rəngi tərifdəki açıq qumdan xeyli tünd çıxır.
- **Dekor (icazəli):** palma, ağ evlər (qırmızı dam), fənər, mayak, körpü/estakada, qayıq, çimərlik çətiri. **Olmaz:** şam (palma ilə əvəz), kaktus, dağ konusu.
- **Təklif:** trekin bir tərəfi boyunca dəniz üfüqü (su müstəvisi + günəş yolu); pilləli ağ qəsəbə (orta plan); landmark — mayak və liman; şamların palma ilə əvəzlənməsi.

### Zavod
- **Kimlik:** sənaye zonası, təhlükə, lazerlər, tutqun hava.
- **Palitra (indiki):** səma `#4a4e5c → #9a8e74` · yer `#484a52` · duman `#6e6a60` · vurğu (bordür) `#f5c518` (xəbərdarlıq sarısı).
- **İndi nə pisdir:** binalar neondakı tünd-göy qutularla eynidir (sənaye kimi oxunmur); arxada boz konus dağlar var (zavoda aid deyil); orta plan boşdur.
- **Dekor (icazəli):** konteyner, baca (tüstülü), anqar, boru kəməri, kran, çən, fənər, xəbərdarlıq lövhəsi. **Olmaz:** ağac, dağ, yaşayış binası.
- **Təklif:** binaları anqar/sex formasına salmaq (mişar damı, boz-pas rəngi); yolun üstündən boru kəmərləri; uzaq fon — bacalar və soyutma qüllələri silueti; landmark — portal kran və əritmə sexi (narıncı parıltı).

## Səndən lazım olan

1. Hər trekin "Kimlik" cümləsi düzdürmü?
2. "Təklif" bəndlərindən hansılar olsun, hansılar olmasın?
3. Hansı trekdən başlayaq? Mənim təklifim: **Neon** (kadrda ən zəif görünən, bloomdan ən çox qazanan), sonra Riviera (kimliyi ən az oxunan).
