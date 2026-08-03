// Xəta bildirişi: oyunçunun mesajını saxlayır və SAHİBƏ e-poçt göndərir.
//
// E-poçt Resend API ilə gedir (RESEND_API_KEY env dəyişəni). Açar yoxdursa
// bildiriş yalnız anbarda qalır və (Netlify-də) köhnə Netlify Forms yolu
// ehtiyat kimi işləyir — heç bir bildiriş itmir.
//
// Şablon e-poçt üçün yazılıb: cədvəl əsaslı, inline CSS, xarici fayl yoxdur
// (Gmail/Outlook <style> bloklarını və uzaq şəkilləri kəsir).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

import { göndər } from './mailer.mjs';

const MAX_MSG = 1500;
const MAX_SUBJ = 120;
const KEEP = 300;          // anbarda saxlanan son bildiriş sayı
const MIN_GAP_MS = 20000;  // eyni cihazdan ard-arda spam qarşısı

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ————— E-POÇT ŞABLONU —————
const BG = '#0e1016', CARD = '#161a23', LINE = '#252b38';
const TEXT = '#e8ecf3', MUTED = '#8c94a6', ACCENT = '#ff6b1a';

function emailHtml({ subject, message, email, meta, id }) {
  const rows = [
    ['Oyunçu', meta.nick || 'qonaq'],
    ['Cavab ünvanı', email || '— (yazmayıb)'],
    ['Dil', meta.lang],
    ['Cihaz', meta.touch ? 'toxunma (mobil/planşet)' : 'masaüstü'],
    ['Ekran', meta.screen],
    ['Səhifə', meta.url],
    ['Vaxt', meta.time],
    ['Brauzer', meta.ua],
  ].filter(([, v]) => v).map(([k, v]) => `
    <tr>
      <td style="padding:7px 14px 7px 0;color:${MUTED};font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td>
      <td style="padding:7px 0;color:${TEXT};font-size:12px;word-break:break-word">${esc(v)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${CARD};border:1px solid ${LINE};border-radius:14px;overflow:hidden">

      <tr><td style="padding:18px 22px;border-bottom:1px solid ${LINE}">
        <span style="font:700 17px/1 Helvetica,Arial,sans-serif;color:${TEXT};letter-spacing:.5px">Nitro<span style="color:${ACCENT}">Verse</span></span>
        <span style="float:right;font:700 11px/1.6 Helvetica,Arial,sans-serif;color:${ACCENT};background:rgba(255,107,26,.12);border:1px solid rgba(255,107,26,.35);border-radius:20px;padding:4px 10px">🐞 XƏTA BİLDİRİŞİ</span>
      </td></tr>

      <tr><td style="padding:22px 22px 6px">
        <div style="font:700 19px/1.35 Helvetica,Arial,sans-serif;color:${TEXT};margin:0 0 14px">${esc(subject)}</div>
        <div style="background:${BG};border-left:3px solid ${ACCENT};border-radius:0 8px 8px 0;padding:14px 16px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${TEXT};white-space:pre-wrap">${esc(message)}</div>
      </td></tr>

      <tr><td style="padding:18px 22px 4px">
        <div style="font:700 11px/1 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:1.2px;text-transform:uppercase;padding-bottom:6px">Texniki kontekst</div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:Helvetica,Arial,sans-serif">${rows}</table>
      </td></tr>

      ${email ? `<tr><td style="padding:16px 22px 4px">
        <a href="mailto:${esc(email)}?subject=${encodeURIComponent('Re: ' + subject)}"
           style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font:700 13px/1 Helvetica,Arial,sans-serif;padding:12px 20px;border-radius:9px">Oyunçuya cavab yaz</a>
      </td></tr>` : ''}

      <tr><td style="padding:18px 22px 20px">
        <div style="border-top:1px solid ${LINE};padding-top:12px;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:${MUTED}">
          Bildiriş №${esc(id)} · oyunun ana menyusundakı “Xəta bildir” formasından göndərilib.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function emailText({ subject, message, email, meta }) {
  return [
    `NitroVerse — xəta bildirişi`, '',
    subject, '', message, '',
    '— Kontekst —',
    `Oyunçu: ${meta.nick || 'qonaq'}`,
    `Cavab ünvanı: ${email || '—'}`,
    `Dil: ${meta.lang} · Cihaz: ${meta.touch ? 'toxunma' : 'masaüstü'} · Ekran: ${meta.screen}`,
    `Səhifə: ${meta.url}`,
    `Vaxt: ${meta.time}`,
    `Brauzer: ${meta.ua}`,
  ].join('\n');
}

// ————— GÖNDƏRMƏ ————— (ortaq mailer, bax api/mailer.mjs)
async function sendEmail(env, payload) {
  return göndər(env, {
    to: env.REPORT_TO || 'abbasovsamir718@gmail.com',
    subject: `🐞 ${payload.subject}`,
    html: emailHtml(payload),
    text: emailText(payload),
    replyTo: payload.email || null,
  });
}

// Ehtiyat yol: açar yoxdursa köhnə Netlify Forms kanalına ötür (e-poçt sadə
// formatda gəlir, amma bildiriş İTMİR)
async function forwardToNetlifyForm(env, p) {
  const site = env.SITE_URL || 'https://apex-drift-racing.netlify.app';
  try {
    const body = new URLSearchParams({
      'form-name': 'bug-report',
      subject: p.subject,
      message: p.message,
      email: p.email || '',
      context: emailText(p).split('— Kontekst —')[1]?.trim() || '',
    });
    const r = await fetch(site + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return { sent: r.ok, reason: r.ok ? 'netlify-form' : `form-${r.status}` };
  } catch { return { sent: false, reason: 'form-error' }; }
}

export function makeReport(getStore, env = process.env) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);

    let b;
    try { b = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }
    if (b.hp) return json({ ok: true });   // bot tələsi — sükutla udulur

    const message = clean(b.message, MAX_MSG);
    if (message.length < 3) return json({ error: 'short' }, 400);
    const m = b.meta || {};
    const payload = {
      subject: clean(b.subject, MAX_SUBJ) || message.slice(0, 60),
      message,
      email: clean(b.email, 120),
      id: Date.now().toString(36).toUpperCase(),
      meta: {
        nick: clean(m.nick, 20), lang: clean(m.lang, 8), screen: clean(m.screen, 30),
        touch: !!m.touch, url: clean(m.url, 200), ua: clean(m.ua, 220),
        time: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      },
    };

    // Anbar: sadə spam qapısı + son bildirişlərin tarixçəsi
    let store = null;
    try { store = getStore('reports'); } catch { /* anbarsız da işləsin */ }
    if (store) {
      const cid = clean(b.cid, 40) || 'anon';
      try {
        const last = await store.get(`t/${cid}`);
        if (last && Date.now() - Number(last) < MIN_GAP_MS) return json({ error: 'slow-down' }, 429);
        await store.set(`t/${cid}`, String(Date.now()));
        await store.setJSON(`r/${Date.now()}-${payload.id}`, payload);
        // köhnələri təmizlə (açar ts ilə başlayır → sıralama xronolojidir)
        const { blobs } = await store.list({ prefix: 'r/' });
        if (blobs.length > KEEP) {
          const köhnə = blobs.map((b) => b.key).sort().slice(0, blobs.length - KEEP);
          for (const k of köhnə) await store.delete(k);
        }
      } catch { /* anbar xətası bildirişi bloklamamalıdır */ }
    }

    // Resend işləməsə (açar yoxdur / açar səhvdir / xidmət cavab vermir)
    // bildiriş İTMƏMƏLİDİR — köhnə Netlify Forms kanalına düşürük.
    let out = await sendEmail(env, payload);
    if (!out.sent) {
      if (out.detail) console.error('report: resend xətası', out.reason, out.detail);
      const fb = await forwardToNetlifyForm(env, payload);
      out = { sent: fb.sent, reason: `${out.reason}→${fb.reason}` };
    }
    return json({ ok: true, id: payload.id, mail: out.sent, via: out.reason });
  };
}
