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
