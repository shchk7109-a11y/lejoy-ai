# 乐享AI - 阿里云部署指南

## 一、架构概览

本应用采用前后端一体化架构，单进程同时服务前端静态资源和后端 API，部署简单。

| 组件 | 技术选型 | 说明 |
|---|---|---|
| 前端 | React 19 + Vite + Tailwind | 构建后为静态文件，由 Express 托管 |
| 后端 | Node.js + Express + tRPC | 提供 API 代理和业务逻辑 |
| 数据库 | MySQL 8.0 | 存储用户、积分、配置数据 |
| AI 接入 | 谷高API中转 | 国内访问 Gemini 系列模型 |
| 文件存储 | 阿里云 OSS（或 S3 兼容） | 存储用户上传的图片和生成的内容 |

---

## 二、阿里云资源准备

### 1. 购买 ECS 服务器

**推荐配置（面向中小规模用户）：**

| 规格 | 推荐值 | 说明 |
|---|---|---|
| CPU | 2核 | 处理并发请求 |
| 内存 | 4GB | Node.js 运行需要 |
| 系统盘 | 40GB SSD | 存放代码和日志 |
| 操作系统 | Ubuntu 22.04 LTS | 稳定，社区支持好 |
| 带宽 | 5Mbps 按量付费 | 初期够用，可随时升级 |

**购买后记录：**
- 公网 IP 地址
- SSH 登录密钥

### 2. 购买 RDS MySQL

进入阿里云控制台 → 云数据库 RDS → 创建实例：

- 数据库类型：MySQL 8.0
- 规格：1核2GB（初期够用）
- 存储：20GB SSD
- 网络：与 ECS 同一 VPC（重要！）

**创建完成后：**
1. 创建数据库：`lejoy_ai`，字符集 `utf8mb4`
2. 创建账号：`lejoy_user`，赋予 `lejoy_ai` 库的读写权限
3. 记录连接地址（内网地址，格式如 `rm-xxx.mysql.rds.aliyuncs.com`）

### 3. 配置安全组

ECS 安全组需开放以下端口：

| 端口 | 协议 | 用途 |
|---|---|---|
| 22 | TCP | SSH 远程登录 |
| 80 | TCP | HTTP 访问 |
| 443 | TCP | HTTPS 访问（配置域名后） |
| 3000 | TCP | 应用端口（可选，调试用） |

---

## 三、服务器环境配置

SSH 登录 ECS 后执行以下命令：

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 3. 安装 pnpm
npm install -g pnpm

# 4. 安装 PM2（进程守护）
npm install -g pm2

# 5. 安装 Nginx（反向代理）
sudo apt install -y nginx

# 6. 验证安装
node --version  # v22.x.x
pnpm --version  # 10.x.x
```

---

## 四、部署应用

### 1. 上传代码

在本地打包代码（或从 GitHub 克隆）：

```bash
# 方式一：直接上传（本地执行）
scp -r /path/to/lejoy-ai-app ubuntu@<ECS公网IP>:/home/ubuntu/

# 方式二：从 GitHub 克隆（服务器上执行）
git clone https://github.com/your-repo/lejoy-ai-app.git
```

### 2. 安装依赖并构建

```bash
cd /home/ubuntu/lejoy-ai-app

# 安装依赖
pnpm install

# 构建前端
pnpm build
```

### 3. 配置环境变量

创建 `.env.production` 文件：

```bash
cat > /home/ubuntu/lejoy-ai-app/.env << 'EOF'
# 数据库连接（使用 RDS 内网地址）
DATABASE_URL=mysql://lejoy_user:你的密码@rm-xxx.mysql.rds.aliyuncs.com:3306/lejoy_ai

# JWT 密钥（随机生成，保密）
JWT_SECRET=your-random-secret-key-at-least-32-chars

# Gemini 模型配置（谷高API中转）
GEMINI_BASE_URL=https://api.gdoubolai.com/v1
GEMINI_TEXT_MODEL=gemini-3.1-flash-lite-preview
GEMINI_TEXT_API_KEY=sk-你的文本模型Key
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
GEMINI_IMAGE_API_KEY=sk-你的图像模型Key
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_API_KEY=sk-你的TTS模型Key

# 应用配置
NODE_ENV=production
EOF
```

### 4. 执行数据库迁移

```bash
cd /home/ubuntu/lejoy-ai-app
node migrate.mjs
```

### 5. 启动应用（使用 PM2）

```bash
# 启动应用
pm2 start "node dist/index.js" --name lejoy-ai

# 设置开机自启
pm2 startup
pm2 save

# 查看运行状态
pm2 status
pm2 logs lejoy-ai
```

---

## 五、配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/lejoy-ai
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name 你的域名或公网IP;

    # 最大上传文件大小（图片上传）
    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/lejoy-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 六、配置 HTTPS（推荐）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（需要先配置好域名解析）
sudo certbot --nginx -d 你的域名

# 自动续期
sudo systemctl enable certbot.timer
```

---

## 七、管理员账号配置

应用部署完成后，第一个登录的用户默认是普通用户。要将自己设置为管理员，在数据库中执行：

```sql
-- 将指定用户设置为管理员（替换为您的邮箱或 openId）
UPDATE users SET role = 'admin' WHERE email = '你的邮箱';

-- 或者查询所有用户后再更新
SELECT id, name, email, role FROM users;
UPDATE users SET role = 'admin' WHERE id = 1;
```

---

## 八、日常运维

### 查看应用日志
```bash
pm2 logs lejoy-ai --lines 100
```

### 更新应用
```bash
cd /home/ubuntu/lejoy-ai-app
git pull  # 或重新上传代码
pnpm install
pnpm build
pm2 restart lejoy-ai
```

### 数据库备份
```bash
# 使用阿里云 RDS 自动备份功能（推荐）
# 或手动导出
mysqldump -h rm-xxx.mysql.rds.aliyuncs.com -u lejoy_user -p lejoy_ai > backup.sql
```

---

## 九、关于 APP 化

Web 应用部署完成后，可通过以下方式快速转为 APP：

**方案一：Capacitor 打包（推荐，几乎零改造）**

```bash
# 在项目目录安装 Capacitor
pnpm add @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios

# 初始化
npx cap init "乐享AI" "com.lejoy.ai"

# 构建前端
pnpm build

# 添加平台
npx cap add android
npx cap add ios

# 同步并打开 IDE
npx cap sync
npx cap open android  # 用 Android Studio 打包 APK
npx cap open ios      # 用 Xcode 打包 IPA
```

**方案二：微信小程序（需要重写前端）**

小程序与 Web 差异较大，建议：
1. 保留现有 Web 版本作为主要入口
2. 小程序版本可以使用 uni-app 或 Taro 框架重写前端
3. 后端 API 可以直接复用，无需改动

---

## 十、费用估算（月度）

| 资源 | 规格 | 估算费用 |
|---|---|---|
| ECS 服务器 | 2核4G | ¥100-200/月 |
| RDS MySQL | 1核2G | ¥80-150/月 |
| 域名 | .com | ¥60/年 |
| SSL 证书 | Let's Encrypt | 免费 |
| 谷高API | 按量计费 | 视用量而定 |
| **合计** | | **约 ¥200-400/月** |

> 初期用户少时，可选择更低配置（1核2G ECS + 1核1G RDS），费用可降至 ¥100/月以内。
