// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2025-05-15",
  devtools: { enabled: false },
  runtimeConfig: {
    public: {
      /** Semi REST API 根地址（get_me、get_token_classes 等），须通过 NUXT_PUBLIC_API_URL 配置 */
      apiUrl: process.env.NUXT_PUBLIC_API_URL || "",
    },
  },
  ui: {
    fonts: false,
  },
  modules: ["@nuxt/icon", "@nuxt/ui", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  routeRules: {
    "/api/**": {
      cors: true,
    },
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
