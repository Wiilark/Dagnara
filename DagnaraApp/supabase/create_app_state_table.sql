-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

create table if not exists public.dagnara_app_state (
  email       text primary key,
  state_data  jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.dagnara_app_state enable row level security;

-- Users can only read/write their own row
create policy "Users manage own app state"
  on public.dagnara_app_state
  for all
  using  (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');
