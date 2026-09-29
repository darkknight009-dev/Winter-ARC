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

-- 6. Public profiles for everyone
alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.checkins enable row level security;
alter table public.freezes enable row level security;
alter table public.snapshots enable row level security;

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
