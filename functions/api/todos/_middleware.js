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
