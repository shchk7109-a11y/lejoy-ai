import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function deployFile(name: string): string {
  const url = new URL(`../scripts/deploy/${name}`, import.meta.url);
  expect(existsSync(url), `${name} 必须存在`).toBe(true);
  return readFileSync(url, "utf8");
}

describe("D1 部署脚本契约", () => {
  it("仓库根目录暴露任务书指定的小程序构建命令", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["build:weapp"]).toBe(
      "pnpm --dir miniprogram build:weapp"
    );
  });

  it("01-init 初始化系统、数据库密钥与 2G swap", () => {
    const source = deployFile("01-init.sh");
    expect(source).toContain("set -Eeuo pipefail");
    expect(source).toContain("apt-get upgrade -y");
    expect(source).toContain("Asia/Shanghai");
    expect(source).toContain("/root/DEPLOY_SECRETS.txt");
    expect(source).toContain("chmod 600");
    expect(source).toContain("openssl rand -hex 12");
    expect(source).toContain("bind-address=127.0.0.1");
    expect(source).toContain("CREATE DATABASE IF NOT EXISTS lejoy_ai");
    expect(source).toContain("fallocate -l 2G /swapfile");
    expect(source).toContain("blkid -p -s TYPE -o value /swapfile");
    expect(source).toContain("systemctl enable --now cron");
  });

  it("02-deploy 固定分支、生产环境、迁移与 PM2 配置", () => {
    const source = deployFile("02-deploy.sh");
    expect(source).toContain("codex/m4-release-ready");
    expect(source).toContain("NODE_ENV");
    expect(source).toContain("DATABASE_URL");
    expect(source).toContain("CONTENT_SECURITY");
    expect(source).toContain("MP_MOCK_LOGIN");
    expect(source).toContain("(export[[:space:]]+)?MP_MOCK_LOGIN[[:space:]]*=");
    expect(source).toContain("local_revision");
    expect(source).toContain("remote_revision");
    expect(source).toContain("GIT_BUNDLE_PATH");
    expect(source).toContain("git init --bare");
    expect(source).toContain('git -C "${bundle_verify_dir}" bundle verify');
    expect(source).toContain('git fetch "${fetch_source}"');
    expect(source).toContain("pnpm install --frozen-lockfile");
    expect(source).toContain("pnpm build");
    expect(source).toContain("pnpm db:push");
    expect(source).toContain("pm2 startOrReload");

    const ecosystem = deployFile("ecosystem.config.cjs");
    expect(ecosystem).toContain('exec_mode: "fork"');
    expect(ecosystem).toContain("instances: 1");
  });

  it("03-nginx-ssl 配置代理限制、HTTPS 与自动续期安装路径", () => {
    const source = deployFile("03-nginx-ssl.sh");
    expect(source).toContain("client_max_body_size 20m");
    expect(source).toContain("proxy_read_timeout 120s");
    expect(source).toContain("--server letsencrypt");
    expect(source).toContain("--webroot");
    expect(source).toContain("--install-cert");
    expect(source).toContain("issue_status=0");
    expect(source).toContain('"${issue_status}" -ne 2');
    expect(source).toContain("grep -Eq");
    expect(source).toContain("return 301 https://");
    expect(source).toContain("/api/mp/health");
    expect(source).toContain("/api/mp/modules");
    expect(source).toContain('--resolve "${DOMAIN}:443:127.0.0.1"');
    expect(source).toContain("for _attempt in {1..15}");
    expect(source).toContain("本机 HTTPS 健康检查失败");
  });
});
