---
paths:
  - "src/net/**"
  - "src/entities/NetworkController.js"
  - "server/**"
  - "peerserver/**"
  - "netlify/**"
---

# Şəbəkə və backend qaydaları

- Onlayn: PeerJS P2P, **host-avtoritativ**. Protokol mesajı və ya deterministik cədvəl (rulet, seed) dəyişəndə `src/net/NetRoom.js` → `PREFIX` versiyasını artır — köhnə və yeni klient eyni otağa düşməsin.
- API iki yerdə yaşayır: `server/api/*.mjs` (canlı, SQLite) və `netlify/functions/*.mjs` (ehtiyat, eyni modulları idxal edir). Endpoint dəyişəndə ikisi də işləməlidir.
- `server/` xarici asılılıqsızdır (Node 22+ daxili `sqlite`). npm paketi əlavə etmə.
- Server env `/etc/nitroverse.env`-dədir. **`AUTH_SECRET` dəyişsə bütün girişlər ölür.** Sirləri repo-ya yazma; `.env.production` yalnız açıq `VITE_*` dəyərləri saxlayır.
- İstifadəçi adı normallaşdırması klient (`main.js` `cleanUser`) və serverdə eyni olmalıdır (`İ` → `i̇` tələsi).
- Qızıl mükafatı server tərəfdə tavanla yoxlanır — klientə etibar etmə.
- Onlayn test: iki ayrı brauzer prosesi. Eyni brauzerdə iki tab işləmir (gizli tabda `requestAnimationFrame` donur).
- Prod build-də DEV qarmaqları yoxdur — server testində UI seçiciləri işlət (`[data-mode="online"]`).
- Canlı serverə toxunan hər şey (ssh, deploy, miqrasiya) yalnız istifadəçi deyəndə.

## Avtomatik onlayn test

`npm run test:online` — iki brauzer konteksti + yerli broker (`peerserver/`, port 9123). DEV qarmağı `window.__online` (`NetRoom`, `start`) menyudan keçmədən otaq qurur. Onlayn axına toxunan hər dəyişiklikdən sonra işlət; yeni ssenarini `tests/online.spec.js`-ə əlavə et.
