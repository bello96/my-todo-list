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
