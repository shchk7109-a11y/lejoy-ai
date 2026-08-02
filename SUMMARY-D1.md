# D1 生产部署与体验版摘要

## 目标

将 `codex/m4-release-ready` 部署到阿里云 ECS，通过 `https://api.hxzhineng.xyz` 提供小程序 API，并生成指向生产 API 的微信体验版构建产物。

## 完成状态

- 部署脚本与管理员积分 CLI：已实现并验证。
- ECS 初始化、应用发布、MySQL 迁移、PM2 单实例、Nginx/HTTPS：已完成。
- 微信小程序生产地址构建：已完成，产物位于 `miniprogram/dist`。
- 用户侧上传体验版与真机确认：待用户按第五节清单执行。

## 交付文件

- `scripts/deploy/01-init.sh`
- `scripts/deploy/02-deploy.sh`
- `scripts/deploy/03-nginx-ssl.sh`
- `scripts/deploy/ecosystem.config.cjs`
- `scripts/admin-credits.ts`
- `docs/部署记录-D1.md`
- `SUMMARY-D1.md`

## 安全约束

- `.env` 仅通过 `scp` 传输到服务器，不进入 Git。
- 数据库密码仅服务器生成，保存于 `/root/DEPLOY_SECRETS.txt`，权限 `600`。
- PM2 固定为 `fork` 单实例。
- 体验期 `CONTENT_SECURITY=off`，且生产 `.env` 不包含 `MP_MOCK_LOGIN`。
- 文档、提交、部署日志和对话均不得包含密钥或密码。

## 部署结果

- 公网健康检查：`200`，响应 `{"ok":true,"version":"1.0.0"}`。
- 未鉴权 modules：`401`。
- HTTP 跳转：`301` 到 HTTPS。
- PM2：单个 `fork_mode` 进程在线，`pm2-root` 已启用开机自启。
- MySQL：仅监听 `127.0.0.1`，生产迁移已应用，`lejoy_ai` 共 6 张表（含迁移元数据表）。
- HTTPS：Let's Encrypt 证书有效，acme.sh 自动续期 cron 已验证。
- CLI：生产库 `list` 实跑并正常退出；当前尚无用户，因此未向生产库写入虚构充值记录。
- 小程序：任务书指定命令构建成功；生产 API 命中 1 个产物文件，本地 API 命中 0。
- 部署日志：服务器 `/var/log/lejoy-ai-deploy.log`（权限 `600`）。

## 用户待办

按 `docs/部署记录-D1.md` 的“微信后台待办清单”执行上传体验版、添加体验成员、配置合法域名和真机验收。
