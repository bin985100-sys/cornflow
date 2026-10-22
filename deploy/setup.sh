#!/usr/bin/env bash
# Установка прокси к Supabase на чистый Ubuntu 22.04/24.04 (или Debian 12).
#
#   curl -fsSL https://raw.githubusercontent.com/bin985100-sys/cornflow/main/deploy/setup.sh | sudo bash -s -- api.cornflow.me you@example.com
#
# Перед запуском A-запись домена (api.cornflow.me) должна уже указывать на IP сервера.
set -euo pipefail

DOMAIN="${1:-api.cornflow.me}"
EMAIL="${2:-}"
UPSTREAM="${UPSTREAM:-wlfwwclmkecutiznnwtt.supabase.co}"

if [ "$(id -u)" -ne 0 ]; then echo "Запустите через sudo"; exit 1; fi
if [ -z "$EMAIL" ]; then echo "Использование: sudo bash setup.sh <домен> <email для Let's Encrypt>"; exit 1; fi

echo "==> Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot curl dnsutils

echo "==> Проверка DNS"
MYIP="$(curl -fsS4 https://ifconfig.me || true)"
DNSIP="$(dig +short A "$DOMAIN" | tail -n1)"
echo "    IP сервера: ${MYIP:-?}   $DOMAIN -> ${DNSIP:-нет записи}"
if [ -n "$MYIP" ] && [ "$MYIP" != "$DNSIP" ]; then
  echo "!!  A-запись $DOMAIN пока не указывает на этот сервер. Исправьте DNS и подождите 5–30 минут."
  exit 1
fi

echo "==> Проверка доступа к Supabase с сервера"
curl -fsS -o /dev/null -w "    https://$UPSTREAM -> HTTP %{http_code}\n" "https://$UPSTREAM/auth/v1/health" || {
  echo "!!  С этого сервера Supabase не открывается — нужен другой хостинг/регион."; exit 1; }

echo "==> Сертификат Let's Encrypt"
mkdir -p /var/www/html
cat > /etc/nginx/sites-available/acme-temp <<NGX
server { listen 80; server_name $DOMAIN; location /.well-known/acme-challenge/ { root /var/www/html; } }
NGX
ln -sf /etc/nginx/sites-available/acme-temp /etc/nginx/sites-enabled/acme-temp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot certonly --webroot -w /var/www/html -d "$DOMAIN" -m "$EMAIL" --agree-tos -n
rm -f /etc/nginx/sites-enabled/acme-temp /etc/nginx/sites-available/acme-temp

echo "==> Конфиг nginx"
# Конфиг встроен в скрипт, чтобы хватало одного файла:
#   curl -fsSL https://raw.githubusercontent.com/bin985100-sys/cornflow/main/deploy/setup.sh | sudo bash -s -- api.cornflow.me you@example.com
# (deploy/nginx-supabase-proxy.conf в репозитории — та же копия для чтения)
cat > /tmp/supabase-proxy.conf.tpl <<'NGINX_CONF'
# Обратный прокси к Supabase: api.cornflow.me -> wlfwwclmkecutiznnwtt.supabase.co
# Нужен потому, что *.supabase.co у части российских провайдеров недоступен,
# а свой домен на российском сервере открывается везде.
#
# __DOMAIN__ и __UPSTREAM__ подставляет setup.sh.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name __DOMAIN__;

    # для выпуска сертификата Let's Encrypt
    location /.well-known/acme-challenge/ { root /var/www/html; }

    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name __DOMAIN__;

    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;

    # Загрузка материалов и видео: лимит задаёт Supabase, здесь не мешаем
    client_max_body_size 0;
    proxy_request_buffering off;
    proxy_buffering off;

    # Адрес Supabase (Cloudflare) иногда меняется — перерезолвим каждые 5 минут,
    # а не один раз при старте nginx
    resolver 77.88.8.8 1.1.1.1 8.8.8.8 valid=300s ipv6=off;
    resolver_timeout 5s;
    set $supabase_upstream __UPSTREAM__;

    # Supabase сам отвечает на CORS — ничего не добавляем, только пропускаем
    location / {
        proxy_pass https://$supabase_upstream;
        proxy_http_version 1.1;

        # Supabase стоит за Cloudflare: нужен правильный Host и SNI
        proxy_set_header Host __UPSTREAM__;
        proxy_ssl_server_name on;
        proxy_ssl_name __UPSTREAM__;
        proxy_ssl_protocols TLSv1.2 TLSv1.3;

        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;

        # Realtime (/realtime/v1/websocket) — постоянное соединение
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_connect_timeout 15s;
        proxy_send_timeout    3600s;
        proxy_read_timeout    3600s;

        # Ссылки в ответах (Location при входе через Google, письма и т. п.)
        # оставляем как есть: auth-редиректы должны вести на сам Supabase.
    }

    # Быстрая проверка, что прокси жив: https://__DOMAIN__/__proxy_health
    location = /__proxy_health {
        default_type text/plain;
        return 200 "ok\n";
    }
}
NGINX_CONF
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__UPSTREAM__/$UPSTREAM/g" /tmp/supabase-proxy.conf.tpl \
  > /etc/nginx/sites-available/supabase-proxy
rm -f /tmp/supabase-proxy.conf.tpl
ln -sf /etc/nginx/sites-available/supabase-proxy /etc/nginx/sites-enabled/supabase-proxy
nginx -t && systemctl reload nginx

# certbot сам продлевает сертификат; после продления перечитываем nginx
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx

# Файрвол, если включён
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80,443/tcp; fi

echo "==> Проверка"
sleep 1
curl -fsS "https://$DOMAIN/__proxy_health"
curl -fsS -o /dev/null -w "    https://$DOMAIN/auth/v1/health -> HTTP %{http_code} (401 — нормально, ключа нет)\n" \
  "https://$DOMAIN/auth/v1/health" || true

echo
echo "Готово. Теперь в GitHub: Settings -> Secrets and variables -> Actions -> Variables"
echo "  VITE_SUPABASE_URL = https://$DOMAIN"
echo "и перезапустите сборку (Actions -> Deploy -> Run workflow)."
