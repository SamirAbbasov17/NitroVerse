# NitroVerse — "orta səviyyə" → "professional" planı

Bu sənəd hazırkı vəziyyəti dürüst qiymətləndirir və oyunu professional
səviyyəyə çıxaracaq işləri **təsir gücünə görə** sıralayır. Hər maddədə
"nə edilir", "niyə vacibdir" və "necə yoxlanılır" var.

---

## Hazırkı vəziyyət — dürüst qiymət

**Güclü tərəflər:** 5 rejim, 6 trek, 18 maşın + imza gücləri, onlayn
multiplayer, hesab/qızıl sistemi, 4 dil, mobil dəstək, 60 FPS (kadr xərci
p50 ~2.2 ms — büdcənin 15%-i). Texniki baza professionaldır.

**Zəif tərəflər (oyunu "orta" göstərən):**

| # | Problem | Təsir |
|---|---|---|
| 1 | **Vizual bütövlük yoxdur** — hər trekdə bədii dil fərqlidir, dekor bəzən səhnəyə uyğun deyil (yaşıl blob-lar, təsadüfi obyektlər) | Ən böyük — ilk 10 saniyədə "ucuz" hissi verir |
| 2 | **İşıqlandırma yastıdır** — kölgə yoxdur (zen/arena/futbol), materiallar tək-cür, gecə/gündüz kontrastı zəif | Yüksək |
| 3 | **Maşın modelləri eyni ailədəndir** — silhouetlər bir-birinə oxşayır, fərq yalnız rəngdədir | Yüksək |
| 4 | **Səs dizaynı zəifdir** — mühərrik sintetikdir, təkər/toqquşma/külək qatları yoxdur | Yüksək (hissiyyatın 40%-i səsdir) |
| 5 | **Onboarding yoxdur** — yeni oyunçu nə edəcəyini özü kəşf edir | Orta-yüksək (retention) |
| 6 | **Meta-progress dayazdır** — qızıl → maşın; hədəf/mükafat əyrisi yoxdur | Orta (uzunmüddətli) |
| 7 | **UI tipoqrafiyası və ikonoqrafiyası qeyri-sistemlidir** | Orta |
| 8 | **itch.io səhifəsi boşdur** — art yoxdur, tema standartdır | Orta (birinci təəssürat) |

---

## Faza 1 — Vizual bütövlük (1–2 gün, ən yüksək təsir)

**1.1 Bədii bibliya (art bible).** Hər trek/biom üçün 5 rəngli palitra
(səma, uzaq, orta, yaxın, vurğu) + icazə verilən dekor siyahısı təsbit
olunur. Palitradan kənar rəng qadağandır.
→ *Yoxlama:* hər səhnədən kadr, palitraya avtomatik uyğunluq testi
(dominant rənglərin palitraya məsafəsi).

**1.2 Dekor təmizliyi.** Səhnəyə uyğun olmayan hər obyekt silinir
(yaşıl blob-lar, təsadüfi kollar). Qayda: "bu obyekt bu səhnədə niyə var?"
sualına bir cümlə ilə cavab yoxdursa — silinir.
→ *Yoxlama:* 5 biom × gün/gecə vizual audit (skript hazırdır: `visual-audit.mjs`).

**1.3 Vahid material dili.** Bütün dekor eyni roughness/metalness
qaydasına salınır, gecə üçün emissive qaydası (yalnız işıq mənbələri
parlayır).
→ *Yoxlama:* material sayğacı + kadr müqayisəsi.

**1.4 Kompozisiya.** Hər trekdə 3 "poster nöqtəsi" (kamera oradan
keçəndə kadr gözəl olur): tağ, körpü, tunel çıxışı, şəhər silueti.
→ *Yoxlama:* trek boyu 12 nöqtədən kadr, hər biri ayrıca qiymətləndirilir.

## Faza 2 — İşıq və atmosfer (1 gün)

**2.1 Kölgə** — yarışda kölgə var, zen/arena/futbolda yoxdur. Zen üçün
yalnız maşın + yaxın dekor üçün kaskad kölgə (mobil: söndürülür).
**2.2 Gecə-gündüz əyrisi** — 6 mərhələli palitra (dan, səhər, günorta,
qürub, toran, gecə) + hər mərhələdə fog/exposure/ambient dəyəri.
**2.3 Atmosfer effektləri** — istilik dalğası (səhra), duman lövhələri
(dağ), yağış splash-ları (asfaltda), qar toz buludu.
→ *Yoxlama:* hər mərhələdən kadr + kadr vaxtı ölçməsi (p99 ≤ 20 ms).

## Faza 3 — Maşın identikliyi (1–2 gün)

**3.1 Silhouet fərqi** — 18 maşını 5 sinifə bölüb hər sinifə fərqli
gövdə forması (formula, hot-hatch, muscle, SUV, van). Hazır Kenney
modellərindən + prosedural əlavələrdən istifadə.
**3.2 Detal keçidi** — LOD: yaxında spoyler/egzoz/rels, uzaqda sadə.
**3.3 Boya sistemi** — 2 rəngli sxem (gövdə + vurğu), mat/metallik/
xrom variantları.
→ *Yoxlama:* 18 maşının qarajda yan-yana kadrı, silhouet testi (qara
fonda yalnız kontur — fərqlənirlərmi?).

## Faza 4 — Səs (1 gün, hissiyyata təsiri böyük)

**4.1 Mühərrik** — 3 qatlı: aşağı gurultu + orta ton + yüksək fit,
sürətə görə cross-fade; nitro üçün ayrıca qat.
**4.2 Təkər** — asfalt/torpaq/qar üçün fərqli sürtünmə səsi, drift
cığırtısı sürüşmə bucağına bağlı.
**4.3 Mühit** — külək (sürətlə), quş/cırcırama (zen gündüz), şəhər
uğultusu (neon), tunel əks-səsi.
**4.4 Toqquşma** — metal/plastik/beton üçün 3 fərqli zərbə səsi + şiddət.
→ *Yoxlama:* qulaqla A/B + səs qatlarının spektr yoxlaması.

## Faza 5 — Oyunçu axını və onboarding (1 gün)

**5.1 İlk 60 saniyə** — ilk girişdə avtomatik "sınaq turu": 30 saniyəlik
sürüş, idarəetmə ipucuları kontekstdə çıxır (nitro yaxınlaşanda "E bas").
**5.2 Hədəflər** — gündəlik 3 tapşırıq (məs. "2 dövrə birinci bitir"),
mükafat qızıl.
**5.3 Nəticə ekranı** — dövrə vaxtları, ən yaxşı dövrə, "şəxsi rekord"
bildirişi, paylaşma düyməsi.
→ *Yoxlama:* yeni hesabla tam axın testi (5 dəqiqəlik ilk sessiya).

## Faza 6 — UI sistemi (yarım gün)

Tipoqrafiya şkalası (4 ölçü), 8px şəbəkə, ikon dəsti (tək üslub),
vahid düymə/kart komponentləri, animasiya qaydaları (150/250 ms).
→ *Yoxlama:* bütün ekranların kadr-kadr müqayisəsi.

## Faza 7 — Mağaza səhifəsi (yarım gün)

itch.io: xüsusi tema (rəng, font, fon şəkli), başlıq banneri, GIF-lər
(hər rejimdən 3 saniyə), bölmə başlıqları, "Nə yenidir" devlog.
→ *Yoxlama:* səhifənin masaüstü + mobil kadrı.

---

## Ölçülə bilən hədəflər

| Metrika | Hazırda | Hədəf |
|---|---|---|
| Kadr vaxtı p99 (masaüstü) | 3.1 ms | ≤ 4 ms (kölgə ilə) |
| Kadr vaxtı p99 (mobil) | ~19 ms | ≤ 16.6 ms |
| Konsol xətası | 0 | 0 |
| Vizual audit qüsuru | 4–6 | 0 |
| İlk sessiya uzunluğu | ölçülmür | ≥ 4 dəqiqə |
| itch.io səhifə tamlığı | 60% | 100% |

## Sıralama (ən yüksək təsir → aşağı)

1. **Faza 1** (vizual bütövlük) — oyunun "ucuz" görünməsinin əsas səbəbi
2. **Faza 2** (işıq/atmosfer) — dərinlik və keyfiyyət hissi
3. **Faza 4** (səs) — hissiyyatın yarısı
4. **Faza 3** (maşın identikliyi) — fərqlənmə
5. **Faza 5** (onboarding) — oyunçu qalması
6. **Faza 6–7** (UI + mağaza) — pardaqlama
