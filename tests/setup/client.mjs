const BASE = () => process.env.TEST_BASE_URL;

export function makeClient() {
  let cookie = '';

  const captureCookie = (res) => {
    const set = res.headers.get('Set-Cookie');
    if (set) {
      const m = set.match(/token=([^;]*)/);
      if (m) {
        cookie = `token=${m[1]}`;
      }
    }
  };

  async function call(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (cookie) {
      headers.Cookie = cookie;
    }
    const res = await fetch(`${BASE()}${path}`, { ...options, headers });
    captureCookie(res);
    let body = null;
    if (res.status !== 204) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    return { status: res.status, body };
  }

  return {
    get: (p) => call(p, { method: 'GET' }),
    post: (p, b) => call(p, { method: 'POST', body: JSON.stringify(b) }),
    patch: (p, b) => call(p, { method: 'PATCH', body: JSON.stringify(b) }),
    del: (p) => call(p, { method: 'DELETE' }),
    clearCookie: () => { cookie = ''; },
    getCookie: () => cookie,
  };
}
