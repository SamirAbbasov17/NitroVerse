import { apiBase } from '../net/apiBase.js';

// Tutulmamış JS xətalarını serverə bildirir (bax server/api/report.mjs → kind:'auto').
// Məqsəd: oyunçuda baş verən çöküşlərdən xəbər tutmaq — əvvəl xətalar yalnız
// kimsə əl ilə "Xəta bildir" yazanda üzə çıxırdı.
//
// Qaydalar: eyni xəta sessiyada bir dəfə göndərilir, sessiyada ən çox 5 bildiriş,
// oyunçu haqqında şəxsi məlumat getmir (ləqəb yoxdur) və heç vaxt oyuna mane olmur.
const MAX_PER_SESSION = 5;
// Oyunun buqu olmayan səs-küy: brauzer uzantıları, şəbəkə kəsilməsi, yad mənşə
const NOISE = /ResizeObserver loop|^Script error\.?$|AbortError|Failed to fetch|NetworkError|Load failed|extension:\/\//i;

export function installErrorReporter({ getMode, getCid } = {}) {
  const seen = new Set();
  let sent = 0;

  const report = (message, stack) => {
    try {
      const msg = String(message || '').slice(0, 300);
      if (msg.length < 3 || NOISE.test(msg) || NOISE.test(stack || '')) return;
      const sig = msg + '|' + String(stack || '').split('\n')[1];
      if (seen.has(sig) || sent >= MAX_PER_SESSION) return;
      seen.add(sig);
      sent++;
      const body = {
        kind: 'auto',
        message: msg,
        stack: String(stack || '').slice(0, 1600),
        cid: getCid?.() || '',
        meta: {
          mode: getMode?.() || '',
          build: document.querySelector('script[type="module"][src]')?.src.split('/').pop() || '',
          lang: document.documentElement.lang || '',
          screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
          touch: matchMedia('(pointer:coarse)').matches,
          url: location.origin + location.pathname,
          ua: navigator.userAgent,
        },
      };
      // DEV-də backend yoxdur: göndərilmir, test üçün yığılır
      if (import.meta.env.DEV) { (window.__errReports ||= []).push(body); return; }
      fetch(apiBase('report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => { /* bildiriş alınmasa da oyun davam edir */ });
    } catch { /* bildirişçinin öz xətası oyunu dayandırmamalıdır */ }
  };

  window.addEventListener('error', (e) => {
    report(e.message, e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report(r?.message || String(r), r?.stack || '');
  });
}
