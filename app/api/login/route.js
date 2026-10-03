import { NextResponse } from 'next/server';
import { redis, COOKIE, secret, makeSession, normUser, validUser, getUser, checkPassword, createUser } from '../../../lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ inviteOnly: !!process.env.SIGNUP_CODE });
}

export async function POST(req) {
  if (!secret()) {
    return NextResponse.json({ error: 'Server setup incomplete: set SESSION_SECRET in Vercel.' }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  const username = normUser(body.username);
  const password = String(body.password || '');
  const fail = (msg, status = 400) => NextResponse.json({ error: msg }, { status });

  if (body.mode === 'signup') {
    if (process.env.SIGNUP_CODE && body.code !== process.env.SIGNUP_CODE) return fail('That invite code is not right.', 403);
    if (!validUser(username)) return fail('Username must be 3–20 characters: letters, numbers or underscore.');
    if (password.length < 8 || password.length > 100) return fail('Password must be at least 8 characters.');
    const user = await createUser(username, password);
    if (!user) return fail('That username is taken. Try another.', 409);
  } else {
    const failKey = `et:fail:${username}`;
    if ((Number(await redis.get(failKey)) || 0) >= 10) {
      return fail('Too many wrong attempts. Try again in 15 minutes.', 429);
    }
    const user = validUser(username) ? await getUser(username) : null;
    if (!user || !checkPassword(password, user)) {
      const n = await redis.incr(failKey);
      if (n === 1) await redis.expire(failKey, 900);
      return fail('Wrong username or password.', 401);
    }
    await redis.del(failKey);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeSession(username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
