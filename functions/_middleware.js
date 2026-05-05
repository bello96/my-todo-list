import { AppError } from './lib/errors.js';

export const onRequest = async (ctx) => {
  try {
    return await ctx.next();
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    console.error('[unhandled]', err?.stack || err);
    return Response.json(
      { error: { code: 'INTERNAL', message: '服务器错误' } },
      { status: 500 }
    );
  }
};
