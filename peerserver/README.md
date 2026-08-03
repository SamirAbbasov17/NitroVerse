# NitroVerse PeerServer

Oyunun onlayn rejimi üçün **öz signaling (broker) serverimiz**.

## Nə edir, nə etmir

WebRTC-də oyunçular bir-birinə **birbaşa** qoşulur. Bu server yalnız tanışlıq
mərhələsində iştirak edir: otaq kodunu peer ID-yə bağlayır və SDP/ICE mübadiləsini
ötürür. **Oyun trafiki (mövqe, hadisələr) buradan keçmir** — ona görə server çox
yüngüldür: 6 eyni vaxtlı bağlantıda 66 MB RAM, CPU demək olar sıfır.

Əvvəl PeerJS-in ictimai brokeri (`0.peerjs.com`) işlədilirdi — pulsuzdur, amma
sabitliyə zəmanət yoxdur və yüklənmə zamanı otaq yaradılmaya bilir.

## Yerli işə salma

```bash
cd peerserver
npm install
npm run dev            # http://localhost:9000  · sağlamlıq: /health
```

Oyunu ona yönəltmək (layihə kökündə `.env.local`):

```
VITE_PEER_HOST=localhost
VITE_PEER_PORT=9000
VITE_PEER_PATH=/peer
VITE_PEER_KEY=nitroverse
VITE_PEER_SECURE=0
```

Dəyişən təyin olunmayıbsa oyun **ictimai brokerə** düşür — yəni bu server
dayansa da oyun tamamilə sınmır.

## İstehsala yerləşdirmə

Netlify Functions **YARAMIR**: PeerServer daimi WebSocket bağlantısı tələb edir,
funksiyalar isə vəziyyətsizdir. WebSocket dəstəkləyən hostinq lazımdır.

### Render.com (ən sadə)
1. Repo-nu bağla → **New Web Service** → Root Directory: `peerserver`
2. Build: `npm install` · Start: `node server.js`
3. Environment: `PEER_KEY=nitroverse`, `ALLOW_ORIGIN=https://<sənin-domenin>`
4. Render `https://<ad>.onrender.com` verir → oyunda:
   `VITE_PEER_HOST=<ad>.onrender.com`, `VITE_PEER_PORT=443`, `VITE_PEER_SECURE=1`

> Pulsuz plan 15 dəqiqə hərəkətsizlikdən sonra yatır (ilk otaq ~30 s gecikir).
> Onlayn rejim ciddi işlənəcəksə ödənişli plan lazımdır.

### Fly.io / Railway (Docker ilə)
```bash
fly launch --dockerfile Dockerfile --name nitroverse-peer
fly deploy
```

### Öz VPS-in
```bash
docker build -t nitroverse-peer .
docker run -d --restart=always -p 9000:9000 \
  -e PEER_KEY=nitroverse -e ALLOW_ORIGIN=https://<domen> nitroverse-peer
```
Qarşısına nginx/Caddy qoyub TLS bağla (WebSocket üçün `Upgrade` başlıqlarını ötür).

## Parametrlər

| Dəyişən | Standart | İzah |
|---|---|---|
| `PORT` | 9000 | dinləmə portu |
| `PEER_PATH` | `/peer` | broker yolu |
| `PEER_KEY` | `nitroverse` | client ilə eyni olmalıdır |
| `ALLOW_ORIGIN` | `*` | istehsalda öz domenini yaz |

## Monitorinq

`GET /health` → `{ aktiv, pik, ümumi, otaq, uptime, yaddaş }`

- `aktiv` — hazırda qoşulu peer sayı (oyunçu + otaq ID-ləri)
- `otaq` — açıq otaq sayı (`apex-drift-…` ID-ləri)
- `pik` — server qalxandan bəri maksimum

## Ölçmə (yerli test)

3 onlayn rejim × 2 oyunçu:

| Rejim | Səhnə | Maşın | Mövqe sinxronu |
|---|---|---|---|
| Yarış | GameplayScene | 2/2 | 84 m |
| Futbol | FootballScene | 6/6 | 96.5 m |
| Arena | ArenaScene | 6/6 | 59.8 m |

12 bağlantı, pik 6, 0 xəta, 66 MB RAM.
