# NitroVerse

Brauzerdə işləyən low-poly yarış oyunu — **Three.js**, vanilla JavaScript, quraşdırma tələb etmir.

🎮 **Oyna:** https://apex-drift-racing.netlify.app

![Three.js](https://img.shields.io/badge/Three.js-r160-000000?logo=three.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-mobil%20dəstəkli-5A0FC8)

---

## Nə var

| | |
|---|---|
| **6 trek** | Səhra · Neon şəhər · Alp · Kanyon · Rivyera · Zavod |
| **18 maşın** | Hər birinin öz statistikası və **imza gücü** (yarışda 1 dəfə) |
| **Yarış** | 6 maşın, dövrələr, canlı sıralama, power-up-lar |
| **Sonsuz sürüş (Zen)** | Prosedural yol, 5 biom, gecə-gündüz dövrü, hava, tunellər, körpülər, şəhər rayonları |
| **Futbol 3v3** | Nitro, zərbə, qapıçı proqnozu |
| **Arena** | Battle royale — daralan zona, ability-lər, son qalan udur |
| **Onlayn** | PeerJS ilə P2P otaqlar (yarış / futbol / arena) |
| **Hesab və iqtisadiyyat** | Qızıl, gündəlik mükafat, maşın açılışı, kosmetika (boya · disk · skin · əfsanəvi effekt · finiş animasiyası) |
| **Sosial** | Dostlar, şəxsi mesajlar, onlayn siyahı, liderlər |
| **4 dil** | AZ · EN · RU · TR |

Mobil üçün ayrıca toxunma idarəsi var; hədəf — bütün rejimlərdə 60 FPS.

## Texniki

- **Render:** Three.js, flat-shaded low-poly, **postprocessing yoxdur** (mobil FPS üçün prinsipial qərar)
- **Performans:** material imzasına görə mesh birləşdirmə (`MergeUtils`), paylaşılan materiallar, chunk əsaslı prosedural dünya, resurs təmizləmə (`disposeObject3D`)
- **Fizika:** arcade kinematik model — drift, tutum, asqı, maneə toqquşması
- **Onlayn:** PeerJS (öz broker serveri `peerserver/`), host-avtoritativ sinxronizasiya
- **Backend:** Netlify Functions + Blobs (`netlify/functions/`) **və ya** öz serverin (`server/` — tək proses, SQLite, xarici asılılıq yoxdur)

## Qurulum

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
```

## Layihə quruluşu

```
src/
├── core/        # Game loop, səhnələr (Gameplay/Endless/Showcase), model kitabxanası, audio, i18n
├── entities/    # Maşın, oyunçu/AI idarəsi
├── world/       # Trek qurucusu, sonsuz yol generatoru, təbiət dəsti
├── race/        # Yarış idarəsi, power-up-lar, imza gücləri
├── net/         # PeerJS otaqları, auth, sosial
├── ui/          # Menyu, HUD, nəticələr
└── data/        # Maşınlar, treklər, kosmetika, iqtisadiyyat
netlify/functions/   # auth · rooms · social (Netlify Blobs)
server/              # öz hostinqin üçün alternativ backend (SQLite)
peerserver/          # öz PeerJS broker serverin
```

## Öz serverində işlətmək

`server/README.md` — tək prosesli Node serveri statik faylları verir və `/api/{auth,rooms,social}` endpointlərini işlədir (SQLite, Node 22+ daxili modulu).
`peerserver/README.md` — onlayn rejim üçün öz signaling brokerin.

## Lisenziya və resurslar

Kod müəllifi: **Samir Abbasov**. 3D modellər — [Kenney](https://kenney.nl) (CC0).

---

<sub>Oyunda xəta görsən: ana menyuda **🐞 Xəta bildir**.</sub>
