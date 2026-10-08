# Coffee

A relationship manager for people job searching. It flags contacts you haven't
talked to in 30 days and hands you a draft to send.

**[coffee-app-network.netlify.app](https://coffee-app-network.netlify.app)** · open signup

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
| Auth | Clerk |
| Hosting | Netlify |
| Database | Supabase — Postgres, Storage, Edge Functions, RLS |
| AI | Free open-weight models on OpenRouter; bring your own key for the power tools |
| Desktop | Electron 40 |

## How auth works

Clerk handles sign-in. Supabase is configured to trust Clerk as a third-party
auth provider, so it verifies Clerk's tokens against Clerk's published JWKS — no
key is shared in either direction and nothing mints tokens on our behalf.

The one piece worth knowing: Clerk's `sub` is its own user id, but every row here
is keyed on a Supabase UUID that predates Clerk. `link_clerk_identity()` binds
the two on the email Clerk verified, and `app_user_id()` resolves it inside every
RLS policy. That is what lets existing accounts keep their data rather than
finding an empty app beside it.

Migration: [`docs/migration_clerk_auth.sql`](docs/migration_clerk_auth.sql).

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

Netlify builds from `main`. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
`VITE_CLERK_PUBLISHABLE_KEY` are set in the site's environment — all three are
public by design; RLS is what protects the data.
