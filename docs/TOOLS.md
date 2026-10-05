# Alətlər — nə işlədirik və niyə

Araşdırma tarixi: **2026-10-05**. Şərt: yalnız pulsuz alətlər. Pulsuz tier limitləri tez-tez dəyişir — ciddi partiya işindən əvvəl yenidən yoxla.

Maşın: MacBook Air M5, 16 GB RAM. Blender 5.1.1, Chrome, ffmpeg, uv, Node 26 quraşdırılıb.

## Qoşulmuş MCP serverlər (`.mcp.json`)

| Server | Nə verir | Asılılıq |
|---|---|---|
| `chrome-devtools` (Google, rəsmi) | oyunu real Chrome-da açmaq, skrinşot, konsol, performans trace, CPU/şəbəkə throttle, mobil emulyasiya | — |
| `threejs-devtools` (icma, v0.4) | canlı səhnə ağacı, material/shader/tekstura, draw call, yaddaş. Öz brauzerini açır (proxy 9222 → 5173); səhifədə bir neçə renderer olanda (maşın önizləmələri) yanlışını seçə bilər — nəticəni `chrome-devtools` ilə tutuşdur | dev server 5173-də; kiçik layihədir — problem yaradarsa `.mcp.json`-dan sil |
| `context7` | kitabxanaların aktual sənədi (Three.js r160, PixiJS, inkjs, Playwright) | — |
| `blender` (blender-mcp) | Blender-i interaktiv idarə; Poly Haven / Sketchfab / Hunyuan3D inteqrasiyası | Blender açıq + addon qoşulu (aşağıda) |
| `drawthings` (mcp-drawthings) | lokal şəkil generasiyası (sınaqdan keçib: ~56 s / 768×1024) | Draw Things açıq + API Server aktiv (aşağıda) |

`pixel-plugin` (Aseprite MCP) qlobal qurulub, amma **Aseprite proqramı yoxdur** — alətlər işləmir.

### Əl ilə bir dəfəlik qurulum

**Blender MCP** (addon faylı 2026-10-05-də quraşdırılıb: `uvx mcp-for-blender install-addon`)
1. Blender → Edit → Preferences → Add-ons → "MCP for Blender"-i söndür-yandır (və ya Blender-i yenidən başlat)
2. 3D görünüşdə `N` → MCP tabı → **Start MCP Server**
3. İstəyə görə: Poly Haven qutusunu işarələ (CC0 HDRI/tekstura/model)
4. Addon köhnəlsə eyni əmrlə yenilənir

**Draw Things**
1. `/Applications/Draw Things.app` aç
2. Model seç və endir: FLUX.2 [klein] 4B və ya Z-Image Turbo (hər biri bir neçə GB)
3. Settings → API Server → aktiv et (HTTP, port 7860, yalnız localhost)

## Repo daxili alətlər

| Alət | Əmr | Nə üçün |
|---|---|---|
| Playwright | `npm run test:*` | smoke, performans, kadr, sızma, mobil audit (`docs/TESTING.md`) |
| ESLint | `npm run lint` | real buq tutan minimal qaydalar; redaktədən sonra hook özü işlədir |
| Blender headless | `tools/blender/prep_model.py` | model hazırlığı: miqyas, pivot, decimate, GLB, önizləmə |
| gltf-transform | `npx gltf-transform optimize\|inspect` | GLB təmizləmə və yoxlama |
| ffmpeg | — | səs/video çevirmə, kəsmə |
| gh | — | GitHub PR/issue |

## Pulsuz məzmun mənbələri

**3D (CC0 — atribusiyasız, kommersiya OK):** kenney.nl · quaternius.com · KayKit (kaylousberg.itch.io) · poly.pizza (CC0 filtri) · polyhaven.com · ambientcg.com

**Səs:** Kenney Audio (CC0) · Sonniss GDC paketləri (royalty-free, atribusiyasız) · freesound.org (yalnız CC0 filtri ilə)

**AI 3D (yalnız tək hero/landmark obyekt):** Hunyuan3D — hostinqdə gündə ~20 pulsuz generasiya; Tripo — ayda ~300 kredit. Pulsuz tier-in çıxış lisenziyası fərqli ola bilər (CC BY / ictimai) — hər istifadədə şərti oxu, `ASSETS-LICENSES.md`-ə yaz.

**AI 2D:**
- Draw Things (lokal, limitsiz). Modellər: FLUX.2 [klein] 4B, Z-Image Turbo — Apache 2.0
- Gemini API — **pulsuz tier-də şəkil generasiyası yoxdur.** 2026-10-05-də real açarla yoxlanıldı: `gemini-2.5-flash-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` hamısı `429 … free_tier_requests, limit: 0` qaytarır. Açar `.env.local`-dadır (`GEMINI_API_KEY`) və etibarlıdır (model siyahısı gəlir), amma şəkil üçün ödənişli hesab (billing) lazımdır. Billing qoşulsa referansla redaktə/personaj ardıcıllığı üçün ən güclü seçim budur.

## Rədd edilənlər

| Alət | Səbəb |
|---|---|
| **Higgsfield** | Pulsuz deyil: pulsuz planda 0 kredit, kommersiya istifadəsi qadağan; MCP hər generasiyada kredit yeyir; ən ucuz plan ~$15–19/ay. Pul ayrılsa treyler/video üçün yenidən baxıla bilər. |
| Pollinations | Əvvəl işlədilib (`art/carmageddon/gen_*.py`): nəzarət zəif, keyfiyyət sabit deyil. |
| ElevenLabs SFX (pulsuz) | Pulsuz tier kommersiya istifadəsini qadağan edir. |
| Gemini şəkil API (pulsuz tier) | Kvota 0 — sınaqla təsdiqləndi (yuxarıda). Onlayn bələdçilərdəki "gündə 500 pulsuz şəkil" artıq doğru deyil. |
| Meshy (pulsuz) | Ayda ~3 teksturalı model — praktik deyil. |
| Aseprite | $20. Piksel stil seçilərsə qərar veriləcək (alternativ: LibreSprite, pulsuz). |
| ComfyUI | Draw Things eyni maşında ~20–40% sürətlidir və qurulumu sadədir. |
| Postgres / Sentry / Figma / GitHub MCP | Bu layihəyə indi dəyər qatmır; hər əlavə MCP konteksti yeyir. |

## Sonraya saxlanılan qərarlar

- **VN mühərriki (Carmageddon):** inkjs (ssenari dili) + PixiJS v8 (render və 2D oynanış). Pixi'VN (hazır VN çərçivəsi, ink dəstəkli) alternativ kimi qiymətləndiriləcək.
- **GLB sıxılması (meshopt/draco):** `GLTFLoader`-ə dekoder qoşulmalıdır — hələ qoşulmayıb.
- **Three.js r160 → r186:** upgrade planında müzakirə olunacaq.

## Mənbələr

- [Chrome DevTools MCP vs Playwright MCP](https://mcp.directory/blog/chrome-devtools-mcp-vs-playwright-mcp-2026) · [threejs-devtools-mcp](https://github.com/DmitriyGolub/threejs-devtools-mcp) · [blender-mcp](https://mcpservers.org/servers/ahujasid/blender-mcp)
- [Claude Code + Draw Things](https://www.heyuan110.com/posts/ai/2026-02-16-claude-code-draw-things-workflow/) · [Mac-da lokal şəkil generasiyası](https://modelfit.io/guides/local-image-generation-mac/)
- [Higgsfield pulsuzdurmu](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026) · [Higgsfield MCP qiyməti](https://www.higgsfieldmcp.com/guides/is-it-free)
- [AI 3D generatorlar 2026](https://blyth.ai/blog/best-ai-3d-model-generators-2026) · [Pulsuz oyun assetləri](https://app.cinevva.com/guides/game-assets-guide) · [Pulsuz səs/SFX](https://app.cinevva.com/guides/free-sound-effects-music)
- [Gemini şəkil API pulsuz tier](https://www.aifreeapi.com/en/posts/gemini-image-generation-free-api) · [Pixi'VN](https://pixivn.readthedocs.io/en/latest/)
