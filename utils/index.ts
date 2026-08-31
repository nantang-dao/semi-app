/** 中国大陆手机号。业务校验，与链无关，不进 semi-core。 */
export const isPhoneNumber = (phone: string) => {
  return /^1[3-9]\d{9}$/.test(phone);
};
