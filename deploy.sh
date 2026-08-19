#!/usr/bin/env bash
# ============================================================
# Global Sales Coach V0.1 — 一键部署脚本
# 用法（在香港轻量服务器上）:
#   git clone git@github.com:bannerzhan/Global_Sales_Coach.git
#   cd Global_Sales_Coach
#   cp .env.example .env && vim .env   # 填入真实凭据
#   bash deploy.sh your-domain.com
# ============================================================
set -euo pipefail

DOMAIN="${1:?用法: bash deploy.sh <你的域名>}"
COMPOSE="docker compose"

echo "==> [1/5] 检查依赖"
command -v docker >/dev/null || { echo "未安装 Docker，先安装：curl -fsSL https://get.docker.com | sh"; exit 1; }
$COMPOSE version >/dev/null 2>&1 || { echo "docker compose 不可用"; exit 1; }

echo "==> [2/5] 检查 .env"
[ -f .env ] || { echo "缺少 .env（参考 .env.example）"; exit 1; }
set -a; source .env; set +a
: "${ARK_API_KEY:?ARK_API_KEY 未设置}"
: "${ARK_ENDPOINT_PRO:?ARK_ENDPOINT_PRO 未设置}"
: "${ARK_ENDPOINT_TURBO:?ARK_ENDPOINT_TURBO 未设置}"
: "${ARK_ENDPOINT_FLASH:?ARK_ENDPOINT_FLASH 未设置}"
: "${AUTH_SECRET:?AUTH_SECRET 未设置}"
: "${AUTH_USER_EMAIL:?AUTH_USER_EMAIL 未设置}"
: "${AUTH_USER_PASSWORD_HASH:?AUTH_USER_PASSWORD_HASH 未设置}"
# 防御校验：hash 应形如 $2y$10$...（\$ 转义被 bash source 还原成字面 $）。
# 若值不以 $2 开头，多半是用户直接粘贴了含 $ 的原始 hash 或写错，提前拦截。
case "${AUTH_USER_PASSWORD_HASH}" in
  '$2'*) : ;;  # 字面 $ 开头（\$2 转义还原）
  *) echo "!! AUTH_USER_PASSWORD_HASH 格式异常（应形如 \\$2y\\$10\\$...）。请检查 .env：hash 中每个 \$ 都必须写成 \\\$（见 .env.example 注释）"; exit 1 ;;
esac
if [ "${POSTGRES_PASSWORD:-}" = "gsc_dev_password" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "!! POSTGRES_PASSWORD 仍是默认值，生成随机密码并写回 .env"
  GEN=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
  if grep -q '^POSTGRES_PASSWORD=' .env; then
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${GEN}|" .env
  else
    echo "POSTGRES_PASSWORD=${GEN}" >> .env
  fi
  set -a; source .env; set +a
fi

echo "==> [3/5] 配置域名 ${DOMAIN}"
export GSC_DOMAIN="${DOMAIN}"

echo "==> [4/5] 构建并启动（首次约 3-5 分钟）"
$COMPOSE up -d --build

echo "==> [5/5] 等待健康检查"
for i in $(seq 1 30); do
  if $COMPOSE exec -T db pg_isready -U gsc -d gsc >/dev/null 2>&1 \
     && curl -fsk "https://${DOMAIN}" >/dev/null 2>&1; then
    echo ""
    echo "=============================================="
    echo " 部署成功: https://${DOMAIN}"
    echo " 数据库: gsc-db (schema 已由 init 脚本初始化)"
    echo " 登录:   ${AUTH_USER_EMAIL}"
    echo "=============================================="
    exit 0
  fi
  printf '.'; sleep 5
done
echo ""
echo "!! 仍有服务未就绪，排查："
echo "   $COMPOSE ps"
echo "   $COMPOSE logs --tail=50 app caddy"
exit 1
