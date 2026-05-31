FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY .env.build .env
COPY . .
RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
COPY --from=builder /app/.output ./
EXPOSE 3000
CMD ["node", "server/index.mjs"]
