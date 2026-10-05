import { TUNING } from '../data/balance.js';

// ————— SÜRÜŞ MODELİ SINAĞI (Faza 2) —————
// Köhnə və yeni sürüş modelini YAN-YANA müqayisə etmək üçün müvəqqəti keçid.
// Standart oyunçu heç nə görmür: sınaq yalnız ünvana `?feel=2` yazılanda açılır
// (seçim yadda qalır; `?feel=0` tam söndürür). Açıq olanda ekranda kiçik nişan
// çıxır — toxunmaq və ya F8 basmaq sürüş əsnasında modeli dəyişir.
//
// Model təsdiqlənəndə bu fayl silinəcək və seçilən model standart olacaq.
const KEY = 'apexFeel'; // '' (sınaq bağlı) | '1' (sınaq açıq, köhnə model) | '2' (yeni model)

// Ünvan parametri səhifə açılanda BİR DƏFƏ oxunur — sonra seçim yaddaşdan gəlir
// (yoxsa nişanla edilən keçidi ünvan hər dəfə geri qaytarardı).
try {
  const q = new URLSearchParams(location.search).get('feel');
  if (q === '0') localStorage.removeItem(KEY);
  else if (q === '1' || q === '2') localStorage.setItem(KEY, q);
} catch { /* gizli rejim */ }

function read() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export const feelTestOn = () => read() !== '';
export const currentFeel = () => (read() === '2' ? TUNING.feel2 : null);

// Səhnəyə qoşur: bütün maşınlara cari modeli tətbiq edir, nişanı göstərir.
// `getCars` — səhnədəki maşınların siyahısını qaytaran funksiya.
// Qaytarır: təmizləmə funksiyası (səhnə bağlananda çağırılır).
export function mountFeelTest(uiRoot, getCars, input) {
  const apply = () => { const f = currentFeel(); for (const c of getCars()) c.feel = f; };
  apply();
  if (!feelTestOn()) return () => {};

  const chip = document.createElement('button');
  chip.className = 'feel-chip';
  const paint = () => {
    const yeni = !!currentFeel();
    chip.textContent = yeni ? 'SÜRÜŞ: YENİ ⇄' : 'SÜRÜŞ: KÖHNƏ ⇄';
    chip.classList.toggle('is-new', yeni);
  };
  const toggle = () => {
    try { localStorage.setItem(KEY, currentFeel() ? '1' : '2'); } catch { /* gizli rejim */ }
    apply();
    paint();
  };
  chip.onclick = toggle;
  paint();
  uiRoot.appendChild(chip);
  input?.bind('F8', toggle);
  return () => chip.remove();
}
