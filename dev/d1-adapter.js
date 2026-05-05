// 本地开发用的 D1 适配器：基于 Node 22 内置 node:sqlite。
// 仅在 vite dev 与 vitest 中使用，生产环境是 Cloudflare D1 真实绑定。
// 暴露的接口尽量贴近 D1Database 的子集（prepare/bind/first/run/all + exec）。

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function createLocalD1(filePath) {
  if (filePath !== ':memory:') {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');

  function prepare(sql) {
    let boundArgs = [];
    let stmt = null;
    function ensureStmt() {
      if (!stmt) {
        stmt = db.prepare(sql);
      }
      return stmt;
    }

    const api = {
      bind(...args) {
        boundArgs = args;
        return api;
      },
      async first() {
        const row = ensureStmt().get(...boundArgs);
        return row || null;
      },
      async run() {
        const r = ensureStmt().run(...boundArgs);
        return {
          success: true,
          meta: {
            changes: r.changes,
            last_row_id: Number(r.lastInsertRowid),
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: r.changes,
          },
        };
      },
      async all() {
        const results = ensureStmt().all(...boundArgs);
        return {
          success: true,
          results,
          meta: {
            changes: 0,
            duration: 0,
            size_after: 0,
            rows_read: results.length,
            rows_written: 0,
          },
        };
      },
    };
    return api;
  }

  return {
    prepare,
    async exec(sql) {
      db.exec(sql);
    },
    _raw: db,
  };
}

export function applySchemaToLocalD1(d1, schemaSql) {
  d1._raw.exec(schemaSql);
}
