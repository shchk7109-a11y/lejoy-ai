#!/usr/bin/env bash
set -Eeuo pipefail

LOG_FILE="/var/log/lejoy-ai-deploy.log"
SECRETS_FILE="/root/DEPLOY_SECRETS.txt"
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "必须使用 root 执行 01-init.sh" >&2
  exit 1
fi

touch "${LOG_FILE}"
chmod 600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1
printf '[%s] D1 server init start\n' "$(date --iso-8601=seconds)"

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates cron curl git gnupg jq nginx mysql-server openssl

timedatectl set-timezone Asia/Shanghai

node_major=""
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi
if [[ "${node_major}" != "22" ]]; then
  install -m 0755 -d /etc/apt/keyrings
  key_tmp="$(mktemp)"
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor > "${key_tmp}"
  install -m 0644 "${key_tmp}" /etc/apt/keyrings/nodesource.gpg
  rm -f "${key_tmp}"
  printf '%s\n' \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

corepack enable
corepack prepare pnpm@10.4.1 --activate
npm install --global pm2@latest

cat > /etc/mysql/mysql.conf.d/99-lejoy-bind.cnf <<'MYSQL_CONFIG'
[mysqld]
bind-address=127.0.0.1
mysqlx-bind-address=127.0.0.1
MYSQL_CONFIG
mysqld --validate-config
systemctl enable --now mysql
systemctl restart mysql
systemctl enable --now nginx
systemctl enable --now cron

if [[ ! -f "${SECRETS_FILE}" ]]; then
  install -m 0600 /dev/null "${SECRETS_FILE}"
fi
chmod 600 "${SECRETS_FILE}"
if ! grep -q '^MYSQL_LEJOY_PASSWORD=' "${SECRETS_FILE}"; then
  db_password="$(openssl rand -hex 12)"
  printf 'MYSQL_LEJOY_PASSWORD=%s\n' "${db_password}" >> "${SECRETS_FILE}"
fi
db_password="$(awk -F= '/^MYSQL_LEJOY_PASSWORD=/{print substr($0, index($0, "=") + 1); exit}' "${SECRETS_FILE}")"
if [[ ! "${db_password}" =~ ^[A-Fa-f0-9]{24}$ ]]; then
  printf '%s\n' "DEPLOY_SECRETS.txt 中的数据库密码格式无效" >&2
  exit 1
fi

mysql --protocol=socket <<SQL
CREATE DATABASE IF NOT EXISTS lejoy_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'lejoy_user'@'localhost' IDENTIFIED BY '${db_password}';
ALTER USER 'lejoy_user'@'localhost' IDENTIFIED BY '${db_password}';
GRANT ALL PRIVILEGES ON lejoy_ai.* TO 'lejoy_user'@'localhost';
FLUSH PRIVILEGES;
SQL
unset db_password

if ! swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
  fi
  chmod 600 /swapfile
  if [[ "$(blkid -p -s TYPE -o value /swapfile 2>/dev/null || true)" != "swap" ]]; then
    mkswap /swapfile
  fi
  swapon /swapfile
fi
if ! grep -qE '^/swapfile[[:space:]]' /etc/fstab; then
  printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
fi

printf 'node=%s pnpm=%s pm2=%s\n' "$(node --version)" "$(pnpm --version)" "$(pm2 --version)"
printf 'timezone=%s swap_bytes=%s\n' \
  "$(timedatectl show -p Timezone --value)" \
  "$(swapon --show=SIZE --bytes --noheadings | awk '{total += $1} END {print total + 0}')"
printf 'mysql_bind=%s secrets_mode=%s\n' \
  "$(mysql --protocol=socket -Nse "SELECT @@bind_address")" \
  "$(stat -c '%a' "${SECRETS_FILE}")"
printf '[%s] D1 server init complete\n' "$(date --iso-8601=seconds)"
