import { describe, it, expect } from 'vitest';
import { makeClient } from '../setup/client.mjs';

const uniqUser = () => `u_${Math.random().toString(36).slice(2, 10)}`;

async function loggedInClient() {
  const c = makeClient();
  await c.post('/api/auth/register', { username: uniqUser(), password: 'secret123' });
  return c;
}

describe('todos', () => {
  it('未登录访问列表返回 401', async () => {
    const c = makeClient();
    const r = await c.get('/api/todos');
    expect(r.status).toBe(401);
  });

  it('新建 → 列表 → 更新 → 删除 链路', async () => {
    const c = await loggedInClient();

    const created = await c.post('/api/todos', { content: '买菜', taskDate: '2026-05-05' });
    expect(created.status).toBe(201);
    expect(created.body.data.taskId).toBeTruthy();
    expect(created.body.data.content).toBe('买菜');
    expect(created.body.data.completed).toBe(false);

    const list = await c.get('/api/todos?from=2026-05-01&to=2026-05-31');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);

    const id = created.body.data.taskId;
    const upd = await c.patch(`/api/todos/${id}`, { completed: true });
    expect(upd.status).toBe(200);
    expect(upd.body.data.completed).toBe(true);

    const upd2 = await c.patch(`/api/todos/${id}`, { content: '买水果' });
    expect(upd2.body.data.content).toBe('买水果');

    const del = await c.del(`/api/todos/${id}`);
    expect(del.status).toBe(204);

    const list2 = await c.get('/api/todos');
    expect(list2.body.data.length).toBe(0);
  });

  it('日期范围筛选生效', async () => {
    const c = await loggedInClient();
    await c.post('/api/todos', { content: 'a', taskDate: '2026-04-15' });
    await c.post('/api/todos', { content: 'b', taskDate: '2026-05-15' });
    await c.post('/api/todos', { content: 'c', taskDate: '2026-06-15' });

    const may = await c.get('/api/todos?from=2026-05-01&to=2026-05-31');
    expect(may.body.data.length).toBe(1);
    expect(may.body.data[0].content).toBe('b');
  });

  it('数据隔离：A 用户看不到 B 的任务', async () => {
    const a = await loggedInClient();
    await a.post('/api/todos', { content: 'a-only', taskDate: '2026-05-05' });

    const b = await loggedInClient();
    const list = await b.get('/api/todos');
    expect(list.body.data.length).toBe(0);
  });

  it('批量完成', async () => {
    const c = await loggedInClient();
    const r1 = await c.post('/api/todos', { content: 't1', taskDate: '2026-05-05' });
    const r2 = await c.post('/api/todos', { content: 't2', taskDate: '2026-05-05' });
    const ids = [r1.body.data.taskId, r2.body.data.taskId];

    const bulk = await c.post('/api/todos/bulk-complete', { ids, completed: true });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.updated).toBe(2);

    const list = await c.get('/api/todos');
    for (const t of list.body.data) {
      expect(t.completed).toBe(true);
    }
  });

  it('参数校验：空 content 返 400', async () => {
    const c = await loggedInClient();
    const r = await c.post('/api/todos', { content: '   ', taskDate: '2026-05-05' });
    expect(r.status).toBe(400);
  });

  it('参数校验：日期格式错返 400', async () => {
    const c = await loggedInClient();
    const r = await c.post('/api/todos', { content: 'x', taskDate: '05/05/2026' });
    expect(r.status).toBe(400);
  });

  it('删除不存在的 todo 返回 404', async () => {
    const c = await loggedInClient();
    const r = await c.del('/api/todos/99999999');
    expect(r.status).toBe(404);
  });
});
