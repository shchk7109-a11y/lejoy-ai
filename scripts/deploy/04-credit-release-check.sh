#!/usr/bin/env bash
# 积分兑换发布前的独立数据库验证与生产备份；不触发生产迁移或服务重启。
set -Eeuo pipefail
umask 077

APP_DIR="/opt/lejoy-ai"
TEST_DB="lejoy_ai_credit_test"
TEST_USER="lejoy_credit_test"
TEST_PASSWORD_FILE="/root/.lejoy-ai/credit-test-db-password"
BACKUP_DIR="/root/lejoy-ai-backups"
MODE="${1:---test}"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "必须使用 root 执行" >&2
  exit 1
fi
if [[ ! -d "${APP_DIR}/.git" ]]; then
  printf '%s\n' "生产代码目录不存在" >&2
  exit 1
fi
if [[ "${MODE}" != "--test" && "${MODE}" != "--backup" ]]; then
  printf '%s\n' "用法：04-credit-release-check.sh [--test|--backup]" >&2
  exit 1
fi

cd "${APP_DIR}"
if [[ "${MODE}" == "--test" ]]; then
  install -d -m 0700 "$(dirname "${TEST_PASSWORD_FILE}")"
  if [[ ! -e "${TEST_PASSWORD_FILE}" ]]; then
    printf '%s' "$(openssl rand -hex 24)" > "${TEST_PASSWORD_FILE}"
  fi
  chmod 600 "${TEST_PASSWORD_FILE}"
  test_password="$(<"${TEST_PASSWORD_FILE}")"
  if [[ ! "${test_password}" =~ ^[a-f0-9]{48}$ ]]; then
    printf '%s\n' "独立测试库密码格式无效" >&2
    exit 1
  fi

  mysql --protocol=socket <<SQL
CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${TEST_USER}'@'localhost' IDENTIFIED BY '${test_password}';
ALTER USER '${TEST_USER}'@'localhost' IDENTIFIED BY '${test_password}';
GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '${TEST_USER}'@'localhost';
CREATE USER IF NOT EXISTS '${TEST_USER}'@'127.0.0.1' IDENTIFIED BY '${test_password}';
ALTER USER '${TEST_USER}'@'127.0.0.1' IDENTIFIED BY '${test_password}';
GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '${TEST_USER}'@'127.0.0.1';
SQL

  test_url="mysql://${TEST_USER}:${test_password}@127.0.0.1:3306/${TEST_DB}"
  # 只在命令进程内传入测试库 URL；错误输出也屏蔽密码，不写入生产 .env。
  set +e
  DATABASE_URL="${test_url}" pnpm exec drizzle-kit migrate 2>&1 | sed -u "s/${test_password}/[REDACTED]/g"
  migrate_status=${PIPESTATUS[0]}
  set -e
  if [[ "${migrate_status}" -ne 0 ]]; then exit "${migrate_status}"; fi

  set +e
  TEST_DATABASE_URL="${test_url}" pnpm exec vitest run server/credits/redeem.integration.test.ts 2>&1 | sed -u "s/${test_password}/[REDACTED]/g"
  test_status=${PIPESTATUS[0]}
  set -e
  unset test_url test_password
  if [[ "${test_status}" -ne 0 ]]; then exit "${test_status}"; fi
  printf 'independent_test_database=%s integration=passed\n' "${TEST_DB}"
  exit 0
fi

install -d -m 0700 "${BACKUP_DIR}"
revision="$(git rev-parse --short HEAD)"
backup_file="${BACKUP_DIR}/pre-credit-${revision}.sql.gz"
if [[ ! -e "${backup_file}" ]]; then
  backup_temp="$(mktemp "${BACKUP_DIR}/.pre-credit-${revision}.XXXXXX")"
  trap 'rm -f -- "${backup_temp}"' EXIT
  mysqldump --protocol=socket --single-transaction --quick --routines --triggers \
    --no-tablespaces --set-gtid-purged=OFF lejoy_ai | gzip -9 > "${backup_temp}"
  gzip -t "${backup_temp}"
  chmod 600 "${backup_temp}"
  mv -- "${backup_temp}" "${backup_file}"
  trap - EXIT
fi
gzip -t "${backup_file}"
if [[ ! -s "${backup_file}" || "$(stat -c '%a' "${backup_file}")" != "600" ]]; then
  printf '%s\n' "生产备份文件为空或权限不安全" >&2
  exit 1
fi
printf 'production_backup=%s bytes=%s sha256=%s\n' \
  "${backup_file}" "$(stat -c '%s' "${backup_file}")" "$(sha256sum "${backup_file}" | awk '{print $1}')"
