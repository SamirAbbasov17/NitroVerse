// CARMAGEDDON — yaddaş. İrəliləyiş NitroVerse HESABINA bağlıdır: hesaba giribsə serverdə saxlanır (başqa cihazda
// davam etmək olur), qonaqdırsa yalnız bu brauzerdə (localStorage).
// Necə işləyir:
//   • oyun həmişə yerli surətdən oxuyur və ona yazır (sürətli, şəbəkəsiz də işləyir);
//   • hesab varsa, hər yazı (az sonra, toplu şəkildə) serverə də göndərilir;
//   • başlıq ekranı açılanda `syncSave()` serverdəki yaddaşı gətirir. Qaydalar:
//       – serverdə yaddaş var → o əsasdır (yerli surət onunla əvəz olunur);
//       – serverdə yoxdur, yerlidə QONAQ kimi oynanmış yaddaş var → hesaba köçürülür;
//       – yerli surət BAŞQA hesabındır → silinir (başqasının irəliləyişi görünməsin);
//       – qonaqdır, yerli surət hansısa hesabındır → silinir (o, serverdə qalır).
// Yerli surətin kimə aid olduğu ayrıca açarda saxlanır ('' = qonaq).
import { auth } from '../../net/Auth.js';

const KEY = 'cgCh1', OWNER = 'cgCh1Owner';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* gizli rejim */ } };
const me = () => (auth.isLoggedIn ? String(auth.profile?.nick || '').toLowerCase() : '');

export const loadSave = () => { try { return JSON.parse(get(KEY) || 'null'); } catch { return null; } };

let pushT = 0, pending = false, lastSent;
function push() {
  clearTimeout(pushT); pending = false;
  if (!auth.isLoggedIn) return Promise.resolve(false);
  const body = get(KEY);
  if (body === lastSent) return Promise.resolve(true);
  return auth._call({ action: 'cgSet', token: auth.token, save: body ? JSON.parse(body) : null }).then(() => { lastSent = body; return true; }, () => false);
}
function schedule() { if (!auth.isLoggedIn) return; pending = true; clearTimeout(pushT); pushT = setTimeout(push, 1200); }

export function storeSave(s) { set(KEY, JSON.stringify(s)); set(OWNER, me()); schedule(); }
export function clearSave() { set(KEY, null); set(OWNER, me()); schedule(); }
// gözləyən yazını dərhal göndər (səhifə bağlananda / başlıq ekranına çıxanda)
export function flushSave() { return pending ? push() : Promise.resolve(true); }

// Başlıq ekranı açılanda: hesabın yaddaşı ilə uzlaşdır. Nəticə: 'guest' | 'server' | 'adopted' | 'empty' | 'offline'
export async function syncSave() {
  const who = me(), owner = get(OWNER) ?? '';
  if (!who) { if (owner) { set(KEY, null); set(OWNER, ''); } return 'guest'; }
  if (owner && owner !== who) { set(KEY, null); set(OWNER, who); }                // başqa hesabın yerli surəti
  let res;
  try { res = await Promise.race([auth._call({ action: 'cgGet', token: auth.token }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]); }
  catch { return 'offline'; }                                                     // şəbəkə yoxdur — yerli surətlə davam
  if (res.save && res.save.stage) { const body = JSON.stringify(res.save); set(KEY, body); set(OWNER, who); lastSent = body; return 'server'; }
  if (get(KEY)) { set(OWNER, who); await push(); return 'adopted'; }             // qonaq irəliləyişi hesaba köçür
  set(OWNER, who); lastSent = null; return 'empty';
}

if (typeof addEventListener === 'function') addEventListener('pagehide', () => { if (pending) push(); });
