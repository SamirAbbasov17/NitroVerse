
// Aktiv otaqlar reyestri — host hər 25s-də heartbeat göndərir,
// 40s-dən köhnə otaqlar siyahıdan avtomatik silinir (heartbeat 15s).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const FRESH_MS = 40000;

export function makeRooms(getStore) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const now = Date.now();
    try {
      // strong consistency: yazılan otaq dərhal siyahıda görünsün
      const store = getStore('rooms');

      if (req.method === 'POST') {
        const b = await req.json();
        const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        if (code.length !== 4) {
          return Response.json({ error: 'bad code' }, { status: 400, headers: CORS });
        }
        if (b.remove) {
          await store.delete(code);
          return Response.json({ ok: true }, { headers: CORS });
        }
        await store.setJSON(code, {
          code,
          host: String(b.host || 'Oyunçu').slice(0, 14),
          players: Math.min(6, Math.max(1, b.players | 0)),
          track: String(b.track || 'desert').slice(0, 12),
          laps: [1, 3, 5].includes(b.laps) ? b.laps : 3,
          mode: ['race', 'football', 'arena'].includes(b.mode) ? b.mode : 'race',
          inGame: !!b.inGame,
          t: now,
        });
        return Response.json({ ok: true }, { headers: CORS });
      }

      // GET — təzə otaqların siyahısı
      const { blobs } = await store.list();
      const rooms = [];
      for (const bl of blobs) {
        const r = await store.get(bl.key, { type: 'json' }).catch(() => null);
        if (r && now - r.t < FRESH_MS) rooms.push(r);
        else store.delete(bl.key).catch(() => {});
      }
      rooms.sort((a, b2) => b2.t - a.t);
      return Response.json({ rooms: rooms.slice(0, 20) }, { headers: CORS });
    } catch (e) {
      return Response.json({ rooms: [], error: 'store' }, { headers: CORS });
    }
  };
}
