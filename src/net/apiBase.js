// API ünvanının tək mənbəyi.
// Qayda: sayt BİZİM domenlərdədirsə API da ORADADIR (/api/...). Yad mənşədə
// (itch.io embed və s.) rəsmi serverə düşürük — bütün endpoint-lərdə CORS açıqdır.
// Dev serveri (vite) API vermir → orada da uzaq bazaya düşürük.
const REMOTE = 'https://nitroverse.az';
const ÖZ_HOSTLAR = ['nitroverse.az', 'www.nitroverse.az', '167.235.51.78'];

// Statik resurslar (musiqi) üçün baza: yad mənşədə (itch.io embed) fayllar
// paketə salınmır — rəsmi serverdən axıdılır (Audio elementi CORS istəmir)
export function assetBase() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const öz = ÖZ_HOSTLAR.includes(host) || host.endsWith('.netlify.app')
      || host === 'localhost' || host === '127.0.0.1';
    if (!öz) return REMOTE + '/';
  }
  return '';
}

export function apiBase(name) {
  if (typeof window !== 'undefined') {
    // Testlər üçün açıq override
    const ov = window.__API_BASE;
    if (ov) return ov.replace(/\/$/, '') + '/api/' + name;
    const host = window.location.hostname;
    const isDev = import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1');
    if (!isDev) {
      const öz = ÖZ_HOSTLAR.includes(host) || host.endsWith('.netlify.app');
      return (öz ? window.location.origin : REMOTE) + '/api/' + name;
    }
  }
  return REMOTE + '/api/' + name;
}
