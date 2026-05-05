import jwt from '@tsndr/cloudflare-worker-jwt';

const PBKDF2_ITER = 600000;
const SALT_LEN = 16;
const HASH_LEN = 32;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(password, salt, iter, len) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await deriveBits(password, salt, PBKDF2_ITER, HASH_LEN);
  return `pbkdf2$${PBKDF2_ITER}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }
  const iter = parseInt(parts[1], 10);
  if (!Number.isFinite(iter) || iter < 1) {
    return false;
  }
  const salt = b64ToBytes(parts[2]);
  const expected = b64ToBytes(parts[3]);
  const actual = await deriveBits(password, salt, iter, expected.length);
  return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function signJwt(payload, secret) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      ...payload,
      iat: now,
      exp: now + COOKIE_MAX_AGE,
    },
    secret
  );
}

export async function verifyJwt(token, secret) {
  try {
    const valid = await jwt.verify(token, secret);
    if (!valid) {
      return null;
    }
    const decoded = jwt.decode(token);
    return decoded?.payload || null;
  } catch {
    return null;
  }
}

export function setAuthCookie(token) {
  return `token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function clearAuthCookie() {
  return `token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function parseCookie(header) {
  if (!header) {
    return {};
  }
  const out = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const k = trimmed.slice(0, idx);
    const v = trimmed.slice(idx + 1);
    out[k] = v;
  }
  return out;
}
