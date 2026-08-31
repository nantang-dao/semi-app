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
  // Nuxt 的 createGranularWatcher 给每个顶层目录建一个不限深度的 chokidar watcher。
  // 它对 node_modules 只有两道保护，都只覆盖根目录：ignoredDirs（= modulesDir + buildDir，
  // 且只在根 watcher 的 handler 里对直接子目录检查）和根 watcher 的
  // /[\\/]node_modules[\\/]/ 正则（不传给子 watcher）。
  // packages/semi-core/node_modules 是孙子级，两道都够不着，里面的 pnpm 符号链接被
  // followSymlinks 跟进去，viem 一个包 10074 个文件被逐个 fs.watch。macOS 上一个文件
  // 一个 fd，越过 ~10240 后 child_process.spawn 一律 EBADF，nitropack 起不了 esbuild，
  // dev server 所有请求 500。
  //
  // 子 watcher 里唯一生效的钩子是 isIgnored，也就是这个 ignore 选项。但它必须**只**匹配
  // workspace 内嵌的 node_modules：写成 "**/node_modules/**" 会连 @nuxt/ui 的组件扫描
  // 一起挡掉，页面上的 UButton / UTabs / UModal 会 "Failed to resolve component"。
  // 详见 docs/dev-server-fd-limit.md。
  ignore: ["packages/*/node_modules/**"],
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
