# ❄️ Winter Arc OS

The discipline operating system for the **Winter Arc** — October 1 → February 28, 151 days.

People don't fail transformations because they're lazy. They fail because there's no structure,
no proof, and nothing waiting for them at the finish line. Winter Arc OS fixes all three:

- **Identity first** — you pick who you are on Feb 28 before you pick habits
- **3 non-negotiables** — checked in daily, 60 seconds
- **Day-1 snapshot** — photo, weight, and a letter to your future self, sealed away
- **XP + levels + streaks with 3 freezes** — motivation that survives a bad week
- **Brutal push notifications** — four escalating roasts a day (18:00 → 23:00, your timezone)
  until the day is recorded. No emojis. No mercy. Milestone streaks get their own verdict.
- **151-day heatmap** — your entire arc visible on one screen
- **Transformation Report** — a Spotify-Wrapped-style card of everything you did, plus the
  Day-1 letter reveal and before/after photo. The moment that makes it all feel real.

## Stack

- **Next.js 16** (App Router, RSC, `proxy.ts` for auth guard)
- **Supabase** — Postgres, auth, storage (progress photos), RLS
- **Tailwind CSS v4**, PWA installable (manifest + service worker)
- Zero-dependency icon generator (`scripts/gen-icons.mjs`)

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com), then:
   - SQL Editor → run the contents of [`supabase/schema.sql`](supabase/schema.sql)
     (tables, RLS, signup trigger, private storage bucket, immutability triggers,
     integrity validators, report function, push tables)
   - For an existing install, run [`supabase/migration-security.sql`](supabase/migration-security.sql)
     and [`supabase/migration-push.sql`](supabase/migration-push.sql) instead — they upgrade
     in place: recorded days become immutable, journals/photos become owner-only,
     photos move to signed URLs, and push subscription tables are added
   - Project Settings → API → copy the **Project URL**, **anon key**, **service_role key**
2. **Google OAuth** (Authentication → Sign In / Up → Google):
   - Easiest: enable the **Google provider via Supabase** (Supabase handles the client secret)
   - Or use your own Google Cloud OAuth client: add `https://<project-ref>.supabase.co/auth/v1/callback`
     as an Authorized redirect URI, then paste the Client ID + Secret into Supabase
   - For local dev add `http://localhost:3000/auth/callback` and your deployed
     `https://your-domain.com/auth/callback` to the authorized redirect lists
3. **Env**: copy `.env.example` → `.env.local` and fill in the Supabase values, then:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Paste the public key into `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key into
   `VAPID_PRIVATE_KEY`. Set `CRON_SECRET` to any random string.
4. **Push cron** (the nag engine): point a scheduler at
   `GET /api/cron/notify` with header `Authorization: Bearer <CRON_SECRET>`, every
   15 minutes. Options:
   - **Vercel Cron** (if deployed there): add to `vercel.json`:
     ```json
     { "crons": [{ "path": "/api/cron/notify", "schedule": "*/15 * * * *" }] }
     ```
     (Vercel sends the same header automatically when `CRON_SECRET` is set.)
   - **[cron-job.org](https://cron-job.org)** (free): create a job hitting the URL every
     15 minutes with the Authorization header set.
5. **Run**:
   ```bash
   npm install
   npm run dev
   ```
6. Open http://localhost:3000 → **Continue with Google** → onboarding starts your arc
   → Settings → **Enable streak notifications**

### How the notification ladder works

| Local time | Push | Tone by streak |
|---|---|---|
| 18:00 | headsup | < 7 days: soft · 7–29: hard · 30+: nuclear |
| 20:00 | nudge | escalates with streak size |
| 21:30 | lastcall | the day closes at midnight |
| 23:00 | final | last warning |

Sealed days stay silent. Milestones (7/30/75/151) fire a celebration the moment the
streak crosses the line. Every push is plain text — the voice of a coach who has
seen too many quitting days.

## How a user experiences it

1. **Sign in with Google** → onboarding: identity, promise, 3 habits, Day-1 snapshot
2. **Daily** → open the app, toggle habits, mood, one journal line, lock the day
3. **Weekly** → Progress page shows the heatmap, streaks, perfect days, this week's log
4. **Feb 28** → Report page: shareable card, Day-1 letter reveal, before/after, seal the arc

## Roadmap ideas

- Cohort chapters + leaderboards (everyone starts Oct 1 together)
- AI coach that reads check-ins and adjusts the plan
- Push notifications for the nightly check-in reminder
