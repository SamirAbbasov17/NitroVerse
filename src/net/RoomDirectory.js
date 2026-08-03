// Aktiv otaqlar reyestri müştərisi — Netlify Function + Blobs (pulsuz).
// Absolut URL: localhost-dan da işləyir (funksiya CORS-a açıqdır).
import { apiBase } from './apiBase.js';

const API = () => apiBase('rooms');

// null = siyahı əlçatan deyil (şəbəkə/API xətası); [] = otaq yoxdur
export async function listRooms() {
  try {
    const r = await fetch(API(), { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    return Array.isArray(j.rooms) ? j.rooms : [];
  } catch {
    return null;
  }
}

// Host otağını elan edir: dərhal + hər 15s heartbeat. stop() silir.
// Tab bağlananda da silinir (pagehide + keepalive) — siyahıda "ölü" otaq qalmasın.
export function announceRoom(net) {
  const send = () => {
    if (!net.code) return;
    fetch(API(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: net.code,
        host: net.players.find((p) => p.isHost)?.name || net.name,
        players: net.players.length,
        track: net.lobbyTrack,
        laps: net.lobbyLaps,
        mode: net.lobbyMode || 'race',
        inGame: net.inGame,
      }),
    }).catch(() => {});
  };
  send();
  const iv = setInterval(send, 15000);
  const removeNow = () => {
    if (!net.code) return;
    try {
      fetch(API(), {
        method: 'POST',
        keepalive: true, // tab bağlanarkən də çatsın
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: net.code, remove: true }),
      }).catch(() => {});
    } catch { /* boş */ }
  };
  window.addEventListener('pagehide', removeNow);
  return {
    update: send,
    stop() {
      clearInterval(iv);
      window.removeEventListener('pagehide', removeNow);
      removeNow();
      // Yolda olan heartbeat silmədən sonra çata bilər — təkrar sil
      setTimeout(removeNow, 1800);
    },
  };
}
