---
paths:
  - "public/models/**"
  - "public/music/**"
  - "art/**"
  - "src/core/ModelLibrary.js"
  - "src/world/NatureKit.js"
  - "src/world/CityKit.js"
  - "docs/ASSETS-LICENSES.md"
---

# Asset qaydaları

- **Lisenziya əvvəl gəlir.** Yalnız CC0 və ya kommersiya istifadəsinə açıq icazəli. Hər xarici və ya AI ilə yaradılmış fayl `docs/ASSETS-LICENSES.md`-ə yazılır (mənbə, lisenziya, tarix, AI-dırsa model + prompt). Lisenziya faylını dəstin qovluğuna kopyala.
- Pulsuz AI servislərinin çıxış lisenziyası fərqlidir (bəziləri CC BY və ya qeyri-kommersiya). İstifadədən əvvəl şərtləri yoxla; əmin deyilsənsə işlətmə.
- 3D mənbə sırası: mövcud dəstlər (Kenney, KayKit) → digər CC0 dəstlər (Quaternius, Poly Pizza) → Blender-də kitbash → yalnız sonda AI generasiya. Stil bütövlüyü poliqon sayından vacibdir.
- Format `.glb`. Oyuna girməzdən əvvəl `nitroverse-asset-pipeline` skill-i (Blender headless → `gltf-transform optimize` → büdcə testi).
- Model yükləyicisi `NatureKit`/`CityKit` üslubunda: hündürlüyə görə normallaşdır, mərkəzlə, yerə otur, tək paylaşılan material, `userData.shared = true`, `main.js`-də əvvəlcədən yüklə.
- NatureKit materialları **rəngə görə** paylaşılır (ağappaq ağac buqu) — yeni dəstdə material açarını yoxla.
- `art/` mənbə fayllarıdır, oyuna daxil deyil. Oyunda işlənən son fayl `public/`-ə gedir.
- 2D generasiya: `nitroverse-art-2d` skill-i. Stil bibliyası olmadan personaj/fon generasiya etmə.
- Böyük ikili fayl (>5 MB) commit etməzdən əvvəl istifadəçidən soruş.
