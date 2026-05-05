// 注册/登录无需鉴权。本中间件留作未来限流/审计的扩展点。
export const onRequest = async (ctx) => {
  return ctx.next();
};
