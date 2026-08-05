# 体验二维码旧路径兼容设计

日期：2026-08-05  
分支：`codex/m4-release-ready`

## 1. 问题与证据

微信公众平台当前体验二维码的启动路径是 `pages/index/index`，而生产构建的
`app.json` 只声明了 `pages/login/index` 等页面，没有 `pages/index/index`。
扫码时微信无法加载目标页面，因此体验成员看到白屏。同期公网健康检查正常，
服务端也存在成功的小程序请求，故问题位于体验包启动路径，不在生产 API。

## 2. 目标

- 让现有指向 `pages/index/index` 的体验二维码可以正常进入登录界面。
- 保持 `pages/login/index` 为默认首屏，不改变已有登录、登录态跳转或退出流程。
- 在自动化测试和生产构建中防止兼容入口被误删。

## 3. 方案

在 `app.config.ts` 的页面清单末尾增加 `pages/index/index`，并新增同路径页面。
兼容页面直接渲染现有 `LoginPage`，不复制登录逻辑，也不增加额外接口请求。

页面放在清单末尾，保证正常冷启动仍进入 `pages/login/index`；只有二维码或旧链接
明确指定 `pages/index/index` 时才走兼容入口。已有登录态仍由 `LoginPage` 内部逻辑
跳转到首页。

## 4. 测试与发布

1. 先增加失败测试，断言 `app.config.ts` 声明 `pages/index/index`，并且兼容页面复用
   登录页而不是复制登录代码。
2. 实现最小兼容页面后运行针对性测试、完整测试和 TypeScript 检查。
3. 执行 `pnpm --dir miniprogram build:weapp:prod`，确认生产域名命中且
   `127.0.0.1` 为零，并检查产物包含 `pages/index/index` 的 JS/JSON/WXML；登录样式
   被 Taro 抽取到 `common.wxss` 时，确认 `app.wxss` 引用公共样式且其中存在
   `.login-page`。
4. 提交并推送 `codex/m4-release-ready`。本次仅有小程序代码变更，无需服务器部署。
5. 上传新体验版后，分别验证旧路径二维码和正常启动路径。

## 5. 非目标

- 不迁移或重命名 `pages/login/index`。
- 不修改微信登录、鉴权、API 地址或服务器配置。
- 不改动 `miniprogram/project.config.json`、`project.private.config.json` 等用户本地配置。
