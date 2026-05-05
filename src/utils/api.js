export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (res.status === 204) {
    return null;
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(res.status, 'PARSE_ERROR', '响应解析失败');
    }
    return null;
  }

  if (!res.ok) {
    const code = json?.error?.code;
    const message = json?.error?.message;
    if (res.status === 401) {
      window.dispatchEvent(
        new CustomEvent('authStateChanged', {
          detail: { user: null, isLoggedIn: false },
        })
      );
    }
    throw new ApiError(res.status, code, message);
  }
  return json.data;
}

export const api = {
  get:   (p)    => request(p, { method: 'GET' }),
  post:  (p, b) => request(p, { method: 'POST', body: JSON.stringify(b ?? {}) }),
  patch: (p, b) => request(p, { method: 'PATCH', body: JSON.stringify(b ?? {}) }),
  del:   (p)    => request(p, { method: 'DELETE' }),
};
