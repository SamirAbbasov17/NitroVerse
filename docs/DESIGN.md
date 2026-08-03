# NitroVerse — Bədii istiqamət (Art Direction)

Bu sənəd "nə gözəldir" sualına layihə üçün **bağlayıcı cavab** verir. Yeni
vizual əlavə etməzdən əvvəl buradakı qaydalarla yoxla.

## Dəmir qaydalar

1. **Postprocessing pipeline YOXDUR.** Bloom/DOF/SSAO mobil FPS-i öldürür.
   Effekt lazımdırsa: bir dəfə hesablanan həndəsə, additiv sprite, vertex
   rəngi, yaxud CSS overlay (render dövrünə toxunmur).
2. **Az, amma yerində.** Səpələnmiş obyekt sayı yox, **kompozisiya** işləyir.
   Boş sahə pis deyil — mənasız obyekt pisdir. (Təcrübə: yola yaxın
   səpələnmiş ot/daş "zibil" kimi oxundu və geri götürüldü.)
3. **Kontekst.** Şəhər trekində ağac/qaya olmaz; alp trekində neon lövhə
   olmaz; səhrada palma olmaz. Model qoymazdan əvvəl "bu, bu səhnədə niyə
   var?" sualına bir cümlə ilə cavab olmalıdır.
4. **Silueti oxu.** Uzaqdakı obyekt yalnız siluetlə oxunur: forma fərqli
   deyilsə, detal artırmağın mənası yoxdur.
5. **Yol həmişə ən üstdədir.** Heç bir dekor, relyef və ya təsadüfi
   generasiya asfaltın üstünə çıxa bilməz (bax TESTING.md → şüa testi).

## Palitra və işıq

- Hər trekin öz palitrası var (`src/data/tracks.js` → `palette`): göy,
  duman, yer, kənar, vurğu. Yeni rəng seçəndə **vurğu rəngindən** başla,
  qalanını ona uyğunlaşdır.
- Kölgə: yalnız `Environment`-in günəşi (2048 xəritə, ±70 m çərçivə).
  Arena/futbol/zen kölgəsizdir — orada kontrast **ambient + hemisphere**
  ilə qurulur.
- Gecə: ambient minimum 0.5 olmalıdır, yoxsa flat-shaded iri üçbucaqlar
  sərt qara ləkə kimi oxunur (ölçülüb, düzəldilib).

## Dərinlik layları

Səhnə üç laydan qurulur — biri əskikdirsə mənzərə "yastı" görünür:

| Lay | Nümunə | Qayda |
|---|---|---|
| Fon | göy günbəzi, dağ siluetləri, buludlar | duman rənginə yaxınlaşır |
| Orta | təpələr, binalar, tribunalar | siluet fərqli olsun |
| Yaxın | yol kənarı, bariyer, işarələr | yalnız trekin **öz** elementləri |

Yer səthi düz disk olmamalıdır: vertex rəngi (təkrarsız ləkələr) + trekdən
34 m sonra başlayan yüngül relyef (`Environment._build`).

## Assetlər

- **Kenney Nature Kit** (CC0) — zen biomları üçün ağac/qaya/bitki.
- **KayKit City Builder Bits** (CC0) — zen şəhər rayonları.
- Prosedural (`AssetFactory`) — trek elementləri: bariyer, tribuna,
  projektor, sponsor lövhəsi, konteyner.

Model əlavə etməzdən əvvəl: `docs/MODELS.md`.

## Oyun hissi (game feel)

Mövcud: hit-stop (55 ms), zərbə flaşı, sürət zolaqları (82%+), nitro
xromatikası, kamera FOV oyunu, drift meyli, vinyet, kinematik qradasiya.

Yeni effekt əlavə edəndə: **ölç** (kadr vaxtı p99 və maks), sonra qərar ver.
33 ms-dən böyük sıçrayış qəbul edilmir.
