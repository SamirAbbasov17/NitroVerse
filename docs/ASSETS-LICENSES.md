# Asset lisenziya jurnalı

Oyuna daxil olan **hər** xarici və ya AI ilə yaradılmış fayl burada qeyd olunur. Qeydsiz asset commit olunmur. Qaydalar: `.claude/rules/assets.md`.

## 3D modellər

| Dəst | Yol | Mənbə | Lisenziya | Lisenziya faylı |
|---|---|---|---|---|
| Kenney Car Kit 3.1 | `public/models/cars/` (10 GLB + `Textures/`) | kenney.nl | CC0 | `public/models/KENNEY-LICENSE.txt` |
| Kenney Nature Kit | `public/models/nature/` (21 GLB) | kenney.nl | CC0 | `public/models/KENNEY-LICENSE.txt` (Car Kit mətni — Nature Kit üçün ayrıca fayl yoxdur) |
| KayKit City Builder Bits | `public/models/city/` (12 gltf + bin + `colormap.png`) | kaylousberg.itch.io | CC0 | `public/models/city/KAYKIT-LICENSE.txt` |
| Prosedural | `src/core/AssetFactory.js` və s. | öz kodumuz | — | — |

## Musiqi

| Fayllar | Mənbə | Lisenziya | Status |
|---|---|---|---|
| `public/music/*.mp3` (24 trek, ~50 MB) | **HoliznaCC0** (Free Music Archive / holiznacc0.bandcamp.com) — əvvəlki sessiyada Claude tərəfindən endirilib; mənbə `src/core/AudioManager.js:317`-də qeyd olunub | CC0 1.0 (sənətçi bütün arxivini CC0 elan edib) | 18 trek "Lo-fi And Chill" toplusundandır. 6 faylın ID3 teqi `Holizna — Ocean Memory / Summer Air` göstərir (`cold-salt-water`, `currents-we-used-to-know`, `i-dont-understand-a-thing`, `ocean-memory`, `washed-up`, `roof-tops`) — bu albomların CC0 olması ayrıca səhifədən təsdiqlənməyib; kommersiya buraxılışından əvvəl FMA səhifəsində yoxlanmalıdır. Lisenziya mətni `public/music/`-ə əlavə olunmayıb. |
| Menyu/yarış musiqisi | `src/core/AudioManager.js` (sintez) | öz kodumuz | OK |

## Şriftlər

| Şrift | Mənbə | Lisenziya |
|---|---|---|
| Russo One, Rajdhani | Google Fonts | SIL OFL 1.1 |

## AI ilə yaradılanlar

Oyuna daxil olan AI assetləri bura yazılır: fayl, model, prompt, seed, tarix, servis şərtləri.

| Fayl | Model / servis | Prompt (qısa) | Seed | Tarix | Lisenziya qeydi |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

`art/carmageddon/` (Pollinations ilə sınaqlar, 2026-08) oyuna **daxil deyil** və rədd edilmiş cəhd kimi saxlanılır.

## Yeni sətir əlavə etmə qaydası

1. Lisenziyanı mənbə səhifəsində oxu (CC0 / açıq kommersiya icazəsi). Əmin deyilsənsə — işlətmə.
2. Dəstin lisenziya faylını qovluğuna kopyala.
3. Yuxarıdakı uyğun cədvələ sətir yaz.
4. CC BY kimi atribusiya tələb edən lisenziya yalnız istifadəçi razıdırsa; oyun daxili "Kreditlər"ə də əlavə olunmalıdır.
