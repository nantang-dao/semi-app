# InstantDB 下线清单

徽章数据已经迁到 semi-backend 的 Postgres，Nitro 的 12 个端点全部改走 Rails。
**InstantDB 侧的数据和配置刻意保留着**，它是这次迁移的回滚窗口。

这份文档记录「还剩什么、为什么留着、要拆的时候拆哪些」。在生产切换稳定运行一段
时间之前，不要动下面任何一项。

## 现状：代码里已经没人用它了

```
$ grep -rn "utils/db" server/ pages/ components/ utils/ stores/
（无结果）
```

`server/utils/db/index.ts` 导出的 `db` 单例，**没有任何文件 import**。它现在是
死代码，但仍然会随 `@instantdb/admin` 一起留在仓库里。

一个可观测的旁证：把 12 个端点切走之后，Nitro 产物从 7.44 MB 降到 6.85 MB
（gzip 1.98 → 1.83 MB），因为 `@instantdb/admin` 不再被任何路由拉进去。

## 保留清单

### 代码

| 路径 | 内容 | 状态 |
| --- | --- | --- |
| `server/utils/db/index.ts` | admin client 单例 | 死代码，无人 import |
| `server/utils/db/instant.schema.ts` | 7 个 entity 的 schema 定义 | 迁移时的字段对照依据 |
| `server/utils/db/instant.perms.ts` | 权限规则（只有 `profiles` 一条） | 同上 |

### 依赖与脚本

- `package.json` → `"@instantdb/admin": "1.0.66"`
- `package.json` → `db-schema-push` 脚本（`instant-cli push schema && push perms`）

### 环境变量

- `ginger.yml` `secrets.inject`：`INSTANT_APP_ID`、`INSTANT_APP_ADMIN_TOKEN`
- `.env.example`：上面两个，加 `INSTANT_SCHEMA_FILE_PATH`、`INSTANT_PERMS_FILE_PATH`

### 远端数据

导出时的行数（2026-08-31）：

| entity | 行数 | 去向 |
| --- | --- | --- |
| `profiles` | 25 | → `badge_profiles` |
| `badge_classes` | 47 | → `badge_classes` |
| `badges` | 74 | → `badges` |
| `errors` | ? | **不迁移**，见下 |
| `$files` | 0 | Instant 内置，从未使用 |
| `$users` | ? | Instant 内置，从未使用 |

## 为什么保留

1. **回滚窗口。** Rails 侧刚上线，真实用户流量还没跑过。Instant 里的数据仍是
   完整的，`server/utils/db/` 留着意味着回滚只需要 revert 端点那次提交。
2. **字段对照。** `instant.schema.ts` 是唯一记录原始字段形态的地方（哪些
   `.optional()`、哪些 `.indexed()`）。迁移脚本的字段映射就是照着它写的。
3. **删除是不可逆的一步，而保留的成本接近零** —— 死代码不进 bundle，只占仓库
   空间。

## 下线步骤（时机成熟再执行，按顺序）

1. **确认 Rails 侧稳定**：生产走过完整的创建 profile → 建 class → 发徽章 →
   领取 / 拒绝，且 `badges:verify` 对账仍然干净。
2. **最后再导出一次** `node --env-file=.env scripts/export-instant-badges.mjs`，
   与 Postgres 对账，确认切换之后 Instant 侧没有产生新写入（应该不会，已经没有
   写入方了）。归档这份导出。
3. **处理 `errors` entity** —— 里面有历史 PIN，属于敏感数据。它在代码里早就没有
   写入方了，下线时应当整体删除而不是导出保留。
4. 删除 `server/utils/db/` 三个文件。
5. 从 `package.json` 移除 `@instantdb/admin` 和 `db-schema-push`，`pnpm install`
   更新 lockfile。
6. 从 `ginger.yml` 和 `.env.example` 移除四个 `INSTANT_*` 变量，
   从 `.env` / `.env.production` 移除实际值。
7. **吊销 `INSTANT_APP_ADMIN_TOKEN`**，然后在 Instant 控制台删除 app。

## 相关

- 迁移脚本：`scripts/export-instant-badges.mjs`（导出）、
  semi-backend `lib/tasks/badges.rake`（导入与对账）
- 后端表结构：semi-backend `db/migrate/20260901000001_create_badge_tables.rb`
- 后端端点：semi-backend `app/controllers/badges_controller.rb`
- 数据里已知的两处历史问题（迁移原样带过来了，没有修改数据）：
  - 4 枚徽章的收件人地址是全小写。它们的 `badge_id` 由小写地址 namehash 得出，
    改地址等于换 id，所以只能在代码侧兼容，见 `server/utils/badge_address.ts`。
  - 7 个 badge_class 的 `profile_id` 指向不存在的 profile，其中一条的
    `profile_id` 和 `class_id` 都是 `keccak256("")`。列表接口按 `profile_id`
    过滤，因此不会把它们显示出来。
