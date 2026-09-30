-- ============================================================
-- Winter Arc OS — database schema
-- Run this in Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Arc Runner',
  identity text,                -- "who am I on Feb 28?"
  commitment text,              -- the promise / why
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

-- 2. Habits (max 3 enforced in app)
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  icon text not null default '🔥',
  cadence text not null default 'daily',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists habits_user_idx on public.habits(user_id);

-- 3. Daily check-ins (one row per user per arc day)
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  arc_year int not null,                    -- year the arc started (Oct 1 of this year)
  arc_day int not null,                     -- 0-based arc day index
  date date not null,
  habits_done uuid[] not null default '{}', -- habit ids completed
  mood text,
  journal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, arc_year, arc_day)
);
create index if not exists checkins_user_idx on public.checkins(user_id, arc_day);

-- 4. Streak freezes (max 3 per arc, enforced in app)
create table if not exists public.freezes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  arc_year int not null,
  arc_day int not null,
  date date not null,
  created_at timestamptz not null default now(),
  unique(user_id, arc_year, arc_day)
);

-- 5. Day-1 snapshot (weight, photo, baseline metrics, letter to future self)
create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'start' check (kind in ('start', 'end')),
  weight numeric,
  note text,
  photo_url text,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- 5b. Web-push subscriptions (one row per browser/device)
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

-- 5c. One-push-per-user-per-day ledger (prevents duplicate nudges)
create table if not exists public.push_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  arc_year int not null,
  arc_day int not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, arc_year, arc_day, kind)
);

-- 6. Public profiles for everyone
alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.checkins enable row level security;
alter table public.freezes enable row level security;
alter table public.snapshots enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;

create policy "profiles_select_all" on public.profiles
  for select using (true);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "habits_select_all" on public.habits
  for select using (true);
create policy "habits_write_own" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "checkins_select_all" on public.checkins
  for select using (true);
create policy "checkins_write_own" on public.checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "freezes_select_all" on public.freezes
  for select using (true);
create policy "freezes_write_own" on public.freezes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "snapshots_select_all" on public.snapshots
  for select using (true);
create policy "snapshots_write_own" on public.snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Push: owner-only, server (service role) writes on dispatch
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

-- 7. Auto-create profile on signup (works for email + Google OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      'Arc Runner'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8. Report stats for the shareable card (bypasses RLS via security definer)
create or replace function public.report_stats(p_user uuid)
returns json
language sql
stable
security definer set search_path = public
as $$
  with hab as (
    select count(*)::int as n from public.habits h where h.user_id = p_user
  ),
  days as (
    select c.arc_day
    from public.checkins c
    where c.user_id = p_user and cardinality(c.habits_done) >= (select n from hab)
    union
    select f.arc_day from public.freezes f where f.user_id = p_user
  ),
  streaks as (
    select arc_day, arc_day - row_number() over (order by arc_day) as grp from days
  ),
  best as (
    select coalesce(max(cnt), 0)::int as longest from (
      select count(*)::int as cnt from streaks group by grp
    ) t
  )
  select json_build_object(
    'display_name', p.display_name,
    'identity', p.identity,
    'days_fought', (select count(*)::int from public.checkins c where c.user_id = p_user),
    'habit_checks', (select coalesce(sum(cardinality(c.habits_done)), 0)::int from public.checkins c where c.user_id = p_user),
    'perfect_days', (select count(*)::int from public.checkins c where c.user_id = p_user and cardinality(c.habits_done) >= (select n from hab)),
    'longest_streak', (select longest from best),
    'total_xp', (select coalesce(sum(cardinality(c.habits_done) * 10 + (case when cardinality(c.habits_done) >= (select n from hab) then 10 else 0 end)), 0)::int from public.checkins c where c.user_id = p_user)
  )
  from public.profiles p
  where p.id = p_user;
$$;

-- 9. Storage bucket for progress photos
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

create policy "progress_photos_select" on storage.objects
  for select using (bucket_id = 'progress-photos');
create policy "progress_photos_insert" on storage.objects
  for insert with check (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "progress_photos_delete" on storage.objects
  for delete using (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================

-- ============================================================

-- ============================================================
-- IMMUTABILITY + SECURITY HARDENING (idempotent, safe to re-run)
-- ============================================================

-- Winter Arc OS — Migration: immutability + security hardening
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- Every policy is dropped before creation (fixes error 42710).
-- ============================================================

-- ------------------------------------------------------------
-- 1. IMMUTABILITY — a sealed (fully recorded) day can never be
--    un-done: no edits that change its identity, no un-completing
--    a complete day, no deletes.
-- ------------------------------------------------------------
create or replace function public.enforce_checkin_immutability()
returns trigger
language plpgsql
as $$
declare
  old_count int;
  new_count int;
begin
  if tg_op = 'DELETE' then
    raise exception 'Recorded days are immutable: check-ins cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' then
    -- Identity of the day cannot be rewritten
    if new.user_id is distinct from old.user_id
       or new.arc_year is distinct from old.arc_year
       or new.arc_day is distinct from old.arc_day then
      raise exception 'Recorded days are immutable: day identity cannot be changed.';
    end if;

    -- A complete day can never become incomplete
    old_count := cardinality(old.habits_done);
    new_count := cardinality(new.habits_done);
    if new_count < old_count then
      raise exception 'Recorded days are immutable: habits cannot be un-logged (% -> %).', old_count, new_count;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists checkins_immutability on public.checkins;
create trigger checkins_immutability
  before update or delete on public.checkins
  for each row execute function public.enforce_checkin_immutability();

-- ------------------------------------------------------------
-- 2. INTEGRITY — arc_day must match the calendar date it claims.
--    Prevents forged "day 40" entries dated today, and prevents
--    double-logging: one row per (user, arc_year, arc_day) is
--    already enforced by the unique constraint.
-- ------------------------------------------------------------
create or replace function public.validate_checkin_day()
returns trigger
language plpgsql
as $$
declare
  v_start date;
  expected_day int;
begin
  -- Arc start: Oct 1 of arc_year
  v_start := make_date(new.arc_year, 10, 1);
  expected_day := (new.date - v_start);
  if expected_day < 0 or expected_day > 150 then
    raise exception 'Invalid arc day: date % is outside the % arc.', new.date, new.arc_year;
  end if;
  if new.arc_day is distinct from expected_day then
    raise exception 'arc_day % does not match date % (expected %).', new.arc_day, new.date, expected_day;
  end if;
  return new;
end;
$$;

drop trigger if exists checkins_validate_day on public.checkins;
create trigger checkins_validate_day
  before insert or update on public.checkins
  for each row execute function public.validate_checkin_day();

-- Same validation for freezes
drop trigger if exists freezes_validate_day on public.freezes;
create trigger freezes_validate_day
  before insert or update on public.freezes
  for each row execute function public.validate_checkin_day();

-- ------------------------------------------------------------
-- 3. RLS — owner-only on personal data.
--    Drop ALL possibly-existing policies first (idempotent),
--    then create the hardened set.
-- ------------------------------------------------------------
-- profiles
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- habits (name/identity of habits stays public for report stats)
drop policy if exists "habits_select_all" on public.habits;
drop policy if exists "habits_write_own" on public.habits;
drop policy if exists "habits_insert_own" on public.habits;
drop policy if exists "habits_update_own" on public.habits;
drop policy if exists "habits_delete_own" on public.habits;
create policy "habits_select_all" on public.habits
  for select using (true);
create policy "habits_insert_own" on public.habits
  for insert with check (auth.uid() = user_id);
create policy "habits_update_own" on public.habits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habits_delete_own" on public.habits
  for delete using (auth.uid() = user_id);

-- checkins — journals are private
drop policy if exists "checkins_select_all" on public.checkins;
drop policy if exists "checkins_write_own" on public.checkins;
drop policy if exists "checkins_select_own" on public.checkins;
drop policy if exists "checkins_insert_own" on public.checkins;
drop policy if exists "checkins_update_own" on public.checkins;
drop policy if exists "checkins_delete_own" on public.checkins;
create policy "checkins_select_own" on public.checkins
  for select using (auth.uid() = user_id);
create policy "checkins_insert_own" on public.checkins
  for insert with check (auth.uid() = user_id);
create policy "checkins_update_own" on public.checkins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "checkins_delete_own" on public.checkins
  for delete using (auth.uid() = user_id);

-- freezes — private
drop policy if exists "freezes_select_all" on public.freezes;
drop policy if exists "freezes_write_own" on public.freezes;
drop policy if exists "freezes_select_own" on public.freezes;
drop policy if exists "freezes_insert_own" on public.freezes;
drop policy if exists "freezes_update_own" on public.freezes;
drop policy if exists "freezes_delete_own" on public.freezes;
create policy "freezes_select_own" on public.freezes
  for select using (auth.uid() = user_id);
create policy "freezes_insert_own" on public.freezes
  for insert with check (auth.uid() = user_id);
create policy "freezes_update_own" on public.freezes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "freezes_delete_own" on public.freezes
  for delete using (auth.uid() = user_id);

-- snapshots — photos and Day-1 letters are private
drop policy if exists "snapshots_select_all" on public.snapshots;
drop policy if exists "snapshots_write_own" on public.snapshots;
drop policy if exists "snapshots_select_own" on public.snapshots;
drop policy if exists "snapshots_insert_own" on public.snapshots;
drop policy if exists "snapshots_update_own" on public.snapshots;
drop policy if exists "snapshots_delete_own" on public.snapshots;
create policy "snapshots_select_own" on public.snapshots
  for select using (auth.uid() = user_id);
create policy "snapshots_insert_own" on public.snapshots
  for insert with check (auth.uid() = user_id);
create policy "snapshots_update_own" on public.snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "snapshots_delete_own" on public.snapshots
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3b. BACKFILL — fix profiles created before the Google-name
--     trigger existed: pull the real name from auth metadata.
-- ------------------------------------------------------------
update public.profiles p
set display_name = coalesce(
  (select u.raw_user_meta_data ->> 'display_name'
   from auth.users u where u.id = p.id),
  (select u.raw_user_meta_data ->> 'full_name'
   from auth.users u where u.id = p.id),
  (select u.raw_user_meta_data ->> 'name'
   from auth.users u where u.id = p.id),
  p.display_name
)
where p.display_name = 'Arc Runner'
  and exists (
    select 1 from auth.users u
    where u.id = p.id
      and coalesce(
        u.raw_user_meta_data ->> 'display_name',
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name'
      ) is not null
  );

-- ------------------------------------------------------------
-- 4. STORAGE — photos are private now. Signed URLs only.
-- ------------------------------------------------------------
update storage.buckets set public = false where id = 'progress-photos';

drop policy if exists "progress_photos_select" on storage.objects;
drop policy if exists "progress_photos_insert" on storage.objects;
drop policy if exists "progress_photos_delete" on storage.objects;
drop policy if exists "progress_photos_read_own" on storage.objects;
drop policy if exists "progress_photos_write_own" on storage.objects;
drop policy if exists "progress_photos_delete_own" on storage.objects;

create policy "progress_photos_read_own" on storage.objects
  for select
  using (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "progress_photos_write_own" on storage.objects
  for insert
  with check (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "progress_photos_delete_own" on storage.objects
  for delete
  using (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------
-- 5. PUSH NOTIFICATION TABLES — web-push subscriptions + dedupe log
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.push_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  arc_year int not null,
  arc_day int not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, arc_year, arc_day, kind)
);

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
