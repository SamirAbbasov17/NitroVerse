---
name: nitroverse-playtest
description: NitroVerse-i real brauzerdə chrome-devtools MCP ilə açıb oynamaq, müşahidə etmək və oynanış/kamera/HUD problemlərini tapmaq. Oynanış hissi, kamera, fizika, toqquşma, HUD və ya giriş gecikməsi ilə bağlı iş görüləndə, buq təkrarlananda və "oyun necə hiss olunur" sualına cavab lazım olanda işlədilir.
---

# Oynanış testi

Statik kadr hərəkəti göstərmir. Hissə aid hər iş burada yoxlanır.

## Hazırlıq

1. Dev server: `npm run dev` (arxa planda; 5173). Testlər işləyirsə onların serveri artıq qalxıb.
2. `chrome-devtools` MCP ilə `http://localhost:5173` aç. Alət sxemləri gecikmiş yüklənir — `ToolSearch` ilə `chrome-devtools` axtar.
3. Rejimi birbaşa başlat (menyudan keçmədən), `evaluate_script` ilə:
   ```js
   window.__menu.onStart({ mode: 'race', trackId: 'neon', carId: 'blaze', laps: 3, difficulty: 'normal' })
   // mode: 'race' | 'free' (zen) | 'football' | 'arena'
   // trackId: desert | neon | alpine | canyon | riviera | zavod
   ```
4. İdarə: W/A/S/D və ya oxlar, Space əl əyləci, Esc pauza, M səs. Düymələri basılı saxlamaq üçün klaviatura hadisələrini `evaluate_script` ilə göndər və ya ardıcıl kadr al.

## Müşahidə üsulu

- **Ardıcıl kadr:** eyni manevrdə 0.3–0.5 s aralıqla 4–6 skrinşot → kameranın, maşının və effektlərin hərəkətini oxu.
- **Vəziyyət oxu:** `window.__active` aktiv səhnədir — maşın mövqeyi/sürəti, kamera, `renderer.info`. Hissi rəqəmlə təsdiqlə (məs. sükan girişindən dönmə başlayana qədər neçə kadr).
- **Performans trace:** `performance_start_trace` → manevr → `performance_stop_trace`; uzun kadrları və səbəbini oxu.
- **Zəif cihaz:** CPU throttle 4× + 844×390 emulyasiya ilə təkrarla. Oyunçuların çoxu telefondadır.
- **Konsol:** hər sessiyanın sonunda xəta/xəbərdarlıq siyahısı.

## Yoxlama siyahısı

| Sahə | Nəyə bax |
|---|---|
| Giriş | sükan/qaz reaksiyası gecikirmi; düymə buraxılanda maşın nə vaxt düzəlir |
| Sürüş | sürət hissi, drift başlanğıcı/çıxışı, əyləc məsafəsi, yoldan çıxanda cəza |
| Kamera | titrəmə, divara girmə, kəskin dönüşdə maşını itirmə, FOV sıçrayışı, geri baxış |
| Toqquşma | divara ilişmə, obyektin içinə girmə, havaya atılma, AI ilə təmas |
| AI | yolda qalırmı, bir-birinə yığılırmı, çətinlik fərqi hiss olunurmu |
| HUD | sürətdə oxunurmu, fonla qarışırmı, vacib məlumat gözün yolundadırmı |
| Axın | start geri sayımı, pauza, yenidən başlat, finiş → nəticə → menyu |
| Səs | mühərrik sürətə uyğunmu, effektlər üst-üstə yığılıb cırıldayırmı |
| Rejimə xas | futbol: top fizikası, qol; arena: zona, ability; zen: chunk keçidi, tunel |

## Hesabat

Hər tapıntı üçün: **nə etdim → nə gözləyirdim → nə oldu → sübut (kadr/rəqəm) → ciddilik**. Tapıntıları düzəltməyə başlama — siyahını istifadəçiyə ver, sıranı o seçir. "Yaxşı hiss olunur" tipli sübutsuz hökm yazma.

Təkrarlanan yoxlama lazımdırsa onu `tests/`-ə Playwright testi kimi yaz.
