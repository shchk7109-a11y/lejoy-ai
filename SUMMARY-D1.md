# D1 生产部署与体验版摘要

## 目标

将 `codex/m4-release-ready` 部署到阿里云 ECS，通过 `https://api.hxzhineng.xyz` 提供小程序 API，并生成指向生产 API 的微信体验版构建产物。

## 当前状态

- 部署脚本与管理员积分 CLI：已实现，待完成全量本地验证。
- ECS 初始化、应用发布、Nginx/HTTPS：待执行。
- 微信小程序生产地址构建：待执行。
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

待实际部署后回填。

## 用户待办

待实际构建完成后，按 `docs/部署记录-D1.md` 的“微信后台待办清单”执行上传体验版、添加体验成员、配置合法域名和真机验收。
