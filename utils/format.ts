/**
 * 三个替换掉小依赖的格式化函数。
 *
 * 原来分别用 bignumber.js（一处调用）、dayjs + relativeTime 插件（三处）和
 * serialize-error（三处）。都是纯函数，几十行就能覆盖，没必要为此各带一个库。
 * 行为与被替换的实现逐例对拍过：金额、日期、错误序列化完全相同，相对时间的
 * 中文文案也与 dayjs zh-cn 逐字一致。
 */

/**
 * 千分位 + 截断到 `fixed` 位小数。
 *
 * 对应 `new BigNumber(value).toFormat(fixed, 1)`——BigNumber 的舍入模式 1 是
 * ROUND_DOWN，也就是向零截断，**不是四舍五入**。金额显示上这个区别要紧：
 * 宁可少显示一点，也不要显示出用户其实没有的余额。
 *
 * 这里手动截断而不用 Intl 的 roundingMode: "trunc"——后者是 ES2023，旧一点的
 * 浏览器会静默退回四舍五入。
 */
export function formatAmount(value: string, fixed: number): string {
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [intPart = "0", fracPart = ""] = abs.split(".");

  const truncated = fracPart.slice(0, fixed).padEnd(fixed, "0");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const body = fixed > 0 ? `${grouped}.${truncated}` : grouped;
  return (negative ? "-" : "") + body;
}

/**
 * dayjs zh-cn 的 relativeTime 分档与文案，逐字复刻。
 *
 * 一开始用的是 `Intl.RelativeTimeFormat`，但它给出的中文与 dayjs 全不相同：
 * 空格（"5 分钟前" vs "5分钟前"）、numeric:"auto" 会说"昨天"/"去年"、45 秒内
 * dayjs 说"几秒前"。这是用户看得见的文案，换库不该顺带改它，所以照抄。
 */
const RELATIVE_THRESHOLDS: [limitSeconds: number, render: (n: number) => string][] = [
  [45, () => "几秒"],
  [90, () => "1 分钟"],
  [45 * 60, (n) => `${Math.round(n / 60)} 分钟`],
  [90 * 60, () => "1 小时"],
  [22 * 3600, (n) => `${Math.round(n / 3600)} 小时`],
  [36 * 3600, () => "1 天"],
  [26 * 86400, (n) => `${Math.round(n / 86400)} 天`],
  [45 * 86400, () => "1 个月"],
  [320 * 86400, (n) => `${Math.round(n / (30 * 86400))} 个月`],
  [548 * 86400, () => "1 年"],
];

/** 相对时间，对应 dayjs 的 `fromNow()`（locale zh-cn）。输出与 dayjs 逐字一致。 */
export function formatRelativeTime(date: string | Date, now = Date.now()): string {
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return "";

  const diffSeconds = (then - now) / 1000;
  const abs = Math.abs(diffSeconds);

  let body = `${Math.round(abs / (365 * 86400))} 年`;
  for (const [limit, render] of RELATIVE_THRESHOLDS) {
    if (abs < limit) {
      body = render(abs);
      break;
    }
  }
  // dayjs zh-cn: past "%s前", future "%s内"
  return diffSeconds <= 0 ? `${body}前` : `${body}内`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 对应 dayjs 的 `format("YYYY-MM-DD HH:mm")` / `("YYYY-MM-DD HH:mm:ss")`，本地时区。 */
export function formatDateTime(date: string | Date, withSeconds = false): string {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "";
  const base =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

/**
 * 把 Error 变成可 JSON 序列化的对象，对应 serialize-error 的 `serializeError`。
 *
 * 我们只把它喂给 /api/log-error，用到的就是 name / message / stack 和自定义
 * 字段。循环引用用 seen 集合挡住——那正是当初需要这个库的原因。
 */
export function serializeError(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => serializeError(v, seen));

  const out: Record<string, unknown> = {};
  if (value instanceof Error) {
    out.name = value.name;
    out.message = value.message;
    if (value.stack) out.stack = value.stack;
    if (value.cause !== undefined) out.cause = serializeError(value.cause, seen);
  }
  for (const key of Object.keys(value)) {
    out[key] = serializeError((value as Record<string, unknown>)[key], seen);
  }
  return out;
}
