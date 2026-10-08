// OYUNLARIN SİYAHISI. NitroVerse tək oyun deyil — hər oyun `src/games/<ad>/` qovluğunda yaşayır və
// platformanı (src/platform.js: kətan, giriş, səs, hesab, bildirişlər) işlədir.
// Yeni oyun əlavə etmək: qovluq yarat, `mount()` ixrac et, aşağıya sətir yaz. Siyahıda birdən çox oyun
// olanda `main.js` seçim ekranını (hub) göstərməlidir — hələlik tək oyun var, birbaşa açılır.
import { mount as mountRacing } from './racing/index.js';

export const GAMES = [
  { id: 'racing', mount: mountRacing },
];
