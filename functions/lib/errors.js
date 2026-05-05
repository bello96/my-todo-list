export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', '请先登录'),
  invalidCreds: () => new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误'),
  forbidden:    () => new AppError(403, 'FORBIDDEN', '无权操作此资源'),
  notFound:     (k) => new AppError(404, 'NOT_FOUND', `${k}不存在`),
  duplicate:    (k) => new AppError(409, 'DUPLICATE', `${k}已存在`),
  validation:   (m) => new AppError(400, 'VALIDATION_FAILED', m),
};

export function jsonOk(data, status = 200) {
  if (data === null || data === undefined) {
    return new Response(null, { status: 204 });
  }
  return Response.json({ data }, { status });
}

export function jsonError(status, code, message) {
  return Response.json({ error: { code, message } }, { status });
}
