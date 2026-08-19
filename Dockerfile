# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
COPY . .
# 部署关键：Next build 会把 env.ts 的校验结果（env 值）固化进 server bundle，
# 构建期必须提供真实、无转义歧义的 env 值。经 ARG/ENV 字面传递，
# 完全绕开 .env 文件的 $ 展开问题（@next/env / dotenv 对 $ 的处理与 compose 不一致）。
ARG ARK_API_KEY ARK_BASE_URL ARK_ENDPOINT_PRO ARK_ENDPOINT_TURBO ARK_ENDPOINT_FLASH ARK_MODEL_FLASH AUTH_SECRET AUTH_USER_EMAIL AUTH_USER_PASSWORD_HASH POSTGRES_PASSWORD AUTH_URL DATABASE_URL
ENV ARK_API_KEY=$ARK_API_KEY ARK_BASE_URL=$ARK_BASE_URL ARK_ENDPOINT_PRO=$ARK_ENDPOINT_PRO ARK_ENDPOINT_TURBO=$ARK_ENDPOINT_TURBO ARK_ENDPOINT_FLASH=$ARK_ENDPOINT_FLASH ARK_MODEL_FLASH=$ARK_MODEL_FLASH AUTH_SECRET=$AUTH_SECRET AUTH_USER_EMAIL=$AUTH_USER_EMAIL AUTH_USER_PASSWORD_HASH=$AUTH_USER_PASSWORD_HASH POSTGRES_PASSWORD=$POSTGRES_PASSWORD AUTH_URL=$AUTH_URL DATABASE_URL=$DATABASE_URL
RUN npm run build

# ---- Run ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S gsc && adduser -S gsc -G gsc
COPY --from=builder --chown=gsc:gsc /app/.next/standalone ./
COPY --from=builder --chown=gsc:gsc /app/.next/static ./.next/static
COPY --from=builder --chown=gsc:gsc /app/public ./public
USER gsc
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
