-- ============================================================
-- DAGNARA — Full Supabase Setup
-- Run this entire script in Supabase SQL Editor:
--   https://supabase.com/dashboard → SQL Editor → New query
-- ============================================================

-- ── 1. Profiles ───────────────────────────────────────────────────────────────
create table if not exists public.dagnara_profiles (
  email        text primary key,
  profile_data jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.dagnara_profiles enable row level security;

drop policy if exists "Users manage own profile" on public.dagnara_profiles;
create policy "Users manage own profile"
  on public.dagnara_profiles for all
  using  (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

-- ── 2. App State ──────────────────────────────────────────────────────────────
create table if not exists public.dagnara_app_state (
  email      text primary key,
  state_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dagnara_app_state enable row level security;

drop policy if exists "Users manage own app state" on public.dagnara_app_state;
create policy "Users manage own app state"
  on public.dagnara_app_state for all
  using  (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

-- ── 3. Diary Entries ──────────────────────────────────────────────────────────
create table if not exists public.dagnara_diary (
  email      text not null,
  date       text not null,
  entry_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (email, date)
);

alter table public.dagnara_diary enable row level security;

drop policy if exists "Users manage own diary" on public.dagnara_diary;
create policy "Users manage own diary"
  on public.dagnara_diary for all
  using  (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

-- ── Done ──────────────────────────────────────────────────────────────────────
-- All three tables are now created with Row Level Security enabled.
-- Each user can only read and write their own rows.
