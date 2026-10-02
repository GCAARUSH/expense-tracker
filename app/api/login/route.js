import { NextResponse } from 'next/server';
import { COOKIE, makeToken, passwordOk } from '../../../lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  if (!passwordOk(password)) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(), {
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
