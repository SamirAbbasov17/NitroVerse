// Ortaq e-poçt göndərici (Resend API — xarici kitabxana yoxdur, adi fetch).
// Həm xəta bildirişləri (report.mjs), həm parol bərpası (auth.mjs) bunu işlədir.
const ACCENT = '#ff6b1a', BG = '#0e1016', CARD = '#161a23', LINE = '#252b38';
const TEXT = '#e8ecf3', MUTED = '#8c94a6';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Oyunun brendi ilə kart şablonu. E-poçt üçün: cədvəl əsaslı, inline CSS,
// xarici fayl yoxdur (Gmail/Outlook <style> və uzaq şəkilləri kəsir).
export function kart({ nişan, başlıq, gövdə, alt }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${CARD};border:1px solid ${LINE};border-radius:14px;overflow:hidden">
      <tr><td style="padding:18px 22px;border-bottom:1px solid ${LINE}">
        <span style="font:700 17px/1 Helvetica,Arial,sans-serif;color:${TEXT};letter-spacing:.5px">Nitro<span style="color:${ACCENT}">Verse</span></span>
        <span style="float:right;font:700 11px/1.6 Helvetica,Arial,sans-serif;color:${ACCENT};background:rgba(255,107,26,.12);border:1px solid rgba(255,107,26,.35);border-radius:20px;padding:4px 10px">${nişan}</span>
      </td></tr>
      <tr><td style="padding:22px 22px 6px">
        <div style="font:700 19px/1.35 Helvetica,Arial,sans-serif;color:${TEXT};margin:0 0 14px">${başlıq}</div>
        ${gövdə}
      </td></tr>
      <tr><td style="padding:18px 22px 20px">
        <div style="border-top:1px solid ${LINE};padding-top:12px;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:${MUTED}">${alt}</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export const blok = (mətn) => `<div style="background:${BG};border-left:3px solid ${ACCENT};border-radius:0 8px 8px 0;padding:14px 16px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${TEXT};white-space:pre-wrap">${esc(mətn)}</div>`;

export const kodBloku = (kod) => `<div style="background:${BG};border:1px dashed ${ACCENT};border-radius:10px;padding:18px;text-align:center;font:700 30px/1 Helvetica,Arial,sans-serif;color:${TEXT};letter-spacing:9px">${esc(kod)}</div>`;

export const sətir = (k, v) => `<tr>
  <td style="padding:7px 14px 7px 0;color:${MUTED};font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td>
  <td style="padding:7px 0;color:${TEXT};font-size:12px;word-break:break-word">${esc(v)}</td></tr>`;

export const cədvəl = (sətirlər) => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:Helvetica,Arial,sans-serif">${sətirlər}</table>`;

// Qaytarır: { sent, reason }. Açar yoxdursa göndərmir (çağıran ehtiyat yola düşür).
export async function göndər(env, { to, subject, html, text, replyTo }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no-key' };
  const from = env.REPORT_FROM || 'NitroVerse <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject, html, text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { sent: false, reason: `resend-${res.status}`, detail: detail.slice(0, 200) };
    }
    return { sent: true, reason: 'resend' };
  } catch (e) {
    return { sent: false, reason: 'fetch-error', detail: String(e).slice(0, 120) };
  }
}
