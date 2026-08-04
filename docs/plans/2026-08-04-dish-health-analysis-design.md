# 生活助手“菜品健康分析”改版设计

## 1. 目标与边界

本轮把小程序“生活助手”收敛为两个清晰入口：

- **菜品健康分析**：同一个输入区支持输入菜名、粘贴抖音分享内容、语音说菜名，也支持拍照或从相册选菜品图片。
- **识花草**：保留现有能力与计费规则。

菜品分析解决“老人从短视频学做菜，但不知道营养和更健康吃法”的问题。结果是食物营养层面的估算与建议，不做疾病诊断、用药建议或个体化医疗判断。

本轮不新增数据库表，不修改 `server/ai/gateway.ts`，不保存分析历史，也不抓取或破解受限制的抖音内容。

## 2. 方案选择

采用单一编排接口 `POST /api/mp/life/dish-analyze`，由服务端完成输入判断、菜名识别、公开网页降级、视觉拆解、营养分析和计费。

没有采用“识别接口 + 分析接口”两阶段方案，因为它会让客户端承担中间状态、计费和幂等协调；也没有由客户端抓取抖音页面，因为小程序域名、安全与跨域约束不适合承担该职责。

## 3. 小程序交互

### 3.1 入口页

入口页显示两张适老化大卡：

1. `菜品健康分析`：说明“输入菜名、粘贴分享内容，或拍一道菜”。
2. `识花草`：沿用拍照识别说明。

移除“查菜谱”和“健康百科”入口。菜谱查询的菜名输入能力并入菜品健康分析。

### 3.2 菜品分析输入页

同一页面提供：

- 一个大字输入框，提示“输入菜名，或粘贴抖音分享内容”；最大 1000 字，以容纳分享文案。
- `VoiceInput` 语音按钮，识别结果回填同一输入框。
- `开始分析`暖橙色全宽主按钮，高度不低于 108rpx、字号不低于 40rpx。
- `拍一道菜`和`从相册选择`两个大按钮。

文字与图片二选一提交。用户选图后展示原图预览，再自动进入分析；不把链接、菜名和语音拆成不同步骤。

### 3.3 未识别状态

接口返回 `code: "DISH_NOT_FOUND"` 时，不进入全局错误页。页面在输入区上方显示：

> 没认出这道菜，请说一下菜名，或拍张照片

同时自动聚焦输入框并保留原输入，方便用户补充菜名。该状态不是系统失败，不扣积分，也不显示“服务器忙不过来”。

### 3.4 结果页

结果页沿用参考图的信息密度，但按现有设计令牌和适老化尺寸重绘，顺序如下：

1. 菜品图、菜名、健康指数大数字与文字标签。
2. `营养估算口径`，明确数据按“每 100 克”或“常见一份”估算。
3. 六格营养：热量、蛋白质、脂肪、碳水、钠、糖。
4. `重点关注`：最多 4 条，区分“值得肯定”和“需要留意”，说明高盐、高油、高糖或蛋白质等真正影响选择的原因。
5. 食材拆解：原材料、配料、调味料三组，空组显示“未识别到”，不混成标签。
6. 营养概述。
7. `更健康的吃法`：分为烹饪调整和一餐搭配，提供可执行建议。
8. 固定估算与医疗免责声明。
9. `AigcBadge`。

文字路径优先展示 `generateFoodImage` 生成的菜品图；图片生成失败不让已经完成的营养分析整体失败，前端显示无图占位。拍照路径始终展示用户原图并使用 `aspectFit`，避免拉伸变形。

## 4. 接口与数据结构

### 4.1 请求

```ts
type DishAnalyzeRequest =
  | { dishText: string; fileKey?: never }
  | { fileKey: string; dishText?: never };
```

服务端要求恰好提供一种输入：

- `dishText`：去除首尾空格后 1–1000 字。
- `fileKey`：只接受当前用户上传且已完成安全登记、未判定为风险的图片。

### 4.2 成功响应

```ts
type DishAnalyzeSuccess = {
  code: "OK";
  title: string;
  imageUrl?: string;
  imageSource: "generated" | "upload" | "none";
  healthScore: number;
  scoreLabel: string;
  portionBasis: string;
  nutrition: {
    calories: string;
    protein: string;
    fat: string;
    carbs: string;
    sodium: string;
    sugar: string;
  };
  ingredients: {
    primary: string[];
    secondary: string[];
    seasonings: string[];
  };
  overview: string;
  attentionPoints: Array<{
    kind: "positive" | "caution";
    title: string;
    detail: string;
  }>;
  cookingTips: string[];
  pairingTips: string[];
  disclaimer: string;
  tags: string[];
  securityStatus?: "bypassed" | "pending";
  credits: number;
};
```

所有数组、数值和字符串在服务端做运行时校验与数量限制，防止模型返回异常结构直接进入界面。

### 4.3 未识别响应

```ts
type DishAnalyzeNotFound = {
  code: "DISH_NOT_FOUND";
  message: "没认出这道菜，请说一下菜名，或拍张照片";
  credits: number;
};
```

使用 HTTP 200 返回，避免被小程序通用请求层归类为服务故障。其他参数错误、内容安全拒绝、模型故障仍使用现有错误协议。

## 5. 服务端识别与生成链路

### 5.1 文字路径

1. 对输入执行现有文字安全检查，不记录输入原文。
2. DeepSeek 以 JSON 对象 `{ "dishName": string | null }` 从完整分享文案或菜名中提取标准菜名。
3. 如果没有提取到菜名且文本包含合法 `https://v.douyin.com/...` 链接，抓取公开网页元数据。
4. 将网页 `<title>`、`description`、`og:title`、`og:description` 的有限长度文本再次交给 DeepSeek 提取菜名。
5. 仍无菜名则返回 `DISH_NOT_FOUND`，不进入计费函数。
6. 已有菜名后，在 `withCreditCharge` 内调用 DeepSeek 生成营养 JSON；同时尝试生成菜品图。

DeepSeek JSON 模式只要求返回对象，不使用裸数组，避免与 `json_object` 模式冲突。

### 5.2 抖音公开页面抓取约束

- 只识别 HTTPS 的 `v.douyin.com` 短链接。
- 初始地址和每次重定向后的地址都必须属于抖音官方域名；不请求任意用户域名或内网地址。
- 使用普通浏览器 User-Agent，不携带 Cookie，不模拟登录，不破解验证码或访问限制。
- 总超时 5 秒，限制重定向次数和响应体大小，只接受 HTML。
- 仅提取公开标题与描述，失败时静默进入未识别结果；日志只记录阶段、耗时、状态和 traceId，不记录 URL 查询参数、标题或用户原文。
- 抓取函数通过依赖注入传入路由，测试中完全使用 mock，不访问真实抖音。

### 5.3 图片路径

1. 复用现有 `resolveOwnedImage` 校验用户图片。
2. Kimi 视觉返回 JSON 对象，包含菜名以及原材料、配料、调味料三类清单。
3. 没有识别到菜名时返回 `DISH_NOT_FOUND`，不扣积分。
4. 识别成功后，在 `withCreditCharge` 内把菜名和食材拆解交给 DeepSeek，生成统一营养结果。
5. 结果使用原上传图，不额外生成图片。

### 5.4 计费与失败语义

- 菜名识别、公开标题抓取和图片识别均在计费函数之前完成。
- 只有确认菜名后才调用 `withCreditCharge(userId, 1, "life_dish_analyze", ...)`。
- 营养生成失败由现有补偿逻辑自动退分。
- 菜品图属于附加展示；生成失败不影响营养结果，也不触发重复扣分。
- 生成类请求继续使用 `x-idempotency-key`，前端不自动重试。

## 6. 代码组织

- 新增 `server/dish-analysis.ts`：模型提示词、结果解析校验、菜名提取、营养生成和抖音元数据抓取。
- `server/mp/m3-routes.ts`：注册 `/life/dish-analyze`，处理所有权、安全检查、计费、生成图片存储与响应组装。
- `server/minimaxService.ts`：保留现有函数供 H5/兼容路径使用；新链路使用独立的强类型结构，避免扩大旧接口风险。
- `miniprogram/src/services/api.ts`：新增菜品分析请求/响应类型与方法。
- `miniprogram/src/pages/life-assistant/`：重构入口、输入、未识别状态和结果卡。
- `server/mp/modules.ts`：把生活助手描述更新为“菜品健康分析、识花草”。

旧 `/life/recipe` 与 `/life/health` 暂时保留，避免破坏仍可能存在的旧体验包；新版小程序不再调用它们。

## 7. 测试与验收

### 7.1 服务端单元测试

- 分享文案直接提取菜名，不抓网页。
- 首次未提取、合法抖音短链抓取标题后识别成功。
- 抓取超时、非 HTML、非法域名或再次未识别时返回 `DISH_NOT_FOUND`。
- `DISH_NOT_FOUND` 不调用 `withCreditCharge`。
- 图片识别成功时 Kimi 食材拆解传给 DeepSeek，返回原图。
- 图片未识别不扣分。
- 营养 JSON 字段、数组长度、健康指数范围与免责声明校验。
- 文字路径生成图失败仍返回营养结果。
- 不记录用户输入原文。

### 7.2 小程序回归测试

- 入口只显示“菜品健康分析”和“识花草”。
- 同一输入框支持文字、链接和语音回填。
- 拍照与相册按钮均可用。
- 未识别状态显示指定大字提示并聚焦输入框，不显示全局错误页。
- 结果页包含六格营养、三组食材、重点关注、更健康的吃法、免责声明与 `AigcBadge`。
- 图片使用不变形的显示模式，所有字号、按钮高度和点击区满足现有适老化令牌。

### 7.3 发布流程

1. 运行相关 Vitest 与完整 `pnpm test`。
2. 运行 `pnpm build:weapp:prod`，产物 API 地址校验必须通过。
3. 提交并推送 `codex/m4-release-ready`。
4. SSH 执行 `scripts/deploy/02-deploy.sh`。
5. `curl https://api.hxzhineng.xyz/api/mp/health` 验证生产健康状态，并检查 PM2 日志不含用户输入原文。
