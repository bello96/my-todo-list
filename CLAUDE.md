# 项目上下文（给 Claude Code 用）

## 一句话定位

Cloudflare 全栈待办应用：Pages（前端） + Pages Functions（API） + D1（SQLite）+ JWT Cookie 鉴权。生产域名 https://todo.dengjiabei.cn/。

## 当前状态

最新 tag：`v0.1.1`（修了 review 必修项 H1/H2）。
迁移起点 tag：`pre-cloudflare-migration`（CloudBase 时代最后一个 commit）。

## 关键架构决策（为什么这么做）

### 本地开发用自写 vite 插件，不用 `wrangler pages dev`

`wrangler/workerd` 在 Windows 11 上有 access violation 崩溃，wrangler 3.x 和 4.x 都复现。`dev/vite-plugin-functions.js` 是替代方案，在 vite dev 阶段拦截 `/api/*` 转发到 `functions/api/**`，并用 Node 22 内置 `node:sqlite` 模拟 D1Database 接口（`dev/d1-adapter.js`）。

只在 `apply: 'serve'` 阶段启用，`npm run build` 不会打入生产 bundle。

### PBKDF2 100k iter（不是 OWASP 推荐的 600k）

Cloudflare Workers 的 `crypto.subtle.deriveBits` 对 PBKDF2 iter 硬限制 ≤ 100,000。本地 Node 22 无此限制，所以本地测试通过但生产 register 抛 `NotSupportedError`，被 `_middleware.js` 兜成 500。

`functions/lib/auth.js` 的 `PBKDF2_ITER = 100000` 不要再改大。配合密码最小长度 ≥ 10 字符（H1 修复）。

### 后端不读 `wrangler.toml` 的 binding 声明

Pages Functions 实际从 Cloudflare 控制台 **Settings → Bindings** 读 D1 binding，从 **Variables and Secrets** 读 `JWT_SECRET`。`wrangler.toml` 里的 `[[d1_databases]]` 是 wrangler CLI 自身用（比如 `wrangler d1 execute` 走 binding 名查 db_id），**不会自动注入到 Pages runtime**。

部署新项目时这两项**必须在 dashboard 手动配置**。

### deploy commit message 必须 ASCII

`wrangler pages deploy` 会把 git log 的 HEAD commit message 通过 Cloudflare API 传上去。Windows GBK 控制台编码会污染中文，Cloudflare API 直接拒绝。永远显式 `--commit-message="ASCII string"`。

本地 git commit message 中文不受影响（git 自身用 UTF-8）。

## 常用命令速查

```bash
npm run dev               # 本地 http://localhost:5173（前+API 一体）
npm test                  # 集成测试（vitest，启子进程跑 vite dev）
npm run db:apply:local    # 本地 .wrangler/ 目录 D1 apply schema
npm run db:apply:remote   # 生产 D1 apply schema
npm run db:apply:test     # 测试 D1 apply schema（持久化到 .wrangler/state-test/）

# 部署到 Cloudflare Pages（branch=main 必加，否则可能 deploy 到 Preview env 拿不到 binding）
npm run build && npx wrangler pages deploy dist --project-name=my-todo-list --branch=main --commit-message="ASCII desc"

# 远程 D1 单条命令调试
npx wrangler d1 execute todo-list-db --remote --command="SELECT ..."
```

## 已知坑（已踩过的不要再踩）

- **Git Bash 子进程崩溃**：在 Windows 上 Git Bash spawn 重量级子进程（npm/node/wrangler）容易触发 `add_item ("\??\C:\Program Files\Git", ...)` fatal error，bash 进程池被污染后后续命令也跑不了，只能等几分钟自愈或重启会话。重要的 deploy / 测试命令优先在用户自己的 PowerShell 跑。
- **PowerShell 5.1 curl 引号转义**：`curl.exe -d "{\"key\":\"val\"}"` 在 PS 5.1 下 `\"` 会被吃掉。需要 `--data-binary "@file.json"` 或者用 PowerShell 7。
- **`*.pages.dev` 国内可达性**：Cloudflare 二级随机子域在国内时通时断。验证用自定义域名 `todo.dengjiabei.cn`（走 CF 自家入口）。
- **wrangler tail 走 WebSocket 在国内被拦**：诊断 functions runtime 错误用临时 debug endpoint，不要指望 `wrangler tail`。

## Commit 约定

继承用户全局 `CLAUDE.md` 的规则：

- commit message 描述部分必须中文，`feat:`/`fix:`/`style:` 等前缀可保留英文。
- 不写 `Co-Authored-By: Claude Opus ...`；改用 `合作：Claude Code Opus` 作为 trailer。
- 多行 commit message 用 `git commit -F .git/COMMIT_MSG_TMP`（避免 Windows 控制台 GBK 污染）。
- 所有 `if` 语句必须用花括号，禁止省略。

## Review 留下的待办

来自 v0.1.0 的独立 code review，按 severity：

- **H3（强烈建议）**：JWT 不可吊销。`functions/api/todos/_middleware.js` 直接信任 `payload.sub`，被删账号 7 天内仍能读写自己历史 todo。推荐用 `users.token_version` 字段 + JWT payload 里塞 `tv`，verify 时比对。
- **M1**：`functions/api/auth/register.js:29` 用 `msg.includes('UNIQUE')` 判 D1 错误是脆弱启发式。改成捕获 `err.cause?.code === 'SQLITE_CONSTRAINT'` 更稳。
- **M3（可选加固）**：CSRF 用 `SameSite=Lax` + JSON content-type 拦截，覆盖度够但不彻底。考虑升级 `SameSite=Strict`（同源 SPA 完全可行）或在 `_middleware.js` 加 `content-type === application/json` 闸口。
- **M4**：register 接口暴露用户名是否存在（防枚举）。配 Cloudflare WAF 给 `/api/auth/register` 加 IP rate limit（5 次/分钟）即可。
- **L1**：测试缺 IDOR 写路径用例（A 用户 PATCH/DELETE B 的 todo id 应 404）、JWT 篡改用例、bulk-complete 越权用例。

## 不要做的事

- **不要把 PBKDF2_ITER 调高**：Workers 平台限制，调高直接 500。
- **不要在 `functions/_middleware.js` 里返回原始错误信息给前端**：保持 `'服务器错误'` 不变，stack 只写 console.error。
- **不要往 wrangler.toml 里写 secret**：所有 secret 走 `.dev.vars`（本地）+ Cloudflare dashboard（生产）。
- **不要重新移动 `v0.1.0` tag**：tag 一旦发布 immutable，新修复打 `v0.1.x`。
- **不要把 dev 工具暴露到 production bundle**：`dev/` 目录 + `dev/vite-plugin-functions.js` 仅 `apply: 'serve'`，build 不会带；保持这个约束。
