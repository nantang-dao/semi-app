FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# .env.production bakes VITE_* public vars into the client bundle at build time
COPY .env.production .env
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output /app/.output
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
