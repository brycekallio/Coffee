# Coffee

A relationship manager for people job searching. It flags contacts you haven't
talked to in 30 days and hands you a draft to send.

**[coffee-35f.pages.dev](https://coffee-35f.pages.dev)** · open signup

Generic CRMs are built for sales pipelines, and a spreadsheet won't tell you a
contact has gone quiet. Coffee tracks the people in your network, the
applications you've sent, and the follow-ups you meant to do.

## What it does

- **Contacts** — company, title, meeting history, notes
- **Stale alerts** — nobody logged in 30+ days gets flagged with a one-click draft
- **Applications** — table and Kanban, Bookmarked → Applied → Interview → Offer
- **Outreach** — compose email/SMS/LinkedIn and schedule it; a local worker
  delivers through your own logged-in sessions, so nothing routes through a
  third party
- **AI** — contact summaries, resume-to-JD matching, meeting-note processing
- **Analytics** — applications by status, contacts over time, outreach by channel
- **Chrome extension** — one click on a LinkedIn profile pre-fills a contact
- **Desktop app** — Electron build with tray icon and native notifications

## Stack

| Layer | |
|---|---|
| Frontend | React 19 · TypeScript · Vite 7 · Tailwind 4 |
| Hosting + auth | Cloudflare Pages, with a Pages Function for sign-in |
| Database | Supabase — Postgres, Storage, Edge Functions, RLS |
| AI | Free open-weight models on OpenRouter; bring your own key for the power tools |
| Desktop | Electron 40 |

## How auth works

Sign-in is Google OAuth, handled by a Pages Function at `/auth/*` — same origin
as the app, so the session cookie is first-party rather than fighting browser
cookie blocking.

The function does the OAuth exchange, then asks Supabase for a real session
(`admin/generate_link` → `auth/v1/verify`, both server-side and back to back, so
the one-time code never reaches the browser). What the client gets is an ordinary
Supabase session. Nothing downstream has to trust a token we minted ourselves,
and `auth.uid()`, RLS and storage policies work exactly as they always did.

The browser holds no password and no long-lived credential — just an HttpOnly
cookie carrying the refresh token, which the function rotates on every use.

Details and the migration are in [`docs/auth-cloudflare.md`](docs/auth-cloudflare.md).

## Running it locally

```bash
npm install
npm run dev
```

`.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Schema is in [`docs/schema.sql`](docs/schema.sql), safe to re-run against a fresh
project. Auth runs on the deployed Pages Function, so local dev signs in against
the deployed origin rather than localhost.

| Command | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck + production build |
| `npm run lint` | ESLint |
| `npm run worker` | local scheduled-outreach worker |
| `npm run electron:dev` | desktop app, dev mode |
| `npm run electron:build` | packaged desktop app |

## Layout

```
src/              React app — App.tsx holds state, pages/ render it
functions/        Cloudflare Pages Functions (auth)
supabase/functions/   Edge Functions (AI, calendar, email tracking)
electron/         desktop shell
extension/        Chrome extension
scripts/worker.ts local scheduled-outreach worker
docs/             schema, auth runbook, security notes
```

State lives in `App.tsx` and flows down through props — no Redux, just Supabase
calls from handlers. Every table is scoped by RLS to `auth.uid() = owner_id`, so
a user only ever sees their own rows.

## Deploying

```bash
npm run build
npx wrangler pages deploy dist --project-name=coffee
```

Secrets are set with `wrangler pages secret put`; the list is in the auth runbook.
