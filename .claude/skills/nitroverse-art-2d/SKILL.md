---
name: nitroverse-art-2d
description: NitroVerse üçün 2D art yaratmaq — personaj, fon, CG, UI illüstrasiyası, ikon, promo şəkli. Draw Things (lokal) ilə generasiya, stil bibliyası, personaj ardıcıllığı və son emal qaydaları. Carmageddon visual novel işi, personaj dizaynı, sprite/ifadə vərəqi, fon şəkli və ya istənilən 2D şəkil generasiyası lazım olanda işlədilir.
---

# 2D art axını

Əvvəlki cəhd (`art/carmageddon/`) uğursuz oldu: stil qərarı yox idi, şəkil Python skripti ilə piksel-piksel çəkildi, generasiya nəzarətsiz idi. Bu axın onu təkrarlamamaq üçündür.

## 0. Stil bibliyası olmadan generasiya etmə

`art/<layihə>/STYLE.md` olmalıdır və istifadəçi təsdiqləməlidir:
- stil (piksel / anime illüstrasiya / cel-shaded / boyalı), referans əsərlər
- palitra (hex), xətt qalınlığı, kölgə üsulu, işıq istiqaməti
- kətan ölçüləri: personaj, fon, CG, portret
- hər personaj üçün: təsvir vərəqi + **təsdiqlənmiş referans şəkil**

Stil hələ seçilməyibsə: 3–4 fərqli istiqamətdə kiçik nümunə hazırla, istifadəçiyə göstər, o seçsin. Seçimi özün etmə.

## 1. Alətlər

| Alət | Nə üçün | Qeyd |
|---|---|---|
| **Draw Things** (`drawthings` MCP, lokal) | əsas generasiya, limitsiz | tətbiq açıq və API Server aktiv olmalıdır (Settings → API Server, HTTP, 7860). ölçülüb (2026-10-05, FLUX.2 klein 4B q8, 768×1024, 4 addım, cfg 1): **~56 s/şəkil**. Bu model üçün `steps: 4`, `cfg_scale: 1` ver — MCP-nin standartı (20 addım, 7.5) bu modelə uyğun deyil |
| **Gemini API** (`GEMINI_API_KEY`, `.env.local`) | referansla redaktə, personajı yeni poza/ifadəyə salmaq | **pulsuz tier-də şəkil kvotası 0-dır** (2026-10-05 sınağı: 429, limit 0). Yalnız istifadəçi billing qoşsa işləyir — qoşulmayıbsa cəhd etmə, Draw Things işlət |
| **ffmpeg / Python PIL** | kəsmə, ölçü, format, vərəq yığma | PIL quraşdırılmayıbsa `uv run --with pillow` |
| `pixel-plugin` (Aseprite MCP) | piksel art redaktəsi | **Aseprite quraşdırılmayıb — işləmir.** Piksel stil seçilərsə istifadəçidən Aseprite (pullu) və ya LibreSprite qərarını soruş |

Modellər (Draw Things-də endirilir): FLUX.2 klein 4B və Z-Image Turbo — Apache 2.0, kommersiya istifadəsinə açıq. Başqa checkpoint/LoRA işlətməzdən əvvəl lisenziyasını yoxla.

## 2. Personaj ardıcıllığı

1. Tək, təmiz, tam boy, neytral poza referansı yarat → istifadəçi təsdiqləsin.
2. Sonrakı hər şəkil həmin referansdan törəyir: image-to-image / referans şəkilli redaktə. Sıfırdan mətnlə yenidən generasiya etmə — üz və geyim sürüşür.
3. Prompt şablonu sabit qalır: `[STYLE.md stil sətri], [personaj sabit təsviri], [dəyişən: poza/ifadə/bucaq], [fon qaydası]`. Seed-i qeyd et.
4. İfadə vərəqi: eyni baş, yalnız ifadə dəyişir (inpaint/redaktə), sonra bir vərəqə yığ.
5. Uzunmüddətli ardıcıllıq lazımdırsa təsdiqlənmiş 15–25 şəkildən Draw Things-də LoRA təlimi.

## 3. Yoxlama

Hər şəklə **Read ilə bax**, bu siyahı ilə:
- əllər/barmaqlar, gözlərin simmetriyası, anatomiya
- geyim detalları referansla eynidirmi (rəng, aksesuar sayı, tərəf)
- stil sürüşməsi (xətt qalınlığı, kölgə üsulu)
- fon: kənar artefakt, şəffaflıq kənarı
- mətn/loqo/su nişanı qalmayıb

Qüsurlu şəkli "kifayət qədər yaxşıdır" deyə keçirmə — yenidən generasiya et və ya istifadəçiyə qüsuru de. İstifadəçiyə 2–4 variant göstər, seçim onundur.

## 4. Fayl qaydası

- Mənbə və aralıq fayllar: `art/<layihə>/<növ>/` (məs. `art/carmageddon/characters/mira/ref-v2.png`)
- Oyuna gedən son fayl: `public/<layihə>/…`, `.webp` (fon) / `.png` (şəffaf sprite)
- Hər qəbul olunmuş asset `docs/ASSETS-LICENSES.md`-ə: model, prompt, seed, tarix
- Rədd edilənləri silmə — `art/<layihə>/_rejected/`-ə köçür (nəyin işləmədiyi bəlli olsun)
