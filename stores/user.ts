import { defineStore } from "pinia";
import { AUTH_TOKEN_KEY, getCookie, logout, getMe } from "@/utils/semi_api";

export const useUserStore = defineStore("user", {
  state: () => ({
    user: null as UserInfo | null,
  }),
  actions: {
    async getUser(force = false) {
      if (this.user && !force) {
        return this.user;
      }

      if (getCookie(AUTH_TOKEN_KEY)) {
        const user = await getMe();
        this.user = user;
      }
      return null;
    },
    async signout() {
      // logout() 会先让服务端吊销 token，再删本地 cookie
      await logout();
      this.user = null;
    },
    setUser(user: UserInfo) {
      this.user = user;
    },
  },
});
