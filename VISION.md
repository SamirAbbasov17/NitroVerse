# NitroVerse — Vizual Transformasiya Planı
## Hədəf: "Sideways" / "art of rally" səviyyəli stilizə estetika — performansa toxunmadan

Referans dili: flat-shaded low-poly həndəsə + **zəngin işıq-rəng qatı** + **laylı atmosfer
dərinliyi**. Görüntünün "professional" görünməsi poliqon sayından yox, bu üç şeydən gəlir:
rəng qradasiyası (grading), dərinlik layları (fon → orta → yaxın), kompozisiya qaydaları.

Dəmir qayda: **postprocessing pipeline YOX** (mobil FPS qatili). Hər effekt ya bir dəfəlik
hesablanır, ya merged/instanced statikdir, ya da CSS/sprite hiyləsidir.

---

## FAZA 1 — Render qatı (ən böyük sıçrayış, ~0 performans xərci)

1. **ACES tone mapping + exposure**: `renderer.toneMapping = ACESFilmic`, hər trekin
   palitrasına `exposure` sahəsi. Rənglər dərhal "oyun render-i" kimi görünür — düz
   RGB-nin plastik görkəmi itir. (1 sətir + palitra tuning)
2. **Səma 2.0**: 3-dayaq qradiyent (zenit → üfüq → yer xətti) + **böyük günəş/ay diski**
   + halo sprite. Gecə trekində ulduzlar (`THREE.Points`, 1 draw call). Üfüqdə açıq
   "işıq zolağı" — dərinlik hissinin açarı.
3. **İki tonlu duman**: fog rəngi üfüq rənginə calanır (hazırda var, tuning), uzaq
   silhouette qatı ilə birlikdə işləyəcək.
4. **Vignette**: CSS radial-gradient overlay (GPU-suz). **Bloom imitasiyası**: emissive
   intensivliklərin qaldırılması + glow sprite-lar (neon, lampalar, fork lövhələri).
5. Hər trek üçün grading preset: sun/hemi/ambient intensivlik + exposure + fog sıxlığı
   bir yerdə (palette obyektində) — 5 trekin hər biri fərqli "saat/hava" hissi versin.

## FAZA 2 — Ətraf mühitin dərinliyi (laylı kompozisiya)

1. **Uzaq fon halqası**: 2-3 qat silhouette dağ/təpə silsiləsi (hər qat TƏK merged mesh,
   fog ilə əriyir) — "dünyanın sonu görünmür" hissi. Trek başına +2-3 draw call.
2. **Orta qat relyefi**: düz yer diski əvəzinə trek ətrafında qalxan flat-shaded
   heightfield yamaclar (yol müstəvisi fizika üçün düz qalır — dərə içində yol illüziyası).
   Kanyonda yolu "sıxan" qaya divarları, alpdə yamaclar, rivierada dəniz tərəfi açıq.
3. **Dəniz səthi (riviera)**: böyük parlaq plane + günəş yolu (emissive gradient zolaq),
   sahil xətti köpük zolağı — shader-siz, statik.
4. **Buludlar**: instanced flat-shaded blob klasterləri, çox yavaş drift (1 instanced mesh).
5. **Landmark-lar**: hər trekə 2-3 böyük "set piece" — istiqamətlənmə + karakter:
   - Kanyon: nəhəng qaya tağı (yol altından keçir), mesa silsiləsi
   - Riviera: mayak + liman kranları, sahil ferris çarxı silueti
   - Neon: körpü tağı, nəhəng reklam lövhələri (emissive)
   - Alp: göl güzgüsü + şəlalə, kilsə qülləsi
   - Səhra: qatar relsi + köhnə su qülləsi
6. **Prop klasterləşməsi**: tək-tək səpmə əvəzinə 3-7-lik təbii qruplar + yol kənarı
   "detal zolağı" (çəmən topaları, çınqıl, işarələr). Hamısı InstancedMesh/merged.

## FAZA 3 — Yolun özü

1. **Asfalt toxuması**: subtle noise + döngə qövslərində təkər izi qaralması + kənar
   köhnəlmə (bir dəfəlik canvas texture, UV yol boyu).
2. **Curb naxışı**: zolaqlı (qırmızı-ağ / trek aksenti) canvas texture — indiki düz rəng
   əvəzinə klassik yarış curb-u.
3. **Start/finish zonası**: checkered boya, kiçik tribuna, bayraq dirəkləri, gantry
   (hamısı merged statik).
4. **Skid marks**: drift zamanı yolda qalan iz (pool-lanmış ribbon buffer, max ~200 seqment,
   köhnələr solur) — drift oyununda ən böyük "feel" detalı.
5. **Barrier variantları**: kanyon uçurum tərəfində guardrail, neonda işıqlı baryer,
   alpda daş divar — postların yerinə seqment-seqment (merged).

## FAZA 4 — Maşın hissi (game feel)

1. **Drift tüstüsü + toz**: offroad-da trek rəngli toz, driftdə ağ tüstü (mövcud smoke
   sistemi gücləndirilir, pool ilə).
2. **Statik envmap parıltısı**: hər trekdə BİR dəfə kiçik CubeCamera render → maşın
   boyasında yumşaq əks — "plastik yox, boya" görkəmi. Bir dəfəlik xərc.
3. **Kamera mikro-dinamika**: nitroda FOV kick, döngədə yüngül roll, sürət artdıqca
   incə titrəyiş (hamısı mövcud kamera kodunda parametr).
4. **Fara/stop işıqları**: qürub/gecə treklərində emissive fara + arxada qırmızı iz hissi.

## FAZA 5 — Xəritə dizayn dili (dərin kompleks quruluş)

1. **Zonalar**: hər trek 3 sektora bölünür, dekor paylanması + aksent rəngi sektor üzrə
   (məs. riviera: liman → qəsəbə → açıq sahil). Dövrə boyu "səyahət" hissi.
2. **Vizual elevasiya**: yol fiziki düz qalır, ətraf relyef qalxıb-enir → dərədən keçid,
   aşırım kənarı, uçurum illüziyası.
3. **Tunel/örtülü keçidlər**: kanyon qaya tağı, neon estakada altı — işıq ritmi dəyişir.
4. **Qısayol vizual dili**: fərqli asfalt tonu (tozlu/köhnə), girişdə qapı dirəkləri —
   "gizli yol" hissi.
5. (Opsional) 6-cı trek: **"Vulkan Gecəsi"** — qara qum, közərən lava çatları (emissive),
   boz duman — palitra şousu.

## FAZA 6 — UI cilası

- Menyu showcase səhnəsi yeni mühiti göstərir (fon treki fırlanır), ekranlar arası
  yumşaq keçidlər, HUD mövqe dəyişəndə animasiya, finişdə kamera orbiti + konfeti.

---

## Performans büdcəsi (pozulmaz)

| Qayda | Hədd |
|---|---|
| Draw calls | desktop <150, mobil <120 (hazırda ~108) |
| İşıq sayı | SABİT (pool) — shader recompile qadağandır |
| Texture | yalnız kiçik canvas-lar (256–512), bir dəfəlik |
| Postprocessing | YOX — vignette CSS, bloom emissive ilə |
| Statik əlavələr | hamısı mergeStaticGroup / InstancedMesh |
| Dinamik effektlər | pool-lanmış (skid, smoke, sprite) |
| Hər faza sonu | FPS reqressiya testi: desktop 60, iPhone emulyasiya axıcı |

## İcra ardıcıllığı

1 → 2 → 3 → 4 → 5 → 6. Hər faza müstəqil deploy olunur, əvvəl/sonra screenshot müqayisəsi
+ FPS testi ilə. Faza 1+2 birlikdə görüntünün ~70%-ni dəyişir.
