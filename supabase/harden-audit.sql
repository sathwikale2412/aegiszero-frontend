-- AegisZero — make the audit trail tamper-proof
-- Paste into Supabase -> SQL Editor for the shared project and run. Safe to re-run.
--
-- Two holes in the current setup:
--   1. "own aegis events" is a `for all` policy, so the signed-in operator can UPDATE and
--      DELETE their own dispatch history. Nothing in the app ever asks to do that.
--   2. `created_at` / `logged_at` are `not null default now()`, which only applies when the
--      client leaves the column out. A caller may send any timestamp it likes and Postgres
--      stores it, so a row can be back-dated.
--
-- The app writes neither column and issues no update or delete (checked in src/lib/cloud.js),
-- so closing both changes nothing you can see in the console.

-- 1. Audit events become append-only.
drop policy if exists "own aegis events" on public.aegis_audit_events;
drop policy if exists "own aegis events read" on public.aegis_audit_events;
drop policy if exists "own aegis events insert" on public.aegis_audit_events;

create policy "own aegis events read" on public.aegis_audit_events
  for select using (auth.uid() = user_id);

create policy "own aegis events insert" on public.aegis_audit_events
  for insert with check (auth.uid() = user_id);

-- `aegis_logins` already splits read from insert, so it needs no policy change.

-- 2. Timestamps are set by the database, not by whoever sent the request.
create or replace function public.aegis_force_event_time()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.aegis_force_login_time()
returns trigger
language plpgsql
as $$
begin
  new.logged_at := now();
  return new;
end;
$$;

drop trigger if exists aegis_audit_events_force_time on public.aegis_audit_events;
create trigger aegis_audit_events_force_time
  before insert on public.aegis_audit_events
  for each row execute function public.aegis_force_event_time();

drop trigger if exists aegis_logins_force_time on public.aegis_logins;
create trigger aegis_logins_force_time
  before insert on public.aegis_logins
  for each row execute function public.aegis_force_login_time();

-- Prove it: a policy that still allows UPDATE shows up here, and nothing should.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename like 'aegis%'
order by tablename, cmd;
