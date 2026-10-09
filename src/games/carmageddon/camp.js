// CARMAGEDDON Fəsil 1 — HEARTH düşərgəsi (səhnə 1): gəzinti, sakinlər, tapşırıqlar.
// Məqsəd: oyunçu sakinlərlə tanış olsun və onlara bağlansın (bax docs/CARMAGEDDON-CHAPTER1.md).
// Dörd tapşırıqdan üçü bəsdir; sonra Elder Amos axşam ocağına çağırır. Mətnlər hələlik Azərbaycancadır.
import { t } from '../../core/i18n.js';
import { World, drawChar } from './world.js';

const SAVE = 'cgCh1';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } };
const store = (s) => { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch { /* gizli rejim */ } };
export const hasCampSave = () => load()?.stage === 'camp';
export const clearSave = () => { try { localStorage.removeItem(SAVE); } catch { /* boş */ } };

const LOOK = {
  ember: { hair: '#e8301a', skin: '#f4c9a0', top: '#7a4a26', legs: '#2a2230', long: true },
  milo: { hair: '#4a2c1a', skin: '#f2c49a', top: '#5f6b2a', legs: '#3a2a22' },
  wren: { hair: '#c9c9cf', skin: '#c98f6a', top: '#7a3a30', legs: '#4a3a34', hat: '#b3261e' },
  gus: { hair: '#8a8a8a', skin: '#e6b08a', top: '#8a3a1c', legs: '#3a3030', hat: '#6a5a44', trim: '#c9a98a' },
  clara: { hair: '#1c1418', skin: '#7a4a32', top: '#5f7a9a', legs: '#3a3440', long: true },
  ray: { hair: '#f2d23a', skin: '#f2c8a0', top: '#e0b020', legs: '#2a2a30' },
  amos: { hair: '#f0f0f0', skin: '#6a422c', top: '#8a5a34', legs: '#4a3626', hat: '#6a4a2c', trim: '#c9a98a' },
  pip: { hair: '#7a4a2a', skin: '#f6d2b0', top: '#f07a1c', legs: '#4a3a34', hat: '#a8602c' },
};

const SOLIDS = [
  { x: 62, y: 60, w: 170, h: 150 }, { cx: 240, cy: 38, r: 14 }, { cx: 242, cy: 148, r: 20 },      // ağsaqqal çadırı, quyular
  { x: 22, y: 186, w: 142, h: 196 },                                                              // bostan
  { cx: 320, cy: 315, r: 22 },                                                                    // ocaq
  ...[0, 30, 60, 120, 150, 180, 210, 240, 300, 330].map((a) => ({ cx: 320 + Math.cos((a * Math.PI) / 180) * 72, cy: 315 + Math.sin((a * Math.PI) / 180) * 62, r: 13 })),   // oturacaq halqası (şimal və cənubdan keçid)
  { x: 408, y: 50, w: 196, h: 160 },                                                              // emalatxana
  { x: 512, y: 288, w: 92, h: 160 },                                                              // radio dirəyi və köşk
  { x: 66, y: 436, w: 180, h: 128 }, { x: 408, y: 436, w: 176, h: 124 },                          // məktəb çadırı, ev
  { x: 258, y: 556, w: 50, h: 30 }, { x: 20, y: 570, w: 50, h: 45 }, { x: 572, y: 445, w: 40, h: 60 }, { x: 545, y: 556, w: 55, h: 28 },
  { cx: 592, cy: 45, r: 20 }, { cx: 55, cy: 35, r: 16 },
];

// qısa yazılış: [kim, hiss, mətn] — kim null = təhkiyə
const L = (who, emo, text) => ({ who, emo, text });

export async function runCamp(ch) {
  const st = (load()?.stage === 'camp' && load()) || { stage: 'camp', q: { seeds: 0, parts: 0, pip: 0, radio: 0 }, got: [], seen: [], x: 475, y: 590 };
  const done = () => ['seeds', 'parts', 'pip', 'radio'].filter((k) => st.q[k] === 9).length;
  const map = ch.art.camp;
  const journal = document.createElement('div'); journal.className = 'cgs__journal'; ch.el.appendChild(journal);
  const hint = document.createElement('div'); hint.className = 'cgs__hint'; hint.textContent = t('cg.moveHint'); ch.el.appendChild(hint);
  setTimeout(() => hint.classList.add('is-out'), 7000);
  let finish; const ended = new Promise((r) => { finish = r; });

  const world = new World(ch.el, ch.cv, { map, size: 640, solids: SOLIDS, spawn: { x: st.x, y: st.y }, hero: LOOK.ember }, {
    onInteract: (en) => { en.use?.(); },
    onTick: (dt, w) => tick(dt, w),
    onDrawUnder: (x, w) => under(x, w),
  });
  ch.world = world;
  const save = () => { st.x = Math.round(world.p.x); st.y = Math.round(world.p.y); store(st); };
  const talk = async (lines) => {
    world.busy = true;
    for (const l of lines) { if (ch.dead) return; await ch.dlg.say(l); }
    ch.dlg.hide(); world.busy = false; world.coolUntil = performance.now() + 260; refresh(); save();
  };
  const once = (key) => { if (st.seen.includes(key)) return false; st.seen.push(key); return true; };

  // ——— jurnal ———
  function refresh() {
    const rows = [];
    const row = (name, txt, ok) => rows.push(`<li class="${ok ? 'is-done' : ''}"><b>${name}</b>${txt}</li>`);
    if (st.q.seeds) row('Granny Wren', st.q.seeds === 9 ? 'Toxumlar tapıldı' : st.q.seeds === 2 ? 'Toxumları Granny Wren-ə apar' : `Toxum kisələri: ${st.got.filter((g) => g[0] === 's').length}/3`, st.q.seeds === 9);
    if (st.q.parts) row('Old Gus', st.q.parts === 9 ? 'Baqqi yığıldı' : st.q.parts === 2 ? 'Hissələri Old Gus-a apar' : `Baqqi hissələri: ${st.got.filter((g) => g[0] === 'p').length}/3`, st.q.parts === 9);
    if (st.q.pip) row('Miss Clara', st.q.pip === 9 ? 'Pip tapıldı' : st.q.pip === 4 ? 'Miss Clara-ya xəbər ver' : `Pip-i tap (${st.q.pip - 1}/3 gizlənmə yeri)`, st.q.pip === 9);
    if (st.q.radio) row('Radio Ray', st.q.radio === 9 ? 'Antena düzəldi' : st.q.radio === 1 ? 'Old Gus-dan mis naqil al' : st.q.radio === 2 ? 'Naqili radio dirəyinə bağla' : 'Radio Ray-ə qayıt', st.q.radio === 9);
    if (done() >= 3) row('Elder Amos', st.amos ? 'Axşam ocağına get' : 'Elder Amos səni axtarır', false);
    journal.innerHTML = rows.length ? `<h4>${t('cg.journal')}</h4><ul>${rows.join('')}</ul>` : '';
    // varlıqların görünməsi vəziyyətə bağlıdır
    for (const en of world.ents) if (en.when) en.hidden = !en.when();
  }

  // ——— sakinlər ———
  const npc = (id, x, y, use, extra = {}) => world.add({ id, x, y, kind: 'npc', look: LOOK[id], use, ...extra });

  npc('wren', 182, 300, async () => {
    if (st.q.seeds === 0) {
      st.q.seeds = 1;
      await talk([
        L('wren', 'neutral', 'A, Ember. Gəl, gəl. Belim bu gün yenə mənimlə danışmır.'),
        L('ember', 'smile', 'Sabahın xeyir, Granny Wren. Nə lazımdır?'),
        L('wren', 'neutral', 'Gecə külək toxum kisələrimi aparıb. Üç dənə. Biri pomidor idi… ya bibər. Ya da ikisi də.'),
        L('wren', 'neutral', 'Mən şəhərləri görmüşəm, qızım. Orada toxum yox idi. Mağaza vardı. Mağaza bitəndə hər şey bitdi.'),
        L('wren', 'neutral', 'Toxum isə bitmir. Birini əkirsən, yüzünü verir. Tap onları, hə?'),
        L('ember', 'neutral', 'Taparam.'),
      ]);
    } else if (st.q.seeds === 1) {
      await talk([L('wren', 'neutral', 'Kisələr kiçikdir, sarı iplə bağlamışam. Külək şimala və bostanın o tayına əsirdi.')]);
    } else if (st.q.seeds === 2) {
      st.q.seeds = 9;
      await talk([
        L('wren', 'neutral', 'Üçü də! Bax, bu pomidordur. Bu da… hə, bibər. Üçüncüsü nədir, özüm də bilmirəm. Əkək, görək.'),
        L('ember', 'side', 'Bilmədiyin şeyi əkirsən?'),
        L('wren', 'neutral', 'Həyatda ən yaxşı şeylər elə çıxıb, qızım. Sən də bir gün gəldin, heç kim bilmirdi nə çıxacaq.'),
        L('wren', 'neutral', 'Qırmızı çıxdın. Bostana yaraşırsan.'),
        L('ember', 'smile', '…Sağ ol, nənə.'),
      ]);
    } else {
      await talk([L('wren', 'neutral', once('wren2') ? 'Milo dünən cücərtiləri sayırdı. On dörd dedi. Düz saymayıb — on altıdır. Ona demə, sevinsin.' : 'Get, get. Cavanların işi çoxdur. Mənim işim gözləməkdir — toxum kimi.')]);
    }
  });

  npc('gus', 450, 228, async () => {
    if (st.q.radio === 1) {
      st.q.radio = 2;
      await talk([
        L('ember', 'neutral', 'Gus, Ray mis naqil istəyir. Antena üçün.'),
        L('gus', 'neutral', 'O oğlan mənim naqilimin yarısını "efirə" verib. Efir də heç nə qaytarmır.'),
        L('gus', 'neutral', 'Al. Sonuncu makaradır. De ki, bunu da itirsə, onu özünü dirəyə bağlayacağam.'),
      ]);
      return;
    }
    if (st.q.parts === 0) {
      st.q.parts = 1;
      await talk([
        L('gus', 'neutral', 'Nəhayət. Yuxun motordan ağırdır, Ember.'),
        L('ember', 'sleepy', 'Milo deyir hissələr gəlib.'),
        L('gus', 'neutral', 'Gəlib. Sonra da gediblər. Dünən axşam qutunu açıq qoymuşam, səhər üçü yox idi.'),
        L('gus', 'neutral', 'Ya toyuqlar aparıb, ya da sənin qardaşın "təkmilləşdirib". İkisi də eyni dərəcədə təhlükəlidir.'),
        L('gus', 'neutral', 'Karbürator, zəncir, bir də dişli çarx. Düşərgədə harasa düşüblər. Tap, baqqini bu gün ayağa qaldıraq.'),
      ]);
    } else if (st.q.parts === 1) {
      await talk([L('gus', 'neutral', 'Üç hissə. Parıldayan nə görsən, götür. Parıldamayanı da götür — bizdə parıldayan şey qalmayıb.')]);
    } else if (st.q.parts === 2) {
      st.q.parts = 9;
      await talk([
        L('gus', 'neutral', 'Hə, budur. Ver bura… Tut bunu. Yox, o biri əlinlə.'),
        L(null, null, 'Old Gus on dəqiqə danışmadan işləyir. Sonra açarı çevirir. Motor öskürür, öskürür — və oxuyur.'),
        L('gus', 'neutral', 'Eşidirsən? Qırx il əvvəl bu səs hər küçədə vardı. Heç kim qulaq asmırdı.'),
        L('gus', 'neutral', 'Mən usta deyildim, bilirsən. Mühasib idim. Rəqəm sayırdım. Dünya bitəndə rəqəmlər də bitdi, əllərim qaldı.'),
        L('ember', 'neutral', 'Yaxşı əllərdir.'),
        L('gus', 'neutral', 'Səninkilər daha yaxşıdır. Sükan səni sevir. Axşam sınaq sürüşü edərik — qardaşını arxa oturacağa yaxın buraxma.'),
      ]);
    } else {
      await talk([L('gus', 'neutral', once('gus2') ? 'Bilirsən niyə pulsuz paylayırıq yanacağı? Çünki satsaq, sayan lazım olacaq. Mən bir də saymaq istəmirəm.' : 'Baqqi hazırdır. Axşama qədər toxunma. Milo da toxunmasın. Xüsusilə Milo.')]);
    }
  });

  npc('milo', 492, 236, async () => {
    const d = done();
    await talk(d === 0 ? [
      L('milo', 'happy', 'Ember! Gus mənə açar tutmağa icazə verdi! Tutmağa! İşlətməyə yox, amma bu da irəliləyişdir.'),
      L('ember', 'smile', 'Karyeran sürətlə gedir.'),
    ] : d < 3 ? [
      L('milo', 'happy', 'Hamıya kömək edirsən? Mən də edirəm! Granny Wren-in çörəyini yeməyə kömək etdim.'),
      L('ember', 'side', 'Qəhrəmansan.'),
      L('milo', 'pout', 'Axşamkı sürprizi unutma. Hələ də baxmaq olmaz.'),
    ] : [
      L('milo', 'happy', 'Elder Amos səni soruşurdu! Deyəsən axşam ocaq başında nəsə deyəcək.'),
      L('milo', 'neutral', 'Ember… bu gün yaxşı gündür, hə?'),
      L('ember', 'smile', 'Yaxşı gündür.'),
    ]);
  });

  npc('clara', 268, 500, async () => {
    if (st.q.pip === 0) {
      st.q.pip = 1;
      await talk([
        L('clara', 'neutral', 'Ember, yaxşı ki gəldin. Səkkiz şagirdim var. Yeddisini sayıram.'),
        L('ember', 'neutral', 'Pip.'),
        L('clara', 'neutral', 'Pip. Dedim "bu gün G hərfini öyrənirik". Dedi "G — gizlənqaç". Və yox oldu.'),
        L('clara', 'neutral', 'Mən dərsi buraxa bilmərəm — buraxsam, qalan yeddisi də hərf tapacaq. Onu tapıb gətirərsən?'),
        L('ember', 'smile', 'G — gətirərəm.'),
      ]);
    } else if (st.q.pip < 4) {
      await talk([L('clara', 'neutral', 'Pip dar yerləri sevir: çəlləklərin arxası, daşın dibi, yeşiklərin arası. Gülüşündən tanıyarsan.')]);
    } else if (st.q.pip === 4) {
      st.q.pip = 9;
      await talk([
        L('clara', 'neutral', 'Üç yerdə? Üç dəfə qaçdı?'),
        L('ember', 'sleepy', 'Dördüncüsünə gücüm çatmazdı.'),
        L('clara', 'neutral', 'Bilirsən, mən bura gələndə oxumağı bilən tək adam idim. İndi doqquz nəfərik. Onuncu G hərfində ilişib.'),
        L('clara', 'neutral', 'Bir gün bu uşaqlar yol nişanlarını oxuyacaq. "Dayan" yazılanı. "Təhlükə" yazılanı. Bizim nəsil oxuya bilmədi.'),
        L('ember', 'neutral', 'Oxuyacaqlar.'),
      ]);
    } else {
      await talk([L('clara', 'neutral', once('clara2') ? 'Milo dərsə gəlmir, amma lövhəmdəki səhvləri gecə gizlicə düzəldir. Guya bilmirəm.' : 'Sakit ol, sinif! …Bağışla, Ember, sən demədim.')]);
    }
  });

  npc('ray', 498, 404, async () => {
    if (st.q.radio === 0) {
      st.q.radio = 1;
      await talk([
        L('ray', 'neutral', 'Ember! Ember-Ember-Ember. Eşidirsən? Yox, eşitmirsən. Mən də eşitmirəm. Problem də budur!'),
        L('ember', 'side', 'Ray. Nəfəs al.'),
        L('ray', 'neutral', 'Antena susub. Dünən gecə şərq karvanı ilə danışırdım, sonra — xışşş. Naqil yanıb.'),
        L('ray', 'neutral', 'Old Gus-da mis naqil var, amma o məni görəndə açarı əlinə alır. Sən istəsən, verər.'),
        L('ray', 'neutral', 'Naqili gətir, dirəyin dibindəki qutuya bağla. Mən yuxarı çıxa bilmərəm, hündürlükdən… efir pozulur.'),
      ]);
    } else if (st.q.radio === 1) {
      await talk([L('ray', 'neutral', 'Old Gus. Mis naqil. O sənə "hə" deyir. Mənə "yox" deyir, sonra da "rədd ol" deyir.')]);
    } else if (st.q.radio === 2) {
      await talk([L('ray', 'neutral', 'Naqil səndədir? Dirəyin dibindəki qutu, cənub tərəf. Bağla, mən qulaqcıqdayam!')]);
    } else if (st.q.radio === 3) {
      st.q.radio = 9;
      await talk([
        L('ray', 'neutral', 'İşləyir! Eşidirəm! Efir qayıtdı!'),
        L('ray', 'neutral', '…Qəribədir. Şərq karvanı cavab vermir. Qərb də. Heç kim.'),
        L('ember', 'neutral', 'Bəlkə yatıblar.'),
        L('ray', 'neutral', 'Hamısı? Eyni vaxtda? Bir də… bir səs var. Danışmır. Sadəcə nəfəs alır. Yeddi dəfə tıqqıltı, sonra sükut.'),
        L('ember', 'side', 'Ray, sən üç gündür yatmırsan.'),
        L('ray', 'neutral', 'Dörd. Hə, yəqin odur. Yəqin… odur. Sağ ol, Ember.'),
      ]);
    } else {
      await talk([L('ray', 'neutral', once('ray2') ? 'Bilirsən niyə radioçuyam? Anam o biri karvanda idi. Hər gecə səsini eşidirdim. Bir gecə eşitmədim. O vaxtdan qulaq asıram.' : 'Yeddi tıqqıltı, sükut. Yeddi tıqqıltı, sükut. Bu kod deyil. Mən bütün kodları bilirəm.')]);
    }
  });

  npc('amos', 150, 228, async () => {
    if (done() >= 3) {
      if (!st.amos) {
        st.amos = true;
        await talk([
          L('amos', 'neutral', 'Ember. Bu gün səni hər yerdə gördüm. Bostanda, emalatxanada, məktəbdə.'),
          L('ember', 'neutral', 'Xırda işlər idi.'),
          L('amos', 'neutral', 'Ev xırda işlərdən tikilir. Yol böyük işlərlə doludur — qaç, tap, sağ qal. Ev isə budur: toxum kisəsi, itmiş uşaq, bir makara naqil.'),
          L('amos', 'neutral', 'Qırx il yol getdik. Mən bu gecə ilk dəfə demək istəyirəm ki, çatdıq.'),
          L('amos', 'neutral', 'Gün batanda ocaq başına gəl. Qardaşını da gətir. Hamı orada olacaq.'),
        ]);
      }
      world.busy = true;
      finish();
      return;
    }
    await talk(once('amos1') ? [
      L('amos', 'neutral', 'Sabahın xeyir, Ember. Quyu bu gün iki barmaq qalxıb.'),
      L('ember', 'neutral', 'Yaxşı xəbərdir.'),
      L('amos', 'neutral', 'Ən yaxşısıdır. Get, camaata bax. Bu gün hamının sənə işi düşüb — bu, pis şey deyil. Deməli, lazımsan.'),
    ] : [L('amos', 'neutral', 'Gün uzundur. Camaata kömək et, sonra mənə baş çək.')]);
  }, { still: true });

  // ——— Pip: üç gizlənmə yeri ———
  const pipSpots = [[320, 580], [562, 66], [594, 522]];
  pipSpots.forEach(([x, y], i) => world.add({
    id: 'pip' + i, x, y, kind: 'spot', r: 4, when: () => st.q.pip === i + 1,
    draw: (c, en, tt) => { const w = Math.round(Math.sin(tt * 9) * 1.5); c.fillStyle = '#12080c'; c.fillRect(en.x - 2 + w, en.y - 14, 5, 5); c.fillStyle = '#f07a1c'; c.fillRect(en.x - 1 + w, en.y - 13, 3, 3); },
    use: async () => {
      st.q.pip = i + 2;
      await talk(i === 0 ? [
        L('pip', 'neutral', 'Hihihi! Tapdın! Amma bu sayılmır, çünki mən hələ gizlənməmişdim!'),
        L('ember', 'side', 'Çəlləyin arxasında oturmuşdun.'),
        L('pip', 'neutral', 'Məşq edirdim! İndi əsl gizlənirəm. Yüzə qədər say! Yox, sən sürətli sayırsan. Minə qədər!'),
      ] : i === 1 ? [
        L('pip', 'neutral', 'Necə?! Bu daşı heç kim bilmir! Bura mənim gizli daşımdır!'),
        L('ember', 'smile', 'Papağın daşdan hündürdür.'),
        L('pip', 'neutral', '…Papaq xəyanət etdi. Sonuncu dəfə! Bu dəfə tapsan, dərsə gedirəm. Söz!'),
      ] : [
        L('pip', 'neutral', 'Oooof. Yaxşı. Uddun.'),
        L('pip', 'neutral', 'Ember, böyüyəndə mən də sənin kimi sürücü olacağam. Maşınım qırmızı olacaq. Saçım da.'),
        L('ember', 'smile', 'Əvvəl G hərfi. Sonra maşın.'),
        L('pip', 'neutral', 'G — gedirəm. Görürsən? Bilirəm!'),
      ]);
    },
  }));

  // ——— götürülən əşyalar ———
  const item = (id, x, y, when, draw, lines) => world.add({
    id, x, y, kind: 'item', r: 2, when: () => when() && !st.got.includes(id), draw,
    use: async () => {
      st.got.push(id);
      if (id[0] === 's' && st.got.filter((g) => g[0] === 's').length === 3) st.q.seeds = 2;
      if (id[0] === 'p' && st.got.filter((g) => g[0] === 'p').length === 3) st.q.parts = 2;
      await talk(lines);
    },
  });
  const seed = (c, en, tt) => { const b = Math.round(Math.sin(tt * 4 + en.x) * 1); c.fillStyle = '#12080c'; c.fillRect(en.x - 4, en.y - 8 + b, 8, 8); c.fillStyle = '#d9b06a'; c.fillRect(en.x - 3, en.y - 7 + b, 6, 6); c.fillStyle = '#ffd166'; c.fillRect(en.x - 3, en.y - 6 + b, 6, 1); if (Math.sin(tt * 6 + en.y) > 0.6) { c.fillStyle = '#fff'; c.fillRect(en.x + 3, en.y - 11 + b, 1, 1); } };
  const part = (c, en, tt) => { const b = Math.round(Math.sin(tt * 4 + en.x) * 1); c.fillStyle = '#12080c'; c.fillRect(en.x - 4, en.y - 8 + b, 9, 8); c.fillStyle = '#9aa3ad'; c.fillRect(en.x - 3, en.y - 7 + b, 7, 6); c.fillStyle = '#5a626c'; c.fillRect(en.x - 1, en.y - 5 + b, 3, 2); if (Math.sin(tt * 6 + en.y) > 0.6) { c.fillStyle = '#fff'; c.fillRect(en.x + 4, en.y - 10 + b, 1, 1); } };
  item('s1', 196, 404, () => st.q.seeds === 1, seed, [L(null, null, 'Sarı iplə bağlanmış kiçik kisə. İçində nəsə xışıldayır.'), L('ember', 'neutral', 'Biri var.')]);
  item('s2', 330, 92, () => st.q.seeds === 1, seed, [L(null, null, 'Kisə quyunun yolunda, qumun içində yarı basdırılıb.'), L('ember', 'side', 'Külək bunu bura qədər aparıb?')]);
  item('s3', 32, 160, () => st.q.seeds === 1, seed, [L(null, null, 'Kisənin üstündə Granny Wren-in əl yazısı: "?"'), L('ember', 'smile', 'O həqiqətən bilmir.')]);
  item('p1', 344, 592, () => st.q.parts === 1, part, [L(null, null, 'Karbürator. Üstündə kiçik, yağlı barmaq izləri var.'), L('ember', 'side', 'Milo.')]);
  item('p2', 616, 240, () => st.q.parts === 1, part, [L(null, null, 'Zəncir. Bir toyuq onu yuva kimi dövrələmişdi.'), L('ember', 'neutral', 'Bağışla. Bu, baqqinindir.')]);
  item('p3', 96, 602, () => st.q.parts === 1, part, [L(null, null, 'Dişli çarx. Bir dişi çatışmır… yox, sayıb yenə saydın. Hamısı yerindədir.'), L('ember', 'neutral', 'Üçüncü.')]);

  // ——— baxıla bilən yerlər ———
  const spot = (id, x, y, lines, when = null) => world.add({ id, x, y, kind: 'spot', r: 6, when, use: () => talk(typeof lines === 'function' ? lines() : lines) });
  spot('mast', 536, 458, () => {
    if (st.q.radio === 2) {
      st.q.radio = 3;
      return [
        L(null, null, 'Naqili qutuya bağlayırsan. Yuxarıda nəsə cızıldayır.'),
        L(null, null, 'Qulaqcıqdan səs gəlir: xışıltı… sonra aydın, yavaş: tıq. tıq. tıq. tıq. tıq. tıq. tıq.'),
        L(null, null, 'Sükut.'),
        L('ember', 'side', '…Yəqin külək idi.'),
      ];
    }
    return [L(null, null, 'Hearth-in radio dirəyi. Ray deyir ki, yaxşı gecədə üç günlük yoldan səs tutur.'), L('ember', 'neutral', st.q.radio >= 3 ? 'İndi də susub.' : 'Dünyanın qalanı hələ oradadır. Haradasa.')];
  });
  spot('well', 244, 174, [L(null, null, 'Quyu. İlk suyu çıxan gün Elder Amos ağladı və bunu hamıdan gizlətməyə çalışdı.'), L('ember', 'smile', 'Hamı gördü.')]);
  spot('garden', 172, 372, [L(null, null, 'Bostan. On dörd cücərti. Ya da on altı.'), L('ember', 'neutral', 'Yol boyu heç vaxt bir yerdə yaşıl görməmişdim.')]);
  spot('fire', 320, 348, [L(null, null, 'Ocaq heç vaxt sönmür. Düşərgənin adı da buradandır.'), L('ember', 'neutral', 'Bu axşam hamı burada olacaq.')]);
  spot('buggy', 428, 216, () => (st.q.parts === 9
    ? [L(null, null, 'Baqqi. Motor hələ ilıqdır.'), L('ember', 'smile', 'Axşam. Səbr et.')]
    : [L(null, null, 'Old Gus-un baqqisi. Motorun yarısı yerdədir.'), L('ember', 'neutral', 'Yığılsa, düşərgədə ən sürətli şey olacaq. Məndən sonra.')]));
  spot('home', 470, 566, [L(null, null, 'Sənin və Milonun çadırı. İçəridən yağ və çörək iyi gəlir.'), L('ember', 'sleepy', 'Yatmaq üçün hələ tezdir. Təəssüf.')]);
  spot('school', 150, 570, [L(null, null, 'Miss Clara-nın məktəbi. Lövhədə: "A — ana. B — baqqi. C — çörək."'), L('ember', 'smile', 'Vacib sözlərdən başlayıb.')]);
  spot('rock', 78, 52, [L(null, null, 'Daşın üstündə cızılıb: "BURADA DAYANDIQ." Altında qırx üç ad var.'), L('ember', 'neutral', 'Mənimki sonuncudan əvvəlkidir. Sonuncu — Milo.')]);
  spot('barrels', 284, 592, [L(null, null, 'Yanacaq çəlləkləri. Qıfıl yoxdur. Kimə lazımdırsa, götürür.'), L('ember', 'side', 'The Syndicate bunu görsə, dəli olar.')]);

  // ——— ətraf: ocağın alovu və gəzən toyuqlar ———
  const hens = [0, 1, 2].map((i) => ({ x: 190 + i * 22, y: 410 + i * 9, tx: 200, ty: 410, w: 0, c: ['#f2ead8', '#c98a4a', '#f2ead8'][i] }));
  const smoke = [];
  function tick(dt) {
    for (const h of hens) {
      h.w -= dt;
      if (h.w <= 0) { h.w = 1.5 + Math.random() * 3; h.tx = 175 + Math.random() * 120; h.ty = 392 + Math.random() * 40; }
      const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy);
      if (d > 1) { h.x += (dx / d) * 14 * dt; h.y += (dy / d) * 14 * dt; h.f = dx < 0; h.m = true; } else h.m = false;
    }
    if (Math.random() < dt * 5) smoke.push({ x: 320 + (Math.random() - 0.5) * 6, y: 304, a: 1 });
    for (const s of smoke) { s.y -= 9 * dt; s.x += Math.sin(s.y * 0.3) * 4 * dt; s.a -= dt * 0.45; }
    while (smoke.length && smoke[0].a <= 0) smoke.shift();
  }
  function under(c, w) {
    // alov (xəritədəki ocağın üstündə canlı piksellər)
    const f = Math.floor(w.t * 9);
    for (let i = 0; i < 9; i++) {
      const hx = 316 + ((i * 7 + f * 3) % 9), hy = 306 + ((i * 5 + f) % 9);
      c.fillStyle = ['#ffd166', '#ff9a2e', '#fff0b0'][(i + f) % 3]; c.fillRect(hx, hy, 2, 2);
    }
    for (const s of smoke) { c.fillStyle = `rgba(90,70,70,${Math.max(0, s.a * 0.5).toFixed(2)})`; c.fillRect(Math.round(s.x), Math.round(s.y), 2, 2); }
    for (const h of hens) {
      const hop = h.m ? Math.round(Math.abs(Math.sin(w.t * 12 + h.x)) * 1) : 0, x = Math.round(h.x), y = Math.round(h.y) - hop;
      c.fillStyle = 'rgba(20,8,10,0.25)'; c.fillRect(x - 5, Math.round(h.y), 10, 2);
      c.fillStyle = '#12080c'; c.fillRect(x - 6, y - 10, 12, 10); c.fillStyle = h.c; c.fillRect(x - 5, y - 9, 10, 7);
      c.fillStyle = '#12080c'; c.fillRect(h.f ? x - 9 : x + 4, y - 14, 5, 6); c.fillStyle = h.c; c.fillRect(h.f ? x - 8 : x + 5, y - 13, 3, 4);
      c.fillStyle = '#e2371c'; c.fillRect(h.f ? x - 8 : x + 6, y - 15, 2, 2); c.fillStyle = '#ffb53a'; c.fillRect(h.f ? x - 10 : x + 8, y - 11, 2, 1);
      c.fillStyle = '#12080c'; c.fillRect(h.f ? x - 7 : x + 6, y - 12, 1, 1); c.fillStyle = '#ffb53a'; c.fillRect(x - 2, y, 1, 2); c.fillRect(x + 1, y, 1, 2);
    }
  }

  refresh();
  if (once('campIntro')) {
    await talk([
      L(null, null, 'Hearth. Qırx üç nəfər, on bir çadır, bir quyu və heç vaxt sönməyən ocaq.'),
      L('ember', 'neutral', 'Old Gus gözləyir. Amma əvvəl bir dövrə vurum — səhər hamının bir dərdi olur.'),
    ]);
  }
  await ended;
  save();
  world.dispose(); journal.remove(); hint.remove();
  ch.world = null;
  st.stage = 'evening'; store(st);
}

export { LOOK, drawChar };
