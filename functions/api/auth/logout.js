import { clearAuthCookie } from '../../lib/auth.js';

export const onRequestPost = async () => {
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearAuthCookie() },
  });
};
