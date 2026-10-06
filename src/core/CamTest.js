// ————— KAMERA SINAĞI (Faza 2) —————
// Köhnə və yeni arxa-görünüş kamerasını YAN-YANA müqayisə etmək üçün müvəqqəti keçid.
// Standart oyunçu heç nə görmür: sınaq ünvana `?cam=2` yazılanda açılır (seçim yadda
// qalır; `?cam=0` söndürür). Açıq olanda ekranda nişan çıxır — toxunmaq və ya F9
// sürüş əsnasında kameranı dəyişir.
//
// Yeni variant (B): döngənin içinə baxır və sürətdə azca alçalır; məsafə köhnə ilə
// eynidir. İstifadəçi seçəndən sonra bu fayl silinəcək.
const KEY = 'apexCam'; // '' (sınaq bağlı) | '1' (köhnə) | '2' (yeni)

// Ünvan parametri səhifə açılanda bir dəfə oxunur
try {
  const q = new URLSearchParams(location.search).get('cam');
  if (q === '0') localStorage.removeItem(KEY);
  else if (q === '1' || q === '2') localStorage.setItem(KEY, q);
} catch { /* gizli rejim */ }

const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export const camB = () => read() === '2';

// Arxa-görünüş kamerasının B variantı üçün düzəlişlər. Səhnə öz hesabladığı
// `back`/`height`/`fov` dəyərlərinə bunları əlavə edir.
//   side  — baxış nöqtəsinin döngə tərəfə sürüşməsi (m; müsbət = sağa)
//   back  — əlavə geri məsafə (m)     drop — hündürlükdən çıxılan (m)     fov — əlavə dərəcə
export function camBTweak(car, speedT, lookBack = 1) {
  if (!camB()) return null;
  const st = (car._steerSmooth || 0) * lookBack;
  return {
    side: st * (1.3 + speedT * 1.3),
    // İstifadəçi rəyi (1-ci sınaq): tam sürətdə maşın kameradan çox uzaqlaşırdı
    // (əlavə 0.9 m geri + daha geniş baxış bucağı). İndi məsafə və baxış bucağı
    // köhnə kamera ilə EYNİDİR — fərq yalnız döngəyə baxış və azca alçaq rakursdur.
    back: car.isDrifting ? 0.3 : 0,
    drop: speedT * 0.2,
    fov: car.driftBoostT > 0 ? 3 : 0,
  };
}

export function mountCamTest(uiRoot, input) {
  if (read() === '') return () => {};
  const chip = document.createElement('button');
  chip.className = 'cam-chip';
  const paint = () => {
    chip.textContent = camB() ? 'KAMERA: YENİ ⇄' : 'KAMERA: KÖHNƏ ⇄';
    chip.classList.toggle('is-new', camB());
  };
  const toggle = () => {
    try { localStorage.setItem(KEY, camB() ? '1' : '2'); } catch { /* gizli rejim */ }
    paint();
  };
  chip.onclick = toggle;
  paint();
  uiRoot.appendChild(chip);
  input?.bind('F9', toggle);
  return () => chip.remove();
}
