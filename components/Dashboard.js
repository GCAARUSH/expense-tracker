'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEBIT_CATS = ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Rent', 'Health', 'Education', 'Entertainment', 'Travel', 'Other'];
const CREDIT_CATS = ['Salary', 'Pocket money', 'Gift', 'Refund', 'Interest', 'Other income'];
const BAR_COLORS = ['#e9b44c', '#55d6b2', '#8fb4ff', '#ff7f6e', '#c79bff', '#7fd4ff', '#ffb38a'];

const round2 = (n) => Math.round(n * 100) / 100;
const inr = (n) =>
  (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pdfMoney = (n) =>
  (n < 0 ? '-' : '') + 'Rs. ' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDate(dt) {
  const [d] = dt.split('T');
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(dt) {
  const [h, m] = dt.split('T')[1].split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/* Replays every transaction in time order so each row knows the balance right after it. */
function buildLedger(data) {
  const sorted = [...data.transactions].sort(
    (a, b) => a.datetime.localeCompare(b.datetime) || (a.createdAt || 0) - (b.createdAt || 0)
  );
  const bal = {};
  data.accounts.forEach((a) => (bal[a.id] = round2(Number(a.opening) || 0)));
  const rows = sorted.map((t) => {
    const r = { ...t };
    if (t.type === 'credit') bal[t.accountId] = round2(bal[t.accountId] + t.amount);
    else if (t.type === 'debit') bal[t.accountId] = round2(bal[t.accountId] - t.amount);
    else {
      bal[t.accountId] = round2(bal[t.accountId] - t.amount);
      bal[t.toAccountId] = round2(bal[t.toAccountId] + t.amount);
      r.toBalance = bal[t.toAccountId];
    }
    r.balance = bal[t.accountId];
    return r;
  });
  return { rows, balances: bal };
}

export default function Dashboard({ mode }) {
  const [data, setData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const busy = useRef(false);
  const viewKey = useRef('');

  const load = useCallback(async () => {
    if (busy.current || document.visibilityState === 'hidden') return;
    try {
      const q = viewKey.current ? `?key=${encodeURIComponent(viewKey.current)}` : '';
      const res = await fetch('/api/data' + q, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        if (mode === 'admin' && res.status === 401) {
          setNeedLogin(true);
          return;
        }
        setError(json.error || 'Could not load');
        setOnline(false);
        return;
      }
      setData(json.data);
      setIsAdmin(json.isAdmin);
      setMe(json.me || null);
      setNeedLogin(mode === 'admin' && !json.isAdmin);
      setError('');
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [mode]);

  useEffect(() => {
    viewKey.current = new URLSearchParams(window.location.search).get('key') || '';
    load();
    const id = setInterval(load, 5000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  async function act(action, payload) {
    busy.current = true;
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const json = await res.json();
      if (!res.ok) return { error: json.error || 'Something went wrong' };
      setData(json.data);
      return json;
    } catch {
      return { error: 'Network problem — try again' };
    } finally {
      busy.current = false;
    }
  }

  async function logout() {
    await fetch('/api/login', { method: 'DELETE' });
    setIsAdmin(false);
    setNeedLogin(true);
  }

  if (needLogin) return <Login onDone={load} />;
  if (error && !data) {
    return (
      <div className="wrap">
        <div className="login">
          <h1>Can&apos;t open this</h1>
          <p className="msg err">{error}. Ask for the full link, including the key.</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="wrap"><p className="sub">Loading…</p></div>;

  return <Main data={data} canEdit={mode === 'admin' && isAdmin} online={online} act={act} onLogout={logout} viewKey={viewKey.current} me={me} reload={load} />;
}

function Bal({ v }) {
  return <span style={v < 0 ? { color: 'var(--debit)' } : undefined}>{inr(v)}</span>;
}

function Login({ onDone }) {
  const [signup, setSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/login').then((r) => r.json()).then((j) => setInviteOnly(!!j.inviteOnly)).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: signup ? 'signup' : 'login', username, password: pw, code }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) onDone();
      else setErr(json.error || 'Something went wrong');
    } catch {
      setErr('Network problem — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Ledger</h1>
      <p className="sub" style={{ margin: 0 }}>{signup ? 'Create your own private ledger.' : 'Log in to your ledger.'}</p>
      <div className="field">
        <label htmlFor="un">Username</label>
        <input id="un" className="in" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus />
      </div>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" className="in" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} />
      </div>
      {signup && inviteOnly && (
        <div className="field">
          <label htmlFor="ic">Invite code</label>
          <input id="ic" className="in" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      )}
      {err && <div className="msg err" role="alert">{err}</div>}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}</button>
      <button className="btn small" type="button" onClick={() => { setSignup(!signup); setErr(''); }}>
        {signup ? 'I already have an account' : 'New here? Create an account'}
      </button>
    </form>
  );
}

function Main({ data, canEdit, online, act, onLogout, viewKey, me, reload }) {
  const { rows, balances } = useMemo(() => buildLedger(data), [data]);
  const accName = useMemo(() => Object.fromEntries(data.accounts.map((a) => [a.id, a.name])), [data]);
  const total = round2(Object.values(balances).reduce((s, v) => s + v, 0));

  const [fAcc, setFAcc] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (fAcc !== 'all' && r.accountId !== fAcc && r.toAccountId !== fAcc) return false;
        const d = r.datetime.slice(0, 10);
        if (fFrom && d < fFrom) return false;
        if (fTo && d > fTo) return false;
        return true;
      })
      .reverse();
  }, [rows, fAcc, fFrom, fTo]);

  // Balance of the account being looked at (for transfers, the side that matters)
  const balFor = (r) => (fAcc !== 'all' && r.type === 'transfer' && r.toAccountId === fAcc ? r.toBalance : r.balance);

  const spent = round2(filtered.filter((r) => r.type === 'debit').reduce((s, r) => s + r.amount, 0));
  const added = round2(filtered.filter((r) => r.type === 'credit').reduce((s, r) => s + r.amount, 0));

  async function exportPdf() {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    const accLabel = fAcc === 'all' ? 'All accounts' : accName[fAcc];
    const range = fFrom || fTo ? `${fFrom || 'start'} to ${fTo || 'today'}` : 'All dates';

    doc.setFontSize(18);
    doc.text('Expense statement', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`${accLabel}  |  ${range}  |  Generated ${new Date().toLocaleString('en-IN')}`, 14, 23);
    doc.setTextColor(0);
    doc.text(
      `Total spent: ${pdfMoney(spent)}     Total credited: ${pdfMoney(added)}     ` +
        (fAcc === 'all' ? `Combined balance now: ${pdfMoney(total)}` : `Balance now: ${pdfMoney(balances[fAcc] || 0)}`),
      14,
      30
    );

    const body = filtered.map((r) => {
      const isTo = fAcc !== 'all' && r.type === 'transfer' && r.toAccountId === fAcc;
      const sign = r.type === 'credit' || isTo ? '+' : '-';
      return [
        fmtDate(r.datetime),
        fmtTime(r.datetime),
        r.type === 'transfer' ? `${accName[r.accountId]} to ${accName[r.toAccountId]}` : accName[r.accountId],
        r.type === 'debit' ? 'Expense' : r.type === 'credit' ? 'Credit' : 'Transfer',
        r.category,
        r.description || '',
        `${sign}${pdfMoney(r.amount).replace('-', '')}`,
        pdfMoney(balFor(r)),
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [['Date', 'Time', 'Account', 'Type', 'Category', 'Description', 'Amount', 'Balance left']],
      body,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [22, 32, 51] },
      columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 6) {
          h.cell.styles.textColor = String(h.cell.raw).startsWith('+') ? [20, 140, 110] : [200, 70, 50];
        }
      },
    });
    doc.save(`expenses-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const [copied, setCopied] = useState(false);
  function copyViewLink() {
    const k = me?.viewKey || viewKey;
    const url = `${window.location.origin}/view${k ? `?key=${k}` : ''}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>Ledger</h1>
          <span className="live" title={online ? 'Updates every few seconds' : 'Connection lost — retrying'}>
            <span className={'dot' + (online ? '' : ' off')} />
            {online ? 'Live' : 'Reconnecting…'}
          </span>
          {me && <span className="sub">· {me.username}</span>}
        </div>
        <div className="actions">
          <a className="btn" href={'/categories' + (viewKey ? `?key=${encodeURIComponent(viewKey)}` : '')}>Categories</a>
          <button className="btn" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button>
          {canEdit && <button className="btn" onClick={copyViewLink}>{copied ? 'Copied' : 'Copy parents’ link'}</button>}
          {canEdit && (
            <button
              className="btn"
              onClick={async () => {
                if (!confirm('Make a new parents’ link? The old link will stop working.')) return;
                const r = await act('resetViewKey');
                if (r.error) alert(r.error);
                else reload();
              }}
            >
              New link
            </button>
          )}
          {canEdit && <button className="btn" onClick={onLogout}>Log out</button>}
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="total-label">Across all accounts</div>
          <div className={'total num' + (total < 0 ? ' neg' : '')}>{inr(total)}</div>
        </div>
        <div>
          <div className="accounts">
            {data.accounts.length === 0 && (
              <div className="empty">{canEdit ? 'Add your first account below to start tracking.' : 'No accounts yet.'}</div>
            )}
            {data.accounts.map((a, i) => (
              <div className="acc" key={a.id}>
                <span className="bar" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                <span className="name">{a.name}</span>
                <span className={'bal num' + (balances[a.id] < 0 ? ' neg' : '')}>{inr(balances[a.id] || 0)}</span>
                {canEdit ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn small"
                      title="Set what this account held before your first recorded transaction"
                      onClick={async () => {
                        const v = prompt(`How much did "${a.name}" hold before your first recorded transaction? (₹)`, String(a.opening || 0));
                        if (v === null) return;
                        const r = await act('setOpening', { id: a.id, opening: v });
                        if (r.error) alert(r.error);
                      }}
                    >
                      Set start
                    </button>
                    <button
                      className="btn small danger"
                      onClick={() => {
                        if (confirm(`Delete "${a.name}" and every transaction that involves it?`)) act('deleteAccount', { id: a.id });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : <span />}
              </div>
            ))}
          </div>
          {canEdit && <AddAccount act={act} />}
        </div>
      </section>

      {canEdit && data.accounts.some((a) => !a.opening && (balances[a.id] || 0) < 0) && (
        <p className="msg err" style={{ margin: '-8px 0 20px' }}>
          An account is showing a negative balance because it started at ₹0. Tap <b>Set start</b> next to it and enter what it held before your first entry, or record an <b>Add money</b> entry.
        </p>
      )}

      {canEdit && data.accounts.length > 0 && <EntryForm data={data} act={act} />}

      <section>
        <div className="list-head">
          <h2>Transactions <span className="sub num">({filtered.length})</span></h2>
          <div className="filters">
            <div className="field">
              <label htmlFor="fa">Account</label>
              <select id="fa" className="in" value={fAcc} onChange={(e) => setFAcc(e.target.value)}>
                <option value="all">All accounts</option>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ff">From</label>
              <input id="ff" className="in" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ft">To</label>
              <input id="ft" className="in" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
          </div>
        </div>
        <p className="sub" style={{ margin: '0 0 10px' }}>
          Spent <span className="amt debit num">{inr(spent)}</span> · Credited <span className="amt credit num">{inr(added)}</span> in this view. The PDF uses the same filters.
        </p>

        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty">{data.transactions.length ? 'Nothing matches these filters.' : 'No transactions yet.'}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th><th>Account</th><th>Category</th><th>Description</th>
                  <th className="r">Amount</th><th className="r">Balance left</th>{canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isTo = fAcc !== 'all' && r.type === 'transfer' && r.toAccountId === fAcc;
                  const sign = r.type === 'credit' || isTo ? '+' : '−';
                  return (
                    <tr key={r.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(r.datetime)}<div className="sub">{fmtTime(r.datetime)}</div>
                      </td>
                      <td>
                        {r.type === 'transfer' ? `${accName[r.accountId]} → ${accName[r.toAccountId]}` : accName[r.accountId]}
                      </td>
                      <td><span className="pill">{r.category}</span></td>
                      <td>{r.description || <span className="sub">—</span>}</td>
                      <td className={'r num amt ' + r.type} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {sign}{inr(r.amount).replace('-', '')}
                      </td>
                      <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.type === 'transfer' && fAcc === 'all' ? (
                          <>
                            <div><Bal v={r.balance} /><div className="sub">{accName[r.accountId]}</div></div>
                            <div style={{ marginTop: 6 }}><Bal v={r.toBalance} /><div className="sub">{accName[r.toAccountId]}</div></div>
                          </>
                        ) : (
                          <>
                            <Bal v={balFor(r)} />
                            <div className="sub">{accName[isTo ? r.toAccountId : r.accountId]}</div>
                          </>
                        )}
                      </td>
                      {canEdit && (
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn small danger"
                            aria-label="Delete transaction"
                            onClick={() => confirm('Delete this transaction? Balances will be recalculated.') && act('deleteTx', { id: r.id })}
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function AddAccount({ act }) {
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    const r = await act('addAccount', { name, opening });
    if (r.error) setErr(r.error);
    else { setName(''); setOpening(''); setErr(''); }
  }
  return (
    <form className="add-acc" onSubmit={submit}>
      <input className="in" style={{ flex: '1 1 150px', width: 'auto' }} placeholder="New account name (e.g. Cash, SBI)" aria-label="New account name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="in" style={{ flex: '0 1 140px', width: 'auto' }} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Opening ₹" aria-label="Opening balance" value={opening} onChange={(e) => setOpening(e.target.value)} />
      <button className="btn" type="submit">Add account</button>
      {err && <span className="msg err" style={{ width: '100%' }}>{err}</span>}
    </form>
  );
}

function EntryForm({ data, act }) {
  const [type, setType] = useState('debit');
  const [accountId, setAccountId] = useState(data.accounts[0].id);
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [datetime, setDatetime] = useState(nowLocal());
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // keep selections valid if accounts change
  useEffect(() => {
    if (!data.accounts.some((a) => a.id === accountId)) setAccountId(data.accounts[0]?.id || '');
    if (toAccountId && !data.accounts.some((a) => a.id === toAccountId)) setToAccountId('');
  }, [data.accounts, accountId, toAccountId]);

  const others = data.accounts.filter((a) => a.id !== accountId);
  const toId = others.some((a) => a.id === toAccountId) ? toAccountId : others[0]?.id || '';

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const r = await act('addTx', { type, accountId, toAccountId: toId, amount, category, description, datetime });
    setSaving(false);
    if (r.error) return setMsg({ ok: false, text: r.error });

    const { rows } = buildLedger(r.data);
    const row = rows.find((x) => x.id === r.id);
    const name = (id) => r.data.accounts.find((a) => a.id === id)?.name;
    const text =
      row.type === 'transfer'
        ? `Moved ${inr(row.amount)}. ${name(row.accountId)} is now ${inr(row.balance)}, ${name(row.toAccountId)} is now ${inr(row.toBalance)}.`
        : `${row.type === 'credit' ? 'Credited' : 'Recorded'} ${inr(row.amount)}. ${name(row.accountId)} balance is now ${inr(row.balance)}.`;
    setMsg({ ok: true, text });
    setAmount('');
    setDescription('');
    setCategory('');
    setDatetime(nowLocal());
  }

  const cats = type === 'credit' ? CREDIT_CATS : DEBIT_CATS;
  const tabs = [['debit', 'Expense'], ['credit', 'Add money'], ['transfer', 'Transfer']];

  return (
    <form className="panel" onSubmit={submit}>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={type === k} className={'tab ' + k} onClick={() => { setType(k); setMsg(null); }}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid">
        <div className="field">
          <label htmlFor="acc">{type === 'transfer' ? 'From account' : type === 'credit' ? 'Add to account' : 'Paid from'}</label>
          <select id="acc" className="in" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {type === 'transfer' && (
          <div className="field">
            <label htmlFor="to">To account</label>
            <select id="to" className="in" value={toId} onChange={(e) => setToAccountId(e.target.value)} disabled={!others.length}>
              {others.length === 0 && <option value="">Add a second account first</option>}
              {others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="amt">Amount (₹)</label>
          <input id="amt" className="in num" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>

        {type !== 'transfer' && (
          <div className="field">
            <label htmlFor="cat">Category</label>
            <input id="cat" className="in" list="cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Pick or type your own" required />
            <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        )}

        <div className="field">
          <label htmlFor="dt">Date and time</label>
          <input id="dt" className="in" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} required />
        </div>

        <div className="field wide">
          <label htmlFor="desc">Description</label>
          <input id="desc" className="in" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'credit' ? 'Where did the money come from?' : type === 'transfer' ? 'Why are you moving it?' : 'What was it for?'} maxLength={200} />
        </div>
      </div>

      <div className="form-foot">
        <button className={'btn primary'} type="submit" disabled={saving || (type === 'transfer' && !others.length)}>
          {saving ? 'Saving…' : type === 'debit' ? 'Save expense' : type === 'credit' ? 'Add money' : 'Transfer'}
        </button>
        {msg && <span className={'msg ' + (msg.ok ? 'ok' : 'err')} role="status">{msg.text}</span>}
      </div>
    </form>
  );
}
