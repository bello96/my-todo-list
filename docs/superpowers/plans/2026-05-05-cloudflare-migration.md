# Cloudflare 全栈迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 my-todo-list 从腾讯云开发（CloudBase）整体迁移到 Cloudflare（Pages + Pages Functions + D1），部署到 https://todo.dengjiabei.cn/，保留登录注册、日历/列表/CRUD/主题，砍掉头像上传与账号管理（改名改密码）。

**Architecture:** 单一 Cloudflare Pages 项目 = 静态前端 + `functions/api/*` 路由。前端 React 19 不动，仅替换数据层为 fetch；后端用 Pages Functions 配 D1（SQLite）。认证用 PBKDF2 哈希 + JWT (HS256) 存 httpOnly Cookie。本地用 wrangler pages dev + Vite proxy 联调。

**Tech Stack:** React 19 / Vite 6 / Antd 5 / Tailwind / DaisyUI / Cloudflare Pages / Pages Functions / D1 / @tsndr/cloudflare-worker-jwt / wrangler 3.x

**对应设计文档：** `docs/superpowers/specs/2026-05-05-cloudflare-migration-design.md`

---

## 文件结构总览

```
新增
├── wrangler.toml                                  # Pages 项目配置 + D1 binding
├── migrations/0001_init.sql                       # D1 schema
├── functions/                                     # Pages Functions (后端)
│   ├── _middleware.js                             # 全局错误兜底
│   ├── api/auth/
│   │   ├── _middleware.js                         # （占位）
│   │   ├── register.js
│   │   ├── login.js
│   │   ├── logout.js
│   │   └── me.js
│   ├── api/todos/
│   │   ├── _middleware.js                         # JWT 鉴权
│   │   ├── index.js                               # GET 列表 / POST 新建
│   │   ├── [id].js                                # PATCH / DELETE
│   │   └── bulk-complete.js
│   └── lib/
│       ├── auth.js                                # PBKDF2 + JWT + cookie
│       ├── db.js                                  # D1 查询封装
│       └── errors.js                              # AppError 类、Errors 工厂
├── src/utils/api.js                               # 前端 fetch 封装
├── tests/manual.http                              # VSCode REST Client 手测清单
└── tests/api/integration.test.mjs                 # 集成测试（M4）

修改
├── package.json                                   # 增删依赖
├── pnpm-lock.yaml                                 # 重新生成
├── vite.config.js                                 # 加 proxy / 删 cloudbase chunk
├── src/utils/auth.js                              # 重写
├── src/App.jsx                                    # bootstrap 调用
├── src/components/Header.jsx                      # 砍头像/改名/改密码
├── src/components/AddTodoModal.jsx                # 改 fetch
├── src/pages/TodoList.jsx                         # 改 fetch
└── src/pages/CalendarView.jsx                     # 改 fetch

删除
├── src/utils/cloudbase.js
├── cloudfunctions/                                (整个目录)
├── cloudbaserc.json
├── CLOUDBASE_CONFIG.md
├── REACT_19_ANTD_COMPATIBILITY.md
├── rules/                                         (整个目录)
├── .mcp.json
├── .opencode.json
├── CODEBUDDY.md
├── AGENTS.md
└── package.json 中的 @cloudbase/js-sdk、crypto-js
```

---

## 全局执行约定

- **commit message 必须中文**，前缀 `feat:`/`fix:`/`chore:`/`test:` 等可保留英文，每条末尾追加 `合作对象：地表最强 Claude Opus`
- 多行 commit message 用 `git commit -F <文件>` 或单行（Windows Git Bash 多行字符串易出错）
- 所有 `if` 必须用花括号 `{}`，**即使只有一行**（用户全局规则）
- 永远不在 `git commit` 用 `--no-verify`
- 每个里程碑结束都要 commit，且最后一个里程碑结束打 tag

---

## M1 · 清理与基础设施

### Task 1.1 · 删除 CloudBase 残留文件（不删依赖、不删 src/utils/cloudbase.js）

**Files:**
- Delete: `cloudfunctions/` (整个目录)
- Delete: `CLOUDBASE_CONFIG.md`
- Delete: `REACT_19_ANTD_COMPATIBILITY.md`
- Delete: `rules/` (整个目录)
- Delete: `.mcp.json`
- Delete: `.opencode.json`
- Delete: `CODEBUDDY.md`
- Delete: `AGENTS.md`

**说明：** `src/utils/cloudbase.js` 与 `cloudbaserc.json` 暂不删 —— 前者被 Header.jsx / TodoList.jsx 等多处 import，后者被 `cloudbase.js` import。M3 阶段把所有 import 替换后一并删，避免中间状态项目无法编译。

- [ ] **Step 1: 删除 CloudBase 相关目录与文件**

PowerShell 命令：

```powershell
Remove-Item -Recurse -Force cloudfunctions
Remove-Item -Recurse -Force rules
Remove-Item -Force CLOUDBASE_CONFIG.md, REACT_19_ANTD_COMPATIBILITY.md, .mcp.json, .opencode.json, CODEBUDDY.md, AGENTS.md
```

- [ ] **Step 2: 验证删除**

```powershell
Test-Path cloudfunctions, rules, .mcp.json, AGENTS.md
```

预期输出：四个 `False`。`cloudbaserc.json` 仍存在是预期的（M3 删）。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: 删除 CloudBase 残留目录与配置（合作对象：地表最强 Claude Opus）"
```

---

### Task 1.2 · 修改 package.json：删 SDK，增 wrangler/JWT/concurrently

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 重写 package.json scripts、dependencies、devDependencies**

把 `package.json` 内容**整体替换**为以下（注意 `name` 改成 `my-todo-list`、`version` 升 `0.1.0`）：

```json
{
  "name": "my-todo-list",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "wrangler:dev": "wrangler pages dev dist --compatibility-date=2025-05-01 --port 8788",
    "build": "vite build",
    "preview": "wrangler pages dev dist --compatibility-date=2025-05-01",
    "deploy": "npm run build && wrangler pages deploy dist --project-name=my-todo-list",
    "db:apply:local": "wrangler d1 execute todo-list-db --local --file=./migrations/0001_init.sql",
    "db:apply:remote": "wrangler d1 execute todo-list-db --remote --file=./migrations/0001_init.sql",
    "db:apply:test":  "wrangler d1 execute todo-list-db --local --persist-to=./.wrangler/state-test --file=./migrations/0001_init.sql",
    "test": "vitest run",
    "test:setup": "npm run build && npm run db:apply:test",
    "lint": "eslint ."
  },
  "dependencies": {
    "@ant-design/icons": "^6.0.2",
    "@heroicons/react": "^2.2.0",
    "@tsndr/cloudflare-worker-jwt": "^3.1.4",
    "antd": "^5.27.4",
    "daisyui": "^5.0.35",
    "dayjs": "^1.11.18",
    "framer-motion": "^12.12.1",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^6.30.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.25.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.25.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.19",
    "globals": "^16.0.0",
    "postcss": "^8.5.3",
    "prettier": "^3.6.2",
    "tailwindcss": "^3.4.17",
    "vite": "^6.3.5",
    "vitest": "^2.1.9",
    "wrangler": "^3.99.0"
  }
}
```

**变更点说明：**
- 删 `@cloudbase/js-sdk`、`crypto-js`
- 加 `@tsndr/cloudflare-worker-jwt`、`wrangler`、`vitest`
- 加 scripts: `wrangler:dev`、`db:apply:local/remote`、`deploy`、`test`

- [ ] **Step 2: 重新装依赖**

```bash
pnpm install
```

预期：lockfile 更新，无 error。如果当前没 pnpm，可以用 `npm install`，但要把 `pnpm-lock.yaml` 删掉换成 `package-lock.json`。

- [ ] **Step 3: 验证 wrangler 可用**

```bash
npx wrangler --version
```

预期：输出 `⛅️ wrangler 3.x.x` 之类。

- [ ] **Step 4: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: package.json 切换到 Cloudflare 工具链（移除 cloudbase-sdk/crypto-js，加入 wrangler/jwt/vitest）（合作对象：地表最强 Claude Opus）"
```

---

### Task 1.3 · 创建 D1 数据库（远程）

**Files:** 无（仅 CLI 操作）

- [ ] **Step 1: 登录 Cloudflare 账号（若未登录）**

```bash
npx wrangler login
```

会弹浏览器，授权完即可。如果已登录跳过。

验证：

```bash
npx wrangler whoami
```

预期：输出账号邮箱与 Account ID。**记下 Account ID**，稍后填入 wrangler.toml（如需）。

- [ ] **Step 2: 创建 D1 数据库**

```bash
npx wrangler d1 create todo-list-db
```

**记下输出中的 `database_id`（UUID 格式）**，下一步要填进 wrangler.toml。

输出示例（关键三行）：
```
✅ Successfully created DB 'todo-list-db' in region xxx
[[d1_databases]]
binding = "DB"
database_name = "todo-list-db"
database_id = "00000000-0000-0000-0000-000000000000"
```

---

### Task 1.4 · 写入 wrangler.toml

**Files:**
- Create: `wrangler.toml`

- [ ] **Step 1: 创建 wrangler.toml**

把 `<DATABASE_ID>` 替换成 Task 1.3 拿到的 UUID：

```toml
name                   = "my-todo-list"
compatibility_date     = "2025-05-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding       = "DB"
database_name = "todo-list-db"
database_id   = "<DATABASE_ID>"
```

- [ ] **Step 2: 提交**

```bash
git add wrangler.toml
git commit -m "chore: 添加 wrangler.toml 与 D1 binding（合作对象：地表最强 Claude Opus）"
```

---

### Task 1.5 · 写入 schema 迁移文件

**Files:**
- Create: `migrations/0001_init.sql`

- [ ] **Step 1: 创建 migrations 目录与 SQL 文件**

`migrations/0001_init.sql`：

```sql
-- 用户表
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE INDEX idx_users_username ON users(username);

-- 待办表
CREATE TABLE todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  content     TEXT    NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,
  task_date   TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_todos_user_date ON todos(user_id, task_date);
```

- [ ] **Step 2: 应用到本地 D1（miniflare 内置）**

```bash
npm run db:apply:local
```

预期：输出 `Executing on local database... ✅ N commands executed successfully`（N≥4）。

- [ ] **Step 3: 应用到远程 D1**

```bash
npm run db:apply:remote
```

会提示确认 `Ok to proceed? (y/N)`，输入 `y`。

预期：`✅ N commands executed successfully`。

- [ ] **Step 4: 验证远程表**

```bash
npx wrangler d1 execute todo-list-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

预期：能看到 `users`、`todos` 两行（+ 系统表 `sqlite_sequence`）。

- [ ] **Step 5: 提交**

```bash
git add migrations/0001_init.sql
git commit -m "feat: 添加 D1 初始 schema（users + todos）（合作对象：地表最强 Claude Opus）"
```

---

### Task 1.6 · 修改 vite.config.js（清理 CloudBase + 加 dev proxy）

**Files:**
- Modify: `vite.config.js`

- [ ] **Step 1: 整体替换 vite.config.js**

新内容：

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'antd': ['antd'],
          'antd-icons': ['@ant-design/icons'],
          'heroicons': ['@heroicons/react'],
          'animation': ['framer-motion'],
          'utils': ['dayjs'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
});
```

**变更点：**
- 删 `manualChunks` 中的 `'cloudbase'` 与 `utils` 里的 `'crypto-js'`
- 删 `server.proxy['/__auth']`
- 加 `server.proxy['/api']` 指向 wrangler dev 端口
- 删 `allowedHosts`（不再需要 CloudBase 跨域）

- [ ] **Step 2: 验证 build 仍通过（因 cloudbaserc.json 还在，src/utils/cloudbase.js 暂时仍可解析）**

```bash
npm run build
```

预期：构建成功，dist/ 生成。如失败，多半是 vite 配置项有 typo，回看 Step 1。

- [ ] **Step 3: 提交**

```bash
git add vite.config.js
git commit -m "chore: vite.config.js 清理 CloudBase 配置并加 /api dev proxy（合作对象：地表最强 Claude Opus）"
```

---

### Task 1.7 · M1 阶段验收

- [ ] **Step 1: 检查项目结构**

```bash
ls
```

预期看到：`functions/`（暂无，M2 创建）、`migrations/`、`src/`、`wrangler.toml`、`package.json`、`vite.config.js` 等。**不应该再有** `cloudfunctions/`、`cloudbaserc.json`、`rules/` 等。

- [ ] **Step 2: 验证远程 D1 schema**

```bash
npx wrangler d1 execute todo-list-db --remote --command ".schema"
```

预期：看到 `users` 与 `todos` 两个 CREATE TABLE 语句和两个 INDEX。

---

## M2 · 后端 API 实现

### Task 2.1 · functions/lib/errors.js

**Files:**
- Create: `functions/lib/errors.js`

- [ ] **Step 1: 创建文件**

```js
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', '请先登录'),
  invalidCreds: () => new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误'),
  forbidden:    () => new AppError(403, 'FORBIDDEN', '无权操作此资源'),
  notFound:     (k) => new AppError(404, 'NOT_FOUND', `${k}不存在`),
  duplicate:    (k) => new AppError(409, 'DUPLICATE', `${k}已存在`),
  validation:   (m) => new AppError(400, 'VALIDATION_FAILED', m),
};

export function jsonOk(data, status = 200) {
  if (data === null || data === undefined) {
    return new Response(null, { status: 204 });
  }
  return Response.json({ data }, { status });
}

export function jsonError(status, code, message) {
  return Response.json({ error: { code, message } }, { status });
}
```

---

### Task 2.2 · functions/lib/auth.js（密码 + JWT + cookie）

**Files:**
- Create: `functions/lib/auth.js`

- [ ] **Step 1: 创建文件**

```js
import jwt from '@tsndr/cloudflare-worker-jwt';

const PBKDF2_ITER = 600000;
const SALT_LEN = 16;
const HASH_LEN = 32;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(password, salt, iter, len) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await deriveBits(password, salt, PBKDF2_ITER, HASH_LEN);
  return `pbkdf2$${PBKDF2_ITER}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }
  const iter = parseInt(parts[1], 10);
  if (!Number.isFinite(iter) || iter < 1) {
    return false;
  }
  const salt = b64ToBytes(parts[2]);
  const expected = b64ToBytes(parts[3]);
  const actual = await deriveBits(password, salt, iter, expected.length);
  return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function signJwt(payload, secret) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      ...payload,
      iat: now,
      exp: now + COOKIE_MAX_AGE,
    },
    secret
  );
}

export async function verifyJwt(token, secret) {
  try {
    const valid = await jwt.verify(token, secret);
    if (!valid) {
      return null;
    }
    const decoded = jwt.decode(token);
    return decoded?.payload || null;
  } catch {
    return null;
  }
}

export function setAuthCookie(token) {
  return `token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function clearAuthCookie() {
  return `token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function parseCookie(header) {
  if (!header) {
    return {};
  }
  const out = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const k = trimmed.slice(0, idx);
    const v = trimmed.slice(idx + 1);
    out[k] = v;
  }
  return out;
}
```

---

### Task 2.3 · functions/lib/db.js（暂时极简）

**Files:**
- Create: `functions/lib/db.js`

- [ ] **Step 1: 创建文件**

```js
export function serializeTodo(row) {
  return {
    taskId:    row.id,
    content:   row.content,
    completed: row.completed === 1,
    userId:    row.user_id,
    createdAt: `${row.task_date} 00:00:00`,
  };
}

export function serializeUser(row) {
  return {
    id:           row.id,
    username:     row.username,
    createdAt:    row.created_at,
    lastLoginAt:  row.last_login_at,
  };
}
```

> **设计说明：** 这个文件目前只放序列化辅助函数，因为 D1 的 prepare/bind/all 已经够直白，再封装一层 ORM 反而隐藏 SQL，适得其反。如果后面 SQL 重复较多再扩展。

---

### Task 2.4 · functions/_middleware.js（全局错误兜底）

**Files:**
- Create: `functions/_middleware.js`

- [ ] **Step 1: 创建文件**

```js
import { AppError } from './lib/errors.js';

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
    console.error('[unhandled]', err?.stack || err);
    return Response.json(
      { error: { code: 'INTERNAL', message: '服务器错误' } },
      { status: 500 }
    );
  }
};
```

---

### Task 2.5 · functions/api/auth/_middleware.js（占位）

**Files:**
- Create: `functions/api/auth/_middleware.js`

- [ ] **Step 1: 创建文件**

```js
// 注册/登录无需鉴权。本中间件留作未来限流/审计的扩展点。
export const onRequest = async (ctx) => {
  return ctx.next();
};
```

---

### Task 2.6 · functions/api/auth/register.js

**Files:**
- Create: `functions/api/auth/register.js`

- [ ] **Step 1: 创建文件**

```js
import { hashPassword, signJwt, setAuthCookie } from '../../lib/auth.js';
import { Errors } from '../../lib/errors.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    throw Errors.validation('请求体必须是 JSON');
  }
  const { username, password } = body || {};

  if (!username || typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw Errors.validation('用户名需 3-20 字符，仅字母/数字/下划线/连字符');
  }
  if (!password || typeof password !== 'string' || password.length < 6 || password.length > 100) {
    throw Errors.validation('密码长度需 6-100 字符');
  }

  const hash = await hashPassword(password);

  let row;
  try {
    row = await env.DB.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username, created_at'
    ).bind(username, hash).first();
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      throw Errors.duplicate('用户名');
    }
    throw err;
  }

  const token = await signJwt({ sub: row.id, username: row.username }, env.JWT_SECRET);

  return new Response(
    JSON.stringify({
      data: { id: row.id, username: row.username, createdAt: row.created_at },
    }),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setAuthCookie(token),
      },
    }
  );
};
```

---

### Task 2.7 · functions/api/auth/login.js

**Files:**
- Create: `functions/api/auth/login.js`

- [ ] **Step 1: 创建文件**

```js
import { verifyPassword, signJwt, setAuthCookie } from '../../lib/auth.js';
import { Errors } from '../../lib/errors.js';

export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    throw Errors.validation('请求体必须是 JSON');
  }
  const { username, password } = body || {};
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    throw Errors.validation('用户名和密码必填');
  }

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash FROM users WHERE username = ?'
  ).bind(username).first();

  if (!user) {
    throw Errors.invalidCreds();
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw Errors.invalidCreds();
  }

  await env.DB.prepare(
    "UPDATE users SET last_login_at = datetime('now') WHERE id = ?"
  ).bind(user.id).run();

  const token = await signJwt({ sub: user.id, username: user.username }, env.JWT_SECRET);

  return new Response(
    JSON.stringify({ data: { id: user.id, username: user.username } }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setAuthCookie(token),
      },
    }
  );
};
```

---

### Task 2.8 · functions/api/auth/me.js

**Files:**
- Create: `functions/api/auth/me.js`

- [ ] **Step 1: 创建文件**

```js
import { verifyJwt, parseCookie } from '../../lib/auth.js';
import { Errors, jsonOk } from '../../lib/errors.js';
import { serializeUser } from '../../lib/db.js';

export const onRequestGet = async ({ request, env }) => {
  const token = parseCookie(request.headers.get('Cookie')).token;
  if (!token) {
    throw Errors.unauthorized();
  }
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) {
    throw Errors.unauthorized();
  }

  const user = await env.DB.prepare(
    'SELECT id, username, created_at, last_login_at FROM users WHERE id = ?'
  ).bind(payload.sub).first();

  if (!user) {
    throw Errors.unauthorized();
  }

  return jsonOk(serializeUser(user));
};
```

---

### Task 2.9 · functions/api/auth/logout.js

**Files:**
- Create: `functions/api/auth/logout.js`

- [ ] **Step 1: 创建文件**

```js
import { clearAuthCookie } from '../../lib/auth.js';

export const onRequestPost = async () => {
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearAuthCookie() },
  });
};
```

---

### Task 2.10 · functions/api/todos/_middleware.js（鉴权）

**Files:**
- Create: `functions/api/todos/_middleware.js`

- [ ] **Step 1: 创建文件**

```js
import { verifyJwt, parseCookie } from '../../lib/auth.js';
import { Errors } from '../../lib/errors.js';

export const onRequest = async (ctx) => {
  const token = parseCookie(ctx.request.headers.get('Cookie')).token;
  if (!token) {
    throw Errors.unauthorized();
  }
  const payload = await verifyJwt(token, ctx.env.JWT_SECRET);
  if (!payload) {
    throw Errors.unauthorized();
  }

  ctx.data.user = { id: payload.sub, username: payload.username };
  return ctx.next();
};
```

---

### Task 2.11 · functions/api/todos/index.js（GET / POST）

**Files:**
- Create: `functions/api/todos/index.js`

- [ ] **Step 1: 创建文件**

```js
import { Errors, jsonOk } from '../../lib/errors.js';
import { serializeTodo } from '../../lib/db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet = async ({ request, env, data }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let sql = 'SELECT id, user_id, content, completed, task_date, created_at FROM todos WHERE user_id = ?';
  const params = [data.user.id];

  if (from) {
    if (!DATE_RE.test(from)) {
      throw Errors.validation('from 参数必须为 YYYY-MM-DD 格式');
    }
    sql += ' AND task_date >= ?';
    params.push(from);
  }
  if (to) {
    if (!DATE_RE.test(to)) {
      throw Errors.validation('to 参数必须为 YYYY-MM-DD 格式');
    }
    sql += ' AND task_date <= ?';
    params.push(to);
  }
  sql += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return jsonOk(results.map(serializeTodo));
};

export const onRequestPost = async ({ request, env, data }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    throw Errors.validation('请求体必须是 JSON');
  }
  const { content, taskDate } = body || {};

  if (!content || typeof content !== 'string') {
    throw Errors.validation('content 必须是字符串');
  }
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    throw Errors.validation('content 长度需 1-200 字符');
  }
  if (!taskDate || typeof taskDate !== 'string' || !DATE_RE.test(taskDate)) {
    throw Errors.validation('taskDate 必须为 YYYY-MM-DD 格式');
  }

  const row = await env.DB.prepare(
    'INSERT INTO todos (user_id, content, task_date) VALUES (?, ?, ?) RETURNING id, user_id, content, completed, task_date, created_at'
  ).bind(data.user.id, trimmed, taskDate).first();

  return jsonOk(serializeTodo(row), 201);
};
```

---

### Task 2.12 · functions/api/todos/[id].js（PATCH / DELETE）

**Files:**
- Create: `functions/api/todos/[id].js`

- [ ] **Step 1: 创建文件**

```js
import { Errors, jsonOk } from '../../lib/errors.js';
import { serializeTodo } from '../../lib/db.js';

function parseId(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw Errors.validation('id 无效');
  }
  return id;
}

export const onRequestPatch = async ({ params, request, env, data }) => {
  const id = parseId(params.id);

  let body;
  try {
    body = await request.json();
  } catch {
    throw Errors.validation('请求体必须是 JSON');
  }

  const sets = [];
  const args = [];

  if (body.content !== undefined) {
    if (typeof body.content !== 'string') {
      throw Errors.validation('content 必须是字符串');
    }
    const trimmed = body.content.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      throw Errors.validation('content 长度需 1-200 字符');
    }
    sets.push('content = ?');
    args.push(trimmed);
  }
  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      throw Errors.validation('completed 必须是 boolean');
    }
    sets.push('completed = ?');
    args.push(body.completed ? 1 : 0);
  }
  if (sets.length === 0) {
    throw Errors.validation('至少需要 content 或 completed 其一');
  }

  sets.push("updated_at = datetime('now')");
  args.push(id, data.user.id);

  const sql = `UPDATE todos SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING id, user_id, content, completed, task_date, created_at`;
  const row = await env.DB.prepare(sql).bind(...args).first();
  if (!row) {
    throw Errors.notFound('待办');
  }
  return jsonOk(serializeTodo(row));
};

export const onRequestDelete = async ({ params, env, data }) => {
  const id = parseId(params.id);

  const result = await env.DB.prepare(
    'DELETE FROM todos WHERE id = ? AND user_id = ?'
  ).bind(id, data.user.id).run();

  if (result.meta.changes === 0) {
    throw Errors.notFound('待办');
  }
  return new Response(null, { status: 204 });
};
```

---

### Task 2.13 · functions/api/todos/bulk-complete.js

**Files:**
- Create: `functions/api/todos/bulk-complete.js`

- [ ] **Step 1: 创建文件**

```js
import { Errors, jsonOk } from '../../lib/errors.js';

export const onRequestPost = async ({ request, env, data }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    throw Errors.validation('请求体必须是 JSON');
  }
  const { ids, completed } = body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    throw Errors.validation('ids 必须是非空数组');
  }
  if (ids.length > 1000) {
    throw Errors.validation('单次最多处理 1000 条');
  }
  if (typeof completed !== 'boolean') {
    throw Errors.validation('completed 必须是 boolean');
  }

  const cleanIds = [];
  for (const raw of ids) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) {
      cleanIds.push(n);
    }
  }
  if (cleanIds.length === 0) {
    throw Errors.validation('ids 全部无效');
  }

  const placeholders = cleanIds.map(() => '?').join(',');
  const sql = `UPDATE todos SET completed = ?, updated_at = datetime('now') WHERE user_id = ? AND id IN (${placeholders})`;
  const result = await env.DB.prepare(sql).bind(completed ? 1 : 0, data.user.id, ...cleanIds).run();

  return jsonOk({ updated: result.meta.changes });
};
```

---

### Task 2.14 · 写本地 .dev.vars 注入开发用 JWT_SECRET

**Files:**
- Create: `.dev.vars` (已被 .gitignore)

- [ ] **Step 1: 创建文件**

`.dev.vars`：

```
JWT_SECRET=local-dev-secret-DO-NOT-USE-IN-PROD-32bytes-min-xxxxx
```

> wrangler pages dev 自动加载 `.dev.vars` 作为环境变量。**这是开发专用密钥**，不会被 git 跟踪（M1 已加 .gitignore），生产环境用 `wrangler pages secret put`。

- [ ] **Step 2: 验证 .dev.vars 不会被 git 跟踪**

```bash
git check-ignore -v .dev.vars
```

预期：`.gitignore:NN:.dev.vars	.dev.vars`（NN 是 .gitignore 行号）。如果输出空字符串，说明没被 ignore，需要检查 .gitignore 是否包含 `.dev.vars`。

---

### Task 2.15 · 写 manual.http（VSCode REST Client）

**Files:**
- Create: `tests/manual.http`

- [ ] **Step 1: 创建文件**

```http
@base = http://127.0.0.1:8788

### 注册（首次）
POST {{base}}/api/auth/register
Content-Type: application/json

{ "username": "alice", "password": "secret123" }

### 注册重复用户名（应该 409）
POST {{base}}/api/auth/register
Content-Type: application/json

{ "username": "alice", "password": "secret123" }

### 注册参数错误（应该 400）
POST {{base}}/api/auth/register
Content-Type: application/json

{ "username": "ab", "password": "x" }

### 登录成功
POST {{base}}/api/auth/login
Content-Type: application/json

{ "username": "alice", "password": "secret123" }

### 登录密码错（应该 401 INVALID_CREDENTIALS）
POST {{base}}/api/auth/login
Content-Type: application/json

{ "username": "alice", "password": "wrong" }

### 当前用户
GET {{base}}/api/auth/me

### 列表（无筛选）
GET {{base}}/api/todos

### 列表（按日期范围）
GET {{base}}/api/todos?from=2026-05-01&to=2026-05-31

### 新建
POST {{base}}/api/todos
Content-Type: application/json

{ "content": "买菜", "taskDate": "2026-05-05" }

### 更新（把上一步返回 id 填到 :id）
PATCH {{base}}/api/todos/1
Content-Type: application/json

{ "completed": true }

### 修改内容
PATCH {{base}}/api/todos/1
Content-Type: application/json

{ "content": "买水果" }

### 批量完成
POST {{base}}/api/todos/bulk-complete
Content-Type: application/json

{ "ids": [1, 2], "completed": true }

### 删除
DELETE {{base}}/api/todos/1

### 退出登录
POST {{base}}/api/auth/logout

### 退出后再访问 me（应该 401）
GET {{base}}/api/auth/me
```

---

### Task 2.16 · 启动本地服务并跑通所有接口

- [ ] **Step 1: 准备一个最小 dist 占位（前端 M3 才会真构建）**

PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path dist | Out-Null
Set-Content -Path dist\index.html -Value "<html><body>placeholder</body></html>"
```

或 bash：

```bash
mkdir -p dist
echo "<html><body>placeholder</body></html>" > dist/index.html
```

- [ ] **Step 2: 启动 wrangler pages dev（新开终端）**

```bash
npx wrangler pages dev dist --port=8788
```

预期：终端最后输出 `[wrangler:info] Ready on http://127.0.0.1:8788`，`.dev.vars` 中的 `JWT_SECRET` 被自动加载。

- [ ] **Step 3: 跑通 manual.http 中的接口**

逐条执行 `tests/manual.http` 里的请求，验证：

| 接口 | 预期 |
|------|------|
| 注册（首次） | 201，`Set-Cookie: token=...` |
| 注册重复 | 409 `DUPLICATE` |
| 注册非法 | 400 `VALIDATION_FAILED` |
| 登录成功 | 200，新 cookie |
| 登录密码错 | 401 `INVALID_CREDENTIALS` |
| me（已登录） | 200，返回 user |
| 列表 | 200，`{ data: [] }` |
| 新建 | 201 |
| 更新 | 200 |
| 批量完成 | 200，`{ updated: N }` |
| 删除 | 204 |
| 删除不存在 | 404 `NOT_FOUND` |
| 退出 | 204 |
| 退出后 me | 401 `UNAUTHORIZED` |

如果 VSCode 没装 REST Client，用 curl 也行：

```bash
curl -i -X POST http://127.0.0.1:8788/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}' \
  -c /tmp/cookies.txt

curl -i http://127.0.0.1:8788/api/auth/me -b /tmp/cookies.txt
```

---

### Task 2.17 · M2 提交

- [ ] **Step 1: 提交所有 functions/ 与 manual.http**

```bash
git add functions/ tests/manual.http
git commit -m "feat: 实现 Pages Functions 后端（auth + todos）（合作对象：地表最强 Claude Opus）"
```

---

## M3 · 前端改造

### Task 3.1 · 创建 src/utils/api.js

**Files:**
- Create: `src/utils/api.js`

- [ ] **Step 1: 创建文件**

```js
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (res.status === 204) {
    return null;
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(res.status, 'PARSE_ERROR', '响应解析失败');
    }
    return null;
  }

  if (!res.ok) {
    const code = json?.error?.code;
    const message = json?.error?.message;
    if (res.status === 401) {
      window.dispatchEvent(
        new CustomEvent('authStateChanged', {
          detail: { user: null, isLoggedIn: false },
        })
      );
    }
    throw new ApiError(res.status, code, message);
  }
  return json.data;
}

export const api = {
  get:   (p)    => request(p, { method: 'GET' }),
  post:  (p, b) => request(p, { method: 'POST', body: JSON.stringify(b ?? {}) }),
  patch: (p, b) => request(p, { method: 'PATCH', body: JSON.stringify(b ?? {}) }),
  del:   (p)    => request(p, { method: 'DELETE' }),
};
```

---

### Task 3.2 · 重写 src/utils/auth.js

**Files:**
- Modify: `src/utils/auth.js` (整体替换)

- [ ] **Step 1: 整体替换文件内容**

```js
import { api, ApiError } from './api';

class Auth {
  constructor() {
    this.currentUser = null;
    this.ready = false;
  }

  async bootstrap() {
    try {
      const user = await api.get('/auth/me');
      this.currentUser = user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        this.currentUser = null;
      } else {
        console.error('bootstrap failed', err);
        this.currentUser = null;
      }
    }
    this.ready = true;
    this._notify();
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async register(username, password) {
    try {
      const user = await api.post('/auth/register', { username, password });
      this.currentUser = user;
      this._notify();
      return { success: true, user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async login(username, password) {
    try {
      const user = await api.post('/auth/login', { username, password });
      this.currentUser = user;
      this._notify();
      return { success: true, user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async logout() {
    try {
      await api.post('/auth/logout', {});
    } catch (err) {
      console.warn('logout request failed (still clearing local state)', err);
    }
    this.currentUser = null;
    this._notify();
  }

  _notify() {
    window.dispatchEvent(
      new CustomEvent('authStateChanged', {
        detail: { user: this.currentUser, isLoggedIn: !!this.currentUser },
      })
    );
  }
}

const authInstance = new Auth();
export default authInstance;
```

> **重要变更：** 不再用 localStorage、不再有 saveUserToStorage / updateUserInStorage / loadUserFromStorage。状态唯一来源是后端 `/api/auth/me`。

---

### Task 3.3 · 修改 src/App.jsx（bootstrap 调用 + 简化登录态读取）

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 找到 useEffect 中的 checkAuth 部分（约 91-99 行），替换为：**

打开 `src/App.jsx`，定位第 91-100 行附近的：

```js
  useEffect(() => {
    // 初始检查登录状态
    const checkAuth = () => {
      setLoading(true);
      updateAuthState();
      setLoading(false);
    };

    checkAuth();
```

替换为：

```js
  useEffect(() => {
    // 初始通过 /api/auth/me 拉取登录状态
    const checkAuth = async () => {
      setLoading(true);
      await auth.bootstrap();
      updateAuthState();
      setLoading(false);
    };

    checkAuth();
```

> **变更原因：** 旧版本从 localStorage 读，瞬间完成；新版本要 await 网络请求，`checkAuth` 改成 async。

- [ ] **Step 2: 验证 src/App.jsx 仍能解析（先不跑）**

无须执行命令，确认编辑无语法错。

---

### Task 3.4 · 修改 src/components/AddTodoModal.jsx（fetch 替换 db）

**Files:**
- Modify: `src/components/AddTodoModal.jsx`

- [ ] **Step 1: 替换 import**

把：

```js
import { useState, useEffect, useRef } from 'react';
import { Modal, DatePicker, Input, App } from 'antd';
import dayjs from 'dayjs';
import { app } from '../utils/cloudbase';
import auth from '../utils/auth';

const db = app.database();
```

改为：

```js
import { useState, useEffect, useRef } from 'react';
import { Modal, DatePicker, Input, App } from 'antd';
import dayjs from 'dayjs';
import { api } from '../utils/api';
```

（删掉 `app`、`auth`、`db`；不再需要它们）

- [ ] **Step 2: 替换 handleAdd 函数**

把整个 `handleAdd` 函数（约 33-78 行）替换为：

```js
  const handleAdd = async () => {
    if (!todoContent.trim()) {
      message.warning('请输入待办事项内容');
      return;
    }

    setLoading(true);
    try {
      await api.post('/todos', {
        content: todoContent.trim(),
        taskDate: selectedDate.format('YYYY-MM-DD'),
      });

      message.success('待办事项添加成功！');

      setTodoContent('');
      setSelectedDate(dayjs());

      if (onSuccess) {
        onSuccess(selectedDate);
      }

      onClose();
    } catch (error) {
      console.error('添加待办事项失败', error);
      message.error(error?.message || '添加失败，请重试');
    } finally {
      setLoading(false);
    }
  };
```

> **变更点：** 不再读 `auth.getCurrentUser()`（后端通过 JWT 自己判定），不再传 `userId`/`userName`/`taskId`。

- [ ] **Step 3: 验证文件无未使用 import**

打开文件确认 `app`、`auth`、`db`、`dayjs.format('YYYY-MM-DD HH:mm:ss')` 等都已无引用（dayjs 还在用，但格式串改了）。

---

### Task 3.5 · 修改 src/pages/TodoList.jsx（fetch 替换 db 操作）

**Files:**
- Modify: `src/pages/TodoList.jsx`

- [ ] **Step 1: 替换 import**

把：

```js
import { app } from '../utils/cloudbase';
```

替换为：

```js
import { api } from '../utils/api';
```

并删除：

```js
const db = app.database();
```

同时删 `import auth from '../utils/auth';`（这个文件内部多处用 `auth.getCurrentUser()`，下面会一并替换为不再调它）。

- [ ] **Step 2: 替换 fetchTodos**

把整个 `fetchTodos`（约 67-104 行）替换为：

```js
  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.set('from', dateRange[0].format('YYYY-MM-DD'));
        params.set('to', dateRange[1].format('YYYY-MM-DD'));
      }
      const qs = params.toString();
      const data = await api.get(`/todos${qs ? `?${qs}` : ''}`);
      setTodos(data || []);
    } catch (error) {
      console.error('获取待办事项失败', error);
      message.error(error?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [dateRange, message]);
```

- [ ] **Step 3: 替换 handleCompleteAll**

把整个 `handleCompleteAll` 函数（约 127-178 行）替换为：

```js
  const handleCompleteAll = async (checked) => {
    try {
      const targetTodos = checked
        ? todos.filter((t) => !t.completed)
        : todos.filter((t) => t.completed);

      if (targetTodos.length === 0) {
        message.info(`当前没有${checked ? '未完成' : '已完成'}的任务`);
        return;
      }

      const ids = targetTodos.map((t) => t.taskId);
      await api.post('/todos/bulk-complete', { ids, completed: checked });

      setTodos((prev) =>
        prev.map((t) => (ids.includes(t.taskId) ? { ...t, completed: checked } : t))
      );

      message.success(`已${checked ? '完成' : '取消完成'} ${targetTodos.length} 项任务`);
    } catch (error) {
      console.error('批量更新任务状态失败', error);
      message.error(error?.message || '操作失败，请重试');
    }
  };
```

- [ ] **Step 4: 替换 toggleTodo**

```js
  const toggleTodo = async (id, completed) => {
    try {
      await api.patch(`/todos/${id}`, { completed: !completed });
      setTodos((prev) =>
        prev.map((t) => (t.taskId === id ? { ...t, completed: !completed } : t))
      );
    } catch (error) {
      console.error('更新待办事项状态失败', error);
      message.error(error?.message || '操作失败');
    }
  };
```

- [ ] **Step 5: 替换 deleteTodo**

```js
  const deleteTodo = async (id) => {
    try {
      await api.del(`/todos/${id}`);
      setTodos((prev) => prev.filter((t) => t.taskId !== id));
    } catch (error) {
      console.error('删除待办事项失败', error);
      message.error(error?.message || '删除失败');
    }
  };
```

- [ ] **Step 6: 替换 handleUpdateTodoContent**

```js
  const handleUpdateTodoContent = async (id) => {
    if (!editingTodoText.trim()) {
      await deleteTodo(id);
      setEditingTodoId(null);
      return;
    }
    try {
      await api.patch(`/todos/${id}`, { content: editingTodoText.trim() });
      setEditingTodoId(null);
      setTodos((prev) =>
        prev.map((t) => (t.taskId === id ? { ...t, content: editingTodoText.trim() } : t))
      );
    } catch (error) {
      console.error('更新待办内容失败', error);
      message.error(error?.message || '更新失败');
    }
  };
```

- [ ] **Step 7: 删除 import App 冲突**

文件顶部本来有 `import { DatePicker, Input, App } from 'antd';` 和 `const { message } = App.useApp();`。这部分保留不动，但要确保**删除底部的 `export default App`** 是 `TodoList`（这个文件本来就 export default TodoList，无须改）。

- [ ] **Step 8: 删除文件中所有 `auth.getCurrentUser()` 引用**

搜索 `auth.getCurrentUser()` 在 TodoList.jsx 中的所有出现，前面 Step 2-6 应该已全删；这一步是保险确认。如果还有残留，删掉那段 `if (!currentUser) return;` 检查（后端会自己 401）。

---

### Task 3.6 · 修改 src/pages/CalendarView.jsx（fetch 替换 db）

**Files:**
- Modify: `src/pages/CalendarView.jsx`

- [ ] **Step 1: 替换 import**

把：

```js
import { app } from '../utils/cloudbase';
import auth from '../utils/auth';

const db = app.database();
```

替换为：

```js
import { api } from '../utils/api';
```

- [ ] **Step 2: 替换 fetchMonthTodos**

把整个 `fetchMonthTodos`（约 28-59 行）替换为：

```js
  const fetchMonthTodos = useCallback(async (date) => {
    try {
      setLoading(true);
      const from = date.startOf('month').format('YYYY-MM-DD');
      const to = date.endOf('month').format('YYYY-MM-DD');
      const data = await api.get(`/todos?from=${from}&to=${to}`);
      setTodos(data || []);
    } catch (error) {
      console.error('获取月度待办事项失败', error);
    } finally {
      setLoading(false);
    }
  }, []);
```

- [ ] **Step 3: 删除文件中残留的 `auth.getCurrentUser()` 检查**

如果还有 `if (!currentUser) { ... }` 之类的代码，全部删除。

---

### Task 3.7 · 简化 src/components/Header.jsx（砍头像/改名/改密码）

**Files:**
- Modify: `src/components/Header.jsx` (大幅简化)

- [ ] **Step 1: 整体替换文件**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightEndOnRectangleIcon } from '@heroicons/react/24/outline';
import { Dropdown, Avatar, App } from 'antd';
import {
  UserOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
} from '@ant-design/icons';

function Header({ currentUser, onLogout }) {
  const [themeMode, setThemeMode] = useState(() => {
    const saved = localStorage.getItem('user-theme-preference');
    return saved || 'system';
  });

  const getCurrentTheme = useCallback(() => {
    if (themeMode === 'system') {
      return window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return themeMode;
  }, [themeMode]);

  const changeTheme = (mode) => {
    setThemeMode(mode);
    if (mode === 'system') {
      localStorage.removeItem('user-theme-preference');
    } else {
      localStorage.setItem('user-theme-preference', mode);
    }

    const actualTheme =
      mode === 'system'
        ? window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : mode;

    document.documentElement.setAttribute('data-theme', actualTheme);

    window.dispatchEvent(
      new CustomEvent('themeChanged', {
        detail: { isDark: actualTheme === 'dark', mode },
      })
    );
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (themeMode === 'system') {
        const isDark = mediaQuery.matches;
        document.documentElement.setAttribute(
          'data-theme',
          isDark ? 'dark' : 'light'
        );
        window.dispatchEvent(
          new CustomEvent('themeChanged', {
            detail: { isDark, mode: 'system' },
          })
        );
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    const actualTheme = getCurrentTheme();
    document.documentElement.setAttribute('data-theme', actualTheme);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, [themeMode, getCurrentTheme]);

  const handleLogout = () => {
    localStorage.removeItem('user-theme-preference');
    setThemeMode('system');
    onLogout();
  };

  const themeItems = [
    {
      key: 'system',
      label: (
        <div className="flex items-center gap-2">
          <DesktopOutlined />
          <span>跟随系统</span>
        </div>
      ),
      onClick: () => changeTheme('system'),
    },
    {
      key: 'light',
      label: (
        <div className="flex items-center gap-2">
          <SunOutlined />
          <span>明亮模式</span>
        </div>
      ),
      onClick: () => changeTheme('light'),
    },
    {
      key: 'dark',
      label: (
        <div className="flex items-center gap-2">
          <MoonOutlined />
          <span>黑暗模式</span>
        </div>
      ),
      onClick: () => changeTheme('dark'),
    },
  ];

  const userItems = [
    {
      key: 'logout',
      label: (
        <div className="flex items-center gap-2 text-red-500">
          <ArrowRightEndOnRectangleIcon className="h-4 w-4" />
          <span>退出登录</span>
        </div>
      ),
      onClick: handleLogout,
    },
  ];

  const getThemeIcon = () => {
    if (themeMode === 'system') {
      return <DesktopOutlined className="text-base-content" />;
    }
    if (themeMode === 'light') {
      return <SunOutlined className="text-yellow-500" />;
    }
    return <MoonOutlined className="text-blue-400" />;
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="navbar bg-base-100 shadow-lg"
    >
      <div className="navbar-start">
        <h1 className="text-xl font-bold text-primary">Todo List</h1>
      </div>
      <div className="navbar-end">
        <div className="flex items-center gap-4">
          <Dropdown
            menu={{ items: themeItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div className="flex items-center gap-1 cursor-pointer hover:bg-base-200 rounded-lg p-2 transition-colors">
              {getThemeIcon()}
            </div>
          </Dropdown>

          <Dropdown
            menu={{ items: userItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div className="flex items-center gap-2 cursor-pointer hover:bg-base-200 rounded-lg p-2 transition-colors">
              <Avatar icon={<UserOutlined />} size={32} />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-base-content">
                  {currentUser?.username}
                </span>
              </div>
            </div>
          </Dropdown>
        </div>
      </div>
    </motion.nav>
  );
}

export default Header;
```

> **删除内容：** 头像上传 / 修改用户名 / 修改密码 / Modal / Upload / Input.Password / Spin / EditOutlined / CameraOutlined / 全部 dayjs 用法 / cloudbase 引用 / crypto-js 引用。

> **保留功能：** 主题切换（system/light/dark）、用户名显示（占位 Avatar 不上传）、退出登录。

> **`App` 导入：** 上面 import 中保留 `App` 但当前文件已不用 `App.useApp()`。可以一并删 `App`，也可保留以备扩展。**简化版直接删** —— 把 `App` 从 antd 的导入中去掉。

修正最终的 antd 导入行：

```jsx
import { Dropdown, Avatar } from 'antd';
```

---

### Task 3.8 · 删除 src/utils/cloudbase.js 与 cloudbaserc.json

**Files:**
- Delete: `src/utils/cloudbase.js`
- Delete: `cloudbaserc.json`

- [ ] **Step 1: 确认 src 中无其他对 cloudbase 的引用**

PowerShell：

```powershell
Select-String -Path src\**\*.js,src\**\*.jsx -Pattern "from.*cloudbase|cloudbaserc"
```

或 bash：

```bash
grep -rE "from.*cloudbase|cloudbaserc" src/ || true
```

预期：无输出（之前 Header / TodoList / CalendarView / AddTodoModal / auth.js 都已改完）。

- [ ] **Step 2: 删除文件**

```powershell
Remove-Item src\utils\cloudbase.js, cloudbaserc.json
```

- [ ] **Step 3: 验证 build 通过**

```bash
npm run build
```

预期：成功，dist/ 生成，无 import 错误。

---

### Task 3.9 · 本地完整闭环验证

- [ ] **Step 1: 启动后端 wrangler pages dev**

确保 dist 已生成（上一步 build 完即可）：

```bash
npx wrangler pages dev dist --port=8788
```

- [ ] **Step 2: 启动前端 vite 开发服务器（新终端）**

```bash
npm run dev
```

预期：Vite 输出 `Local: http://127.0.0.1:5173/`。

- [ ] **Step 3: 浏览器打开 http://127.0.0.1:5173/**

走一遍完整流程：
1. 打开页面 → 应自动跳转 `/login`
2. 点击"立即注册"→ 输入 `testuser` / `secret123` → 注册并自动登入
3. 跳转日历页（`/calendar`），月视图无任务
4. 点击某天的 `+`，新增 "测试任务"
5. 验证日历上出现 "测试任务"
6. 点击该日 → 跳到列表页
7. 勾选 "测试任务" → 状态变完成（划线）
8. 双击 → 编辑为 "测试任务（已改）" → 回车保存
9. 删除 → 列表为空
10. 切回日历页 → 已无该任务
11. 点右上角用户菜单 → 退出登录 → 回 `/login`
12. 重新登录 → 应仍为 testuser，无任务（之前已删）
13. 再点退出 → F5 刷新 → 仍为 `/login`（cookie 已清）

- [ ] **Step 4: 检查浏览器 Network 面板**

应看到：
- 所有 `/api/*` 请求都带 `Cookie: token=...`（除注册/登录前）
- 401 不应频繁出现
- 控制台无 ESLint warning 之外的红色 error

---

### Task 3.10 · M3 提交

- [ ] **Step 1: 提交所有前端改动**

```bash
git add src/ vite.config.js .dev.vars
```

> 注意：`.dev.vars` 应该被 `.gitignore` 排除，`git add .dev.vars` 会被忽略，这是正确的。

确认无 .dev.vars 进入暂存区：

```bash
git status
```

应**看不到** `.dev.vars`。

- [ ] **Step 2: commit**

```bash
git commit -m "feat: 前端改用 fetch API 替换 CloudBase SDK，并简化 Header（合作对象：地表最强 Claude Opus）"
```

---

## M4 · 集成测试（基于 wrangler dev 子进程）

> **测试策略说明：** Cloudflare Pages Functions 的 `vitest-pool-workers` 集成尚不成熟。本计划采用更直接的方式：让 vitest 在 globalSetup 中起一个 `wrangler pages dev` 子进程，跑 HTTP 测试，结束时 kill。Windows 兼容性已考虑（用 `tree-kill` 杀进程组）。

### Task 4.1 · 安装测试依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 `tree-kill`**

```bash
pnpm add -D tree-kill
```

- [ ] **Step 2: 验证已安装**

```bash
pnpm ls tree-kill
```

预期：输出版本号（≥ 1.2.0）。

---

### Task 4.2 · vitest.config.mjs

**Files:**
- Create: `vitest.config.mjs`

- [ ] **Step 1: 创建文件**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/setup/global.mjs'],
    include: ['tests/**/*.test.mjs'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
```

---

### Task 4.3 · 测试服务的 globalSetup

**Files:**
- Create: `tests/setup/global.mjs`

- [ ] **Step 1: 创建文件**

```js
import { spawn } from 'node:child_process';
import treeKill from 'tree-kill';

let serverProcess = null;
const PORT = 8799;

async function waitForReady(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status === 401 || r.status === 200 || r.status === 404) {
        return;
      }
    } catch {
      // 继续等
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

export async function setup() {
  // 用独立测试 D1（local）, 起在 8799 端口避开开发用的 8788
  serverProcess = spawn(
    'npx',
    [
      'wrangler', 'pages', 'dev', 'dist',
      '--port', String(PORT),
      '--persist-to', './.wrangler/state-test',
    ],
    {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        JWT_SECRET: 'test-secret-32-bytes-pad-pad-pad-pad-pad',
      },
    }
  );

  serverProcess.stdout?.on('data', (d) => {
    if (process.env.VITEST_VERBOSE) {
      process.stdout.write(`[wrangler] ${d}`);
    }
  });
  serverProcess.stderr?.on('data', (d) => {
    if (process.env.VITEST_VERBOSE) {
      process.stderr.write(`[wrangler:err] ${d}`);
    }
  });

  await waitForReady(`http://127.0.0.1:${PORT}/api/auth/me`);
  process.env.TEST_BASE_URL = `http://127.0.0.1:${PORT}`;
}

export async function teardown() {
  if (serverProcess?.pid) {
    await new Promise((resolve) => {
      treeKill(serverProcess.pid, 'SIGTERM', () => resolve());
    });
  }
}
```

---

### Task 4.4 · 测试夹具：HTTP 客户端

**Files:**
- Create: `tests/setup/client.mjs`

- [ ] **Step 1: 创建文件**

```js
const BASE = () => process.env.TEST_BASE_URL;

export function makeClient() {
  let cookie = '';

  const captureCookie = (res) => {
    const set = res.headers.get('Set-Cookie');
    if (set) {
      // 简单解析：取 token=xxx 部分
      const m = set.match(/token=([^;]*)/);
      if (m) {
        cookie = `token=${m[1]}`;
      }
    }
  };

  async function call(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (cookie) {
      headers.Cookie = cookie;
    }
    const res = await fetch(`${BASE()}${path}`, { ...options, headers });
    captureCookie(res);
    let body = null;
    if (res.status !== 204) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    return { status: res.status, body };
  }

  return {
    get: (p) => call(p, { method: 'GET' }),
    post: (p, b) => call(p, { method: 'POST', body: JSON.stringify(b) }),
    patch: (p, b) => call(p, { method: 'PATCH', body: JSON.stringify(b) }),
    del: (p) => call(p, { method: 'DELETE' }),
    clearCookie: () => { cookie = ''; },
    getCookie: () => cookie,
  };
}
```

---

### Task 4.5 · 集成测试 - 认证

**Files:**
- Create: `tests/api/auth.test.mjs`

- [ ] **Step 1: 创建文件**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { makeClient } from '../setup/client.mjs';

const uniqUser = () => `u_${Math.random().toString(36).slice(2, 10)}`;

describe('auth', () => {
  let c;
  beforeEach(() => {
    c = makeClient();
  });

  it('注册成功并自动登录（cookie 注入）', async () => {
    const username = uniqUser();
    const r = await c.post('/api/auth/register', { username, password: 'secret123' });
    expect(r.status).toBe(201);
    expect(r.body.data.username).toBe(username);
    expect(c.getCookie()).toMatch(/^token=/);

    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe(username);
  });

  it('注册重复用户名返回 409 DUPLICATE', async () => {
    const username = uniqUser();
    await c.post('/api/auth/register', { username, password: 'secret123' });
    const r = await c.post('/api/auth/register', { username, password: 'secret123' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DUPLICATE');
  });

  it('注册参数不合法返回 400 VALIDATION_FAILED', async () => {
    const r = await c.post('/api/auth/register', { username: 'ab', password: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('密码错误返回 401 INVALID_CREDENTIALS（防枚举）', async () => {
    const username = uniqUser();
    await c.post('/api/auth/register', { username, password: 'secret123' });
    const c2 = makeClient();
    const r = await c2.post('/api/auth/login', { username, password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('用户名不存在也返 INVALID_CREDENTIALS（防枚举）', async () => {
    const r = await c.post('/api/auth/login', { username: 'nope_'+Math.random(), password: 'whatever' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('登出后访问 me 返回 401', async () => {
    const username = uniqUser();
    await c.post('/api/auth/register', { username, password: 'secret123' });
    const lo = await c.post('/api/auth/logout', {});
    expect(lo.status).toBe(204);
    c.clearCookie();
    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});
```

---

### Task 4.6 · 集成测试 - todos

**Files:**
- Create: `tests/api/todos.test.mjs`

- [ ] **Step 1: 创建文件**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { makeClient } from '../setup/client.mjs';

const uniqUser = () => `u_${Math.random().toString(36).slice(2, 10)}`;

async function loggedInClient() {
  const c = makeClient();
  await c.post('/api/auth/register', { username: uniqUser(), password: 'secret123' });
  return c;
}

describe('todos', () => {
  it('未登录访问列表返回 401', async () => {
    const c = makeClient();
    const r = await c.get('/api/todos');
    expect(r.status).toBe(401);
  });

  it('新建 → 列表 → 更新 → 删除 链路', async () => {
    const c = await loggedInClient();

    const created = await c.post('/api/todos', { content: '买菜', taskDate: '2026-05-05' });
    expect(created.status).toBe(201);
    expect(created.body.data.taskId).toBeTruthy();
    expect(created.body.data.content).toBe('买菜');
    expect(created.body.data.completed).toBe(false);

    const list = await c.get('/api/todos?from=2026-05-01&to=2026-05-31');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);

    const id = created.body.data.taskId;
    const upd = await c.patch(`/api/todos/${id}`, { completed: true });
    expect(upd.status).toBe(200);
    expect(upd.body.data.completed).toBe(true);

    const upd2 = await c.patch(`/api/todos/${id}`, { content: '买水果' });
    expect(upd2.body.data.content).toBe('买水果');

    const del = await c.del(`/api/todos/${id}`);
    expect(del.status).toBe(204);

    const list2 = await c.get('/api/todos');
    expect(list2.body.data.length).toBe(0);
  });

  it('日期范围筛选生效', async () => {
    const c = await loggedInClient();
    await c.post('/api/todos', { content: 'a', taskDate: '2026-04-15' });
    await c.post('/api/todos', { content: 'b', taskDate: '2026-05-15' });
    await c.post('/api/todos', { content: 'c', taskDate: '2026-06-15' });

    const may = await c.get('/api/todos?from=2026-05-01&to=2026-05-31');
    expect(may.body.data.length).toBe(1);
    expect(may.body.data[0].content).toBe('b');
  });

  it('数据隔离：A 用户看不到 B 的任务', async () => {
    const a = await loggedInClient();
    await a.post('/api/todos', { content: 'a-only', taskDate: '2026-05-05' });

    const b = await loggedInClient();
    const list = await b.get('/api/todos');
    expect(list.body.data.length).toBe(0);
  });

  it('批量完成', async () => {
    const c = await loggedInClient();
    const r1 = await c.post('/api/todos', { content: 't1', taskDate: '2026-05-05' });
    const r2 = await c.post('/api/todos', { content: 't2', taskDate: '2026-05-05' });
    const ids = [r1.body.data.taskId, r2.body.data.taskId];

    const bulk = await c.post('/api/todos/bulk-complete', { ids, completed: true });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.updated).toBe(2);

    const list = await c.get('/api/todos');
    for (const t of list.body.data) {
      expect(t.completed).toBe(true);
    }
  });

  it('参数校验：空 content 返 400', async () => {
    const c = await loggedInClient();
    const r = await c.post('/api/todos', { content: '   ', taskDate: '2026-05-05' });
    expect(r.status).toBe(400);
  });

  it('参数校验：日期格式错返 400', async () => {
    const c = await loggedInClient();
    const r = await c.post('/api/todos', { content: 'x', taskDate: '05/05/2026' });
    expect(r.status).toBe(400);
  });

  it('删除不存在的 todo 返回 404', async () => {
    const c = await loggedInClient();
    const r = await c.del('/api/todos/99999999');
    expect(r.status).toBe(404);
  });
});
```

---

### Task 4.7 · 跑测试

- [ ] **Step 1: 准备 dist 与测试 D1 schema**

```bash
npm run test:setup
```

> 这会执行 `npm run build && npm run db:apply:test`：构建前端到 dist/，并把 schema 应用到独立的测试用 D1（在 `.wrangler/state-test` 目录，与开发用 D1 隔离）。

预期：build 成功 + `✅ 4 commands executed successfully`。

- [ ] **Step 2: 跑测试**

```bash
npm test
```

预期：14 个测试全部通过（auth 6 个 + todos 8 个），耗时 < 1 min（包括 wrangler 启动）。

> **如果第一次跑失败，常见原因：**
> 1. **wrangler 启动慢**：把 `tests/setup/global.mjs` 中 `waitForReady` 的 timeout 从 30s 调到 60s
> 2. **Windows 端口占用**：把 `tests/setup/global.mjs` 中 `PORT` 从 8799 改到 8800
> 3. **schema 缺失**：单独跑 `npm run db:apply:test`

- [ ] **Step 3: 修复任何失败的用例**

如果某用例失败，根据错误信息回到对应 functions/api/*.js 排查。设置 `VITEST_VERBOSE=1 npm test` 看 wrangler 详细输出辅助 debug。

- [ ] **Step 4: 验证 lint 仍过**

```bash
npm run lint
```

预期：0 error。warning 可接受。

---

### Task 4.8 · M4 提交

- [ ] **Step 1: 提交**

```bash
git add tests/ vitest.config.mjs package.json pnpm-lock.yaml
git commit -m "test: 添加 API 集成测试（基于 wrangler dev 子进程）（合作对象：地表最强 Claude Opus）"
```

---

## M5 · 部署上线

### Task 5.1 · 创建 Pages 项目

- [ ] **Step 1: 创建项目**

```bash
npx wrangler pages project create my-todo-list --production-branch main
```

> 如果项目已存在，会有 "already exists" 错误，是 OK 的。

- [ ] **Step 2: 验证**

```bash
npx wrangler pages project list
```

预期：列表中能看到 `my-todo-list`。

---

### Task 5.2 · 注入 JWT_SECRET 到 Pages

- [ ] **Step 1: 生成密钥并注入**

PowerShell：

```powershell
$secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
$secret | npx wrangler pages secret put JWT_SECRET --project-name my-todo-list
```

或 bash：

```bash
openssl rand -base64 48 | npx wrangler pages secret put JWT_SECRET --project-name=my-todo-list
```

预期：交互问 environment（选 production），完成后输出 `Success! Uploaded secret JWT_SECRET`。

- [ ] **Step 2: 同样为 preview 环境注入（可选但推荐）**

```bash
openssl rand -base64 48 | npx wrangler pages secret put JWT_SECRET --project-name=my-todo-list
```

第二次会问选哪个环境，选 preview。

- [ ] **Step 3: 验证**

```bash
npx wrangler pages secret list --project-name my-todo-list
```

预期：能看到 `JWT_SECRET`（可能两个，对应 production 和 preview）。

---

### Task 5.3 · 在 Cloudflare 控制台绑定 D1 到 Pages 项目

> **需要在浏览器中操作。** Pages 的 D1 binding 不能通过 CLI 配置。

- [ ] **Step 1: 打开控制台**

访问 https://dash.cloudflare.com → Workers & Pages → my-todo-list → Settings → Functions → D1 database bindings → Add binding

- [ ] **Step 2: 添加 binding**

| 字段 | 值 |
|------|-----|
| Variable name | `DB` |
| D1 database | `todo-list-db` |
| Environment | Production（如有 Preview 也加上） |

保存。

---

### Task 5.4 · 部署

- [ ] **Step 1: 构建并部署**

```bash
npm run deploy
```

预期：
- `vite build` 成功
- `wrangler pages deploy dist` 上传，输出 `🎉 Deployment complete! Take a peek over at https://<commit-hash>.my-todo-list.pages.dev`

- [ ] **Step 2: 访问临时部署 URL 冒烟**

打开输出的 `https://*.my-todo-list.pages.dev`，注册账号 → 登录 → 新建一条 todo → 验证全流程。

如有问题，看 `npx wrangler pages deployment tail --project-name my-todo-list` 实时日志。

---

### Task 5.5 · 绑定自定义域名 todo.dengjiabei.cn

- [ ] **Step 1: 控制台操作**

Cloudflare Dashboard → Workers & Pages → my-todo-list → Custom domains → Set up a custom domain → 输入 `todo.dengjiabei.cn` → Continue → Activate domain

> 由于 `dengjiabei.cn` 已在 Cloudflare，会自动写 CNAME，TLS 自动签发。

- [ ] **Step 2: 等待生效（3-5 分钟）**

```bash
nslookup todo.dengjiabei.cn
```

预期：CNAME 指向 `*.pages.dev` 或 Cloudflare IP。

curl 验证：

```bash
curl -I https://todo.dengjiabei.cn
```

预期：`HTTP/2 200`。

---

### Task 5.6 · 部署后浏览器手测清单

- [ ] **Step 1: 打开 https://todo.dengjiabei.cn**

按以下 8 步走通：

1. ✅ 打开根 URL → 自动跳 `/login`
2. ✅ 注册新用户（用户名：`prod_test_用户`、密码：`prodSecret9`）
3. ✅ 登录并跳转日历视图
4. ✅ 新建一条 todo "上线测试"
5. ✅ 跳到列表视图，勾选完成
6. ✅ 编辑文字并保存
7. ✅ 删除该条
8. ✅ 退出登录、刷新、确认仍在 `/login`

如其中任何一步失败：
- 浏览器 Network 面板看 `/api/*` 响应
- `npx wrangler pages deployment tail --project-name my-todo-list` 查实时日志
- 回看 functions/ 代码定位

- [ ] **Step 2: 验证 D1 远程数据**

```bash
npx wrangler d1 execute todo-list-db --remote --command "SELECT username, created_at FROM users"
```

预期：能看到刚注册的 `prod_test_用户`。

---

### Task 5.7 · M5 提交并打 tag

- [ ] **Step 1: 如有改动，提交**

```bash
git status
```

如有未提交：

```bash
git add -A
git commit -m "chore: 部署 Cloudflare Pages 并绑定 todo.dengjiabei.cn（合作对象：地表最强 Claude Opus）"
```

- [ ] **Step 2: 打 v0.1.0 release tag**

```bash
git tag v0.1.0
```

- [ ] **Step 3: 验证 git log**

```bash
git log --oneline
```

预期：5 个 commit + 初始 commit + 设计文档 commit，共约 7 个 commit。tag 也能看到：

```bash
git tag
```

输出：`pre-cloudflare-migration` `v0.1.0`。

---

## 收尾

迁移完成。关键产物：

- ✅ `https://todo.dengjiabei.cn` 公网可访问
- ✅ D1 数据库 `todo-list-db` 远程已就位
- ✅ JWT_SECRET 已注入 Pages production
- ✅ 集成测试 14 个用例全绿
- ✅ git 历史完整，含 `pre-cloudflare-migration` 回退点 + `v0.1.0` 发布 tag

如未来要扩展（密码重置、第三方登录、多环境等），从设计文档第 10 节"范围之外"中找对应项，单独开新 spec。

---

## 自查 Checklist

写作者回看：
- [x] 设计文档每节（架构/数据/API/认证/前端/部署/错误测试/工作量）都有对应任务
- [x] 任务都是 2-5 分钟可执行的小步
- [x] 每个代码步骤都有完整代码（无 TBD/TODO/伪代码）
- [x] 类型/方法名前后一致（serializeTodo 在 db.js 定义，所有 todos handler 都从那里引）
- [x] 没有"add appropriate error handling"之类的 placeholder
- [x] 命令都有预期输出
- [x] commit 频率合理（每个里程碑一个，约 5-7 个 commit）
- [x] 涵盖了 brainstorming 阶段补发现的两点（Header 砍三项 + vite 清理 chunk）
