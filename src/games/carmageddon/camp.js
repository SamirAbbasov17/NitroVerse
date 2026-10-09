// CARMAGEDDON Fəsil 1 — HEARTH düşərgəsi (səhnə 1): gəzinti, sakinlər, tapşırıqlar.
// Məqsəd: oyunçu sakinlərlə tanış olsun və onlara bağlansın (bax docs/CARMAGEDDON-CHAPTER1.md).
// Dörd tapşırıqdan üçü bəsdir; sonra Elder Amos axşam ocağına çağırır. Mətnlər hələlik Azərbaycancadır.
import { t } from '../../core/i18n.js';
import { World } from './world.js';
import { T } from './tx.js';

const SAVE = 'cgCh1';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } };
const store = (s) => { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch { /* gizli rejim */ } };
export const savedStage = () => { const st = load()?.stage; return ['camp', 'evening', 'night', 'found', 'chase'].includes(st) ? st : null; };
export const setStage = (stage, extra = {}) => store({ ...(load() || {}), stage, ...extra });
export const savedSec = () => load()?.sec | 0;
export const clearSave = () => { try { localStorage.removeItem(SAVE); } catch { /* boş */ } };

const LOOK = {
  ember: { hair: '#e8301a', skin: '#f4c9a0', top: '#7a4a26', legs: '#2a2230', long: true, feat: ['goggles', 'scarf', 'jacket'] },
  milo: { hair: '#4a2c1a', skin: '#f2c49a', top: '#5f6b2a', legs: '#3a2a22', feat: ['freckles', 'jacket'], blink: 1, kid: true },
  wren: { hair: '#c9c9cf', skin: '#c98f6a', top: '#7a3a30', legs: '#4a3a34', hat: '#b3261e', trim: '#5a2a24', feat: ['headscarf'], blink: 2 },
  gus: { hair: '#8a8a8a', skin: '#e6b08a', bald: true, top: '#b8a48a', legs: '#3a3030', hat: '#6a5a44', trim: '#8a3a1c', feat: ['cap', 'moustache', 'apron'], blink: 0.5 },
  clara: { hair: '#1c1418', skin: '#7a4a32', top: '#8aa0b8', legs: '#3a3440', scarf: '#3a4a7a', feat: ['afro', 'glasses', 'scarf'], blink: 1.6 },
  ray: { hair: '#f2d23a', skin: '#f2c8a0', top: '#e0b020', legs: '#2a2a30', feat: ['mohawk', 'headphones', 'jacket'], blink: 2.4 },
  amos: { hair: '#f0f0f0', skin: '#6a422c', top: '#8a5a34', legs: '#4a3626', hat: '#6a4a2c', trim: '#c9a98a', feat: ['widehat', 'beard', 'poncho'], blink: 0.9 },
  pip: { hair: '#7a4a2a', skin: '#f6d2b0', top: '#f07a1c', legs: '#4a3a34', hat: '#a8602c', feat: ['knit', 'freckles'], blink: 1.3, kid: true },
};

// Maneələr xəritədəki obyektlərin GÖRÜNƏN konturu ilə çəkilib (izometrik çadır romb şəklindədir — düzbucaqlı
// ya boş quma dirənirdi, ya da çadırın içinə buraxırdı). Önbaxış: scratchpad tools/solids.py; test: carmageddon-camp.
export const SOLIDS = [
  { poly: [[60, 125], [142, 42], [235, 112], [220, 170], [165, 220], [55, 165]] },                                              // ağsaqqal çadırı
  { poly: [[22, 172], [165, 255], [165, 345], [95, 395], [20, 325]] },                                                          // bostan
  { poly: [[390, 125], [415, 55], [522, 58], [585, 115], [625, 215], [585, 238], [515, 202], [500, 176], [470, 180], [435, 182], [395, 165]] },   // emalatxana
  { poly: [[538, 280], [570, 292], [602, 325], [600, 350], [575, 362], [582, 415], [550, 442], [515, 418], [540, 320]] },      // radio dirəyi və köşk
  { poly: [[59, 492], [80, 475], [175, 405], [246, 456], [246, 515], [265, 522], [262, 552], [235, 555], [200, 540], [192, 600], [155, 602], [150, 575], [108, 570], [100, 550], [60, 545]] },   // məktəb çadırı
  { poly: [[408, 465], [485, 400], [570, 462], [575, 445], [605, 448], [614, 500], [582, 505], [580, 522], [520, 560], [522, 588], [492, 590], [488, 568], [450, 558], [402, 538], [390, 510]] }, // ev
  { cx: 245, cy: 145, r: 14 }, { cx: 238, cy: 42, r: 12 }, { cx: 197, cy: 33, r: 7 }, { cx: 60, cy: 38, r: 12 }, { cx: 598, cy: 48, r: 16 },          // quyular, çəllək, daşlar
  { cx: 320, cy: 315, r: 18 },                                                                                                                         // ocaq
  ...[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => ({ cx: 320 + Math.cos((a * Math.PI) / 180) * 78, cy: 318 + Math.sin((a * Math.PI) / 180) * 54, r: 12 })),   // oturacaq halqası (qapalı)
  { cx: 272, cy: 575, r: 10 }, { cx: 298, cy: 578, r: 9 }, { cx: 38, cy: 592, r: 16 }, { cx: 555, cy: 582, r: 8 }, { cx: 580, cy: 565, r: 8 }, { cx: 592, cy: 553, r: 6 },
  { cx: 604, cy: 545, r: 10 }, { cx: 535, cy: 600, r: 5 }, { cx: 32, cy: 438, r: 8 },
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
    for (const l of lines) { if (ch.dead) return; world.speaker = l.who; await ch.dlg.say({ ...l, text: T(l.text) }); }
    world.speaker = null;
    ch.dlg.hide(); world.busy = false; world.coolUntil = performance.now() + 260; refresh(); save();
  };
  const once = (key) => { if (st.seen.includes(key)) return false; st.seen.push(key); return true; };

  // ——— jurnal ———
  function refresh() {
    const rows = [];
    const row = (name, txt, ok) => rows.push(`<li class="${ok ? 'is-done' : ''}"><b>${name}</b>${txt}</li>`);
    if (st.q.seeds) row('Granny Wren', st.q.seeds === 9 ? T('Toxumlar tapıldı') : st.q.seeds === 2 ? T('Toxumları Granny Wren-ə apar') : T('Toxum kisələri: {n}/3', { n: st.got.filter((g) => g[0] === 's').length }), st.q.seeds === 9);
    if (st.q.parts) row('Old Gus', st.q.parts === 9 ? T('Baqqi yığıldı') : st.q.parts === 2 ? T('Hissələri Old Gus-a apar') : T('Baqqi hissələri: {n}/3', { n: st.got.filter((g) => g[0] === 'p').length }), st.q.parts === 9);
    if (st.q.pip) row('Miss Clara', st.q.pip === 9 ? T('Pip tapıldı') : st.q.pip === 4 ? T('Miss Clara-ya xəbər ver') : T('Pip-i tap ({n}/3 gizlənmə yeri)', { n: st.q.pip - 1 }), st.q.pip === 9);
    if (st.q.radio) row('Radio Ray', st.q.radio === 9 ? T('Antena düzəldi') : st.q.radio === 1 ? T('Old Gus-dan mis naqil al') : st.q.radio === 2 ? T('Naqili radio dirəyinə bağla') : T('Radio Ray-ə qayıt'), st.q.radio === 9);
    if (done() >= 3) row('Elder Amos', st.amos ? T('Axşam ocağına get') : T('Elder Amos səni axtarır'), false);
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
        L('wren', 'sweat', 'Gecə külək toxum kisələrimi aparıb. Üç dənə. Biri pomidor idi… ya bibər. Ya da ikisi də.'),
        L('wren', 'sad', 'Mən şəhərləri görmüşəm, qızım. Orada toxum yox idi. Mağaza vardı. Mağaza bitəndə hər şey bitdi.'),
        L('wren', 'proud', 'Toxum isə bitmir. Birini əkirsən, yüzünü verir. Tap onları, hə?'),
        L('ember', 'neutral', 'Taparam.'),
      ]);
    } else if (st.q.seeds === 1) {
      await talk([L('wren', 'neutral', 'Kisələr kiçikdir, sarı iplə bağlamışam. Külək şimala və bostanın o tayına əsirdi.')]);
    } else if (st.q.seeds === 2) {
      st.q.seeds = 9;
      await talk([
        L('wren', 'happy', 'Üçü də! Bax, bu pomidordur. Bu da… hə, bibər. Üçüncüsü nədir, özüm də bilmirəm. Əkək, görək.'),
        L('ember', 'confused', 'Bilmədiyin şeyi əkirsən?'),
        L('wren', 'smile', 'Həyatda ən yaxşı şeylər elə çıxıb, qızım. Sən də bir gün gəldin, heç kim bilmirdi nə çıxacaq.'),
        L('wren', 'love', 'Qırmızı çıxdın. Bostana yaraşırsan.'),
        L('ember', 'love', '…Sağ ol, nənə.'),
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
        L('gus', 'angry', 'O oğlan mənim naqilimin yarısını "efirə" verib. Efir də heç nə qaytarmır.'),
        L('gus', 'pout', 'Al. Sonuncu makaradır. De ki, bunu da itirsə, onu özünü dirəyə bağlayacağam.'),
      ]);
      return;
    }
    if (st.q.parts === 0) {
      st.q.parts = 1;
      await talk([
        L('gus', 'pout', 'Nəhayət. Yuxun motordan ağırdır, Ember.'),
        L('ember', 'sleepy', 'Milo deyir hissələr gəlib.'),
        L('gus', 'sweat', 'Gəlib. Sonra da gediblər. Dünən axşam qutunu açıq qoymuşam, səhər üçü yox idi.'),
        L('gus', 'angry', 'Ya toyuqlar aparıb, ya da sənin qardaşın "təkmilləşdirib". İkisi də eyni dərəcədə təhlükəlidir.'),
        L('gus', 'neutral', 'Karbürator, zəncir, bir də dişli çarx. Düşərgədə harasa düşüblər. Tap, baqqini bu gün ayağa qaldıraq.'),
      ]);
    } else if (st.q.parts === 1) {
      await talk([L('gus', 'neutral', 'Üç hissə. Parıldayan nə görsən, götür. Parıldamayanı da götür — bizdə parıldayan şey qalmayıb.')]);
    } else if (st.q.parts === 2) {
      st.q.parts = 9;
      await talk([
        L('gus', 'think', 'Hə, budur. Ver bura… Tut bunu. Yox, o biri əlinlə.'),
        L(null, null, 'Old Gus susur. Əlləri nə edəcəyini özü bilir: bir vint, bir zəncir, bir ovuc yağ. Sonra açarı çevirir — motor bir öskürür, bir də öskürür və birdən, nəfəsi açılıbmış kimi, oxumağa başlayır.'),
        L('gus', 'proud', 'Eşidirsən? Qırx il əvvəl bu səs hər küçədə vardı. Heç kim qulaq asmırdı.'),
        L('gus', 'sad', 'Mən usta deyildim, bilirsən. Mühasib idim. Rəqəm sayırdım. Dünya bitəndə rəqəmlər də bitdi, əllərim qaldı.'),
        L('ember', 'neutral', 'Yaxşı əllərdir.'),
        L('gus', 'smile', 'Səninkilər daha yaxşıdır. Sükan səni sevir. Axşam sınaq sürüşü edərik — qardaşını arxa oturacağa yaxın buraxma.'),
      ]);
    } else {
      await talk([L('gus', 'neutral', once('gus2') ? 'Bilirsən niyə pulsuz paylayırıq yanacağı? Çünki satsaq, sayan lazım olacaq. Mən bir də saymaq istəmirəm.' : 'Baqqi hazırdır. Axşama qədər toxunma. Milo da toxunmasın. Xüsusilə Milo.')]);
    }
  });

  npc('milo', 492, 236, async () => {
    const d = done();
    await talk(d === 0 ? [
      L('milo', 'laugh', 'Ember! Gus mənə açar tutmağa icazə verdi! Tutmağa! İşlətməyə yox, amma bu da irəliləyişdir.'),
      L('ember', 'laugh', 'Karyeran sürətlə gedir.'),
    ] : d < 3 ? [
      L('milo', 'happy', 'Hamıya kömək edirsən? Mən də edirəm! Granny Wren-in çörəyini yeməyə kömək etdim.'),
      L('ember', 'smile', 'Qəhrəmansan.'),
      L('milo', 'pout', 'Axşamkı sürprizi unutma. Hələ də baxmaq olmaz.'),
    ] : [
      L('milo', 'shock', 'Elder Amos səni soruşurdu! Deyəsən axşam ocaq başında nəsə deyəcək.'),
      L('milo', 'think', 'Ember… bu gün yaxşı gündür, hə?'),
      L('ember', 'smile', 'Yaxşı gündür.'),
    ]);
  }, { wander: 12, speed: 24 });

  npc('clara', 268, 500, async () => {
    if (st.q.pip === 0) {
      st.q.pip = 1;
      await talk([
        L('clara', 'sweat', 'Ember, yaxşı ki gəldin. Səkkiz şagirdim var. Yeddisini sayıram.'),
        L('ember', 'neutral', 'Pip.'),
        L('clara', 'pout', 'Pip. Dedim "bu gün G hərfini öyrənirik". Dedi "G — gizlənqaç". Və yox oldu.'),
        L('clara', 'sweat', 'Mən dərsi buraxa bilmərəm — buraxsam, qalan yeddisi də hərf tapacaq. Onu tapıb gətirərsən?'),
        L('ember', 'proud', 'G — gətirərəm.'),
      ]);
    } else if (st.q.pip < 4) {
      await talk([L('clara', 'neutral', 'Pip dar yerləri sevir: çəlləklərin arxası, daşın dibi, yeşiklərin arası. Gülüşündən tanıyarsan.')]);
    } else if (st.q.pip === 4) {
      st.q.pip = 9;
      await talk([
        L('clara', 'shock', 'Üç yerdə? Üç dəfə qaçdı?'),
        L('ember', 'sleepy', 'Dördüncüsünə gücüm çatmazdı.'),
        L('clara', 'proud', 'Bilirsən, mən bura gələndə oxumağı bilən tək adam idim. İndi doqquz nəfərik. Onuncu G hərfində ilişib.'),
        L('clara', 'sad', 'Bir gün bu uşaqlar yol nişanlarını oxuyacaq. "Dayan" yazılanı. "Təhlükə" yazılanı. Bizim nəsil oxuya bilmədi.'),
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
        L('ray', 'shock', 'Ember! Ember-Ember-Ember. Eşidirsən? Yox, eşitmirsən. Mən də eşitmirəm. Problem də budur!'),
        L('ember', 'sweat', 'Ray. Nəfəs al.'),
        L('ray', 'fear', 'Antena susub. Dünən gecə şərq karvanı ilə danışırdım, sonra — xışşş. Naqil yanıb.'),
        L('ray', 'sweat', 'Old Gus-da mis naqil var, amma o məni görəndə açarı əlinə alır. Sən istəsən, verər.'),
        L('ray', 'think', 'Naqili gətir, dirəyin dibindəki qutuya bağla. Mən yuxarı çıxa bilmərəm, hündürlükdən… efir pozulur.'),
      ]);
    } else if (st.q.radio === 1) {
      await talk([L('ray', 'neutral', 'Old Gus. Mis naqil. O sənə "hə" deyir. Mənə "yox" deyir, sonra da "rədd ol" deyir.')]);
    } else if (st.q.radio === 2) {
      await talk([L('ray', 'neutral', 'Naqil səndədir? Dirəyin dibindəki qutu, cənub tərəf. Bağla, mən qulaqcıqdayam!')]);
    } else if (st.q.radio === 3) {
      st.q.radio = 9;
      await talk([
        L('ray', 'laugh', 'İşləyir! Eşidirəm! Efir qayıtdı!'),
        L('ray', 'confused', '…Qəribədir. Şərq karvanı cavab vermir. Qərb də. Heç kim.'),
        L('ember', 'neutral', 'Bəlkə yatıblar.'),
        L('ray', 'fear', 'Hamısı? Eyni vaxtda? Bir də… bir səs var. Danışmır. Sadəcə nəfəs alır. Yeddi dəfə tıqqıltı, sonra sükut.'),
        L('ember', 'sweat', 'Ray, sən üç gündür yatmırsan.'),
        L('ray', 'sweat', 'Dörd. Hə, yəqin odur. Yəqin… odur. Sağ ol, Ember.'),
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
          L('amos', 'smile', 'Ember. Bu gün səni hər yerdə gördüm. Bostanda, emalatxanada, məktəbdə.'),
          L('ember', 'neutral', 'Xırda işlər idi.'),
          L('amos', 'proud', 'Ev xırda işlərdən tikilir. Yol böyük işlərlə doludur — qaç, tap, sağ qal. Ev isə budur: toxum kisəsi, itmiş uşaq, bir makara naqil.'),
          L('amos', 'sad', 'Qırx il yol getdik. Mən bu gecə ilk dəfə demək istəyirəm ki, çatdıq.'),
          L('amos', 'smile', 'Gün batanda ocaq başına gəl. Qardaşını da gətir. Hamı orada olacaq.'),
        ]);
      }
      world.busy = true;
      finish();
      return;
    }
    await talk(once('amos1') ? [
      L('amos', 'happy', 'Sabahın xeyir, Ember. Quyu bu gün iki barmaq qalxıb.'),
      L('ember', 'neutral', 'Yaxşı xəbərdir.'),
      L('amos', 'smile', 'Ən yaxşısıdır. Get, camaata bax. Bu gün hamının sənə işi düşüb — bu, pis şey deyil. Deməli, lazımsan.'),
    ] : [L('amos', 'neutral', 'Gün uzundur. Camaata kömək et, sonra mənə baş çək.')]);
  }, { still: true });

  // tapılandan sonra Pip məktəbin yanında hoppanır
  npc('pip', 296, 524, () => talk([
    L('pip', st.q.pip === 9 ? 'proud' : 'pout', st.q.pip === 9 ? 'G — günəş. G — gül. G — Gus! Görürsən, hamısını bilirəm.' : 'Miss Clara-ya de ki, mən özüm gəldim. Tapılmadım. Gəldim.'),
    L('ember', 'smile', st.q.pip === 9 ? 'Sabah H hərfidir. Hazırlaş.' : 'Əlbəttə. Özün gəldin.'),
  ]), { wander: 16, speed: 30, when: () => st.q.pip >= 4 });
  // adsız sakinlər — düşərgə boş görünməsin
  world.add({ id: 'carrier', x: 276, y: 150, kind: 'npc', wander: 18, speed: 14, look: { hair: '#3a2a22', skin: '#d9a070', top: '#4a6a6a', legs: '#3a3430', scarf: '#c9a98a', long: true, feat: ['scarf'], blink: 2.1 }, use: () => talk([
    L(null, null, 'Su daşıyan qadın vedrəni yerə qoyub belini düzəldir.'),
    L(null, null, '"Yolda olanda suyu sayırdıq. Damla-damla. İndi uşaqlar onunla bir-birini isladır." Gülür. "Qoy islatsınlar."'),
  ]) });
  world.add({ id: 'lookout', x: 356, y: 40, kind: 'npc', dir: 1, look: { hair: '#2a2024', skin: '#c08a5a', top: '#6a4a3a', legs: '#2a2a2a', hat: '#4a3a2a', feat: ['cap', 'jacket'], blink: 0.3 }, use: () => talk([
    L(null, null, 'Gözətçi şimala, boş üfüqə baxır. Əlində durbin var, bir şüşəsi çatlayıb.'),
    L(null, null, '"Üç gündür yolda toz görmürəm. Nə karvan, nə alverçi." Çiyinlərini çəkir. "Sakitlik yaxşıdır. Yəqin."'),
    L('ember', 'think', 'Üç gün…'),
  ]) });
  world.add({ id: 'kid1', x: 118, y: 582, kind: 'npc', wander: 12, speed: 16, look: { hair: '#1c1418', skin: '#8a5a3a', top: '#b04a6a', legs: '#3a3440', blink: 0.7, kid: true, long: true }, use: () => talk([
    L(null, null, 'Balaca qız çubuqla qumda hərf cızır: Ə. Sonra bir də: Ə. Sonra üstündən xətt çəkir.'),
    L(null, null, '"Bu hərf yumurtaya oxşayır. Toyuqlar görsə, üstündə oturar."'),
  ]) });
  world.add({ id: 'kid2', x: 146, y: 600, kind: 'npc', wander: 14, speed: 26, look: { hair: '#c9a04a', skin: '#f2c8a0', top: '#4a8a5a', legs: '#3a2a22', feat: ['freckles'], blink: 1.9, kid: true }, use: () => talk([
    L(null, null, '"Sən Ember-sən! Milo deyir sən gözübağlı sürə bilirsən!"'),
    L('ember', 'sweat', 'Milo çox şey deyir.'),
    L(null, null, '"Bir də deyir ki, sən heç nədən qorxmursan." Uşaq sənə elə baxır ki, cavab verə bilmirsən.'),
  ]) });

  // ——— Pip: üç gizlənmə yeri ———
  const pipSpots = [[320, 580], [562, 66], [594, 522]];
  pipSpots.forEach(([x, y], i) => world.add({
    id: 'pip' + i, x, y, kind: 'spot', r: 4, when: () => st.q.pip === i + 1,
    draw: (c, en, tt) => { const w = Math.round(Math.sin(tt * 9) * 1.5); c.fillStyle = '#12080c'; c.fillRect(en.x - 2 + w, en.y - 14, 5, 5); c.fillStyle = '#f07a1c'; c.fillRect(en.x - 1 + w, en.y - 13, 3, 3); },
    use: async () => {
      st.q.pip = i + 2;
      await talk(i === 0 ? [
        L('pip', 'laugh', 'Hihihi! Tapdın! Amma bu sayılmır, çünki mən hələ gizlənməmişdim!'),
        L('ember', 'side', 'Çəlləyin arxasında oturmuşdun.'),
        L('pip', 'pout', 'Məşq edirdim! İndi əsl gizlənirəm. Yüzə qədər say! Yox, sən sürətli sayırsan. Minə qədər!'),
      ] : i === 1 ? [
        L('pip', 'shock', 'Necə?! Bu daşı heç kim bilmir! Bura mənim gizli daşımdır!'),
        L('ember', 'laugh', 'Papağın daşdan hündürdür.'),
        L('pip', 'angry', '…Papaq xəyanət etdi. Sonuncu dəfə! Bu dəfə tapsan, dərsə gedirəm. Söz!'),
      ] : [
        L('pip', 'sad', 'Oooof. Yaxşı. Uddun.'),
        L('pip', 'love', 'Ember, böyüyəndə mən də sənin kimi sürücü olacağam. Maşınım qırmızı olacaq. Saçım da.'),
        L('ember', 'smile', 'Əvvəl G hərfi. Sonra maşın.'),
        L('pip', 'laugh', 'G — gedirəm. Görürsən? Bilirəm!'),
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
  item('s1', 196, 404, () => st.q.seeds === 1, seed, [L(null, null, 'Qumun üstündə sarı iplə bağlanmış balaca bir kisə. Silkələyəndə içində quru yağış kimi nəsə xışıldayır.'), L('ember', 'neutral', 'Biri var.')]);
  item('s2', 330, 92, () => st.q.seeds === 1, seed, [L(null, null, 'İkinci kisə quyuya gedən cığırda, quma yarıyacan batıb. Bir az da gec gəlsəydin, onu birinci yağış özü əkərdi.'), L('ember', 'side', 'Külək bunu bura qədər aparıb?')]);
  item('s3', 32, 160, () => st.q.seeds === 1, seed, [L(null, null, 'Kisənin üstündə Granny Wren-in əl yazısı: "?"'), L('ember', 'smile', 'O həqiqətən bilmir.')]);
  item('p1', 344, 592, () => st.q.parts === 1, part, [L(null, null, 'Karbürator. Üstündə balaca, yağlı barmaq izləri qalıb — günahkarın boyu barədə şübhə yeri qoymur.'), L('ember', 'pout', 'Milo.')]);
  item('p2', 616, 240, () => st.q.parts === 1, part, [L(null, null, 'Zəncir. Bir toyuq onu səliqə ilə dövrələyib üstündə oturmuşdu — görünür, yuva üçün ağlına daha yaxşı şey gəlməyib.'), L('ember', 'neutral', 'Bağışla. Bu, baqqinindir.')]);
  item('p3', 96, 602, () => st.q.parts === 1, part, [L(null, null, 'Dişli çarx. Bir anlıq sənə elə gəlir ki, bir dişi çatışmır. Sayırsan, bir də sayırsan — hamısı yerindədir.'), L('ember', 'neutral', 'Üçüncü.')]);

  // ——— baxıla bilən yerlər ———
  const spot = (id, x, y, lines, when = null) => world.add({ id, x, y, kind: 'spot', r: 6, when, use: () => talk(typeof lines === 'function' ? lines() : lines) });
  spot('mast', 536, 458, () => {
    if (st.q.radio === 2) {
      st.q.radio = 3;
      return [
        L(null, null, 'Naqili sıxıb bağlayırsan. Dirək boyu yuxarı bir cızıltı qaçır və qulaqcıq dirilir.'),
        L(null, null, 'Əvvəl yalnız xışıltı gəlir — uzaq bir dənizin səsinə oxşayır. Sonra onun içindən yavaş, səbirli bir tıqqıltı seçilir. Bir. İki. Üç… Düz yeddi dəfə.'),
        L(null, null, 'Sonra efir elə susur ki, sanki xəttin o başında kimsə nəfəsini içinə çəkib.'),
        L('ember', 'fear', '…Yəqin külək idi.'),
      ];
    }
    return [L(null, null, 'Hearth-in radio dirəyi. Radio Ray and içir ki, havası təmiz gecədə üç günlük yoldan səs tutur.'), L('ember', 'neutral', st.q.radio >= 3 ? 'İndi də susub.' : 'Dünyanın qalanı hələ oradadır. Haradasa.')];
  });
  spot('well', 244, 174, [L(null, null, 'Quyu. İlk suyu çıxan gün Elder Amos ağladı və bunu hamıdan gizlətməyə çalışdı.'), L('ember', 'laugh', 'Hamı gördü.')]);
  spot('garden', 172, 372, [L(null, null, 'Bostan. Torpaqdan baş qaldırmış on dörd cücərti — Granny Wren-ə inansaq, on altı.'), L('ember', 'neutral', 'Yol boyu heç vaxt bir yerdə yaşıl görməmişdim.')]);
  spot('fire', 320, 392, [L(null, null, 'Bu ocaq Hearth-in qurulduğu gecə yandırılıb və o vaxtdan bir dəfə də sönməyib. Gecə növbəsinə kim çıxırsa, ilk işi ona odun atmaqdır.'), L('ember', 'neutral', 'Bu axşam hamı burada olacaq.')]);
  spot('buggy', 428, 216, () => (st.q.parts === 9
    ? [L(null, null, 'Baqqi. Motor hələ ilıqdır.'), L('ember', 'smile', 'Axşam. Səbr et.')]
    : [L(null, null, 'Old Gus-un baqqisi. Motorunun yarısı yerdə, səliqə ilə sərilmiş əskinin üstündədir — cərrahın alətləri kimi.'), L('ember', 'neutral', 'Yığılsa, düşərgədə ən sürətli şey olacaq. Məndən sonra.')]));
  spot('home', 470, 566, [L(null, null, 'Sənin və Milonun çadırı. İçəridən maşın yağının və isti çörəyin iyi gəlir — evin iyi.'), L('ember', 'sleepy', 'Yatmaq üçün hələ tezdir. Təəssüf.')]);
  spot('school', 150, 570, [L(null, null, 'Miss Clara-nın məktəbi. Lövhədə: "A — ana. B — baqqi. C — çörək."'), L('ember', 'smile', 'Vacib sözlərdən başlayıb.')]);
  spot('rock', 78, 52, [L(null, null, 'Daşın üstündə cızılıb: "BURADA DAYANDIQ." Altında qırx üç ad var.'), L('ember', 'sad', 'Mənimki sonuncudan əvvəlkidir. Sonuncu — Milo.')]);
  spot('barrels', 284, 592, [L(null, null, 'Yanacaq çəlləkləri. Nə qıfılı var, nə gözətçisi. Kimə lazımdırsa, gəlib götürür — Hearth-in çöldəki şöhrəti də elə bundandır.'), L('ember', 'think', 'The Syndicate bunu görsə, dəli olar.')]);

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
      L(null, null, 'Səhər Hearth-ə tələsmədən gəlir: əvvəl ocağın tüstüsü qalxır, sonra toyuqlar, ən axırda da insanlar oyanır. Qırx üç nəfər, on bir çadır, bir quyu — Ember üçün dünya elə bu qədərdir.'),
      L('ember', 'neutral', 'Old Gus gözləyir. Amma əvvəl düşərgəni bir dolanım — səhərlər hamının bir dərdi olur, biri də mütləq mənə düşür.'),
    ]);
  }
  await ended;
  save();
  world.dispose(); journal.remove(); hint.remove();
  ch.world = null;
  st.stage = 'evening'; store(st);
}

export { LOOK };
