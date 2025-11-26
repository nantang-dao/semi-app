// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2025-05-15",
  devtools: { enabled: false },
  ui: {
    fonts: false,
  },
  modules: ["@nuxt/icon", "@nuxt/ui", "@pinia/nuxt","@nuxtjs/tailwindcss"],
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
      },
    },
  },
});
