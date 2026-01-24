// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2025-05-15",
  devtools: { enabled: false },
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
      },
      script: [
        {
          src: "https://cdn.trackjs.com/agent/v3/latest/t.js",
          async: true,
        },
        {
          innerHTML: `
            window.TrackJS && TrackJS.install({
              token: "2caaa43bd51e4145974e83e69df5a990",
              // for more configuration options, see https://docs.trackjs.com
            });
          `,
        },
      ],
    },
  },
});
