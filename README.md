# ❄️ Winter Arc OS

The discipline operating system for the **Winter Arc** — October 1 → February 28, 151 days.

People don't fail transformations because they're lazy. They fail because there's no structure,
no proof, and nothing waiting for them at the finish line. Winter Arc OS fixes all three:

- **Identity first** — you pick who you are on Feb 28 before you pick habits
- **3 non-negotiables** — checked in daily, 60 seconds
- **Day-1 snapshot** — photo, weight, and a letter to your future self, sealed away
- **XP + levels + streaks with 3 freezes** — motivation that survives a bad week
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
     integrity validators, report function)
   - For an existing install, run [`supabase/migration-security.sql`](supabase/migration-security.sql)
     instead — it upgrades in place: adds the `locked_at` column and seals past days,
     check-ins become editable only until your local midnight, journals/photos become
     owner-only, and photos move to signed URLs. **Re-run it after pulling new logic
     changes; it is idempotent.**
   - Project Settings → API → copy the **Project URL**, **anon key**, **service_role key**
2. **Google OAuth** (Authentication → Sign In / Up → Google):
   - Easiest: enable the **Google provider via Supabase** (Supabase handles the client secret)
   - Or use your own Google Cloud OAuth client: add `https://<project-ref>.supabase.co/auth/v1/callback`
     as an Authorized redirect URI, then paste the Client ID + Secret into Supabase
   - For local dev add `http://localhost:3000/auth/callback` and your deployed
     `https://your-domain.com/auth/callback` to the authorized redirect lists
3. **Env**: copy `.env.example` → `.env.local` and paste the three Supabase values
4. **Run**:
   ```bash
   npm install
   npm run dev
   ```
5. Open http://localhost:3000 → **Continue with Google** → onboarding starts your arc

## How a user experiences it

1. **Sign in with Google** → onboarding: identity, promise, 3 habits, Day-1 snapshot
2. **Daily** → open the app, tick what you actually did, mood, one journal line, record the
   day. You can edit it any time before your local midnight; after that it is sealed.
   A partial day still counts for the streak, but only a fully-complete day earns XP.
3. **Weekly** → Progress page shows the heatmap, streaks, perfect days, this week's log
4. **Feb 28** → Report page: shareable card, Day-1 letter reveal, before/after, seal the arc

## Roadmap ideas

- Cohort chapters + leaderboards (everyone starts Oct 1 together)
- AI coach that reads check-ins and adjusts the plan
- Push notifications for the nightly check-in reminder
