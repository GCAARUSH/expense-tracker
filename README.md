# Ledger — multi-user expense tracker (Next.js + Vercel)

Each person creates an account and gets a private ledger: multiple accounts,
expenses, credits, transfers, balance left after every transaction, a category
breakdown, PDF export, and a read-only live link for their family.

## Pages
- `/`            — log in / sign up, then manage your ledger
- `/categories`  — spending (or money added) by category
- `/view?key=…`  — read-only live view for parents; each user has their own link

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Required | Purpose |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | yes | Added by connecting Upstash Redis under Storage |
| `SESSION_SECRET` | recommended | Long random string that signs login cookies (falls back to `ADMIN_PASSWORD`) |
| `SIGNUP_CODE` | recommended | If set, new users must enter it to sign up (invite-only) |

After changing variables, redeploy.

## Upgrading from the single-user version
Deploy, open the site, and **create your account first**. The first account ever
created inherits the data from the old version. Your old parents' link stops
working; use **Copy parents' link** to get your new one.

## Notes
- Passwords are hashed (scrypt). Each user can only see their own data.
- The app owner can still see everything in the Upstash database — tell your users.
- The live view refreshes every 5 seconds, only while the tab is open and visible.
- The PDF uses "Rs." because the built-in PDF font has no ₹ glyph.
