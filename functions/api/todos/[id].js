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
