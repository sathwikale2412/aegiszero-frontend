-- AegisZero Enterprise — Supabase schema
-- Run once in the Supabase SQL editor, in the same project used by
-- Day to Day Activity and the CADAT Simulator, so one account signs you in everywhere.
--
-- Gives the console real persistence: who signed in, and every governance event
-- that was dispatched to the Workato pipeline.

create extension if not exists "pgcrypto";

-- Sign-in log for this console.
create table if not exists public.aegis_logins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  email text not null default '',
  logged_at timestamptz not null default now()
);

-- Every dispatch (single identity event or bulk CSV batch) with its payload.
create table if not exists public.aegis_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  event_type text not null,
  message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists aegis_logins_user_idx on public.aegis_logins (user_id, logged_at desc);
create index if not exists aegis_audit_events_user_idx on public.aegis_audit_events (user_id, created_at desc);

-- Row Level Security: operators only ever see their own console history.
alter table public.aegis_logins enable row level security;
alter table public.aegis_audit_events enable row level security;

create policy "own aegis logins read" on public.aegis_logins
  for select using (auth.uid() = user_id);

create policy "own aegis logins insert" on public.aegis_logins
  for insert with check (auth.uid() = user_id);

create policy "own aegis events read" on public.aegis_audit_events
  for select using (auth.uid() = user_id);

create policy "own aegis events insert" on public.aegis_audit_events
  for insert with check (auth.uid() = user_id);

-- Append-only, so an operator cannot rewrite or erase their own dispatch history.
-- The timestamps are stamped here rather than left to the `default now()` above: that
-- default only applies when the client omits the column, so a caller could otherwise
-- back-date a row. See harden-audit.sql to apply this to a database that already exists.
create or replace function public.aegis_force_event_time()
returns trigger language plpgsql as $$
begin new.created_at := now(); return new; end;
$$;

create or replace function public.aegis_force_login_time()
returns trigger language plpgsql as $$
begin new.logged_at := now(); return new; end;
$$;

create trigger aegis_audit_events_force_time
  before insert on public.aegis_audit_events
  for each row execute function public.aegis_force_event_time();

create trigger aegis_logins_force_time
  before insert on public.aegis_logins
  for each row execute function public.aegis_force_login_time();
