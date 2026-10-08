# Carmageddon — üslub bibliyası

NitroVerse-in ikinci oyunu: hekayə əsaslı, post-apokaliptik yarış. Vəziyyət: **hazırlanır** — hələlik
yalnız başlıq ekranı var (`src/games/carmageddon/`). Mənbə fayllar: `art/carmageddon/` (oyuna daxil deyil),
oyuna gedən fayllar: `public/carmageddon/`.

## Qərarlar (istifadəçi, 2026-10-08)

- **Üslub: piksel art.**
- **Baş qəhrəman: qız, qırmızı saçlı, maşın sürən biri.** Dünya: post-apokaliptik.
- NitroVerse menyusundan seçiləndə **ayrıca oyun kimi** açılır: öz şrifti, öz palitrası, öz menyusu.

## Piksel toru

- Başlıq ekranının kətanı **480×270** (16:9), `image-rendering: pixelated` ilə böyüdülür. Kətanda hər
  şey tam pikseldə çəkilir (yarım piksel, hamar kənar, bulanıq böyütmə yoxdur).
- Qəhrəmanın portreti **160×213** (yarım boy), palitra ≤ 56 rəng, tünd kontur.
- Animasiya kadrla (addımla) gedir: nəfəs 1 px, saç sətir-sətir sürüşür, göz kadrları dəyişir.

## Palitra

| Ad | Rəng | Harada |
|---|---|---|
| mürəkkəb | `#12080c` | kontur, fon, kölgə |
| sümük | `#f6e7c8` | əsas mətn, nitq balonu |
| pas | `#e2571c` | çərçivə, vurğu |
| kəhrəba | `#ffb53a` | seçim, "hazırlanır" nişanı |
| qan | `#b3261e` | xəbərdarlıq nöqtəsi |
| toz | `#c9a98a` | ikinci dərəcəli mətn |
| səma | `#170d24 → #5a1c3a → #e8742a → #fbd06a` | zolaqlı qürub (9 pillə, hamar keçid yox) |
| saç | `#ff2a10` ailəsi | qəhrəmanın saçı — kadrda ən doymuş rəng odur |
| göz | `#4cc270` / `#1f7446` | yaşıl |

## Şriftlər (Google Fonts, OFL)

- **Loqo: Black Ops One** — kiçik kətanda (300×64) çəkilir, kənarları sərtləşdirilir və pikselli
  böyüdülür; sarı→narıncı→qırmızı qradiyent, tünd kontur, pas cızıqları.
- **Mətn, düymə, nişan: Tiny5** — Azərbaycan (Ə), türk və kiril hərfləri var və iri hərflərdə oxunur.
  Sınanıb rədd edilənlər: *Press Start 2P* (böyük Ə yoxdur), *Pixelify Sans* (qalın iri hərflərdə Z/2 və
  C/O qarışır, kirildə д/е oxunmur).

## Baş qəhrəman

- Uzun, küləkdə yellənən parlaq qırmızı saç; yaşıl gözlər; özünə arxayın yüngül təbəssüm.
- Alnında sürücü eynəyi; qəhvəyi dəri gödəkçə, boz şərf, barmaqsız əlcək; qolları çarpaz.
- Adı və keçmişi hələ müəyyən deyil (hekayədə açılacaq) — interfeysdə "Sürücü".
- Mənbə: `art/carmageddon/characters/hero/` — `gen-c-4303.png` (əsas eskiz), `gen-a-4101.png` (eyni
  personajın tam boy variantı), `gen-b-4202.png` (alternativ: qısa saç — seçilməyib).
- Boru xətti: Draw Things (FLUX.2 klein 4B) eskizi → `pixelize.py` (fon açarı, modal rənglə 160 px-ə
  endirmə, 56 rəngə kvantlama) → `eyes.py` (gözlər və qaşlar əl ilə piksel-piksel; kadrlar: mərkəz, sol,
  sağ, yarı bağlı, bağlı). Yeni poza/ifadə lazımdırsa eyni eskizdən törət, sıfırdan generasiya etmə.

## Qeyd: ad

"Carmageddon" mövcud oyun seriyasının adıdır (ticarət nişanı başqasına məxsusdur). Oyun ictimai
buraxılmazdan əvvəl ad barədə qərar verilməlidir.
