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
