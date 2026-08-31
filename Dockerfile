FROM node:24.19-alpine AS build
WORKDIR /app

# pnpm comes from the packageManager field in package.json via corepack.
# The prompt would otherwise block a non-interactive build.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# workspace: 根清单 + 各 package 的 package.json 都要先到位，
# 否则 pnpm 解析不出 workspace: 协议的依赖。只 COPY 清单是为了
# 让依赖层在源码变动时仍能命中缓存。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/semi-core/package.json ./packages/semi-core/
RUN pnpm install --frozen-lockfile

COPY . .
# .env.production bakes VITE_* public vars into the client bundle at build time
COPY .env.production .env
RUN pnpm build

FROM node:24.19-alpine
WORKDIR /app
COPY --from=build /app/.output /app/.output
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
