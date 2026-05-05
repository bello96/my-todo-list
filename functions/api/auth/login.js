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
