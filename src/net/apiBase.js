// API ünvanının tək mənbəyi.
// Qayda: sayt hansı domendədirsə, API də ORADADIR (/api/...). Beləliklə
// oyunu istənilən hostinqə köçürəndə kodda heç nə dəyişmir.
// Dev serveri (vite) API vermir → orada uzaq bazaya düşürük.
const REMOTE = 'https://apex-drift-racing.netlify.app';

export function apiBase(name) {
  if (typeof window !== 'undefined') {
    // Testlər üçün açıq override
    const ov = window.__API_BASE;
    if (ov) return ov.replace(/\/$/, '') + '/api/' + name;
    const host = window.location.hostname;
    const isDev = import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1');
    if (!isDev) return window.location.origin + '/api/' + name;
  }
  return REMOTE + '/api/' + name;
}
