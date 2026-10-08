# UI qaydaları

## Menyu quruluşu

`src/ui/Menu.js` → `_panel({step, stepLabel, title, sub, body, nav, hint, foot})`.
Bütün ekranlar bu qabdan keçir; brandrow (profil/dostlar/mesaj/dil/qaraj)
avtomatik gəlir.

Naviqasiya: YARIŞDA addımlar var (trek→maşın→dövrə), Geri bir addım geri;
qalan rejimlərdə (futbol/arena/zen/qaraj) Geri ana menyuya gedir.

**Mod sətrinə klik ÖZÜ növbəti ekrana keçir** — ayrıca "Davam et" basmaq
lazım deyil (test ardıcıllığını buna görə qur).

## Ekranlar

| Ekran | Metod | Qeyd |
|---|---|---|
| Rejim | `showModes` | altlıq: ☕ dəstək · 🐞 xəta bildir |
| Giriş | `showAuth` | yalnız giriş; qeydiyyat ayrı |
| Qeydiyyat | `showSignup` | istəyə bağlı e-poçt |
| Şifrə bərpası | `showReset` | 2 addım: kod → yeni şifrə |
| Qaraj/kosmetika | `showGarage`/`showCosmetics` | qonaqda 🔒 Hesab nişanı |
| Onlayn | `showOnline` | otaq adı ≠ oyunçu adı |
| Xəta bildir | `showBugReport` | `/api/report` → e-poçt |

## i18n

`src/core/i18n.js`, `t(key, {vars})`, dil `localStorage('apexLang')`,
dəyişəndə `location.reload()`. **4 dil məcburidir**: az/en/ru/tr.
Yeni açar əlavə edəndə dördünü də yaz.

`showTracks`-da map parametri `tr` adlanır — lokal `t` dəyişəni i18n
funksiyasını kölgələyir, ondan çəkin.

## Vizual dil

- Qalın Russo One başlıqlar, Rajdhani mətn
- **Ölçü şkalası** (`styles.css` → `:root` şərhi): şrift 10–16, 18, 20, 22, 24, 26, 30, 34 px (yarım piksel yoxdur); künc 4 / 6 / 8 / 10 / 12 / 14 px (`--r-chip|btn|card|panel`); boşluq 4-ün misilləri. Yeni qayda yazanda şkaladan seç
- **İkonlar** `src/ui/icons.js` (Phosphor "fill"); emoji avtomatik ikona çevrilir, çat istisna
- Vurğu rəngi `--accent` (narıncı), yaxşı `--good`, təhlükə qırmızı
- Kilid nişanı: `🔒 Hesab` (qonaq) / `🪙<qiymət>` (hesabla)
- Modal YOXDUR: zen mühit idarəsi HUD düymələridir (istifadəçi qərarı)
