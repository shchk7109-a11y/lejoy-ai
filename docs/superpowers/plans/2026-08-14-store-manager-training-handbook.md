# 乐享AI店长培训讲义 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 制作并交付一份 35-45 页、图文并茂、适合 60-90 分钟培训及长期查阅的《乐享AI店长培训讲义》A4 PDF。

**Architecture:** 以当前 `codex/m4-release-ready` 生产构建为截图来源，通过微信开发者工具自动化采集页面状态，形成有编号的截图清单；正文使用结构化 Python 数据组织，由 ReportLab 统一生成带目录、页眉页脚、图题、话术框和可打印表单的 PDF。验收分为内容检查、PDF 结构检查、全文提取检查和逐页 PNG 视觉检查四层。

**Tech Stack:** Taro 4.2.1 微信小程序、微信开发者工具 CLI、`miniprogram-automator`、Python 3、ReportLab、Pillow、pdfplumber、pypdf、Poppler。

---

## 文件结构

- Create: `scripts/training-handbook/capture-screenshots.mjs` - 启动微信开发者工具，按清单进入页面、执行演示操作并保存原始截图。
- Create: `scripts/training-handbook/screenshot-manifest.json` - 记录每张截图的编号、页面、状态、图题、隐私检查和正文用途。
- Create: `scripts/training-handbook/build_handbook.py` - 注册中文字体、读取截图和内容、生成 A4 PDF。
- Create: `scripts/training-handbook/handbook_content.py` - 保存章节、段落、话术、练习、活动清单、表单和截图引用的结构化正文。
- Create: `scripts/training-handbook/verify_handbook.py` - 校验页数、目录顺序、必需文字、截图完整性、敏感词和 PDF 字体。
- Create: `docs/training-handbook/assets/screenshots/` - 保存从当前生产构建采集并裁切后的页面和结果截图。
- Create: `docs/training-handbook/assets/demo/` - 保存无真实顾客隐私的演示照片和生成结果。
- Create: `output/pdf/乐享AI店长培训讲义.pdf` - 最终交付文件。
- Modify: `miniprogram/package.json` - 增加截图自动化开发依赖和命令，不改变小程序运行逻辑。
- Modify: `pnpm-lock.yaml` - 锁定截图自动化依赖。

### Task 1: 建立截图自动化与清单

**Files:**
- Modify: `miniprogram/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/training-handbook/screenshot-manifest.json`
- Create: `scripts/training-handbook/capture-screenshots.mjs`

- [ ] **Step 1: 安装截图依赖**

Run:

```bash
cd miniprogram
pnpm add -D miniprogram-automator@0.12.1
```

Expected: `miniprogram/package.json` 出现 `miniprogram-automator`，锁文件更新，小程序源码和生产 API 配置不变。

- [ ] **Step 2: 添加截图命令**

在 `miniprogram/package.json` 的 `scripts` 中加入：

```json
"capture:handbook": "node ../scripts/training-handbook/capture-screenshots.mjs"
```

- [ ] **Step 3: 写截图清单**

`screenshot-manifest.json` 使用以下完整字段：

```json
{
  "version": "2026.08",
  "items": [
    {
      "id": "login",
      "chapter": "基础操作",
      "path": "pages/login/index",
      "state": "初始登录页",
      "caption": "图5-1 登录页：先说明用途，再由顾客主动点击登录",
      "file": "01-login.png",
      "privacyChecked": true
    }
  ]
}
```

清单必须覆盖登录、首页上下半屏、我的页面、大字模式、积分明细、老摄影大师、暖心文案、故事会、生活助手、识花草、AI万花筒和代表性错误态；截图编号按讲义章节顺序排列。

- [ ] **Step 4: 实现微信开发者工具自动截图**

`capture-screenshots.mjs` 提供并实际调用以下函数：

```js
async function launchMiniProgram() {}
async function ensureSignedIn(miniProgram) {}
async function openPage(miniProgram, route, query = {}) {}
async function tapByText(page, text) {}
async function fillInput(page, selector, value) {}
async function savePageScreenshot(miniProgram, fileName) {}
async function captureAll() {}
```

启动参数固定为当前仓库：

```js
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const projectPath = path.resolve(repoRoot, 'miniprogram')
const outputDir = path.resolve(repoRoot, 'docs/training-handbook/assets/screenshots')
```

脚本必须在退出前调用 `miniProgram.close()`；任何截图失败都记录 `id` 并以非零状态退出，防止静默缺图。

- [ ] **Step 5: 构建并运行首轮截图**

Run:

```bash
cd miniprogram
pnpm build:weapp:prod
pnpm capture:handbook
```

Expected: 生产地址校验通过，截图目录中所有清单文件存在，截图不包含开发者工具外壳、调试浮层或真实顾客信息。

- [ ] **Step 6: 提交截图基础设施**

```bash
git add miniprogram/package.json pnpm-lock.yaml scripts/training-handbook/capture-screenshots.mjs scripts/training-handbook/screenshot-manifest.json docs/training-handbook/assets
git commit -m "docs: capture current miniprogram handbook screenshots"
```

### Task 2: 编写完整讲义正文

**Files:**
- Create: `scripts/training-handbook/handbook_content.py`

- [ ] **Step 1: 定义内容类型**

建立以下数据结构，并让每个章节只通过这些类型组合：

```python
from dataclasses import dataclass, field

@dataclass(frozen=True)
class Block:
    kind: str
    title: str = ""
    body: str = ""
    items: tuple[str, ...] = ()
    screenshot_id: str = ""
    rows: tuple[tuple[str, ...], ...] = ()

@dataclass(frozen=True)
class Chapter:
    number: int
    title: str
    learning_goal: str
    blocks: tuple[Block, ...] = field(default_factory=tuple)
```

- [ ] **Step 2: 写前置价值与引流章节**

正文依次建立以下章节，且必须位于功能教学之前：

```python
CHAPTER_TITLES = (
    "当代中老年人的AI需求",
    "乐享AI如何帮助灵芝水铺引流",
    "门店引流实战方法",
    "门店AI体验活动组织方法",
    "乐享AI整体介绍与基础操作",
    "老摄影大师",
    "暖心文案",
    "AI故事会",
    "生活助手",
    "AI万花筒",
    "常见问题与现场处理",
    "隐私、安全与合规底线",
    "店长实操考核",
)
```

完整展开五种活动：老照片焕新日、节日祝福小课堂、祖孙故事时光、今天这道菜怎么样、社区花草识别活动。每种活动必须包含目标人群、准备物料、15-30 分钟流程、推荐话术、可带走结果和合规边界。

- [ ] **Step 3: 写功能教学章节**

每个功能章固定包含以下块，不得只写功能介绍：

```python
(
    Block(kind="goal", body="本章学习目标"),
    Block(kind="scenario", body="适合在门店使用的真实场景"),
    Block(kind="steps", items=("步骤1", "步骤2", "步骤3")),
    Block(kind="screenshot", screenshot_id="清单中的真实截图ID"),
    Block(kind="remember", body="店长要记住"),
    Block(kind="script", body="现场可以这样说"),
    Block(kind="warning", body="注意不要做"),
    Block(kind="exercise", body="实操或情景题"),
)
```

功能内容必须与当前能力一致：修图六个预设和艺术画室；文案四步七种风格和三条结果；故事六种风格、可选孩子照片、四页配图、朗读、本机六本和相册导出；菜品分析、六项营养、食材拆解、识花草两段式；万花筒文字/语音提问和朗读。

- [ ] **Step 4: 写故障、合规与考核**

故障表至少覆盖：网络失败、服务繁忙、AI仍在生成、积分不足、相机/相册/麦克风授权、保存失败、页面白屏和手动重试。合规内容逐条写明不宣称治疗效果、不把营养分析与产品功效建立因果、不留存顾客照片和录音、AI结果仅作一般参考、花草不可作为食药或毒性处置唯一依据。

- [ ] **Step 5: 写可打印附录**

增加以下 `Block(kind="table")`：功能与积分速查、收银台话术卡、30分钟活动清单、60分钟活动清单、常见问题排查、技术反馈记录、店长实操考核、隐私与合规确认。积分获取政策统一写“以门店正式运营政策为准”。

- [ ] **Step 6: 做正文静态检查**

Run:

```bash
python3 -m py_compile scripts/training-handbook/handbook_content.py
rg -n "待完善|稍后补充|治疗|治愈|保证有效|强制分享" scripts/training-handbook/handbook_content.py
```

Expected: Python 编译成功；无待完善或稍后补充字样；合规风险词仅出现在明确的禁止说明中。

- [ ] **Step 7: 提交正文**

```bash
git add scripts/training-handbook/handbook_content.py
git commit -m "docs: write store manager handbook content"
```

### Task 3: 生成 A4 讲义 PDF

**Files:**
- Create: `scripts/training-handbook/build_handbook.py`
- Create: `output/pdf/乐享AI店长培训讲义.pdf`

- [ ] **Step 1: 建立字体与页面模板**

`build_handbook.py` 使用 ReportLab `BaseDocTemplate`、`PageTemplate`、`TableOfContents` 和 `multiBuild()`；注册系统中文字体，正文不小于 11.5pt，操作步骤 12-14pt。实现：

```python
def register_fonts() -> dict[str, str]: ...
def make_styles(fonts: dict[str, str]): ...
def draw_header_footer(canvas, doc): ...
def image_box(path, max_width, max_height): ...
def build_story(content, manifest): ...
def build_pdf(output_path): ...
```

页面为 A4 竖版；页眉显示当前章节；页脚显示“乐享AI店长培训讲义 · 2026.08”及页码；截图必须用等比缩放，不得设置互相独立的固定宽高。

- [ ] **Step 2: 实现统一教学组件**

对 `remember`、`script`、`warning` 分别使用暖橙、自然绿、浅红提示框；步骤使用编号圆点；截图使用白底圆角卡片并显示连续图题；表格允许跨页重复表头但不允许整行截断。

- [ ] **Step 3: 生成封面、目录与正文**

封面包含书名、副标题“灵芝水铺店长与店员培训使用”、版本号、60-90分钟课程说明；目录从“当代中老年人的AI需求”开始，确保“乐享AI如何帮助灵芝水铺引流”和“门店引流实战方法”位于所有功能介绍之前。

- [ ] **Step 4: 生成最终 PDF**

Run:

```bash
mkdir -p output/pdf tmp/pdfs/store-manager-handbook
python3 scripts/training-handbook/build_handbook.py
pdfinfo output/pdf/乐享AI店长培训讲义.pdf
```

Expected: PDF 能打开、中文正常、页数 35-45 页、页面尺寸为 A4。

- [ ] **Step 5: 提交 PDF 生成器与首版文件**

```bash
git add scripts/training-handbook/build_handbook.py output/pdf/乐享AI店长培训讲义.pdf
git commit -m "docs: generate illustrated store manager handbook"
```

### Task 4: 自动验收与逐页视觉复核

**Files:**
- Create: `scripts/training-handbook/verify_handbook.py`
- Modify: `scripts/training-handbook/build_handbook.py`
- Modify: `scripts/training-handbook/handbook_content.py`
- Modify: `output/pdf/乐享AI店长培训讲义.pdf`

- [ ] **Step 1: 先写失败的验收脚本**

`verify_handbook.py` 必须检查：

```python
assert 35 <= page_count <= 45
assert required_chapters == extracted_chapters
assert traffic_first_index < first_feature_index
assert all_screenshot_files_exist
assert not forbidden_placeholders
assert not leaked_secrets_or_real_customer_fields
assert fonts_are_embedded
```

必需章节和截图 ID 直接从 `handbook_content.py` 与 `screenshot-manifest.json` 读取，避免另写一套易漂移清单。

- [ ] **Step 2: 运行验收并记录首轮失败**

Run:

```bash
python3 scripts/training-handbook/verify_handbook.py output/pdf/乐享AI店长培训讲义.pdf
```

Expected: 若页数、章节、截图或字体有任一问题，脚本列出精确项目并返回非零状态。

- [ ] **Step 3: 修正到自动验收通过**

Run:

```bash
python3 scripts/training-handbook/build_handbook.py
python3 scripts/training-handbook/verify_handbook.py output/pdf/乐享AI店长培训讲义.pdf
```

Expected: 输出 `PASS: handbook structure, content, screenshots and fonts verified`。

- [ ] **Step 4: 渲染全部页面**

Run:

```bash
rm -f tmp/pdfs/store-manager-handbook/page-*.png
pdftoppm -png -r 120 output/pdf/乐享AI店长培训讲义.pdf tmp/pdfs/store-manager-handbook/page
```

Expected: PNG 数量与 PDF 页数完全一致。

- [ ] **Step 5: 逐页视觉检查并修订**

逐页检查以下项目：中文乱码、文字截断、重叠、孤行、表格跨页错误、图片拉伸、图片过小、图题与图片分离、页眉页脚缺失、目录页码错误、空白页和黑块。每次修订后重新生成 PDF、重新渲染全部页面，并只检查最新 PNG。

- [ ] **Step 6: 最终回归**

Run:

```bash
python3 scripts/training-handbook/verify_handbook.py output/pdf/乐享AI店长培训讲义.pdf
pnpm test
cd miniprogram && pnpm build:weapp:prod
```

Expected: 讲义验收通过、测试全绿、生产构建地址校验通过；讲义制作未改变小程序功能逻辑。

- [ ] **Step 7: 提交最终验收版本**

```bash
git add scripts/training-handbook/verify_handbook.py scripts/training-handbook/build_handbook.py scripts/training-handbook/handbook_content.py output/pdf/乐享AI店长培训讲义.pdf
git commit -m "docs: verify final store manager training handbook"
```

### Task 5: 推送与交付

**Files:**
- Verify: `output/pdf/乐享AI店长培训讲义.pdf`

- [ ] **Step 1: 检查提交范围**

Run:

```bash
git status --short
git log --oneline origin/codex/m4-release-ready..HEAD
```

Expected: 不暂存或改动用户现有的 `.DS_Store`、`miniprogram/project.config.json` 和 `miniprogram/project.private.config.json`；提交记录包括设计、截图、正文、PDF 与验收。

- [ ] **Step 2: 推送当前分支**

Run:

```bash
git push origin codex/m4-release-ready
```

Expected: 远端分支包含本讲义相关提交及此前尚未推送的设计提交。

- [ ] **Step 3: 最终交付说明**

回复中提供最终 PDF 文件、页数、截图数量、版本号、验证命令结果、提交号，并明确列出仍需真实门店验证的三项：培训时长是否合适、店长话术是否自然、打印后的截图可读性。
