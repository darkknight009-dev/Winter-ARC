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
