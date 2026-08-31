/**
 * 把 InstantDB 的徽章数据导成 JSON，供 semi-backend 的 badges:import 读取。
 *
 * 凭证只从环境变量读，脚本里不写死、也不落进产物：
 *
 *   # 用仓库里的 .env
 *   node --env-file=.env scripts/export-instant-badges.mjs [输出目录]
 *
 *   # 或临时传，不落盘
 *   INSTANT_APP_ID=... INSTANT_APP_ADMIN_TOKEN=... \
 *     node scripts/export-instant-badges.mjs [输出目录]
 *
 * 只读，不会写 Instant。默认输出到 ./tmp/instant-export/。
 *
 * 注意 wallet_address 原样导出（checksummed）—— 它是 namehash 的输入，
 * 大小写变了链上 id 就对不上，导入侧也不做 normalize。
 */
import { init } from "@instantdb/admin";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ENTITIES = ["profiles", "badge_classes", "badges"];
const PAGE_SIZE = 500;

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN;
if (!appId || !adminToken) {
  console.error(
    "缺少 INSTANT_APP_ID / INSTANT_APP_ADMIN_TOKEN。\n" +
      "用 `node --env-file=.env scripts/export-instant-badges.mjs`，" +
      "或把两个变量直接放在命令前面。"
  );
  process.exit(1);
}

// 不传 schema：导出要的是库里的原始形态，不是 schema 声明的形态。
const db = init({ appId, adminToken });

/** 按 serverCreatedAt 分页拉全量。Instant 单次查询有上限，必须翻页。 */
async function fetchAll(entity) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await db.query({
      [entity]: {
        $: { limit: PAGE_SIZE, offset, order: { serverCreatedAt: "asc" } },
      },
    });
    const page = result[entity] ?? [];
    rows.push(...page);
    process.stdout.write(`\r  ${entity}: ${rows.length}`);
    if (page.length < PAGE_SIZE) break;
  }
  process.stdout.write("\n");
  return rows;
}

/** 导出前先自查，脏数据要在导入之前就看见，而不是在 Rails 报约束冲突时。 */
function audit(entity, rows, idField) {
  const problems = [];
  const seen = new Map();

  for (const row of rows) {
    const key = row[idField];
    if (key == null || key === "") {
      problems.push(`${row.id}: ${idField} 为空`);
      continue;
    }
    if (seen.has(key)) {
      problems.push(`${idField}=${key} 重复：${seen.get(key)} 与 ${row.id}`);
    }
    seen.set(key, row.id);
    if (typeof key === "string" && !/^0x[0-9a-fA-F]{64}$/.test(key)) {
      problems.push(`${row.id}: ${idField}=${key} 不是 32 字节 hex`);
    }
    if (!row.wallet_address) {
      problems.push(`${row.id}: wallet_address 为空`);
    }
    if (row.chain_id == null) {
      problems.push(`${row.id}: chain_id 为空`);
    }
  }

  if (entity === "badges") {
    for (const row of rows) {
      if (!["pending", "accepted", "rejected"].includes(row.status)) {
        problems.push(`${row.id}: status=${row.status} 不在允许集合内`);
      }
      if (row.status === "accepted" && !row.tx_hash) {
        problems.push(`${row.id}: accepted 但没有 tx_hash`);
      }
    }
  }

  return problems;
}

const outDir = resolve(process.argv[2] ?? "tmp/instant-export");
await mkdir(outDir, { recursive: true });

const summary = {};
let totalProblems = 0;

for (const entity of ENTITIES) {
  const rows = await fetchAll(entity);
  const idField = { profiles: "profile_id", badge_classes: "class_id", badges: "badge_id" }[entity];
  const problems = audit(entity, rows, idField);
  totalProblems += problems.length;

  await writeFile(join(outDir, `${entity}.json`), JSON.stringify(rows, null, 2));
  summary[entity] = { count: rows.length, problems: problems.length };

  if (problems.length) {
    console.error(`\n  ⚠ ${entity} 有 ${problems.length} 条异常：`);
    for (const p of problems.slice(0, 20)) console.error(`    - ${p}`);
    if (problems.length > 20) console.error(`    …还有 ${problems.length - 20} 条`);
    await writeFile(join(outDir, `${entity}.problems.txt`), problems.join("\n"));
  }
}

await writeFile(
  join(outDir, "manifest.json"),
  // 只留前 8 位，够辨认是哪个 app，又不至于把完整 id 带进到处传的产物里。
  JSON.stringify(
    { exported_at: new Date().toISOString(), app_id_prefix: appId.slice(0, 8), summary },
    null,
    2
  )
);

console.log(`\n导出完成 → ${outDir}`);
console.table(summary);
if (totalProblems > 0) {
  console.error(`共 ${totalProblems} 条异常，导入前请先确认。`);
  process.exit(2);
}
