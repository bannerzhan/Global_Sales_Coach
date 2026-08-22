# 语音网关独立进程镜像（X 方案）
# 复用主项目已安装的 tsx + ws（COPY 整个 node_modules 太重，改为先装最小依赖）
FROM node:22-alpine AS builder
WORKDIR /app
# 只装网关需要的运行时依赖
COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com --no-audit --no-fund --ignore-scripts \
    ws@8 tsx@4 2>/dev/null || npm install --no-audit --no-fund --ignore-scripts ws@8 tsx@4
COPY voice-gateway/ ./voice-gateway/
WORKDIR /app/voice-gateway
ENV NODE_ENV=production
EXPOSE 8787
# 直接跑 tsx（网关体量小，无需编译）；生产可改 tsc 预编译
CMD ["node", "../node_modules/tsx/dist/cli.mjs", "src/server.ts"]
