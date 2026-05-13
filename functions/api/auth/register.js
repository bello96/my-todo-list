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
  if (!password || typeof password !== 'string' || password.length < 10 || password.length > 100) {
    throw Errors.validation('密码长度需 10-100 字符');
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
