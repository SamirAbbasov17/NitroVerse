// CARMAGEDDON — Fəsil 1 ssenarisi (bax docs/CARMAGEDDON-CHAPTER1.md).
// Xüsusi isimlər ingiliscədir və tərcümə olunmur. Mətnlər hələlik Azərbaycancadır: ssenari
// oturandan sonra en/ru/tr əlavə olunacaq — `tx(line.text, lang)` çatışmayan dildə az-a düşür.
export const tx = (text, lang) => (typeof text === 'string' ? text : (text[lang] ?? text.az));

// pitch: "mırıltı" səsinin əsas tonu (Hz); wave: tembr
export const CAST = {
  ember: { name: 'Ember', color: '#ff7a3a', pitch: 392, wave: 'triangle' },
  milo: { name: 'Milo', color: '#ffd166', pitch: 587, wave: 'square' },
};

// PROLOQ: hər kadr = fon (art: prologue-N) + mətn
export const PROLOGUE = [
  { art: 'p1', text: { az: 'Əvvəl şəhərlər vardı. Sonra şəhərlər susdu.' } },
  { art: 'p2', text: { az: 'Qalan tək şey yollar oldu. Və yollarda yaşamağı öyrənənlər.' } },
  { art: 'p2', text: { az: 'Onlara Nomads deyirdilər. Yanacaq tapdıqları yerdə gecələyir, səhər yenə yola çıxırdılar.' } },
  { art: 'p3', text: { az: 'Yanacaq isə The Syndicate-in idi. Yeddi baron, yeddi yol.' } },
  { art: 'p3', text: { az: 'Və onların üstündə — heç vaxt danışmayan biri.' } },
  { art: 'p4', text: { az: 'Bir gün Nomads dayandı. Quyu qazdılar. Toxum əkdilər. Yanacağı satmadılar — bölüşdülər.' } },
  { art: 'p4', text: { az: 'O yerə Hearth dedilər.' } },
  { art: 'p5', text: { az: 'Bu, Hearth-in son günüdür.' } },
];

// SƏHNƏ 1a: səhər, çadır. Ember və Milo.
export const MORNING = [
  { who: 'milo', emo: 'happy', text: { az: 'Ember! Ember, oyan! Günəş çoxdan qalxıb!' } },
  { who: 'ember', emo: 'sleepy', text: { az: '…Günəş qalxıb deyə mən də qalxmalıyam? Bunu kim qərar verib?' } },
  { who: 'milo', emo: 'happy', text: { az: 'Old Gus. Baqqinin hissələri gəlib. Dedi sənsiz başlamır.' } },
  { who: 'ember', emo: 'side', text: { az: 'Mənsiz başlamır, çünki sonuncu dəfə sən "kömək edəndə" sükan arxa oturacaqdan çıxdı.' } },
  { who: 'milo', emo: 'pout', text: { az: 'O, təkmilləşdirmə idi.' } },
  { who: 'ember', emo: 'smile', text: { az: 'Təkmilləşdirmə idi. Əlbəttə.' } },
  { who: 'milo', emo: 'happy', text: { az: 'Bu axşam sənə bir şey göstərəcəyəm. Hələ hazır deyil. Baxma!' } },
  { who: 'ember', emo: 'side', text: { az: 'Əlinin arxasında nə gizlədirsən?' } },
  { who: 'milo', emo: 'pout', text: { az: 'Heç nə. Yağdır. Məndə həmişə yağ olur.' } },
  { who: 'ember', emo: 'neutral', text: { az: 'Milo.' } },
  { who: 'milo', emo: 'neutral', text: { az: 'Hə?' } },
  { who: 'ember', emo: 'neutral', text: { az: 'Səhər yeməyi yedin?' } },
  { who: 'milo', emo: 'pout', text: { az: '…Granny Wren mənə iki çörək verdi. Birini sənə saxladım. Sonra onu da yedim.' } },
  { who: 'ember', emo: 'smile', text: { az: 'Sadiq qardaş.' } },
  { who: 'milo', emo: 'neutral', text: { az: 'Ember… biz burada qalacağıq, hə? Bu dəfə yola çıxmayacağıq?' } },
  { who: 'ember', emo: 'neutral', text: { az: 'Elder Amos deyir ki, toxum cücərirsə, ev buradır.' } },
  { who: 'milo', emo: 'happy', text: { az: 'Cücərir! Dünən saydım. On dörd dənə!' } },
  { who: 'ember', emo: 'smile', text: { az: 'Onda ev buradır.' } },
  { text: { az: 'Çöldə Hearth oyanır: çəkic səsi, uşaq gülüşü, uzaqda xırıldayan radio.' } },
];
