FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
ARG VITE_API_URL=https://api.semi.im
ENV VITE_API_URL=$VITE_API_URL
COPY . .
RUN --mount=type=secret,id=VITE_INFURA_API_KEY \
    --mount=type=secret,id=VITE_ALCHEMY_API_KEY \
    --mount=type=secret,id=VITE_OP_BUNDLER_URL \
    --mount=type=secret,id=VITE_MAINNET_BUNDLER_URL \
    --mount=type=secret,id=VITE_OP_PAYMASTER \
    --mount=type=secret,id=VITE_SEPOLIA_BUNDLER_URL \
    --mount=type=secret,id=VITE_SOLA_AUTH_TOKEN \
    --mount=type=secret,id=VITE_TOKEN_OWNER \
    --mount=type=secret,id=VITE_MAINNET_RPC_URL \
    --mount=type=secret,id=VITE_OP_RPC_URL \
    --mount=type=secret,id=VITE_SEPOLIA_RPC_URL \
    sh -c ' \
      for s in VITE_INFURA_API_KEY VITE_ALCHEMY_API_KEY \
               VITE_OP_BUNDLER_URL VITE_MAINNET_BUNDLER_URL VITE_OP_PAYMASTER \
               VITE_SEPOLIA_BUNDLER_URL VITE_SOLA_AUTH_TOKEN VITE_TOKEN_OWNER \
               VITE_MAINNET_RPC_URL VITE_OP_RPC_URL VITE_SEPOLIA_RPC_URL; do \
        [ -f "/run/secrets/$s" ] && export "$s=$(cat /run/secrets/$s)"; \
      done; \
      bun run build \
    '

FROM node:22-alpine AS runner
WORKDIR /app
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
COPY --from=builder /app/.output ./
EXPOSE 3000
CMD ["node", "server/index.mjs"]
