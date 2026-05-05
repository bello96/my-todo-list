import { describe, it, expect, beforeEach } from 'vitest';
import { makeClient } from '../setup/client.mjs';

const uniqUser = () => `u_${Math.random().toString(36).slice(2, 10)}`;

describe('auth', () => {
  let c;
  beforeEach(() => {
    c = makeClient();
  });

  it('注册成功并自动登录（cookie 注入）', async () => {
    const username = uniqUser();
    const r = await c.post('/api/auth/register', { username, password: 'secret123' });
    expect(r.status).toBe(201);
    expect(r.body.data.username).toBe(username);
    expect(c.getCookie()).toMatch(/^token=/);

    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe(username);
  });

  it('注册重复用户名返回 409 DUPLICATE', async () => {
    const username = uniqUser();
    await c.post('/api/auth/register', { username, password: 'secret123' });
    const r = await c.post('/api/auth/register', { username, password: 'secret123' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DUPLICATE');
  });

  it('注册参数不合法返回 400 VALIDATION_FAILED', async () => {
    const r = await c.post('/api/auth/register', { username: 'ab', password: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('密码错误返回 401 INVALID_CREDENTIALS（防枚举）', async () => {
    const username = uniqUser();
    await c.post('/api/auth/register', { username, password: 'secret123' });
    const c2 = makeClient();
    const r = await c2.post('/api/auth/login', { username, password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('用户名不存在也返 INVALID_CREDENTIALS（防枚举）', async () => {
    const r = await c.post('/api/auth/login', { username: 'nope_'+Math.random(), password: 'whatever' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('登出后访问 me 返回 401', async () => {
    const username = uniqUser();
    await c.post('/api/auth/register', { username, password: 'secret123' });
    const lo = await c.post('/api/auth/logout', {});
    expect(lo.status).toBe(204);
    c.clearCookie();
    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});
