# Cloudflare 全栈迁移设计文档

- **日期**：2026-05-05
- **范围**：将 my-todo-list 从腾讯云开发（CloudBase）整体迁移到 Cloudflare 平台，部署到 `https://todo.dengjiabei.cn/`
- **状态**：设计已确认，待写实施计划

---

## 1. 背景与目标

### 1.1 当前情况

`my-todo-list` 是一个基于 CloudBase 的多用户待办事项 Web 应用，技术栈为 React 19 + Vite + Antd + Tailwind/DaisyUI + Framer Motion，后端使用 CloudBase 的云函数（用户认证）+ 云数据库（todos 集合）+ 云存储（头像）。

### 1.2 迁移目标

- 替换底层后端为 Cloudflare 全家桶（Pages + Pages Functions + D1）
- 部署到 `todo.dengjiabei.cn`（域名 NS 已托管在 Cloudflare）
- 保留账号注册登录功能
- 砍掉头像上传，避免引入 R2
- 全新数据库，无需迁移历史数据
- 实现极简版认证：用户名+密码、JWT 7 天、无邮件、无第三方登录
- 单一 Pages 项目部署，前后端一体化
- 删除全部 CloudBase 残留代码与配置

### 1.3 已确认的关键决策

| 决策点 | 用户选择 |
|--------|---------|
| Cloudflare 准备情况 | 账号、域名 NS 托管、wrangler CLI 全部就绪 |
| 功能范围 | 保留登录/日历/列表/CRUD/主题；砍头像上传 |
| 数据迁移 | 无数据，全新开始 |
| 认证形态 | 极简版：用户名+密码、JWT 7 天、无邮件、无第三方登录 |
| 部署架构 | 单一 Pages 项目（Pages + Pages Functions） |
| CloudBase 残留处理 | 全部干净删除（含 rules、cloudfunctions、cloudbaserc.json 等） |
| 账号字段 | 保持现状用 username（不强制邮箱格式） |
| 字段命名 | 后端用规范名（id/user_id/task_date），通过序列化映射兼容前端旧字段名 |
| JWT 实现 | 使用 `@tsndr/cloudflare-worker-jwt` 库（密码学代码用社区审计版本更稳） |

---

## 2. 总体架构

```
                    ┌────────────────────────────────────────┐
                    │      todo.dengjiabei.cn (CF Pages)     │
                    │                                        │
   浏览器 ──HTTPS──▶ │  ┌──────────────┐   ┌───────────────┐ │
                    │  │  静态 React  │   │ Pages Functions│ │
                    │  │  (Vite dist) │   │  /api/*  路由  │ │
                    │  └──────────────┘   └────────┬───────┘ │
                    │                              │         │
                    └──────────────────────────────┼─────────┘
                                                   │ binding
                                                   ▼
                                       ┌──────────────────────┐
                                       │ Cloudflare D1 (SQLite)│
                                       │   users, todos       │
                                       └──────────────────────┘
```

**技术栈**：

- **前端**：保留 React 19 + Vite 6 + Antd 5 + Tailwind 3 + DaisyUI 5 + Framer Motion，仅替换数据层
- **后端**：Pages Functions（Workers 运行时，文件即路由），位于 `functions/api/`
- **数据库**：D1（SQLite-based，免费额度对个人 Todo 完全够）
- **认证**：JWT 存 httpOnly Cookie，密码使用 Web Crypto API 的 PBKDF2 + 随机 salt（替代现有不安全的纯 SHA256）
- **本地开发**：`wrangler pages dev` + 本地 D1（`.wrangler/state` 下 SQLite 文件）+ Vite dev 代理

**部署链路**：

- `wrangler pages deploy dist`（或 git push 触发 CI）→ Pages 构建并发布
- 自定义域 `todo.dengjiabei.cn` 通过 Pages 控制台绑定
- Secrets（JWT 密钥）通过 `wrangler pages secret put JWT_SECRET` 注入

---

## 3. 数据模型（D1 Schema）

```sql
-- 用户表
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,           -- 格式: pbkdf2$<iter>$<salt_b64>$<hash_b64>
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE INDEX idx_users_username ON users(username);

-- 待办表
CREATE TABLE todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  content     TEXT    NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,    -- SQLite 没有 boolean，使用 0/1
  task_date   TEXT    NOT NULL,              -- 'YYYY-MM-DD'，用于按日筛选与月视图
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_todos_user_date ON todos(user_id, task_date);
```

> **D1 外键限制 note**：D1 对 `FOREIGN KEY ... ON DELETE CASCADE` 的强制执行因 SQLite/D1 默认的 `PRAGMA foreign_keys` 行为而**不保证生效**。本表声明 CASCADE 仅作语义文档之用。如未来要支持"注销账号"这种业务，需要在业务代码中显式 `DELETE FROM todos WHERE user_id=?`，不要依赖 CASCADE 自动清理。本期范围内不支持注销，无影响。

### 3.1 与旧模型的差异

| 旧（CloudBase） | 新（D1） | 原因 |
|----------------|---------|------|
| `taskId`（前端 `Math.random` 字符串） | `id`（自增整数） | 后端生成，唯一性保证，索引高效 |
| `createdAt`（含日期+时间字符串）兼任任务日期 | 拆分为 `task_date`（日）+ `created_at`（时间戳） | 月视图按日聚合时不需要字符串前缀匹配，索引可直接命中 |
| `userId` + `userName`（冗余） | 仅 `user_id`（外键） | 用户改名只改一处；查询通过 JOIN |
| `password`（纯 SHA256 无 salt） | `password_hash`（PBKDF2 + 随机 salt + 600k 迭代） | 抗彩虹表与暴力破解，符合 OWASP 2023 建议 |

### 3.2 前端字段映射

后端在序列化时将规范字段名映射为前端旧名，最小化前端 diff：

```js
function serializeTodo(row) {
  return {
    taskId:    row.id,
    content:   row.content,
    completed: row.completed === 1,
    userId:    row.user_id,
    createdAt: `${row.task_date} 00:00:00`,
  };
}
```

---

## 4. API 设计

### 4.1 路由清单

| 方法 | 路径 | 用途 | 鉴权 |
|------|------|------|------|
| `POST` | `/api/auth/register` | 注册 | 公开 |
| `POST` | `/api/auth/login` | 登录，颁发 JWT cookie | 公开 |
| `POST` | `/api/auth/logout` | 清除 cookie | 已登录 |
| `GET`  | `/api/auth/me` | 取当前用户信息（前端启动调一次） | 已登录 |
| `GET`  | `/api/todos?from=YYYY-MM-DD&to=YYYY-MM-DD` | 按日期范围查 | 已登录 |
| `POST` | `/api/todos` | 新建（body: `{content, taskDate}`） | 已登录 |
| `PATCH`| `/api/todos/:id` | 更新（body 可选 `content`、`completed`） | 已登录 |
| `DELETE`| `/api/todos/:id` | 删除 | 已登录 |
| `POST` | `/api/todos/bulk-complete` | 批量完成/取消（body: `{ids:[...], completed:bool}`） | 已登录 |

### 4.2 请求/响应规范

**统一格式**：

```json
// 成功
{ "data": <payload> }

// 失败
{ "error": { "code": "INVALID_CREDENTIALS", "message": "用户名或密码错误" } }
```

**HTTP 状态码语义化使用**：`200 / 201 / 204 / 400 / 401 / 403 / 404 / 409 / 500`

### 4.3 文件组织

```
functions/
├── _middleware.js                   # 全局：CORS、JSON 解析、错误兜底
├── api/
│   ├── auth/
│   │   ├── _middleware.js           # 注册/登录无需鉴权（占位，预留限流）
│   │   ├── register.js
│   │   ├── login.js
│   │   ├── logout.js
│   │   └── me.js
│   └── todos/
│       ├── _middleware.js           # 鉴权：校验 JWT，挂 ctx.data.user
│       ├── index.js                 # GET 列表 / POST 新建
│       ├── [id].js                  # PATCH / DELETE 单个
│       └── bulk-complete.js
└── lib/                             # 共用工具（无 index 不会成路由）
    ├── auth.js                      # PBKDF2 哈希、JWT 签发/校验
    ├── db.js                        # D1 查询封装
    └── errors.js                    # AppError 类、错误码常量
```

### 4.4 中间件链

```
请求 → /functions/_middleware.js（CORS / 错误兜底 / JSON 解析）
     → /functions/api/todos/_middleware.js（authGuard：解析 cookie 中 JWT，401 if invalid）
     → handler（拿到 ctx.data.user.id 后查询）
```

---

## 5. 认证流程

### 5.1 注册

```
前端                          Workers                          D1
  │  {username, password}        │                                │
  ├──────────────────────────▶  │                                │
  │                              │ 1. 校验长度（uname 3-20, pwd ≥6）│
  │                              │ 2. 生成 16 字节 salt           │
  │                              │ 3. PBKDF2-SHA256 600k 轮 → hash │
  │                              │ 4. INSERT users   ─────────▶   │
  │                              │                                │ ←(冲突→ UNIQUE)
  │                              │ 5. 颁发 JWT(7d)                │
  │                              │ 6. Set-Cookie: token=...       │
  │  201 + {user:{id,username}}  │     HttpOnly; Secure; SameSite=Lax │
  │ ◀────────────────────────── │                                │
```

### 5.2 登录

- 查 `users WHERE username=?`，取 `password_hash`，从中拆出 salt 与 iter，重算后 `crypto.subtle` 等时比对
- 命中则更新 `last_login_at`，颁发 JWT cookie，返回用户信息
- 不命中（用户名不存在或密码错误）统一返 `401 INVALID_CREDENTIALS`，不区分两种情况（防用户名枚举）

### 5.3 JWT 设计

```js
// payload
{
  sub: 42,                  // user.id
  username: "alice",
  iat: 1730000000,
  exp: 1730604800,          // 7 天后
}
```

- 算法：HS256（对称密钥，单 Worker 场景够用）
- 密钥：`JWT_SECRET`（Pages Secret，长度 ≥ 32 字节随机串，用 `openssl rand -base64 48` 生成）
- 库：`@tsndr/cloudflare-worker-jwt`（约 2KB，零依赖，社区审计）

### 5.4 Cookie 配置

```
Set-Cookie: token=<jwt>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```

- `HttpOnly`：JS 不可读，杜绝 XSS 窃取
- `Secure`：仅 HTTPS（CF Pages 强制 HTTPS）
- `SameSite=Lax`：默认拦截跨站 POST，提供 CSRF 基本防护
- 不引入 refresh token：个人应用可接受过期重登

### 5.5 鉴权中间件

```js
// functions/api/todos/_middleware.js
export const onRequest = async (ctx) => {
  const token = parseCookie(ctx.request.headers.get('Cookie'))?.token;
  if (!token) {
    return jsonError(401, 'UNAUTHORIZED', '请先登录');
  }

  const payload = await verifyJwt(token, ctx.env.JWT_SECRET);
  if (!payload) {
    return jsonError(401, 'TOKEN_INVALID', '登录已过期');
  }

  ctx.data.user = { id: payload.sub, username: payload.username };
  return ctx.next();
};
```

### 5.6 前端 auth.js 重写要点

```js
class Auth {
  async bootstrap() {                       // App 启动调一次
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    this.currentUser = r.ok ? (await r.json()).data : null;
  }
  async login(u, p) { /* fetch /api/auth/login → 解析 → bootstrap */ }
  async register(u, p) { /* 同上 */ }
  async logout() { /* fetch /api/auth/logout → 清状态 */ }
}
```

`localStorage.currentUser` 那套全部删除，服务端 cookie 是唯一信任源。`isLoggedIn()`/`getCurrentUser()` 接口名保持不变，最小化前端 diff。

### 5.7 安全清单

| 项 | 处理 |
|----|------|
| 密码暴破 | PBKDF2 600k 迭代（OWASP 2023 建议）+ 后续可加单 IP 5 次/分钟限流 |
| 用户名枚举 | 注册返 409 时不区分；登录失败统一 401 |
| Token 泄露 | HttpOnly cookie + Secure + SameSite |
| CSRF | SameSite=Lax 已防大部分；POST 接口受同源策略保护 |
| SQL 注入 | D1 prepared statements 全程参数化 |
| 时序攻击 | 密码比对使用 constant-time 算法 |

---

## 6. 前端改造范围

### 6.1 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/utils/cloudbase.js` | 删除 | 不再需要 |
| `src/utils/auth.js` | 重写 | 见 5.6，约 80 行 |
| `src/utils/api.js` | 新建 | 统一 fetch 封装：`credentials: 'include'`、解析 `{data, error}`、401 自动跳登录 |
| `src/components/AddTodoModal.jsx` | 改 | 替换 db.collection 为 api.post |
| `src/pages/TodoList.jsx` | 改 | 同上 |
| `src/pages/CalendarView.jsx` | 改 | 同上 |
| `src/App.jsx` | 小改 | 启动时 `await auth.bootstrap()` 再渲染路由 |
| `src/pages/Login.jsx` | 不改 | 已经在用 `auth.login()` 接口 |
| `src/pages/Register.jsx` | 不改 | 同上 |
| `src/components/Header.jsx` | 不改 | 不涉及 cloudbase |
| `package.json` | 改 | 移除 `@cloudbase/js-sdk`、`crypto-js`；新增 `@tsndr/cloudflare-worker-jwt`、`wrangler`、`vitest`、`@cloudflare/vitest-pool-workers`、可选 `concurrently` |
| `vite.config.js` | 改 | 删 CloudBase 域名相关；加 dev proxy `/api` → `http://127.0.0.1:8788` |

### 6.2 src/utils/api.js（新建）

```js
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('authStateChanged', {
      detail: { user: null, isLoggedIn: false }
    }));
    throw new ApiError(401, 'UNAUTHORIZED', '请重新登录');
  }
  if (res.status === 204) {
    return null;
  }

  const json = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, json.error?.code, json.error?.message);
  }
  return json.data;
}

export const api = {
  get:  (p)    => request(p, { method: 'GET' }),
  post: (p, b) => request(p, { method: 'POST', body: JSON.stringify(b) }),
  patch:(p, b) => request(p, { method: 'PATCH', body: JSON.stringify(b) }),
  del:  (p)    => request(p, { method: 'DELETE' }),
};
```

### 6.3 三个组件的改动模式

之前（CloudBase）：

```js
const db = app.database();
await db.collection('todos').where({ userId, taskId: id }).update({ completed: !completed });
```

改后（HTTP）：

```js
import { api } from '../utils/api';
await api.patch(`/todos/${id}`, { completed: !completed });
```

不再传 `userId`，鉴权与数据归属由后端从 JWT 推断。

### 6.4 完全不改的部分

CSS / Tailwind/DaisyUI 配置 / Antd 主题 / Framer Motion 动画 / HashRouter 路由结构。

---

## 7. 部署与本地开发

### 7.1 一次性配置

```bash
# 1. 创建 D1 数据库
wrangler d1 create todo-list-db
# → 输出 database_id，填入 wrangler.toml

# 2. 应用 schema（本地 + 远程）
wrangler d1 execute todo-list-db --file=./migrations/0001_init.sql --local
wrangler d1 execute todo-list-db --file=./migrations/0001_init.sql --remote

# 3. 创建 Pages 项目
wrangler pages project create my-todo-list

# 4. 注入 JWT 密钥
openssl rand -base64 48 | wrangler pages secret put JWT_SECRET --project-name=my-todo-list

# 5. 在 Pages 控制台绑定 D1: Settings → Functions → D1 database bindings
#    Variable: DB    Database: todo-list-db    Environment: Production + Preview
```

### 7.2 wrangler.toml

```toml
name                   = "my-todo-list"
compatibility_date     = "2025-05-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding       = "DB"
database_name = "todo-list-db"
database_id   = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 7.3 本地开发流程

推荐两个终端：

```bash
# Terminal 1
npm run dev                                                  # Vite at 5173
# Terminal 2
wrangler pages dev dist --persist-to=./.wrangler/state       # Workers at 8788
```

Vite 代理（`vite.config.js`）：

```js
server: {
  proxy: {
    '/api': 'http://127.0.0.1:8788',
  },
}
```

### 7.4 生产部署

```bash
npm run build
wrangler pages deploy dist --project-name=my-todo-list
```

或推送到 GitHub 后在 Pages 控制台连接仓库自动部署。

### 7.5 域名绑定

Pages 控制台 → Custom Domains → 输入 `todo.dengjiabei.cn`。Cloudflare 自动写入 CNAME，TLS 自动签发，3-5 分钟生效。

### 7.6 package.json scripts

```json
"scripts": {
  "dev": "vite",
  "wrangler:dev": "wrangler pages dev dist --compatibility-date=2025-05-01",
  "build": "vite build",
  "preview": "wrangler pages dev dist",
  "deploy": "npm run build && wrangler pages deploy dist --project-name=my-todo-list",
  "db:apply:local":  "wrangler d1 execute todo-list-db --local  --file=./migrations/0001_init.sql",
  "db:apply:remote": "wrangler d1 execute todo-list-db --remote --file=./migrations/0001_init.sql",
  "test": "vitest run",
  "lint": "eslint ."
}
```

---

## 8. 错误处理与测试策略

### 8.1 后端分层错误模型

```js
// functions/lib/errors.js
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized:    () => new AppError(401, 'UNAUTHORIZED',         '请先登录'),
  invalidCreds:    () => new AppError(401, 'INVALID_CREDENTIALS',  '用户名或密码错误'),
  forbidden:       () => new AppError(403, 'FORBIDDEN',            '无权操作此资源'),
  notFound:    (k) => new AppError(404, 'NOT_FOUND',               `${k}不存在`),
  duplicate:   (k) => new AppError(409, 'DUPLICATE',               `${k}已存在`),
  validation:  (m) => new AppError(400, 'VALIDATION_FAILED',       m),
};
```

### 8.2 全局兜底中间件

```js
// functions/_middleware.js
export const onRequest = async (ctx) => {
  try {
    return await ctx.next();
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    console.error('[unhandled]', err.stack);
    return Response.json(
      { error: { code: 'INTERNAL', message: '服务器错误' } },
      { status: 500 }
    );
  }
};
```

### 8.3 前端错误处理

| 错误码 | 前端处理 |
|--------|---------|
| `UNAUTHORIZED` / `TOKEN_INVALID` | api.js 自动派发 `authStateChanged` → App.jsx 跳 `/login` |
| `VALIDATION_FAILED` / `DUPLICATE` / `INVALID_CREDENTIALS` | 表单内联展示（Login/Register 的 setError） |
| 5xx 与网络错误 | `message.error('系统繁忙，请稍后重试')`（Antd 全局） |

### 8.4 输入校验

```
注册:
  username: 3-20 字符, /^[a-zA-Z0-9_-]+$/
  password: 6-100 字符, 不限字符集

待办:
  content:   1-200 字符
  taskDate:  严格 'YYYY-MM-DD' 正则 + Date.parse 双校验
  completed: boolean
```

校验失败统一抛 `Errors.validation(...)`。

### 8.5 测试策略

**API 集成测试（必做）**：

- 工具：`vitest` + `@cloudflare/vitest-pool-workers`（CF 官方 Workers 测试 pool，支持真 D1 in-memory）
- 覆盖 9 条主路径：注册、重复注册、登录成功、密码错误、查询过滤、新建、更新、删除、批量完成
- 文件：`tests/api/*.test.js`

**手测脚本（可选）**：

- 提供 `tests/manual.http`（VSCode REST Client 格式），列出所有接口示例

**部署后浏览器手测清单（必做）**：

注册 → 登录 → 新建 → 勾选完成 → 编辑 → 删除 → 刷新保持登录 → 退出 八步走通。

**不做**：前端组件单测（Antd 强依赖、维护成本高、收益小）。

---

## 9. 工作量与里程碑

### 9.1 文件级影响概览

```
新增 (~12 个)
├── wrangler.toml
├── migrations/0001_init.sql
├── functions/_middleware.js
├── functions/api/auth/{_middleware,register,login,logout,me}.js
├── functions/api/todos/{_middleware,index,[id],bulk-complete}.js
├── functions/lib/{auth,db,errors}.js
├── src/utils/api.js
└── tests/api/*.test.js

修改 (~7 个)
├── src/utils/auth.js (重写)
├── src/components/AddTodoModal.jsx
├── src/pages/TodoList.jsx
├── src/pages/CalendarView.jsx
├── src/App.jsx (改 bootstrap)
├── vite.config.js
└── package.json

删除 (~14 项)
├── src/utils/cloudbase.js
├── cloudfunctions/ (整个)
├── cloudbaserc.json
├── CLOUDBASE_CONFIG.md
├── REACT_19_ANTD_COMPATIBILITY.md
├── rules/ (整个, 8 个 .mdc)
├── .mcp.json
├── .opencode.json
└── package.json 中: @cloudbase/js-sdk, crypto-js
```

### 9.2 里程碑

| 里程碑 | 内容 | 验收标准 | 预估 |
|--------|------|---------|------|
| **M1 · 清理与基础设施** | 删 CloudBase 残留；建 wrangler.toml；建 D1；写 schema；apply migration | `wrangler d1 execute --remote ".tables"` 看到两张表 | 30 min |
| **M2 · 后端 API 实现** | lib（auth+db+errors）；所有 functions/api/*；_middleware | 通过 HTTP 客户端（curl / manual.http / Postman）手动跑过 8 个接口的成功路径与典型错误 | 2-3 h |
| **M3 · 前端改造** | api.js；auth.js 重写；3 个组件 fetch 替换；App.jsx bootstrap | 本地 `wrangler pages dev` 通完整闭环 | 1.5-2 h |
| **M4 · 集成测试** | vitest + workers pool；9 个用例 | `npm test` 全绿 | 1 h |
| **M5 · 部署上线** | `wrangler pages deploy`；绑定 `todo.dengjiabei.cn`；浏览器手测清单 | 公网域名打开、注册、登录、CRUD 全部正常 | 30 min |

**总计**：5.5–7 小时聚焦实施。

### 9.3 风险与回退

| 风险 | 概率 | 应对 |
|------|------|------|
| Pages Functions 默认体积/CPU 限制不够 | 低 | 单接口逻辑都 < 50 ms、< 1 MB，远低于免费额度 |
| D1 边缘网络一致性 | 极低 | 单用户 Todo 不存在强一致性场景 |
| 自定义域名 DNS 生效慢 | 低 | 用 `*.pages.dev` 默认域名做迁移期临时入口 |
| JWT/PBKDF2 实现 bug | 中 | 用社区库 `@tsndr/cloudflare-worker-jwt`；M4 集成测试覆盖关键路径 |

### 9.4 提交策略

每个里程碑一个 commit：

```
feat: 清理 CloudBase 残留并初始化 D1 与 wrangler 配置
feat: 实现 Pages Functions 后端 (auth + todos)
feat: 前端改用 fetch API 替换 CloudBase SDK
test: 添加 API 集成测试
chore: 部署 Cloudflare Pages 并绑定 todo.dengjiabei.cn
```

---

## 10. 范围之外（明确不做）

- 头像上传与 R2 存储
- 邮箱验证与密码重置
- 第三方 OAuth 登录（GitHub/Google）
- CloudBase 历史数据迁移
- 前端组件单元测试
- 多环境（dev/staging/prod 三套 D1）—— 仅本地 + Production
- 接口限流（先不做，留 `_middleware.js` 占位接口供后续扩展）
- 用户头像、用户资料编辑等账号管理功能
