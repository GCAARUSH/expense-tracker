import { Redis } from '@upstash/redis';
import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'crypto';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export const COOKIE = 'et_session';
const LEGACY_KEY = 'expense-tracker:v1'; // data from the single-user version
const empty = () => ({ accounts: [], transactions: [] });

/* Secret used to sign login cookies. SESSION_SECRET is preferred; ADMIN_PASSWORD still works as a fallback. */
export const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';

/* ---------- data (one ledger per user) ---------- */
export async function getData(username) {
  const d = await redis.get(`et:data:${username}`);
  return d && d.accounts ? d : empty();
}
export async function saveData(username, data) {
  await redis.set(`et:data:${username}`, data);
}

/* ---------- users ---------- */
export const normUser = (s) => String(s || '').trim().toLowerCase();
export const validUser = (s) => /^[a-z0-9_]{3,20}$/.test(s);
export const getUser = (username) => redis.get(`et:user:${username}`);
export const newViewKey = () => randomBytes(16).toString('base64url');

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function checkPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(user.hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createUser(username, password) {
  const { salt, hash } = hashPassword(password);
  const viewKey = newViewKey();
  const user = { username, salt, hash, viewKey, createdAt: Date.now() };
  const created = await redis.set(`et:user:${username}`, user, { nx: true });
  if (!created) return null; // username already taken
  await redis.set(`et:viewkey:${viewKey}`, username);

  // The very first person to sign up inherits the data from the old single-user version.
  let data = empty();
  const claimed = await redis.set('et:legacy-claimed', username, { nx: true });
  if (claimed) {
    const legacy = await redis.get(LEGACY_KEY);
    if (legacy && legacy.accounts) data = legacy;
  }
  await saveData(username, data);
  return user;
}

/* ---------- sessions (signed cookie: username.expiry.signature) ---------- */
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('hex');

export function makeSession(username) {
  const payload = `${username}.${Date.now() + 30 * 24 * 3600 * 1000}`;
  return `${payload}.${sign(payload)}`;
}

export function readSession(req) {
  const t = req.cookies.get(COOKIE)?.value;
  if (!t || !secret()) return null;
  const parts = t.split('.');
  if (parts.length !== 3) return null;
  const [username, exp, sig] = parts;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${username}.${exp}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return username;
}

/* Who is asking, and whose data should they see?
   A ?key= (parents' link) always wins and is read-only; otherwise the login cookie is used. */
export async function resolveViewer(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (key) {
    const owner = await redis.get(`et:viewkey:${key}`);
    return owner ? { username: owner, admin: false } : null;
  }
  const username = readSession(req);
  return username ? { username, admin: true } : null;
}
