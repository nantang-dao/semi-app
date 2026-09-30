import { AUTH_TOKEN_KEY, getCookie, setAuthToken } from "~/utils/semi_api";

/**
 * 旧版本写的登录 cookie 没有 SameSite / Secure。打开页面时按新属性重写一次，
 * 已登录的用户不用重新登录。cookie 读不到属性，所以每次都写，写的内容不变。
 */
export default defineNuxtPlugin(() => {
  const token = getCookie(AUTH_TOKEN_KEY);
  if (token) setAuthToken(token);
});
