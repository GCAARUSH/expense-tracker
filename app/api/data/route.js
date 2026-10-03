import { NextResponse } from 'next/server';
import { redis, getData, saveData, getUser, newViewKey, readSession, resolveViewer } from '../../../lib/store';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const round2 = (n) => Math.round(n * 100) / 100;
const noStore = { headers: { 'Cache-Control': 'no-store' } };

export async function GET(req) {
  const v = await resolveViewer(req);
  if (!v) {
    return NextResponse.json({ error: 'Not logged in, or the link is invalid' }, { status: 401, ...noStore });
  }
  if (v.admin) {
    const [user, data] = await redis.mget(`et:user:${v.username}`, `et:data:${v.username}`);
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401, ...noStore });
    return NextResponse.json(
      {
        data: data && data.accounts ? data : { accounts: [], transactions: [] },
        isAdmin: true,
        me: { username: v.username, viewKey: user.viewKey },
      },
      noStore
    );
  }
  const data = await getData(v.username);
  return NextResponse.json({ data, isAdmin: false, me: null }, noStore);
}

export async function POST(req) {
  const username = readSession(req);
  if (!username) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const { action, payload = {} } = await req.json().catch(() => ({}));
  const data = await getData(username);
  const now = Date.now();
  let newId = null;

  const hasAcc = (id) => data.accounts.some((a) => a.id === id);
  const bad = (msg) => NextResponse.json({ error: msg }, { status: 400 });

  switch (action) {
    case 'addAccount': {
      const name = String(payload.name || '').trim().slice(0, 40);
      if (!name) return bad('Account name is required');
      if (data.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase()))
        return bad('An account with that name already exists');
      const opening = round2(Number(payload.opening) || 0);
      data.accounts.push({ id: randomUUID(), name, opening });
      break;
    }

    case 'setOpening': {
      const acc = data.accounts.find((x) => x.id === payload.id);
      if (!acc) return bad('Account not found');
      const v = Number(payload.opening);
      if (!Number.isFinite(v)) return bad('Enter a valid amount');
      acc.opening = round2(v);
      break;
    }

    case 'deleteAccount': {
      data.accounts = data.accounts.filter((a) => a.id !== payload.id);
      data.transactions = data.transactions.filter(
        (t) => t.accountId !== payload.id && t.toAccountId !== payload.id
      );
      break;
    }

    case 'addTx': {
      const { type, accountId, toAccountId } = payload;
      const amount = round2(Number(payload.amount));
      if (!['debit', 'credit', 'transfer'].includes(type)) return bad('Invalid type');
      if (!hasAcc(accountId)) return bad('Pick an account');
      if (!(amount > 0)) return bad('Enter an amount greater than 0');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(payload.datetime || '')) return bad('Pick a date and time');
      const tx = {
        id: randomUUID(),
        type,
        accountId,
        amount,
        datetime: payload.datetime.slice(0, 16),
        createdAt: now,
        description: String(payload.description || '').trim().slice(0, 200),
        category: String(payload.category || '').trim().slice(0, 40),
      };
      if (type === 'transfer') {
        if (!hasAcc(toAccountId) || toAccountId === accountId)
          return bad('Pick two different accounts for a transfer');
        tx.toAccountId = toAccountId;
        tx.category = 'Transfer';
      } else if (!tx.category) {
        return bad('Category is required');
      }
      data.transactions.push(tx);
      newId = tx.id;
      break;
    }

    case 'deleteTx': {
      data.transactions = data.transactions.filter((t) => t.id !== payload.id);
      break;
    }

    case 'resetViewKey': {
      const user = await getUser(username);
      if (!user) return bad('Account not found');
      const old = user.viewKey;
      user.viewKey = newViewKey();
      await redis.set(`et:user:${username}`, user);
      await redis.set(`et:viewkey:${user.viewKey}`, username);
      if (old) await redis.del(`et:viewkey:${old}`);
      return NextResponse.json({ data, viewKey: user.viewKey });
    }

    default:
      return bad('Unknown action');
  }

  await saveData(username, data);
  return NextResponse.json({ data, id: newId });
}
