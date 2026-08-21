// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2025-05-15",
  devtools: { enabled: false },
  // Fix: Nuxt 3.21.4 regression "Vite Node IPC socket path not configured" with ssr:false
  // See: https://github.com/nuxt/nuxt/issues/34957
  experimental: {
    viteEnvironmentApi: true,
  },
  runtimeConfig: {
    public: {
      apiUrl: process.env.VITE_API_URL || "",
    },
  },
  ui: {
    fonts: false,
  },
  icon: {
    serverBundle: false,
    // SPA: clients fetch icons directly from Iconify CDN — no server handler needed
    fallbackToApi: "client-only",
  },
  hooks: {
    // Remove @nuxt/icon server handler so @iconify/utils is never statically imported
    // at Lambda cold start. Icons are served via client-side CDN fallback instead.
    "nitro:config"(nitroConfig) {
      nitroConfig.handlers = (nitroConfig.handlers ?? []).filter(
        (h) => !String(h.handler).includes("@nuxt/icon")
      );
    },
  },
  nitro: {
    esbuild: {
      // Nitro's esbuild pass defaults to es2019, where bigint literals are a
      // syntax error — the wallet code in utils/ uses them throughout, and the
      // server bundle pulls those in via server/api. es2020 is the first target
      // with BigInt.
      options: { target: "es2020" },
    },
  },
  modules: ["@nuxt/icon", "@nuxt/ui", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  routeRules: {
    // /metadata/** is fetched cross-origin by wallets and indexers, so CORS is needed.
    // /api/** is called same-origin by the SPA client — no CORS needed and adding it
    // generates a Vercel headers-only route that intercepts requests before the Lambda.
    "/metadata/**": {
      cors: true,
    },
  },
  app: {
    head: {
      title: "南塘数字身份", // default fallback title
      htmlAttrs: {
        lang: "zh-CN",
      }
    },
  },
});
