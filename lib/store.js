import { Redis } from '@upstash/redis';
import { createHmac, timingSafeEqual } from 'crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const KEY = 'expense-tracker:v1';

export async function getData() {
  const d = await redis.get(KEY);
  return d && d.accounts ? d : { accounts: [], transactions: [] };
}

export async function saveData(data) {
  await redis.set(KEY, data);
}

/* ---------- auth ---------- */
export const COOKIE = 'et_auth';

export function makeToken() {
  const pw = process.env.ADMIN_PASSWORD || '';
  return createHmac('sha256', pw).update('expense-tracker-admin').digest('hex');
}

export function passwordOk(input) {
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!pw || typeof input !== 'string') return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const t = req.cookies.get(COOKIE)?.value;
  if (!t) return false;
  const expected = makeToken();
  const a = Buffer.from(t);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
