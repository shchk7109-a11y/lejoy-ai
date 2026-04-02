#!/bin/bash
# ─── 乐享AI 一键部署脚本 ───
# 在阿里云服务器上执行此脚本
set -e

APP_DIR="/opt/lejoy-ai"
echo "=== 乐享AI 部署开始 ==="

# 1. 创建应用目录
mkdir -p $APP_DIR
cd $APP_DIR

# 2. 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "Docker 未安装，请先安装 Docker"
    exit 1
fi

# 3. 确认文件已上传
if [ ! -f "$APP_DIR/Dockerfile" ]; then
    echo "错误：请先将项目文件上传到 $APP_DIR"
    echo "需要的文件：Dockerfile, package.json, pnpm-lock.yaml, dist/, patches/, .env.production"
    exit 1
fi

# 4. 构建 Docker 镜像
echo "=== 构建 Docker 镜像 ==="
docker build -t lejoy-ai .

# 5. 停止旧容器（如果存在）
docker stop lejoy-ai 2>/dev/null || true
docker rm lejoy-ai 2>/dev/null || true

# 6. 启动新容器
echo "=== 启动应用 ==="
docker run -d \
  --name lejoy-ai \
  --restart unless-stopped \
  -p 80:3000 \
  --env-file .env.production \
  lejoy-ai

# 7. 等待启动
sleep 3

# 8. 健康检查
if curl -s -o /dev/null -w "%{http_code}" http://localhost:80 | grep -q "200"; then
    echo ""
    echo "=== 部署成功！==="
    echo "访问地址：http://$(curl -s ifconfig.me)"
    echo ""
else
    echo "警告：健康检查未通过，查看日志："
    docker logs lejoy-ai --tail 20
fi
