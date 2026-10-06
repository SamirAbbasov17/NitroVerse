// ————— ARXA-GÖRÜNÜŞ KAMERASININ DÜZƏLİŞLƏRİ (yarış + zen) —————
// İstifadəçi köhnə kamera ilə yan-yana sınayıb bunu seçdi (2026-10-06).
// Köhnə kamera döngədə burundan 5–10° GERİ baxırdı; bu, döngənin İÇİNƏ baxır
// (~9°) və sürətdə azca alçalır. Məsafə və baxış bucağı dəyişmir — ilk sınaqda
// əlavə geri çəkilmə maşını tam sürətdə çox uzaqlaşdırırdı (istifadəçi rəyi).
//
//   side — baxış nöqtəsinin döngə tərəfə sürüşməsi (m; müsbət = sağa)
//   back — əlavə geri məsafə (m)     drop — hündürlükdən çıxılan (m)     fov — əlavə dərəcə
export function chaseCamTweak(car, speedT, lookBack = 1) {
  const st = (car._steerSmooth || 0) * lookBack;
  return {
    side: st * (1.3 + speedT * 1.3),
    back: car.isDrifting ? 0.3 : 0,
    drop: speedT * 0.2,
    fov: car.driftBoostT > 0 ? 3 : 0,   // drift çıxışı təkanında qısa "kick"
  };
}
