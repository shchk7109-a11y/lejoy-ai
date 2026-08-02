#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/lejoy-ai"
BRANCH="codex/m4-release-ready"
REPOSITORY="https://github.com/shchk7109-a11y/lejoy-ai.git"
GIT_BUNDLE_PATH="${GIT_BUNDLE_PATH:-}"
ENV_FILE="${APP_DIR}/.env"
SECRETS_FILE="/root/DEPLOY_SECRETS.txt"
LOG_FILE="/var/log/lejoy-ai-deploy.log"
MODE="${1:-deploy}"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "必须使用 root 执行 02-deploy.sh" >&2
  exit 1
fi
if [[ "${MODE}" != "deploy" && "${MODE}" != "--prepare" ]]; then
  printf '%s\n' "用法：02-deploy.sh [--prepare]" >&2
  exit 1
fi

touch "${LOG_FILE}"
chmod 600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1
printf '[%s] D1 app deploy start mode=%s\n' "$(date --iso-8601=seconds)" "${MODE}"

install -d -m 0755 /opt
fetch_source="${REPOSITORY}"
if [[ -n "${GIT_BUNDLE_PATH}" ]]; then
  if [[ ! -f "${GIT_BUNDLE_PATH}" ]]; then
    printf 'Git bundle 不存在：%s\n' "${GIT_BUNDLE_PATH}" >&2
    exit 1
  fi
  bundle_verify_dir="$(mktemp -d)"
  git init --bare "${bundle_verify_dir}" >/dev/null
  git -C "${bundle_verify_dir}" bundle verify "${GIT_BUNDLE_PATH}"
  rm -rf -- "${bundle_verify_dir}"
  fetch_source="${GIT_BUNDLE_PATH}"
fi
if [[ ! -d "${APP_DIR}/.git" ]]; then
  if [[ -e "${APP_DIR}" ]]; then
    printf '%s\n' "${APP_DIR} 已存在但不是 Git 仓库，停止部署" >&2
    exit 1
  fi
  git clone --branch "${BRANCH}" --single-branch "${fetch_source}" "${APP_DIR}"
  git -C "${APP_DIR}" remote set-url origin "${REPOSITORY}"
else
  cd "${APP_DIR}"
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    printf '%s\n' "生产仓库存在未提交的受跟踪文件修改，停止部署" >&2
    exit 1
  fi
  git fetch "${fetch_source}" "${BRANCH}:refs/remotes/origin/${BRANCH}"
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git checkout "${BRANCH}"
  else
    git checkout --track -b "${BRANCH}" "origin/${BRANCH}"
  fi
  git merge --ff-only "origin/${BRANCH}"
fi

cd "${APP_DIR}"
local_revision="$(git rev-parse HEAD)"
remote_revision="$(git rev-parse "origin/${BRANCH}")"
if [[ "${local_revision}" != "${remote_revision}" ]]; then
  printf '生产仓库提交与远端不一致：local=%s remote=%s\n' "${local_revision}" "${remote_revision}" >&2
  exit 1
fi
printf 'revision=%s\n' "${local_revision}"
if [[ "${MODE}" == "--prepare" ]]; then
  printf '%s\n' "代码目录已准备；请将本地 .env 安全传到 /opt/lejoy-ai/.env 后重新运行本脚本"
  exit 0
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  printf '%s\n' "缺少 ${ENV_FILE}；请先通过 scp 传输本地 .env" >&2
  exit 1
fi
if [[ ! -f "${SECRETS_FILE}" ]]; then
  printf '%s\n' "缺少 ${SECRETS_FILE}；请先运行 01-init.sh" >&2
  exit 1
fi
chmod 600 "${ENV_FILE}" "${SECRETS_FILE}"

db_password="$(awk -F= '/^MYSQL_LEJOY_PASSWORD=/{print substr($0, index($0, "=") + 1); exit}' "${SECRETS_FILE}")"
if [[ ! "${db_password}" =~ ^[A-Fa-f0-9]{24}$ ]]; then
  printf '%s\n' "服务器数据库密码缺失或格式无效" >&2
  exit 1
fi
database_url="mysql://lejoy_user:${db_password}@127.0.0.1:3306/lejoy_ai"

set_env_value() {
  local key="$1"
  local value="$2"
  local temp_file
  temp_file="$(mktemp)"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" {
      if (!found) print key "=" value
      found = 1
      next
    }
    { print }
    END { if (!found) print key "=" value }
  ' "${ENV_FILE}" > "${temp_file}"
  install -m 0600 "${temp_file}" "${ENV_FILE}"
  rm -f "${temp_file}"
}

set_env_value NODE_ENV production
set_env_value DATABASE_URL "${database_url}"
set_env_value CONTENT_SECURITY off
env_temp="$(mktemp)"
awk '!/^[[:space:]]*(export[[:space:]]+)?MP_MOCK_LOGIN[[:space:]]*=/' "${ENV_FILE}" > "${env_temp}"
install -m 0600 "${env_temp}" "${ENV_FILE}"
rm -f "${env_temp}"
unset db_password

require_env_value() {
  local key="$1"
  if ! awk -v key="${key}" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      if (length(value) > 0) found = 1
    }
    END { exit(found ? 0 : 1) }
  ' "${ENV_FILE}"; then
    printf '生产环境变量 %s 缺失\n' "${key}" >&2
    exit 1
  fi
}

for key in \
  NODE_ENV DATABASE_URL JWT_SECRET WECHAT_MINI_APPID WECHAT_MINI_SECRET \
  MOONSHOT_API_KEY ARK_API_KEY DASHSCOPE_API_KEY \
  S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PUBLIC_BASE_URL; do
  require_env_value "${key}"
done
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?MP_MOCK_LOGIN[[:space:]]*=' "${ENV_FILE}"; then
  printf '%s\n' "生产 .env 不得包含 MP_MOCK_LOGIN" >&2
  exit 1
fi

corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install --frozen-lockfile
NODE_ENV=production pnpm build
DATABASE_URL="${database_url}" pnpm db:push
unset database_url

pm2 startOrReload "${APP_DIR}/scripts/deploy/ecosystem.config.cjs" --only lejoy-ai --update-env
pm2 save --force
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

for _attempt in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/mp/health >/tmp/lejoy-health.json; then
    break
  fi
  sleep 1
done
if [[ ! -s /tmp/lejoy-health.json ]]; then
  printf '%s\n' "本机健康检查失败" >&2
  pm2 logs lejoy-ai --lines 50 --nostream
  exit 1
fi

pm2 jlist | node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const apps = JSON.parse(input).filter(app => app.name === "lejoy-ai");
    if (apps.length !== 1 || apps[0].pm2_env.exec_mode !== "fork_mode" || apps[0].pm2_env.status !== "online") {
      process.exit(1);
    }
    console.log(`pm2_processes=${apps.length} mode=${apps[0].pm2_env.exec_mode} status=${apps[0].pm2_env.status}`);
  });
'
printf 'health='
cat /tmp/lejoy-health.json
printf '\n[%s] D1 app deploy complete\n' "$(date --iso-8601=seconds)"
