#!/usr/bin/env bash
# NitroVerse — təmiz Ubuntu VPS-də bir əmrlik qurulum.
#
#   sudo DOMAIN=nitroverse.az bash server/deploy.sh
#
# Nə edir: Node 22, Caddy (avtomatik HTTPS), oyun serveri (statik + /api/*),
# PeerJS brokeri (/peer), firewall, gündəlik yedəkləmə, avtomatik restart.
# Təkrar işlədilə bilər — mövcud quraşdırmanı pozmur (idempotent).
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN verilməyib — məsələn: sudo DOMAIN=nitroverse.az bash server/deploy.sh}"
APP_DIR="${APP_DIR:-/opt/nitroverse}"
DATA_DIR="${DATA_DIR:-/var/lib/nitroverse}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nitroverse}"
PORT="${PORT:-8080}"
PEER_PORT="${PEER_PORT:-9000}"
PEER_KEY="${PEER_KEY:-nitroverse}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "root ilə işlədilməlidir (sudo)"; exit 1; }

say "1/8 · Sistem paketləri"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg sqlite3 ufw rsync >/dev/null

say "2/8 · Node.js 22+ (daxili SQLite modulu üçün şərtdir)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

say "3/8 · Caddy (avtomatik Let's Encrypt sertifikatı)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

say "4/8 · Kodun yerləşdirilməsi → $APP_DIR"
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
rsync -a --delete \
  --exclude node_modules --exclude .git --exclude dist --exclude .netlify \
  "$SRC_DIR/" "$APP_DIR/"
cd "$APP_DIR"
npm ci --omit=dev --silent 2>/dev/null || npm install --silent
npm install --silent --no-save vite >/dev/null 2>&1 || true
npm run build --silent
(cd peerserver && npm install --omit=dev --silent)

say "5/8 · Gizli açar (hesab tokenləri) — BİR DƏFƏ yaradılır"
# DİQQƏT: bu açar dəyişsə BÜTÜN oyunçuların girişi etibarsız olur
if [ ! -f /etc/nitroverse.env ]; then
  umask 077
  {
    echo "AUTH_SECRET=$(openssl rand -hex 32)"
    echo "REPORT_TO=abbasovsamir718@gmail.com"
    echo "REPORT_FROM=NitroVerse <bildiris@${DOMAIN}>"
    [ -n "${RESEND_API_KEY:-}" ] && echo "RESEND_API_KEY=${RESEND_API_KEY}"
  } > /etc/nitroverse.env
  echo "yaradıldı: /etc/nitroverse.env  (YEDƏKLƏ!)"
else
  echo "mövcuddur — toxunulmadı"
fi
chmod 600 /etc/nitroverse.env

say "6/8 · systemd xidmətləri"
cat > /etc/systemd/system/nitroverse.service <<EOF
[Unit]
Description=NitroVerse — oyun serveri (statik + API)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
Environment=STATIC_DIR=$APP_DIR/dist
Environment=DB_FILE=$DATA_DIR/nitroverse.db
EnvironmentFile=/etc/nitroverse.env
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=3
# Təhlükəsizlik: proses yalnız öz qovluqlarına yaza bilər
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/nitroverse-peer.service <<EOF
[Unit]
Description=NitroVerse — PeerJS signaling brokeri
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/peerserver
Environment=PORT=$PEER_PORT
Environment=PEER_KEY=$PEER_KEY
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now nitroverse nitroverse-peer >/dev/null
systemctl restart nitroverse nitroverse-peer

say "7/8 · Caddy: HTTPS + marşrutlar"
# Serverin öz IP-si: domen DNS-də hazır olmasa da oyunu sınamaq üçün
# http://IP açıq qalır (sertifikat yalnız domen üçün alınır)
SERVER_IP="$(curl -4 -s --max-time 8 https://api.ipify.org || hostname -I | awk '{print $1}')"
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN}, www.${DOMAIN} {
    encode zstd gzip

    # Onlayn rejim: PeerJS brokeri (WebSocket).
    # DİQQƏT: prefiks KƏSİLMİR — broker express-də məhz /peer altında
    # qurulub (peerserver/server.js → app.use(PATH, peerServer)).
    # Kəsdikdə klient ws://host/peer/peerjs-ə çıxır, broker isə /peerjs
    # görüb 404 verirdi (onlayn rejim işləmirdi).
    handle /peer/health {
        uri strip_prefix /peer
        reverse_proxy localhost:${PEER_PORT}
    }
    handle /peer/* {
        reverse_proxy localhost:${PEER_PORT}
    }

    # Oyun serveri: statik fayllar + /api/*
    handle {
        reverse_proxy localhost:${PORT}
    }

    # Musiqi/modellər dəyişmir — brauzer keşi uzun saxlasın
    @statik path /music/* /models/* /assets/*
    header @statik Cache-Control "public, max-age=31536000, immutable"
    header /*.html Cache-Control "no-cache"
}

# DNS hazır olmadan sınaq üçün (domen işləyəndən sonra silinə bilər)
http://${SERVER_IP} {
    encode zstd gzip
    handle /peer/health {
        uri strip_prefix /peer
        reverse_proxy localhost:${PEER_PORT}
    }
    handle /peer/* {
        reverse_proxy localhost:${PEER_PORT}
    }
    handle {
        reverse_proxy localhost:${PORT}
    }
}
EOF
caddy validate --config /etc/caddy/Caddyfile >/dev/null && systemctl restart caddy

say "8/8 · Firewall + gündəlik yedəkləmə"
ufw allow OpenSSH >/dev/null; ufw allow 80,443/tcp >/dev/null
ufw --force enable >/dev/null
cat > /etc/cron.daily/nitroverse-backup <<EOF
#!/bin/sh
# İşləyən server dayandırılmadan təhlükəsiz surət
sqlite3 $DATA_DIR/nitroverse.db ".backup '$BACKUP_DIR/db-\$(date +%F).db'"
cp /etc/nitroverse.env $BACKUP_DIR/env-\$(date +%F).bak
find $BACKUP_DIR -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/nitroverse-backup

say "HAZIRDIR"
sleep 2
echo "oyun serveri : $(systemctl is-active nitroverse)"
echo "peer brokeri : $(systemctl is-active nitroverse-peer)"
echo "caddy        : $(systemctl is-active caddy)"
echo
echo "Sayt      : https://${DOMAIN}"
echo "Peer      : wss://${DOMAIN}/peer  (açar: ${PEER_KEY})"
echo "Sağlamlıq : curl https://${DOMAIN}/peer/health"
echo
echo "Növbəti addım — köhnə hesabları köçür:"
echo "  node $APP_DIR/server/import-dump.mjs dump.json"
