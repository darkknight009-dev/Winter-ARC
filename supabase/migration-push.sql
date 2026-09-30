-- ============================================================
-- Winter Arc OS — Migration: web-push notifications
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- Adds:
--   1. push_subscriptions — one row per browser/device (VAPID keys)
--   2. push_log           — dedupe ledger: one push per kind per user per day
-- Both are owner-only via RLS; the cron route uses the service role
-- key (bypasses RLS) to read subscriptions and write the log.
-- ============================================================

-- 1. Push subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- 2. Dedupe ledger (user, arc_year, arc_day, kind) is the natural key
create table if not exists public.push_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  arc_year int not null,
  arc_day int not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, arc_year, arc_day, kind)
);

-- 3. RLS — owner-only. The cron runs with the service role key, which
--    bypasses RLS, so no service policy is needed.
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_write_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
drop policy if exists "push_log_select_own" on public.push_log;
drop policy if exists "push_log_insert_own" on public.push_log;
drop policy if exists "push_log_delete_own" on public.push_log;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_write_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

create policy "push_log_select_own" on public.push_log
  for select using (auth.uid() = user_id);
create policy "push_log_insert_own" on public.push_log
  for insert with check (auth.uid() = user_id);
create policy "push_log_delete_own" on public.push_log
  for delete using (auth.uid() = user_id);
