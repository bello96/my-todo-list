# 项目上下文（给 Claude Code 用）

## 一句话定位

Cloudflare 全栈待办应用：Pages（前端） + Pages Functions（API） + D1（SQLite）+ JWT Cookie 鉴权。生产域名 https://todo.dengjiabei.cn/。

## 当前状态

最新 tag：`v0.1.1`（修了 review 必修项 H1/H2）。
迁移起点 tag：`pre-cloudflare-migration`（CloudBase 时代最后一个 commit）。

最近大改：删 antd → daisyUI + react-day-picker + react-hot-toast；dev 默认走线上 API 反代；去掉主题切换，固定 light 主题。

## 关键架构决策（为什么这么做）

### Dev 默认代理线上 API，测试走本地 functions

`vite.config.js` 默认把 `/api/*` 反代到 `https://todo.dengjiabei.cn`：

- 调试 UI 直接拿真实数据，不用本地 D1
- `cookieDomainRewrite: { '*': '' }` 去掉 cookie 的 Domain 属性，让 cookie 落到 `localhost`
- proxyRes 钩子剥掉 `Secure` flag，让 http://localhost 也能保存 cookie
- **代价**：本地 functions/ 代码改动看不到效果（要切隔离模式），且任何前端 bug 会污染生产 D1

切到本地 functions 隔离模式：

```powershell
$env:USE_LOCAL_FUNCTIONS='1'; pnpm dev
```

启用 `dev/vite-plugin-functions.js`：本地 `/api/*` 走 `functions/api/**` 代码 + `node:sqlite` 模拟 D1（数据存 `.wrangler/state-test/dev.sqlite`）。集成测试自动设这个 env（见 `tests/setup/global.mjs`），保护生产数据。

> 为什么不用 `wrangler pages dev`？`wrangler/workerd` 在 Windows 11 上有 access violation 崩溃，wrangler 3.x 和 4.x 都复现。`dev/vite-plugin-functions.js` 是替代方案。

### PBKDF2 100k iter（不是 OWASP 推荐的 600k）

Cloudflare Workers 的 `crypto.subtle.deriveBits` 对 PBKDF2 iter 硬限制 ≤ 100,000。本地 Node 22 无此限制，所以本地测试通过但生产 register 抛 `NotSupportedError`，被 `_middleware.js` 兜成 500。

`functions/lib/auth.js` 的 `PBKDF2_ITER = 100000` 不要再改大。配合密码最小长度 ≥ 10 字符（H1 修复）。

### 后端不读 `wrangler.toml` 的 binding 声明

Pages Functions 实际从 Cloudflare 控制台 **Settings → Bindings** 读 D1 binding，从 **Variables and Secrets** 读 `JWT_SECRET`。`wrangler.toml` 里的 `[[d1_databases]]` 是 wrangler CLI 自身用（比如 `wrangler d1 execute` 走 binding 名查 db_id），**不会自动注入到 Pages runtime**。

部署新项目时这两项**必须在 dashboard 手动配置**。

### deploy commit message 必须 ASCII

`wrangler pages deploy` 会把 git log 的 HEAD commit message 通过 Cloudflare API 传上去。Windows GBK 控制台编码会污染中文，Cloudflare API 直接拒绝。永远显式 `--commit-message="ASCII string"`。

本地 git commit message 中文不受影响（git 自身用 UTF-8）。

### 前端只用 daisyUI + tailwind，不再有 antd

之前 antd + daisyUI + tailwind 三套并存导致主题切换要同步两套、bundle 膨胀。已移除 antd 全部用法：

- `Modal` → daisyUI `modal modal-open` + 自定义 backdrop
- `DatePicker` / `RangePicker` → `react-day-picker` + React Portal
- `Calendar` → 自定义 dayjs 6×7 网格（事件日历观感比硬塞 day-picker 更干净）
- `message` → `react-hot-toast`
- `Dropdown` / `Avatar` → daisyUI `details.dropdown` + `avatar-placeholder`
- `@ant-design/icons` → `@heroicons/react/24/outline`

`tailwind.config.js` 里 daisyUI `themes: ["light"]`，主题切换已去掉（`<html data-theme="light">` 固定）。

## 常用命令速查

```bash
pnpm dev                  # 默认前端本地 + API 反代线上 https://todo.dengjiabei.cn
pnpm test                 # 集成测试（自动 USE_LOCAL_FUNCTIONS=1 走本地 functions）
pnpm build                # vite build → dist/

# 本地 functions 隔离模式（调后端 / 离线开发）
$env:USE_LOCAL_FUNCTIONS='1'; pnpm dev

# D1 schema 操作
pnpm run db:apply:local    # 本地 .wrangler/ 目录 D1 apply schema
pnpm run db:apply:remote   # 生产 D1 apply schema
pnpm run db:apply:test     # 测试 D1 apply schema（持久化到 .wrangler/state-test/）

# 部署到 Cloudflare Pages（branch=main 必加，否则可能 deploy 到 Preview env 拿不到 binding）
pnpm build && npx wrangler pages deploy dist --project-name=my-todo-list --branch=main --commit-message="ASCII desc"

# 远程 D1 单条命令调试
npx wrangler d1 execute todo-list-db --remote --command="SELECT ..."
```

## 已知坑（已踩过的不要再踩）

- **Git Bash 子进程崩溃**：在 Windows 上 Git Bash spawn 重量级子进程（npm/node/wrangler）容易触发 `add_item ("\??\C:\Program Files\Git", ...)` fatal error，bash 进程池被污染后后续命令也跑不了，只能等几分钟自愈或重启会话。重要的 deploy / 测试命令优先在用户自己的 PowerShell 跑。
- **PowerShell 5.1 curl 引号转义**：`curl.exe -d "{\"key\":\"val\"}"` 在 PS 5.1 下 `\"` 会被吃掉。需要 `--data-binary "@file.json"` 或者用 PowerShell 7。
- **`*.pages.dev` 国内可达性**：Cloudflare 二级随机子域在国内时通时断。验证用自定义域名 `todo.dengjiabei.cn`（走 CF 自家入口）。
- **wrangler tail 走 WebSocket 在国内被拦**：诊断 functions runtime 错误用临时 debug endpoint，不要指望 `wrangler tail`。
- **npmjs.org 国内 SSL 握手被重置（EPROTO）**：用 `pnpm install --registry=https://registry.npmmirror.com` 或持久化 `pnpm config set registry https://registry.npmmirror.com`。

## Commit 约定

继承用户全局 `CLAUDE.md` 的规则：

- commit message 描述部分必须中文，`feat:`/`fix:`/`style:` 等前缀可保留英文。
- 不写 `Co-Authored-By: Claude Opus ...`；改用 `合作：Claude Code Opus` 作为 trailer。
- 多行 commit message 用 `git commit -F .git/COMMIT_MSG_TMP`（避免 Windows 控制台 GBK 污染）。
- 所有 `if` 语句必须用花括号，禁止省略。

## Review 留下的待办

来自历次 code review，按 severity：

- **P0**：`functions/lib/db.js:7` 把 `task_date` 序列化成 `createdAt`，语义严重错位。前端 `CalendarView.jsx` 用 `todo.createdAt` 当任务日期过滤，跨 UTC 边界会偏移，且真正的创建时间在前端无法访问。应分别 expose `taskDate` 和 `createdAt`。
- **H3**：JWT 不可吊销。`functions/api/todos/_middleware.js` 直接信任 `payload.sub`，被删账号 7 天内仍能读写自己历史 todo。推荐用 `users.token_version` 字段 + JWT payload 里塞 `tv`，verify 时比对。
- **M1**：`functions/api/auth/register.js:29` 用 `msg.includes('UNIQUE')` 判 D1 错误是脆弱启发式。改成捕获 `err.cause?.code === 'SQLITE_CONSTRAINT'` 更稳。
- **M2（新）**：`bulk-complete.js` 允许 1000 个 ID，但 D1 单语句 SQL 参数限制 ~100，生产会挂。limit 调小或内部分批。
- **M3（可选加固）**：CSRF 用 `SameSite=Lax` + JSON content-type 拦截，覆盖度够但不彻底。考虑升级 `SameSite=Strict`（同源 SPA 完全可行）或在 `_middleware.js` 加 `content-type === application/json` 闸口。
- **M4**：register 接口暴露用户名是否存在（防枚举）。配 Cloudflare WAF 给 `/api/auth/register` 加 IP rate limit（5 次/分钟）即可。
- **M5（新）**：`me` 接口对孤儿 token（用户已删但 JWT 未过期）没清 cookie，前端会反复 401。应 `Set-Cookie: token=; Max-Age=0`。
- **L1**：测试缺 IDOR 写路径用例（A 用户 PATCH/DELETE B 的 todo id 应 404）、JWT 篡改用例、bulk-complete 越权用例。

## 不要做的事

- **不要把 PBKDF2_ITER 调高**：Workers 平台限制，调高直接 500。
- **不要在 `functions/_middleware.js` 里返回原始错误信息给前端**：保持 `'服务器错误'` 不变，stack 只写 console.error。
- **不要往 wrangler.toml 里写 secret**：所有 secret 走 `.dev.vars`（本地）+ Cloudflare dashboard（生产）。
- **不要重新移动 `v0.1.0` tag**：tag 一旦发布 immutable，新修复打 `v0.1.x`。
- **不要把 dev 工具暴露到 production bundle**：`dev/` 目录 + `dev/vite-plugin-functions.js` 仅 `apply: 'serve'`，build 不会带；保持这个约束。
- **不要在 dev 默认模式（代理线上）下做破坏性操作测试**：直接写生产 D1，要测删数据/迁移类操作请先切 `USE_LOCAL_FUNCTIONS=1`。
