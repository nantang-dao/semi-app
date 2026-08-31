# dev server 起不来：`spawn EBADF`

2026-08-31 记录。症状是 `pnpm dev` 之后端口能 listen、Vite 正常，但每个请求都 500：

```
✔ Vite dev server built in 43ms
[nitro]  ERROR  Error: spawn EBADF
```

`pnpm build` 完全不受影响 —— 构建没有 watcher。

## 修复

`nuxt.config.ts`：

```ts
ignore: ["packages/*/node_modules/**"],
```

fd 数从 **10,470 降到 409**，Nitro 恢复正常（`✔ built in 816ms`）。

**glob 必须收窄到 workspace 内嵌的那一个。** 写成 `**/node_modules/**` 会连
`node_modules/@nuxt/ui` 的组件扫描一起挡掉，页面上报
`Failed to resolve component: UTabs`（UButton / UModal / UPinInput 同理）——
这个坑踩过一次，别再踩。

## 成因

1. Nuxt 的 `createGranularWatcher`（`nuxt/dist/index.mjs:8289`）用 `depth: 0` 监听项目根，
   再给**每个顶层目录**单独建一个不限深度的 chokidar watcher。
2. 它对 node_modules 有两道保护，但**都只覆盖根目录**：
   - 根 watcher 的 `ignored: [isIgnored, /[\/]node_modules[\/]/]`；这条正则**不传给子 watcher**
     （子 watcher 只有 `ignored: [isIgnored]`）
   - `ignoredDirs = new Set([...nuxt.options.modulesDir, nuxt.options.buildDir])`；
     它只在**根 watcher 的 handler 里**对顶层目录的直接子目录检查
3. `packages/semi-core/node_modules` 是孙子级 —— `packages` 拿到的是一个不限深度的
   子 watcher，chokidar 自己走进去，两道保护都够不着。
4. 里面是 pnpm 的符号链接，chokidar 默认 `followSymlinks: true`：

   ```
   viem           -> ../../../node_modules/.pnpm/viem@2.56.0.../node_modules/viem
   permissionless -> ../../../node_modules/.pnpm/permissionless@0.4.0.../node_modules/permissionless
   vitest         -> ../../../node_modules/.pnpm/vitest@4.1.11.../node_modules/vitest
   typescript     -> ../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript
   ```

   viem 一个包就有 **10,074 个文件**，全被监听。
5. chokidar 5 逐文件 `fs.watch`（v4 起移除了 fsevents），macOS 上走 kqueue，
   **一个文件一个常驻 fd**。
6. 越过约 10,240 个 fd 后，Node 的 `child_process.spawn` 一律返回 EBADF。
7. nitropack 在 rollup transform 里同步调 esbuild，esbuild 需要 spawn native service
   进程 → 失败 → Nitro 的 dev handler 建不起来 → 所有请求 500。

第 6 步脱离 Nuxt 单独复现过：

```
opened 10400 fds; max fd = 10410
spawn FAILED: EBADF spawn EBADF
```

二分下来，**10,000 个 fd 仍可 spawn，10,200 个必挂**。这个坎与 `ulimit -n`（1048576）和
`kern.maxfilesperproc`（245760）都无关，是 Node/libuv 自身在 spawn 路径上的限制。

**根 `node_modules` 一直是安全的**（它在 `ignoredDirs` 里，且是顶层目录的直接子目录）。
lsof 报出的是符号链接解析后的真实路径（`node_modules/.pnpm/viem@...`），极易误判成
根 node_modules 泄漏 —— 要确认真正的入口，去看 `packages/*/node_modules/` 里的链接，
数量分布会精确对上：

```
lsof 统计                         符号链接
8640  .pnpm/viem@2.56.0...        viem
 735  .pnpm/permissionless@0.4.0  permissionless
  73  .pnpm/vitest@4.1.11         vitest
  32  .pnpm/typescript@5.9.3      typescript
```

## 何时引入

`84b2b74`（2026-08-23）"Extract keys and chain constants into a semi-core package"
建了 `pnpm-workspace.yaml` 和 `packages/semi-core/`，第一次让嵌套的 node_modules
符号链接农场出现在被监听的顶层目录下。

但它只是装上了雷。之后依赖持续变大（viem 2.48→2.56、permissionless 0.4.0、vitest 4），
加上磁盘上遗留的 `example/`（679 个 fd），总数才越过 10,240。删掉 `example/` 后是
9,791，仍能跑 —— 只剩 449 的余量。所以这是累积效应，不是某一次改动，
而且没有本次修复的话，随便再加一个依赖就会复发。

## 无效的做法（别再试）

| 做法 | 结果 |
|---|---|
| `watchers.chokidar.ignored` | fd 数一个没降（10,451 → 10,451） |
| `vite.server.watch.ignored` | 同上 |
| `nitro.watchOptions.ignored` | 同上 |
| `modulesDir` 加入嵌套 node_modules | 9,902，无效 |
| `ignore: ["**/node_modules/**"]` | fd 降了，但**组件全挂**，见上文 |

前三项传不到子 watcher。`modulesDir` 无效是因为 `ignoredDirs` 只在根 watcher 的 handler
里检查直接子目录，孙子级根本走不到那段代码。

升级也不解决：逐文件 `fs.watch` 是 chokidar v4 移除 fsevents 之后的既定行为；
Nuxt 方面对比过 3.21.4 与 4.5.2 的 `createGranularWatcher`，两者功能完全一致
（同样的 `depth: 0`、同样的 `ignored` 传递方式），**不是 Nuxt 4 的回归**。

## 诊断方法

不需要 dtrace（macOS 有 SIP，而且 syscall 层拿不到 JS 调用栈）。三步：

1. **找对进程再 lsof。** `pgrep -f "nuxt dev"` 匹配不到真正干活的进程，按 fd 数排序找：
   ```bash
   lsof -n -P | awk 'NR>1{c[$2]++} END{for(p in c) print c[p], p}' | sort -rn | head
   lsof -n -P -p <PID> | awk 'NR>1 && $5=="REG"{print $NF}' \
     | sed 's|.*/semi-app/||' | awk -F/ '{print $1"/"$2"/"$3}' | sort | uniq -c | sort -rn
   ```

2. **定位是谁建的 watcher**：在 chokidar 入口
   （`node_modules/.pnpm/chokidar@5.0.0/node_modules/chokidar/index.js` 的
   `export function watch`）临时插一行打印 `paths` / `options.ignored` / `new Error().stack`，
   用完还原。从外面 monkeypatch `fs.watch` 或 `Module._load` 都抓不到 —— chokidar 走 ESM 加载。

3. **改完必须验组件**，不能只看 fd 数掉下来了。至少跑一次 `pnpm build`，再用浏览器打开
   `/` 和 `/login`（都不需要登录）确认没有 `Failed to resolve component`，
   且 `/login` 上有 2 个 button、1 个 input、1 个 form。

## 顺带

`semi-app/example/` 已删除：里面只有一个 `node_modules`（hono、bun-types），没有源码，
git 也未跟踪（曾在 `02d560c add oauth` 中提交过，后来从索引移除但留在了磁盘上），
却单独占了 679 个 fd。其中的 `example/.env.local` 含一个 64 字符的 `API_KEY`，
删除前已另行备份 —— 该 key 是否仍在使用、是否需要轮换，待确认。
