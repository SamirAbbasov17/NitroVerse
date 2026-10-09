// CARMAGEDDON — Fəsil 1 ssenarisi (bax docs/CARMAGEDDON-CHAPTER1.md).
// Xüsusi isimlər ingiliscədir və tərcümə olunmur. Mətnlər hələlik Azərbaycancadır: ssenari
// oturandan sonra en/ru/tr əlavə olunacaq — `tx(line.text, lang)` çatışmayan dildə az-a düşür.
export const tx = (text, lang) => (typeof text === 'string' ? text : (text[lang] ?? text.az));

// pitch: "mırıltı" səsinin əsas tonu (Hz); wave: tembr
export const CAST = {
  ember: { name: 'Ember', color: '#ff7a3a', pitch: 392, wave: 'triangle' },
  milo: { name: 'Milo', color: '#ffd166', pitch: 587, wave: 'square' },
  wren: { name: 'Granny Wren', color: '#d98a7a', pitch: 330, wave: 'sine' },
  gus: { name: 'Old Gus', color: '#c9a98a', pitch: 196, wave: 'sawtooth' },
  clara: { name: 'Miss Clara', color: '#8fb4e0', pitch: 440, wave: 'sine' },
  ray: { name: 'Radio Ray', color: '#f2d23a', pitch: 523, wave: 'square' },
  amos: { name: 'Elder Amos', color: '#e8dcc0', pitch: 165, wave: 'triangle' },
  pip: { name: 'Pip', color: '#f07a1c', pitch: 784, wave: 'square' },
  judge: { name: 'Judge', color: '#b9b9c4', pitch: 247, wave: 'sine' },
  crude: { name: 'Madam Crude', color: '#f2f2f2', pitch: 370, wave: 'sine' },
  butcher: { name: 'Butcher', color: '#b3261e', pitch: 110, wave: 'sawtooth' },
  rust: { name: 'Doctor Rust', color: '#7fbf7a', pitch: 294, wave: 'triangle' },
  preacher: { name: 'Preacher', color: '#ff7a2e', pitch: 220, wave: 'sawtooth' },
  twins: { name: 'The Twins', color: '#b44bff', pitch: 494, wave: 'square' },
  jackal: { name: 'Jackal', color: '#d9b06a', pitch: 147, wave: 'triangle' },
  hush: { name: 'Hush', color: '#8a8a96', pitch: 82, wave: 'sine' },
};

// PROLOQ: hər kadr = fon (art) + mətn. Təhkiyə bədii dildədir — nağıl danışan səs kimi, teleqraf
// üslubunda yox (sahibinin rəyi: "qısa sözlərlə belə oldu, bu var idi" üslubu bəyənilmədi).
export const PROLOGUE = [
  { art: 'p1', text: { az: 'Deyirlər, bir vaxtlar gecələr qaranlıq olmurdu. Şəhərlər o qədər işıq saçırdı ki, göydə ulduzları görmək olmurdu.' } },
  { art: 'p1', text: { az: 'Sonra işıqlar bir-bir söndü. Sonuncu lampanın nə vaxt söndüyünü heç kim xatırlamır — xatırlayan qalmayıb.' } },
  { art: 'p2', text: { az: 'Şəhərlərdən geriyə yollar qaldı: çatlamış, yarısını qum udmuş, daha heç yerə aparmayan yollar.' } },
  { art: 'p2', text: { az: 'Bir də o yolları özünə ev bilən insanlar. Onlar bir yerdə iki gecədən artıq qalmazdılar, çünki çöldə dayanan ya acından ölürdü, ya da tapılırdı. Adlarına Nomads deyirdilər.' } },
  { art: 'p3', text: { az: 'Yolların da sahibi vardı. Yanacağın son damlasına qədər hər şey The Syndicate-ə məxsus idi — yeddi barona və onların qarşısında baş əydiyi, səsini heç kimin eşitmədiyi birinə.' } },
  { art: 'p3', text: { az: 'Onun əsl adını bilən yox idi. Adı çəkiləndə adamlar sadəcə susurdu. Bəlkə elə buna görə ona Hush deyirdilər.' } },
  { art: 'p4', text: { az: 'Günlərin bir günü bir karvan dayandı. Yorulduqları üçün yox — qoca bir qadın torpağı ovcuna alıb ovuşdurduğu və "bu torpaq bitirər" dediyi üçün.' } },
  { art: 'p4', text: { az: 'Quyu qazdılar, su çıxdı. Toxum səpdilər, cücərdi. Yanacaqlarını isə satmadılar: gələnə verdilər, gedənin yoluna qoydular.' } },
  { art: 'p4', text: { az: 'Çöldə belə şey olmur. Çöldə hər şeyin bir qiyməti var. Onlar isə ocağın başına yığışıb həmin yerə ad qoydular: Hearth.' } },
  { art: 'p5', text: { az: 'Bu hekayə Hearth-in necə qurulmasından danışmır.' } },
  { art: 'p5', text: { az: 'Bu hekayə onun son günündən başlayır.' } },
];

// SƏHNƏ 1a: səhər, çadır. Ember və Milo.
export const MORNING = [
  { who: 'milo', emo: 'laugh', text: { az: 'Ember! Ember, oyan! Günəş çoxdan qalxıb!' } },
  { who: 'ember', emo: 'sleepy', text: { az: '…Günəş qalxıb deyə mən də qalxmalıyam? Bunu kim qərar verib?' } },
  { who: 'milo', emo: 'happy', text: { az: 'Old Gus. Baqqinin hissələri gəlib. Dedi sənsiz başlamır.' } },
  { who: 'ember', emo: 'pout', text: { az: 'Mənsiz başlamır, çünki sonuncu dəfə sən "kömək edəndə" sükan arxa oturacaqdan çıxdı.' } },
  { who: 'milo', emo: 'pout', text: { az: 'O, təkmilləşdirmə idi.' } },
  { who: 'ember', emo: 'laugh', text: { az: 'Təkmilləşdirmə idi. Əlbəttə.' } },
  { who: 'milo', emo: 'proud', text: { az: 'Bu axşam sənə bir şey göstərəcəyəm. Hələ hazır deyil. Baxma!' } },
  { who: 'ember', emo: 'confused', text: { az: 'Əlinin arxasında nə gizlədirsən?' } },
  { who: 'milo', emo: 'sweat', text: { az: 'Heç nə. Yağdır. Məndə həmişə yağ olur.' } },
  { who: 'ember', emo: 'neutral', text: { az: 'Milo.' } },
  { who: 'milo', emo: 'neutral', text: { az: 'Hə?' } },
  { who: 'ember', emo: 'neutral', text: { az: 'Səhər yeməyi yedin?' } },
  { who: 'milo', emo: 'sweat', text: { az: '…Granny Wren mənə iki çörək verdi. Birini sənə saxladım. Sonra onu da yedim.' } },
  { who: 'ember', emo: 'laugh', text: { az: 'Sadiq qardaş.' } },
  { who: 'milo', emo: 'think', text: { az: 'Ember… biz burada qalacağıq, hə? Bu dəfə yola çıxmayacağıq?' } },
  { who: 'ember', emo: 'neutral', text: { az: 'Elder Amos deyir ki, toxum cücərirsə, ev buradır.' } },
  { who: 'milo', emo: 'laugh', text: { az: 'Cücərir! Dünən saydım. On dörd dənə!' } },
  { who: 'ember', emo: 'love', text: { az: 'Onda ev buradır.' } },
  { text: { az: 'Çadırın o üzündə Hearth artıq oyanıb: haradasa çəkic döyəclənir, uşaqlar gülüşür, uzaqda köhnə bir radio xırıldaya-xırıldaya öz-özünə danışır.' } },
];

// Səhnə formatı (EVENING, ATTACK): { art } — fon dəyişir; { intro, title } — personajın təqdimat kartı;
// qalanı — sətir ({ who, emo, text }; who yoxdursa təhkiyə).
const N = (az) => ({ text: { az } });
const S = (who, emo, az) => ({ who, emo, text: { az } });

// SƏHNƏ 2: axşam ocağı
export const EVENING = [
  { art: 'e1' },
  N('Gün batanda Hearth-in bütün cığırları bir yerə çıxır. Biri kötük gətirir, biri qazan, biri də sadəcə özünü — ocağın başında yer hamıya çatır.'),
  N('Ember həmişəki yerində oturub: alovdan bir az aralı, Milonun yanında. Milo isə bu axşam yerində qərar tuta bilmir.'),
  S('milo', 'proud', 'İndi olar. Gözünü yum! …Yaxşı, yumma. Onsuz da heç vaxt yummursan.'),
  { art: 'e2' },
  N('Ovcuna soyuq, ağır bir şey qoyur. Köhnə bir dişli çarxdır: pası təmizlənib, parıldayana qədər sürtülüb, ortasından dəri qaytan keçirilib.'),
  S('milo', 'sweat', 'Açar halqasıdır. Baqqinin açarı üçün. Yəni… sənin açarın üçün. Old Gus dedi ki, maşın sürücüsünü özü seçir. O da səni seçib.'),
  S('milo', 'think', 'Üç həftə düzəltmişəm. Dişlərindən biri sınmışdı, onu özüm tökdüm. Bir az əyri alındı.'),
  S('ember', 'love', '…Əyri deyil.'),
  S('milo', 'pout', 'Əyridir. Mən görürəm.'),
  S('ember', 'smile', 'Onda ən çox elə o dişini sevəcəyəm.'),
  { art: 'e1' },
  N('Elder Amos ayağa qalxanda söhbətlər öz-özünə kəsilir. O, səsini heç vaxt qaldırmır — indiyə qədər buna ehtiyac olmayıb.'),
  S('amos', 'proud', 'Qırx il yol getdik. Qırx il heç kim "hara" deyə soruşmadı, çünki cavab həmişə eyni idi: irəli.'),
  S('amos', 'sad', 'Yolda çox adam qoyduq. Hərəmiz kimisə. Adlarını bir daşa yazmaq istədik — daş balaca gəldi.'),
  S('amos', 'smile', 'Amma bu gün bir uşaq mənə cücərtiləri sayıb göstərdi. Bir qız itmiş toxumu tapıb sahibinə qaytardı. Bir motor da qırx ildən sonra yenidən oxudu.'),
  S('amos', 'proud', 'Mən ömrüm boyu karvan başçısı olmuşam. Bu gecə özümə ilk dəfə başqa ad qoymaq istəyirəm: qonşu. Hamınızın qonşusu.'),
  N('Kimsə gülür, kimsə gözünü silir. Əvvəl Granny Wren əl çalır, ardınca hamı. Pip yuxulu-yuxulu "G — gecə" deyir və Miss Clara-nın dizində yuxuya gedir.'),
  N('Ember açar halqasını ovcunda sıxır. Çarxın əyri dişi dərisinə batır və o fikirləşir ki, xoşbəxtlik yəqin elə belə olur: balaca, bir az əyri və yalnız sənin.'),
  { music: null },
  S('ray', 'fear', 'Efir! Efir susub — hamısı birdən! Şərq karvanı, qərb, alverçilərin dalğası… Elə bil kimsə dünyanın səsini kəsib!'),
  S('gus', 'pout', 'Ray, otur. Sənin efirin onsuz da həftədə üç dəfə ölür.'),
  S('ray', 'fear', 'Yox, bu dəfə başqadır. Bu dəfə… bir dinləyin.'),
  N('Hamı susur. Əvvəl ocağın çırtıltısından başqa heç nə eşidilmir. Sonra xəbəri torpaq özü verir: ayaqların altında zəif, ahəngdar bir titrəyiş başlayır.'),
  { music: 'emptycity' },
  { art: 'a1' },
  N('Şimalda, qaranlığın dibində bir işıq yanır. Sonra ikincisi. Sonra üfüq boyu, bir-birinin ardınca — onlarla, yüzlərlə fara.'),
  S('amos', 'neutral', 'Uşaqları çadırlara aparın.'),
  S('clara', 'fear', 'Elder Amos, bəlkə alverçilərdir? Bəlkə sadəcə yoldan keçirlər…'),
  S('amos', 'sad', 'Alverçilər gecə gəlməz, qızım. Bu qədər də gəlməz.'),
];

// SƏHNƏ 3: hücum — baronların gəlişi
export const ATTACK = [
  { art: 'a2' },
  N('Onlar tələsmirdilər. Maşınlar düşərgənin başına yavaş-yavaş, dairə vura-vura dolandı — canavar sürüsü taqətdən düşmüş heyvanın ətrafında necə dolanırsa, elə.'),
  N('Sonra motorlar bir-bir susdu. Və sükutun içində yeddi qapı açıldı.'),
  { intro: 'judge', title: 'The Syndicate-in qanunu' },
  S('judge', 'smile', 'Hearth adlanan yaşayış yeri. Qırx üç nəfər. İttiham: yanacağın icazəsiz saxlanması, icazəsiz paylanması və — ən ağırı — pulsuz paylanması.'),
  S('judge', 'neutral', 'Hökm mən bura gəlməzdən əvvəl çıxarılıb. Mən onu sizə sadəcə çatdırıram. Belə daha nəzakətli olur.'),
  { intro: 'crude', title: 'Yanacağın sahibəsi' },
  S('crude', 'smile', 'Xahiş edirəm, bunu şəxsi məsələ kimi qəbul etməyin. Siz pis insanlar deyilsiniz. Siz pis nümunəsiniz.'),
  S('crude', 'neutral', 'Bir düşərgə yanacağı havayı paylayırsa, sabah o biri düşərgə soruşacaq: bəs biz niyə pul veririk? Mən bu sualı heç sevmirəm.'),
  { intro: 'butcher', title: 'Dəmir yolun baronu' },
  S('butcher', 'angry', 'Çox danışırsınız.'),
  S('butcher', 'neutral', 'Kişiləri mənə verin. Qalanını aranızda özünüz bölün.'),
  { intro: 'rust', title: 'Dumanın həkimi' },
  S('rust', 'think', 'Maraqlıdır… Quru torpaqda bostan. Görəsən, kökləri neçə qarış dərinə gedir? Yox, deməyin. Özüm baxaram. Mən hər şeyə özüm baxıram.'),
  { intro: 'preacher', title: 'Alovun vaizi' },
  S('preacher', 'angry', 'Od verəndir, od da alandır! Siz ocağa ad qoydunuz, ona ev dediniz — indi o, öz evini geri istəyir!'),
  { intro: 'twins', title: 'Bir kürsü, iki kölgə' },
  S('twins', 'laugh', '— Mərc gələk: neçə dəqiqə çəkəcək? — Mən deyirəm on. — Mən deyirəm, saymağa heç kim macal tapmayacaq.'),
  { intro: 'jackal', title: 'Ovçu' },
  S('jackal', 'neutral', 'Qaçın.'),
  S('jackal', 'smile', 'Yalvarıram, qaçın. Yerində dayanan şikarın dadı olmur.'),
  N('Elder Amos papağını çıxarıb sinəsinə sıxdı və irəli çıxdı. Qırx üç nəfərin içindən yalnız o yeridi.'),
  S('amos', 'proud', 'Mənim adım Amos-dur. Bu insanların böyüyü mənəm. Yanacağı götürün — hamısını. Quyunu da götürün. Bizə yalnız getməyə izin verin. Yolu tanıyırıq, bir də qarşınıza çıxmarıq.'),
  S('crude', 'sad', 'Ah, mən bunu elə istərdim ki. Sözümə inanın. Amma qərarı mən vermirəm.'),
  { art: 'a4' },
  N('Yeddisi də kənara çəkildi. Aralarından biri keçdi: hündür, arıq, başdan-ayağa qara. Üzündə üz yox idi — hamar, qara bir maska və onun arxasında közərən iki nöqtə.'),
  N('O, Elder Amos-a baxdı. Sonra düşərgəyə. Sonra — bircə anlıq — Emberə. Və bir kəlmə demədən əlini qaldırdı.'),
  { art: 'a3' },
  N('Ondan sonra baş verənləri Ember heç vaxt sıra ilə xatırlaya bilmədi. Yaddaşında yalnız qırıqlar qaldı: alovun işığında hələ də yaşıl görünən bostan. Yanan məktəb çadırı. Kəsilmiş ağac kimi yavaş-yavaş aşan radio dirəyi.'),
  N('Bir də səslər. Tanıdığı, hər səhər eşitdiyi səslər — bir-bir kəsilən.'),
  S('ember', 'fear', 'Milo… MILO!'),
];

// SƏHNƏ 4: gecə. Axtarış (oynanış) → Milo → Hush → Old Gus → Jackal (döyüş) → maska
export const NIGHT_INTRO = [
  { art: 'a3' },
  N('Ember qaçırdı. Hara qaçdığını ağlı bilmirdi — ayaqları bilirdi. Emalatxanaya. Milo qorxanda həmişə motorların yanına qaçardı: deyirdi ki, onların səsi adamın öz ürəyinin səsini batırır.'),
  N('Düşərgənin içində indi yad fənərlər gəzirdi. Onların işığına düşən bir də qaranlığa qayıtmırdı.'),
];

export const FOUND = [
  { art: 'b1' },
  N('Onu baqqinin yanında tapdı: dizlərini qucaqlayıb oturmuşdu, əlində də özündən ağır bir açar. Ağlamırdı. Milo qorxanda ağlamazdı — sayardı.'),
  S('milo', 'fear', '…otuz yeddi, otuz səkkiz… Ember! Mən yüzə qədər sayacaqdım. Sən gəlməsəydin, özüm çıxıb səni tapacaqdım.'),
  S('ember', 'sad', 'Gəldim. Buradayam. Əlimi tut və nə olursa-olsun, buraxma.'),
  S('milo', 'think', 'Gus dedi ki, baqqi hazırdır. Qaça bilərik. Sən sürərsən, mən də arxada sakitcə oturaram. Söz verirəm, heç nəyə əl vurmaram.'),
  S('ember', 'love', 'Bu dəfə nəyə istəyirsən, əl vur.'),
  N('Çıxışa üç addım qalmışdı ki, qapının ağzını bir kölgə tutdu. Kölgənin əlində zəncir cingildəyirdi.'),
  { art: 'b2' },
  S('butcher', 'neutral', 'Bir kişi tapdım. Balacadır, amma hesaba keçər.'),
  S('ember', 'angry', 'Ona toxunma! Məni apar. Eşidirsən? MƏNİ apar!'),
  N('Milo onun əlini buraxdı. Ember bu anı sonralar min dəfə yada salacaqdı: qardaşı əlini özü buraxdı. Açarı iki əli ilə tutdu və bacısının qabağına keçdi.'),
  S('milo', 'angry', 'Bacıma yaxın gəlmə! Mən… mən heç nədən qorxmuram!'),
  N('Butcher güldü. Bütün gecə ərzində onun çıxardığı insana oxşayan yeganə səs bu oldu.'),
  { music: null },
  { art: 'black' },
  N('Ember gözlərini yummadı. Milo düz deyirdi: o, heç vaxt yummurdu.'),
  N('Sonra emalatxanada təkcə alovun uğultusu qaldı. Bir də yerə düşən açarın cingiltisi.'),
  { music: 'bleeding' },
  { art: 'b3' },
  N('Onu sürüyüb ocağın yanına gətirəndə Ember dirənmirdi. Ovcunda bir şey sıxmışdı — elə bərk ki, çarxın əyri dişi dərisini kəsmişdi.'),
  { art: 'a4' },
  N('Qara maska onun üzünə əyildi. Bu qədər yaxından Ember maskanın səthində öz əksini gördü: balaca, qırmızı, sönmək üzrə olan bir közə oxşayırdı.'),
  { intro: 'hush', title: 'The Syndicate' },
  S('hush', 'neutral', 'Qorxma, Ember. Sönmək ağrıtmır.'),
  N('O, adını bilirdi. Bunun nə demək olduğunu Ember çox-çox sonra anlayacaqdı. O an isə bircə şeyi anladı: bu səsi ömrünün axırına qədər unutmayacaq.'),
  N('Hush əlini ikinci dəfə qaldırdı.'),
  { music: null },
  N('Elə həmin an Hearth-in o başında bir motor oxudu. Ember o səsi tanıdı — onu bu səhər öz əlləri ilə yığmışdı.'),
  S('gus', 'angry', 'ƏLİNİZİ O QIZDAN ÇƏKİN!'),
  { art: 'b5' },
  N('Old Gus alışıb-yanan baqqini düz yanacaq çəlləklərinin üstünə sürdü. Qırx il rəqəm saymış adam son hesabını da səhvsiz apardı.'),
  N('Gecə bir anlığa gündüzə döndü.'),
  { art: 'a3' },
  N('Ember ayağa necə qalxdığını bilmədi. Qulaqları cingildəyirdi, dünya səssiz bir yuxuya oxşayırdı. Və o yuxunun içindən bir maşın çıxdı.'),
  { music: 'hunt' },
  { art: 'b6' },
  N('Alçaq, uzun, sümük rəngində. Sükan arxasında çaqqal kəlləsi dişlərini ağartmışdı. Jackal qaçanları ovlamağa çıxmışdı və indicə birini görmüşdü.'),
  S('jackal', 'laugh', 'Budur! Axır ki, biri qaçır!'),
  N('Ember qaçmadı. Maşın ona çatanda yana sıçradı və kapotdan yapışdı.'),
];

// Jackal ilə döyüş: hər vuruş — bir düymə (left / right / up / hit)
export const DUEL = [
  { key: 'left', az: 'Jackal sükanı sərt qırır — maşın səni üstündən atmaq istəyir. Sola əyil!' },
  { key: 'right', az: 'Qarmaq havanı yarır. Sağa!' },
  { key: 'up', az: 'Kapotdan damın üstünə — dırmaş!' },
  { key: 'left', az: 'O, əyləci basır. Sola yapış!' },
  { key: 'hit', az: 'Pəncərə açıqdır. Vur!' },
  { key: 'right', az: 'Əlində bıçaq parıldayır. Sağa çəkil!' },
  { key: 'hit', az: 'Sükandan yapış və dart!' },
];

export const AFTER_DUEL = [
  { art: 'b6' },
  N('Maşın idarədən çıxıb aşmaqda olan radio dirəyinə doğru şütüdü. Son anda Ember əyildi. Jackal əyilmədi.'),
  { music: null },
  { art: 'black' },
  N('Bir müddət yalnız motorun boş-boşuna fırlanan səsi eşidildi.'),
  { music: 'bleeding' },
  { art: 'b7' },
  N('Maska yan oturacağa düşmüşdü: sümük və pas, içi hələ ilıq. Ember ona uzun-uzun baxdı. Taxmadı. Açar halqasını cibindən çıxarıb onun yanına qoydu.'),
  S('ember', 'neutral', 'Yeddi tıqqıltı idi.'),
  S('ember', 'angry', 'Altısı qaldı.'),
  N('Arxada Hearth yanırdı. Qabaqda yalnız yol vardı — bütün ömrü boyu tanıdığı yeganə ev. Ember sükanı tutdu və qazı axıra qədər basdı.'),
];

// SƏHNƏ 6: son — boş yol və tərk edilmiş bar
export const ENDING = [
  { art: 'z1' },
  N('Yol uzun idi və heç yerə aparmırdı — Emberə indi lazım olan da elə bu idi. Arxasınca gələn faralar bir-bir geridə qaldı; sonuncusu körpünün o tayında söndü.'),
  N('Sonra motor da susdu. Yanacaq əqrəbi çoxdan sıfırı göstərirdi; maşın son yüz addımı, deyəsən, sırf inadından getmişdi.'),
  { art: 'z2' },
  N('Yolun qırağında bir tikili qaralırdı. Damındakı yazının hərfləri çoxdan tökülmüşdü, qalanlarından isə bircə ad oxunurdu: LAST STOP.'),
  N('Qapı açıq idi. Çöldə qapıları çoxdan heç kim bağlamırdı — bağlayan qalmamışdı.'),
  { art: 'z3' },
  N('İçəridən toz, köhnə taxta və kiminsə çoxdan içib qurtardığı bir axşamın iyi gəlirdi. Ember piştaxtaya çatdı və dizləri daha onun sözünə baxmadı.'),
  N('Yerə çökdü. Maskanı yanına qoydu. Açar halqasını isə ovcundan buraxmadı.'),
  N('Pəncərəyə vurulmuş taxtaların arasından içəri nazik bir işıq süzülürdü. Dan yeri sökülürdü: Hearth-siz ilk səhər.'),
  S('ember', 'sad', '…Otuz yeddi. Otuz səkkiz.'),
  N('O, saymağa başladı. Milo kimi. Yüzə çatanda ayağa qalxacaqdı.'),
  N('Ondan sonra isə altı ad vardı. Bir də heç vaxt danışmayan biri.'),
];

// QAÇIŞ ARA SƏHNƏLƏRİ: hissələr arasında (1→2, 2→3, 3→4, 4→5). Baronlar Jackal-ın maşınındakı radiodan danışır.
export const CHASE_CUTS = [
  [
    { art: 'c1' },
    N('Hearth güzgünün içində kiçilirdi: əvvəl çadırlar seçilməz oldu, sonra radio dirəyi, ən axırda alovun özü üfüqdə narıncı bir ləkəyə döndü.'),
    N('Jackal-ın maşını yad idi. Oturacaq başqasının bədəninə görə əyilmişdi, sükan başqasının ovcuna görə sürtülmüşdü. Amma motor itaət edirdi — maşınlar sükan arxasında kimin oturduğuna baxmır.'),
    N('Tablonun altında bir radio xışıldadı. Ember onu söndürmək istədi, əli isə yarı yolda qaldı.'),
    S('judge', 'neutral', 'Bütün ekipajlara. Jackal-ın maşını icazəsiz hərəkətdədir. Sükan arxasındakı şəxs məhkumdur. Hökm dəyişməyib — yalnız icra yeri dəyişib.'),
    S('crude', 'smile', 'Kanyonu bağlayın, əzizlərim. Maşını əzməyin, o bizə hələ lazım olacaq. İçindəkini isə… özünüz bilərsiniz.'),
    { art: 'c2' },
    N('Qabaqda yol iki qaya divarının arasına girirdi. Arxada isə faralar yenidən yandı — bu dəfə onlar dairə vurmurdu, düz üstünə gəlirdi.'),
    S('ember', 'think', 'Kanyon dardır. Mənə dar gələn yol onlara da dar gələcək.'),
  ],
  [
    { art: 'c2' },
    N('Kanyon onu, boğazında qalmış tikə kimi, çölə tüpürdü. Arxada kimsə hələ də yanırdı. Ember güzgüyə baxmadı.'),
    { art: 'c3' },
    N('Hava dəyişdi. Əvvəl iy gəldi: çürük yumurta ilə dərman arasında bir şey. Sonra faraların işığı yaşıla çaldı və yol, sanki kimsə üstünə nəfəs vermiş kimi, dumanın içində əridi.'),
    S('rust', 'think', 'A, budur. Gəldiniz. Mən hesablamışdım ki, kanyondan sağ çıxmaq ehtimalınız on birdə birdir. Səhv etməyi sevirəm — hər dəfə təzə bir şey öyrənirəm.'),
    S('rust', 'neutral', 'Dumanın içində nəfəs almaq olar. Bir müddət. Sonra ağciyərləriniz bunun pis fikir olduğunu özləri anlayacaq. Dəftərim açıqdır, qeyd aparıram.'),
    N('Radioda qələmin kağıza toxunduğu eşidildi. Ember şüşəni qaldırdı, yaylığını ağzına çəkdi və yol kənarındakı solğun işıqları saymağa başladı.'),
    S('ember', 'fear', 'Bir işıq. İki işıq. Yaşıl olan yerə girmə. Bir işıq. İki işıq…'),
  ],
  [
    { art: 'c3' },
    N('Duman arxada qaldı, öskürək isə qalmadı. Ember hər nəfəsdə sinəsinin içində xırda şüşə qırıqları hiss edirdi.'),
    N('Sonra yer titrədi. Hearth-dəki o axşam kimi: əvvəl təkərlərin altında, sonra sükanda, ən axırda dişlərində.'),
    { art: 'c4' },
    N('Qabaqda, yolun düz ortası ilə bir şey gedirdi. Buna maşın demək olmazdı — təkərlərin üstünə qoyulmuş bir qala idi: qan rəngində kabin, arxasında çəlləklər, zəncirlər və dəmir dişlər.'),
    S('butcher', 'neutral', 'Balaca kişinin bacısı.'),
    N('Ember-in barmaqları sükanda ağardı. O səsi tanıyırdı: emalatxananın qapısını tutan kölgənin səsi idi.'),
    S('butcher', 'smile', 'O, açarı iki əli ilə tutmuşdu. Bilirsən? Axıra qədər buraxmadı.'),
    N('Ember cavab vermədi. Ayağı pedalın üstündə idi və pedal artıq döşəməyə dirənmişdi.'),
  ],
  [
    { art: 'c4' },
    N('Yük maşını güzgüdə kiçildi. Butcher-in gülüşü radioda bir az da qaldı, sonra o da kəsildi.'),
    N('Şərqdə göyün ətəyi ağarırdı. Ember bir gecənin içində neçə il yaşadığını saymağa çalışdı və saya bilmədi.'),
    { art: 'c5' },
    N('Yolun sonunda körpü vardı. Daha doğrusu, körpüdən qalan: uçurumun üstünə atılmış taxtalar və bir sahildən o birinə çatmayan boşluq.'),
    S('twins', 'laugh', '— Bax, bax, gəlir. — Jackal-ın maşınında. — Jackal bunu bəyənməzdi. — Jackal artıq heç nəyi bəyənmir.'),
    S('twins', 'smile', '— Mərc gələk: körpüdən keçəcək? — Keçməyəcək. — Mən də deyirəm keçməyəcək. — Bəs onda kiminlə mərc gəlirik?'),
    N('Güzgünün hər iki tərəfində bir motosiklet peyda oldu. Əllərində qarmaq fırlanırdı.'),
    S('ember', 'angry', 'Boşluq maşının boyundan uzundur. Sürətim çatsa, keçərəm. Çatmasa… Çatacaq.'),
  ],
];
