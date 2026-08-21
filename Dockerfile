FROM node:22-alpine AS build
WORKDIR /app

# pnpm comes from the packageManager field in package.json via corepack.
# The prompt would otherwise block a non-interactive build.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# .env.production bakes VITE_* public vars into the client bundle at build time
COPY .env.production .env
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output /app/.output
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
