import { NextResponse } from 'next/server';
import { getData, saveData, isAdmin } from '../../../lib/store';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const round2 = (n) => Math.round(n * 100) / 100;
const noStore = { headers: { 'Cache-Control': 'no-store' } };

export async function GET(req) {
  const admin = isAdmin(req);
  const viewKey = process.env.VIEW_KEY;
  const key = new URL(req.url).searchParams.get('key');
  if (!admin && viewKey && key !== viewKey) {
    return NextResponse.json({ error: 'Invalid view link' }, { status: 401, ...noStore });
  }
  const data = await getData();
  return NextResponse.json({ data, isAdmin: admin }, noStore);
}

export async function POST(req) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }
  const { action, payload = {} } = await req.json().catch(() => ({}));
  const data = await getData();
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
      const acc = { id: randomUUID(), name };
      data.accounts.push(acc);
      const opening = round2(Number(payload.opening) || 0);
      if (opening > 0) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        data.transactions.push({
          id: randomUUID(),
          type: 'credit',
          accountId: acc.id,
          amount: opening,
          category: 'Opening balance',
          description: 'Opening balance',
          datetime: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
          createdAt: now,
        });
      }
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

    default:
      return bad('Unknown action');
  }

  await saveData(data);
  return NextResponse.json({ data, id: newId });
}
