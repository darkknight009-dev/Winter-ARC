-- ============================================================
-- Winter Arc OS — Migration: immutability + security hardening
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- Every policy is dropped before creation (fixes error 42710).
-- ============================================================

-- ------------------------------------------------------------
-- 0. LOCK COLUMN — the instant each check-in's local day ends. Harmless if the
--    table already has it.
-- ------------------------------------------------------------
alter table public.checkins add column if not exists locked_at timestamptz null;

-- ------------------------------------------------------------
-- 1. IMMUTABILITY — a check-in is editable during its own local day and
--    locked permanently once `locked_at` is set (the local day has ended).
--    Partial saves are fine: the same row is upserted, so logging 3 of 5
--    habits mid-day is a normal update, not a blocked one.
-- ------------------------------------------------------------
create or replace function public.enforce_checkin_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.delete_all_data', true), '') <> 'true' then
    raise exception 'Recorded days are immutable: check-ins cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' then
    -- Identity of the day cannot be rewritten
    if new.user_id is distinct from old.user_id
       or new.arc_year is distinct from old.arc_year
       or new.arc_day is distinct from old.arc_day then
      raise exception 'Recorded days are immutable: day identity cannot be changed.';
    end if;
    -- Once the local day has ended (locked_at is in the past), the check-in is
    -- locked permanently. locked_at itself is always the user's local midnight
    -- for that day, so edits stay legal until then.
    if old.locked_at is not null and old.locked_at <= now() then
      raise exception 'Recorded days are immutable: this day has been locked.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists checkins_immutability on public.checkins;
create trigger checkins_immutability
  before update or delete on public.checkins
  for each row execute function public.enforce_checkin_immutability();

-- Backfill: check-ins from days that have already ended are sealed now.
-- Rows for today stay open until the user's local midnight passes.
update public.checkins
set locked_at = (date + 1)::timestamptz
where locked_at is null and date < current_date;

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
-- 3c. TRIGGER FIX — the original handle_new_user only looked for
--     'display_name', a key Google never provides, so OAuth users
--     got 'Arc Runner'. Replace with full-name fallback logic.
-- ------------------------------------------------------------
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
-- 4b. REPORT STATS — matches the app rules: a partial day keeps the streak
--     (at least one habit logged, or a freeze) but pays 0 XP. XP is only
--     awarded for fully-complete days.
-- ------------------------------------------------------------
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
    where c.user_id = p_user and cardinality(c.habits_done) > 0
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
    'total_xp', (select coalesce(sum(case when cardinality(c.habits_done) >= (select n from hab) and (select n from hab) > 0 then cardinality(c.habits_done) * 10 + 10 else 0 end), 0)::int from public.checkins c where c.user_id = p_user)
  )
  from public.profiles p
  where p.id = p_user;
$$;

-- ------------------------------------------------------------
-- 5. USER DATA PURGE — explicitly remove all app data for the
--    signed-in user. The auth identity remains so the user can
--    start a new arc without creating another account.
-- ------------------------------------------------------------
create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Allow this explicit purge to remove sealed check-ins while keeping
  -- ordinary check-in deletes blocked by checkins_immutability.
  perform set_config('app.delete_all_data', 'true', true);

  delete from public.snapshots where user_id = v_user_id;
  delete from public.freezes where user_id = v_user_id;
  delete from public.checkins where user_id = v_user_id;
  delete from public.habits where user_id = v_user_id;
  delete from public.profiles where id = v_user_id;
end;
$$;

revoke all on function public.delete_my_data() from public;
grant execute on function public.delete_my_data() to authenticated;
