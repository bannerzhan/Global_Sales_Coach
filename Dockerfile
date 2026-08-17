# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
COPY . .
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
