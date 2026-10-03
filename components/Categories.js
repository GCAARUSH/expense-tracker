'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const COLORS = ['#e9b44c', '#55d6b2', '#8fb4ff', '#ff7f6e', '#c79bff', '#7fd4ff', '#ffb38a', '#a3e07a', '#f28fb8'];
const round2 = (n) => Math.round(n * 100) / 100;
const inr = (n) => '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

function presetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === 'month') return [ymd(new Date(y, m, 1)), ''];
  if (preset === 'last') return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  if (preset === '30') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return [ymd(d), ''];
  }
  return ['', ''];
}

function fmtDate(dt) {
  const [y, m, d] = dt.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function Categories() {
  const [data, setData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [key, setKey] = useState('');

  const [kind, setKind] = useState('debit');
  const [acc, setAcc] = useState('all');
  const [preset, setPreset] = useState('month');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');

  const load = useCallback(async (k) => {
    if (document.visibilityState === 'hidden') return;
    try {
      const q = k ? `?key=${encodeURIComponent(k)}` : '';
      const res = await fetch('/api/data' + q, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'Log in on the main page first, or open this page from the link you were given (it must include the key).'
            : json.error || 'Could not load'
        );
        setOnline(false);
        return;
      }
      setData(json.data);
      setIsAdmin(json.isAdmin);
      setError('');
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('key') || '';
    setKey(k);
    load(k);
    const id = setInterval(() => load(k), 5000);
    return () => clearInterval(id);
  }, [load]);

  const [from, to] = preset === 'custom' ? [cFrom, cTo] : presetRange(preset);

  const groups = useMemo(() => {
    if (!data) return { list: [], total: 0 };
    const map = new Map();
    for (const t of data.transactions) {
      if (t.type !== kind) continue;
      if (acc !== 'all' && t.accountId !== acc) continue;
      const d = t.datetime.slice(0, 10);
      if (from && d < from) continue;
      if (to && d > to) continue;
      const label = (t.category || '').trim() || 'Uncategorised';
      const k = label.toLowerCase();
      if (!map.has(k)) map.set(k, { label, total: 0, items: [] });
      const g = map.get(k);
      g.total = round2(g.total + t.amount);
      g.items.push(t);
    }
    const list = [...map.values()].sort((a, b) => b.total - a.total);
    list.forEach((g) => g.items.sort((a, b) => b.datetime.localeCompare(a.datetime)));
    return { list, total: round2(list.reduce((s, g) => s + g.total, 0)) };
  }, [data, kind, acc, from, to]);

  const backHref = isAdmin ? '/' : '/view' + (key ? `?key=${encodeURIComponent(key)}` : '');

  if (!data) {
    return (
      <div className="wrap">
        {error ? (
          <div className="login">
            <h1>Can&apos;t open this</h1>
            <p className="msg err">{error}</p>
            <a className="btn" href="/">Go to main page</a>
          </div>
        ) : (
          <p className="sub">Loading…</p>
        )}
      </div>
    );
  }

  const accName = Object.fromEntries(data.accounts.map((a) => [a.id, a.name]));
  const presets = [['month', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days'], ['all', 'All time'], ['custom', 'Custom']];

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>Categories</h1>
          <span className="live">
            <span className={'dot' + (online ? '' : ' off')} />
            {online ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
        <div className="actions">
          <a className="btn" href={backHref}>Back to transactions</a>
        </div>
      </header>

      <div className="panel">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={kind === 'debit'} className="tab debit" onClick={() => setKind('debit')}>Spent</button>
          <button type="button" role="tab" aria-selected={kind === 'credit'} className="tab credit" onClick={() => setKind('credit')}>Money added</button>
        </div>
        <div className="filters">
          <div className="field">
            <label htmlFor="cp">Period</label>
            <select id="cp" className="in" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {presets.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {preset === 'custom' && (
            <>
              <div className="field">
                <label htmlFor="cf">From</label>
                <input id="cf" className="in" type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ct">To</label>
                <input id="ct" className="in" type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="ca">Account</label>
            <select id="ca" className="in" value={acc} onChange={(e) => setAcc(e.target.value)}>
              <option value="all">All accounts</option>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="total-label">{kind === 'debit' ? 'Total spent' : 'Total added'}</div>
      <div className={'total num'} style={kind === 'debit' ? { color: 'var(--debit)' } : { color: 'var(--credit)' }}>{inr(groups.total)}</div>

      {groups.list.length === 0 ? (
        <div className="empty">Nothing here for this period. Try a wider period or another account.</div>
      ) : (
        <>
          <div className="stack" role="img" aria-label="Share of each category">
            {groups.list.map((g, i) => (
              <span key={g.label} title={`${g.label}: ${inr(g.total)}`} style={{ width: `${(g.total / groups.total) * 100}%`, background: COLORS[i % COLORS.length] }} />
            ))}
          </div>

          <div className="cats">
            {groups.list.map((g, i) => {
              const pct = (g.total / groups.total) * 100;
              const color = COLORS[i % COLORS.length];
              return (
                <details className="cat" key={g.label}>
                  <summary>
                    <span className="swatch" style={{ background: color }} />
                    <span className="cat-name">{g.label}<span className="sub"> · {g.items.length} {g.items.length === 1 ? 'entry' : 'entries'}</span></span>
                    <span className="cat-amt num">{inr(g.total)}</span>
                    <span className="cat-pct num">{pct.toFixed(1)}%</span>
                    <span className="cat-track"><span style={{ width: `${pct}%`, background: color }} /></span>
                  </summary>
                  <ul className="cat-items">
                    {g.items.map((t) => (
                      <li key={t.id}>
                        <span className="sub num">{fmtDate(t.datetime)}</span>
                        <span>{t.description || <span className="sub">No description</span>}<span className="sub"> · {accName[t.accountId]}</span></span>
                        <span className="num">{inr(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
