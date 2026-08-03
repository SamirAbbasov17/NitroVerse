# NitroVerse — öz serverində qurulum

Tək prosesli server: statik faylları verir **və** `/api/{auth,rooms,social,report}`
endpointlərini işlədir. Anbar — SQLite faylı. Xarici kitabxana yoxdur
(Node 22+ daxili SQLite modulu işlədilir).

## ƏN SÜRƏTLİ YOL — bir əmr

Təmiz Ubuntu VPS-də (Node, Caddy+HTTPS, systemd, firewall, yedəkləmə,
PeerJS brokeri — hamısı avtomatik):

```bash
sudo DOMAIN=nitroverse.az RESEND_API_KEY=re_xxx bash server/deploy.sh
```

Aşağıdakı bölmələr həmin addımların əl ilə variantıdır.

## Tələblər
- Node.js 22 və ya daha yeni
- İstənilən VPS (1 vCPU / 1 GB kifayətdir)

## Qurulum

```bash
# 1) Layihəni serverə köçür və qur
npm ci
npm run build            # dist/ yaranır

# 2) Gizli açar (hesab tokenləri üçün) — BİR DƏFƏ yaradılır, dəyişmə!
export AUTH_SECRET="$(openssl rand -hex 32)"
echo "$AUTH_SECRET" > /etc/karbon.secret   # təhlükəsiz yerdə saxla

# 3) İşə sal
AUTH_SECRET="$(cat /etc/karbon.secret)" \
DB_FILE=/var/lib/karbon/karbon.db \
STATIC_DIR=./dist \
PORT=8080 \
node server/index.mjs
```

## systemd xidməti (avtomatik başlatma)

`/etc/systemd/system/karbon.service`:

```ini
[Unit]
Description=NitroVerse
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/karbon
Environment=PORT=8080
Environment=STATIC_DIR=/opt/karbon/dist
Environment=DB_FILE=/var/lib/karbon/karbon.db
EnvironmentFile=/etc/karbon.env      # AUTH_SECRET=... , RESEND_API_KEY=... , REPORT_TO=...
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now karbon
```

## Caddy ilə HTTPS (ən sadə yol)

`/etc/caddy/Caddyfile`:

```
karbon.az {
    encode gzip zstd
    reverse_proxy localhost:8080
}
```

Caddy sertifikatı avtomatik alır və yeniləyir.

## E-poçt bildirişləri

Xəta bildirişləri `/api/report` endpointinə gəlir və Resend API ilə
sahibin poçtuna göndərilir. Env dəyişənləri:

| Dəyişən | Təyinat |
|---|---|
| `RESEND_API_KEY` | resend.com açarı (olmasa bildiriş yalnız bazada qalır) |
| `REPORT_TO` | bildirişin gedəcəyi ünvan |
| `REPORT_FROM` | göndərən (domen Resend-də təsdiqlənməlidir) |

## Yedəkləmə

```bash
# Gündəlik: SQLite-ın təhlükəsiz surəti (işləyən server dayanmadan)
sqlite3 /var/lib/karbon/karbon.db ".backup '/backup/karbon-$(date +%F).db'"
find /backup -name 'karbon-*.db' -mtime +30 -delete
```

## Netlify Blobs-dan köçürmə (mövcud hesablar)

```bash
# Netlify-dan export (bir dəfə)
node server/migrate-from-netlify.mjs > dump.json
# Öz serverində import
node server/import-dump.mjs dump.json
```

## Yük tutumu

Ölçülmüş sorğu tezliyi: oyunçu başına oyunda ~4 sorğu/dəq, onlayn səhifədə
~56 sorğu/dəq. 1 vCPU-lu server SQLite ilə saniyədə minlərlə sorğu emal edir,
yəni **500+ eyni vaxtda oyunçu** rahat qarşılanır. Netlify-dakı kimi
"çağırış limiti" yoxdur — yalnız serverin öz gücü ilə məhdudlanır.
