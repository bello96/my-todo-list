// vite-plugin-functions：本地开发模式下，把 Cloudflare Pages Functions
// 风格的 functions/api/**/*.js 暴露成 vite dev server 的 /api/* 路由。
// 仅在 dev 阶段启用；生产由 Cloudflare 自己跑 functions。
//
// 支持的 plan 子集：
//   - functions/api/foo.js                    -> /api/foo
//   - functions/api/foo/index.js              -> /api/foo
//   - functions/api/foo/[id].js               -> /api/foo/:id (params.id)
//   - functions/api/_middleware.js            -> 全局中间件
//   - functions/api/foo/_middleware.js        -> /api/foo/* 中间件
//   - 多层 _middleware 自外向内执行；ctx.next() 进入下一个，最终命中 handler
//   - handler 导出：onRequest / onRequestGet / onRequestPost / onRequestPatch / onRequestDelete

import path from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createLocalD1, applySchemaToLocalD1 } from './d1-adapter.js';

const FUNCTIONS_ROOT = 'functions';

function loadDevVars(rootDir) {
  const file = path.join(rootDir, '.dev.vars');
  if (!existsSync(file)) {
    return {};
  }
  const out = {};
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function resolveRoute(rootDir, urlPath) {
  // urlPath 形如 /api/auth/register 或 /api/todos/42
  const parts = urlPath.replace(/^\/+/, '').split('/');
  if (parts[0] !== 'api') {
    return null;
  }
  const apiBase = path.join(rootDir, FUNCTIONS_ROOT, 'api');
  const segments = parts.slice(1);
  // Walk segments to find handler file. Track collected middleware paths.
  const middlewareFiles = [];
  const params = {};

  // Top-level functions/_middleware.js
  const topMw = path.join(rootDir, FUNCTIONS_ROOT, '_middleware.js');
  if (existsSync(topMw)) {
    middlewareFiles.push(topMw);
  }

  let current = apiBase;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;

    // Collect _middleware.js at this level (before descending or matching file)
    const mw = path.join(current, '_middleware.js');
    if (existsSync(mw)) {
      middlewareFiles.push(mw);
    }

    if (isLast) {
      // Try direct file match first
      const directFile = path.join(current, `${seg}.js`);
      if (existsSync(directFile)) {
        return { handlerFile: directFile, middlewareFiles, params };
      }
      // Try directory + index.js
      const dirIndex = path.join(current, seg, 'index.js');
      if (existsSync(dirIndex)) {
        // Also collect _middleware inside that dir
        const innerMw = path.join(current, seg, '_middleware.js');
        if (existsSync(innerMw)) {
          middlewareFiles.push(innerMw);
        }
        return { handlerFile: dirIndex, middlewareFiles, params };
      }
      // Try dynamic [param].js at this level
      const dynamicMatch = findDynamicFile(current);
      if (dynamicMatch) {
        params[dynamicMatch.paramName] = decodeURIComponent(seg);
        return { handlerFile: dynamicMatch.file, middlewareFiles, params };
      }
      return null;
    }

    // Not last segment: descend into directory
    const childDir = path.join(current, seg);
    if (existsSync(childDir)) {
      current = childDir;
      continue;
    }
    // Try dynamic directory match (e.g. [id]/)
    const dynamicDir = findDynamicDir(current);
    if (dynamicDir) {
      params[dynamicDir.paramName] = decodeURIComponent(seg);
      current = dynamicDir.dir;
      continue;
    }
    return null;
  }
  return null;
}

function findDynamicFile(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const e of entries) {
    const m = e.match(/^\[(.+)\]\.js$/);
    if (m) {
      return { paramName: m[1], file: path.join(dir, e) };
    }
  }
  return null;
}

function findDynamicDir(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const e of entries) {
    const m = e.match(/^\[(.+)\]$/);
    if (m) {
      return { paramName: m[1], dir: path.join(dir, e) };
    }
  }
  return null;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildWebRequest(req) {
  const proto = (req.socket && req.socket.encrypted) ? 'https' : 'http';
  const host = req.headers.host || 'localhost';
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        headers.append(k, item);
      }
    } else if (v !== undefined) {
      headers.set(k, v);
    }
  }
  return { url, headers, method: req.method };
}

async function dispatch(modules, ctx, methodHandlerName) {
  // 中间件链：每个模块导出 onRequest，最后一个是 handler 模块。
  // 中间件可以 ctx.next() 进入下一个；最后 handler 直接返回 Response。
  let i = 0;
  async function next() {
    if (i >= modules.length) {
      return new Response('not found', { status: 404 });
    }
    const m = modules[i++];
    if (m.isHandler) {
      // 最终 handler：选具体 method export，回退到 onRequest
      const fn = m.module[methodHandlerName] || m.module.onRequest;
      if (!fn) {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return await fn(ctx);
    }
    const fn = m.module.onRequest;
    if (!fn) {
      return next();
    }
    return await fn(ctx);
  }
  ctx.next = next;
  return next();
}

export function functionsPlugin(options = {}) {
  const opts = {
    schemaFile: options.schemaFile || 'migrations/0001_init.sql',
    dbPath: options.dbPath || '.wrangler/state-test/dev.sqlite',
    ...options,
  };
  let rootDir;
  let env;

  return {
    name: 'cloudflare-pages-functions-dev',
    apply: 'serve',
    configResolved(config) {
      rootDir = config.root;
    },
    configureServer(server) {
      // 初始化本地 D1 + 加载 .dev.vars
      const dbFullPath = path.resolve(rootDir, opts.dbPath);
      const d1 = createLocalD1(dbFullPath);
      const schemaPath = path.resolve(rootDir, opts.schemaFile);
      if (existsSync(schemaPath)) {
        try {
          const schemaSql = readFileSync(schemaPath, 'utf8');
          // 幂等：用 IF NOT EXISTS 没改 schema 文件，所以只在表不存在时建。
          const hasTables = d1._raw
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            .get();
          if (!hasTables) {
            applySchemaToLocalD1(d1, schemaSql);
            // eslint-disable-next-line no-console
            console.log('[functions-plugin] applied schema to local D1:', dbFullPath);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[functions-plugin] schema apply failed:', err);
        }
      }
      const devVars = loadDevVars(rootDir);
      env = { DB: d1, ...devVars };

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) {
          return next();
        }
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          const route = resolveRoute(rootDir, urlObj.pathname);
          if (!route) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: '路由不存在' } }));
            return;
          }
          const body = ['GET', 'HEAD'].includes(req.method)
            ? undefined
            : await readBody(req);

          const { url, headers, method } = buildWebRequest(req);
          const request = new Request(url, {
            method,
            headers,
            body: body && body.length > 0 ? body : undefined,
            duplex: 'half',
          });

          const ctx = {
            request,
            env,
            data: {},
            params: route.params,
            waitUntil: () => {},
          };

          // Load all middlewares + handler as ESM modules.
          const modules = [];
          for (const mwFile of route.middlewareFiles) {
            const mod = await import(pathToFileURL(mwFile).href + `?t=${Date.now()}`);
            modules.push({ module: mod, isHandler: false });
          }
          const handlerMod = await import(
            pathToFileURL(route.handlerFile).href + `?t=${Date.now()}`
          );
          modules.push({ module: handlerMod, isHandler: true });

          const methodMap = {
            GET: 'onRequestGet',
            POST: 'onRequestPost',
            PATCH: 'onRequestPatch',
            PUT: 'onRequestPut',
            DELETE: 'onRequestDelete',
            HEAD: 'onRequestHead',
            OPTIONS: 'onRequestOptions',
          };
          const methodHandlerName = methodMap[method] || 'onRequest';

          const response = await dispatch(modules, ctx, methodHandlerName);

          res.statusCode = response.status;
          response.headers.forEach((v, k) => {
            // node ServerResponse Set-Cookie 要用数组
            if (k.toLowerCase() === 'set-cookie') {
              const existing = res.getHeader('Set-Cookie');
              const arr = Array.isArray(existing) ? existing : (existing ? [existing] : []);
              arr.push(v);
              res.setHeader('Set-Cookie', arr);
            } else {
              res.setHeader(k, v);
            }
          });
          if (response.status === 204) {
            res.end();
            return;
          }
          const buf = Buffer.from(await response.arrayBuffer());
          res.end(buf);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[functions-plugin] error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: err?.message || 'server error' } }));
        }
      });
    },
  };
}
