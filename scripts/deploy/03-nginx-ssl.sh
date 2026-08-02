#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="api.hxzhineng.xyz"
EXPECTED_IP="${EXPECTED_IP:-}"
WEBROOT="/var/www/acme"
NGINX_SITE="/etc/nginx/sites-available/lejoy-ai"
CERT_DIR="/etc/nginx/ssl/${DOMAIN}"
ACME_HOME="/root/.acme.sh"
ACME="${ACME_HOME}/acme.sh"
LOG_FILE="/var/log/lejoy-ai-deploy.log"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "必须使用 root 执行 03-nginx-ssl.sh" >&2
  exit 1
fi

touch "${LOG_FILE}"
chmod 600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1
printf '[%s] D1 nginx/ssl start\n' "$(date --iso-8601=seconds)"

resolved_ip="$(getent ahostsv4 "${DOMAIN}" | awk 'NR == 1 { print $1 }')"
if [[ -z "${resolved_ip}" ]]; then
  printf '无法解析域名 %s\n' "${DOMAIN}" >&2
  exit 1
fi
if [[ -n "${EXPECTED_IP}" && "${resolved_ip}" != "${EXPECTED_IP}" ]]; then
  printf '域名解析不匹配：expected=%s actual=%s\n' "${EXPECTED_IP}" "${resolved_ip}" >&2
  exit 1
fi

install -d -m 0755 "${WEBROOT}/.well-known/acme-challenge"
cat > "${NGINX_SITE}" <<NGINX_HTTP
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 20m;

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type text/plain;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        send_timeout 120s;
    }
}
NGINX_HTTP
ln -sfn "${NGINX_SITE}" /etc/nginx/sites-enabled/lejoy-ai
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [[ ! -x "${ACME}" ]]; then
  curl -fsSL https://get.acme.sh | sh
fi
"${ACME}" --set-default-ca --server letsencrypt
issue_status=0
"${ACME}" --issue --server letsencrypt -d "${DOMAIN}" --webroot "${WEBROOT}" --keylength ec-256 || issue_status=$?
if [[ "${issue_status}" -ne 0 && "${issue_status}" -ne 2 ]]; then
  printf 'acme.sh 签发失败：exit=%s\n' "${issue_status}" >&2
  exit "${issue_status}"
fi

install -d -m 0700 "${CERT_DIR}"
touch "${CERT_DIR}/key.pem" "${CERT_DIR}/fullchain.pem"
chmod 600 "${CERT_DIR}/key.pem"
chmod 644 "${CERT_DIR}/fullchain.pem"
"${ACME}" --install-cert -d "${DOMAIN}" --ecc \
  --key-file "${CERT_DIR}/key.pem" \
  --fullchain-file "${CERT_DIR}/fullchain.pem" \
  --reloadcmd "systemctl reload nginx"

cat > "${NGINX_SITE}" <<NGINX_HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type text/plain;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        send_timeout 120s;
    }
}
NGINX_HTTPS

nginx -t
systemctl reload nginx

health="$(curl -fsS --max-time 15 "https://${DOMAIN}/api/mp/health")"
modules_status="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://${DOMAIN}/api/mp/modules")"
if [[ "${modules_status}" != "401" ]]; then
  printf '未鉴权 modules 状态异常：%s\n' "${modules_status}" >&2
  exit 1
fi
if ! crontab -l 2>/dev/null | grep -Eq '\.acme\.sh.*/acme\.sh.*--cron'; then
  printf '%s\n' "未检测到 acme.sh 自动续期 cron" >&2
  exit 1
fi

printf 'dns=%s health=%s modules_status=%s\n' "${resolved_ip}" "${health}" "${modules_status}"
printf 'certificate_enddate='
openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -enddate
printf '[%s] D1 nginx/ssl complete\n' "$(date --iso-8601=seconds)"
