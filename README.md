# Coffee ☕

A personal relationship management (PRM) platform for intentional networking and job-search tracking — built because spreadsheets don't remind you to follow up.

## Why I built this

Job searching and professional networking both come down to the same unglamorous problem: staying in touch with the right people at the right time. Generic CRMs are built for sales pipelines, not relationships, and a spreadsheet doesn't nudge you when a contact's gone quiet for a month. Coffee is a single place to track the people in your network, the applications you've sent, and the follow-ups you actually meant to do — with the AI and automation glue to make that upkeep close to effortless.

## What it does

- **Contact tracking** — every person in your network, with company, title, meeting history, and notes
- **Application tracker** — table and Kanban views (Bookmarked → Applied → Interview → Offer → Rejected)
- **Stale contact alerts** — contacts you haven't logged a meeting with in 30+ days get flagged with a one-click follow-up draft
- **AI contact summaries** — 2–3 sentence summaries of a contact's history, via a Supabase Edge Function
- **Resume-to-JD matching** — paste a job description, get AI keyword suggestions against your stored resume
- **Outreach composer + scheduling** — draft email/SMS/LinkedIn messages and schedule them for later; a local background worker (`scripts/worker.ts`) delivers scheduled sends through your own logged-in sessions and Mac's Messages/Mail apps, so nothing routes through a third-party server
- **Analytics dashboard** — applications by status, contacts added over time, outreach by channel, top companies applied to
- **CSV import** — smart field-inference parser for bulk-importing an existing contact list
- **Chrome extension** — one click on any LinkedIn profile pre-fills a new contact
- **Desktop app** — Electron build with tray icon and native notifications, alongside the web app

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Styling | Tailwind CSS 4 — custom "Bioluminescent Depth" dark theme |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, Row-Level Security) |
| AI | Free open-weight models on OpenRouter by default; bring-your-own key (OpenRouter or Anthropic) unlocks the power tools |
| Desktop | Electron 40 + electron-builder |
| Browser extension | Chrome Manifest V3 |
| Charts | Recharts |
| Hosting | Netlify (web), local install (desktop) |

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│   React SPA (Vite)   │────▶│  Supabase             │
│   web + Electron shell│     │  Postgres + Auth + RLS│
└─────────────────────┘     │  Edge Functions:       │
          ▲                  │  - summarize-contact   │
          │                  │  - score-jd            │
   Chrome extension          │  - process-meeting-notes│
   (LinkedIn → contact)      │  - email-open-tracker  │
                              │  - create-calendar-event│
                              │  - exchange-google-token│
                              └──────────────────────┘
          ▲
          │
  scripts/worker.ts — local polling worker
  for scheduled outreach delivery
```

State lives in `App.tsx` and flows down via props — no Redux/Zustand, just direct Supabase calls from handlers. Every table is scoped with Row-Level Security to `auth.uid() = owner_id`, so a user only ever sees their own data.

## Local Development

```bash
npm install
npm run dev
```

### Required Environment Variables

Create a `.env.local` file:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Database schema lives in [`docs/schema.sql`](docs/schema.sql) (safe to re-run against a fresh Supabase project).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |
| `npm run verify` | Preflight env check + build |
| `npm run worker` | Run the local scheduled-outreach delivery worker |
| `npm run electron:dev` | Run the desktop app in dev mode |
| `npm run electron:build` | Build the packaged desktop app |

## Deploying to Netlify

1. Connect the repo to Netlify (via Git or `netlify-cli`).
2. Set the following environment variables in Netlify's site settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Build settings are configured via `netlify.toml`:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - SPA routing is handled by a catch-all redirect to `/index.html`.

## Project structure

```
src/
├── App.tsx              # App shell — state, handlers, routing
├── components/ui/        # Card, Modal, and other shared UI
├── lib/                  # Supabase client, CSV parsing, utils
└── pages/                 # Contacts, Applications, Outreach, Settings, Analytics...
electron/                 # Desktop app main + preload processes
extension/                 # Chrome extension (LinkedIn → contact import)
supabase/functions/        # Edge Functions (AI summaries, JD scoring, calendar, email tracking)
scripts/worker.ts          # Local scheduled-outreach worker
docs/                      # Database schema + security notes
```
