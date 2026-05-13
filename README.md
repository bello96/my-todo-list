# my-todo-list

基于 Cloudflare 全栈技术栈的待办事项应用：日历视图 + 用户注册/登录 + 主题切换。

在线访问：<https://todo.dengjiabei.cn/>

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + Vite + React Router 6 (HashRouter) + Tailwind CSS + DaisyUI + Ant Design + Framer Motion |
| API | Cloudflare Pages Functions（文件路由），全部位于 `functions/api/**/*.js` |
| 数据 | Cloudflare D1（SQLite） |
| 鉴权 | PBKDF2-SHA256 + JWT (HS256, 7 天) + httpOnly Secure SameSite=Lax Cookie |
| 部署 | Cloudflare Pages（前端 + Functions 一体） |

## 项目结构

```
my-todo-list/
├── functions/                  # Cloudflare Pages Functions（生产 API）
│   ├── _middleware.js          # 全局错误兜底（AppError → JSON / 其他 → 500 INTERNAL）
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register.js     # POST 注册
│   │   │   ├── login.js        # POST 登录
│   │   │   ├── logout.js       # POST 登出（清 cookie）
│   │   │   └── me.js           # GET 当前用户
│   │   └── todos/
│   │       ├── _middleware.js  # JWT 鉴权链
│   │       ├── index.js        # GET 列表 + POST 新建
│   │       ├── [id].js         # PATCH + DELETE
│   │       └── bulk-complete.js
│   └── lib/                    # 通用库
│       ├── auth.js             # 密码哈希 / JWT / Cookie
│       ├── db.js               # 行序列化
│       └── errors.js           # AppError + 错误工厂
├── migrations/
│   └── 0001_init.sql           # D1 schema（users + todos）
├── dev/                        # 本地开发桥接（仅 dev，build 不打入）
│   ├── d1-adapter.js           # Node 22 node:sqlite → D1Database 接口
│   └── vite-plugin-functions.js  # 模拟 Pages Functions 路由
├── src/                        # 前端
│   ├── components/
│   ├── pages/
│   ├── utils/
│   │   ├── api.js              # fetch 封装（credentials: include + 401 全局处理）
│   │   └── auth.js             # 登录状态（无 localStorage，bootstrap 走 /api/auth/me）
│   ├── App.jsx
│   └── main.jsx
├── tests/api/                  # vitest 集成测试（启子进程跑 vite dev）
├── wrangler.toml               # name / compatibility_date / D1 binding 声明
└── .dev.vars                   # 本地 secret（已 .gitignore）
```

## 本地开发

依赖 Node 22（启用 `node:sqlite` 实验性内置模块）。

```bash
npm install
npm run dev           # 启动 http://localhost:5173，前后端一体
```

`vite-plugin-functions` 会在 dev 时拦截 `/api/*` 请求，转发到 `functions/api/**`，并用 `node:sqlite` 做 D1 模拟。第一次启动会自动建 schema 到 `.wrangler/state-test/dev.sqlite`。

`.dev.vars`（已 `.gitignore`）示例：

```
JWT_SECRET=至少32字符的随机串
```

> 为什么不用 `wrangler pages dev`？它依赖 workerd，在 Windows 11 上有 access violation 崩溃问题。我们的 vite 插件等价于"功能完整的本地 Pages Functions 跑环境"。

## 测试

```bash
npm test
```

`tests/setup/global.mjs` 会启动一个独立的 vite dev 子进程（端口 5174，DB 用 `:memory:`），跑完所有 fetch 风格集成测试再 tree-kill。

## 部署

### 一次性准备

1. 安装并登录 wrangler：
   ```bash
   npx wrangler login
   ```
2. 创建 D1 数据库：
   ```bash
   npx wrangler d1 create todo-list-db
   ```
   把返回的 `database_id` 写进 `wrangler.toml`。
3. 把 schema 推到远程：
   ```bash
   npm run db:apply:remote
   ```
4. 在 Cloudflare Pages 控制台为项目配置：
   - **Settings → Variables and Secrets** 添加 `JWT_SECRET`（≥ 32 字符随机串）
   - **Settings → Bindings** 添加 D1 binding：variable name `DB`，database `todo-list-db`，environment 至少包含 Production
5. （可选）**Custom domains** 绑定自定义域名。

### 后续每次部署

```bash
npm run build
npx wrangler pages deploy dist --project-name=my-todo-list --branch=main --commit-message="ASCII commit message"
```

> `--commit-message` 必须 ASCII —— Cloudflare API 拒绝包含中文的 commit message（Windows GBK 控制台编码污染）。
> 本地 git commit 仍然按中文规范写，与 deploy commit message 分离。

## 安全说明

- **密码哈希**：PBKDF2-SHA256，**100,000 iterations**，16 字节随机 salt，32 字节 hash。Cloudflare Workers 的 Web Crypto API 硬限制 iter ≤ 100k；本地 Node 22 无此限制。配合 ≥ 10 字符的密码长度要求。
- **JWT secret**：`signJwt`/`verifyJwt` 入口断言 `secret.length >= 32`，运行时 fail-fast，防止误配弱 secret。
- **Cookie**：httpOnly、Secure（dev 转发剥离）、SameSite=Lax、Max-Age 7 天、Path=/。
- **租户隔离**：所有 todo 读/写 SQL 都强制 `WHERE user_id = ?`。
- **错误兜底**：`_middleware.js` 在非 `AppError` 情况下统一返 500 + `INTERNAL`，不向前端泄漏 stack。

## 已知限制 / 后续计划

- 无 token revocation：被删账号 7 天内 JWT 仍可用（计划用 `users.token_version` 字段实现）。
- 注册接口未限速：可被枚举用户名（建议在 Cloudflare WAF 加 IP rate limit）。
- 测试缺 IDOR 写路径（PATCH/DELETE 别人 todo）、JWT 篡改、bulk-complete 越权用例。

## 许可证

MIT
