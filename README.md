# Ledger — expense tracker (Next.js + Vercel)

Multiple accounts, expenses, credits, transfers, running balance after every
transaction, PDF export, dark theme, and a read-only live page for your parents.

## Pages
- `/`      — you. Password protected. Add/delete accounts and transactions.
- `/view`  — parents. Read-only, refreshes every 5 seconds. PDF export works here too.

## Deploy (about 5 minutes)
1. Push this folder to a GitHub repo.
2. On vercel.com: **Add New → Project →** import the repo → Deploy.
3. In the project: **Storage → Create → Upstash Redis** (free tier) → connect it
   to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
4. In **Settings → Environment Variables** add:
   - `ADMIN_PASSWORD` = a long password only you know
   - `VIEW_KEY` = a random string (optional but recommended)
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.
6. Open your site, log in, then tap **Copy parents' link** and send it to them.
   The link looks like `https://your-app.vercel.app/view?key=YOUR_VIEW_KEY`.

## Run locally
```
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

## Notes
- Balances are never stored; they're recalculated from the transaction history, so
  deleting or back-dating a transaction keeps everything consistent.
- PDF uses "Rs." instead of ₹ because the built-in PDF font has no rupee glyph.
- Overdrafts are allowed (balance just shows in red) so a missed entry never blocks you.
