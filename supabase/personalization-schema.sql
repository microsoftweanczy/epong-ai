-- ───────────────────────────────────────────────────────────
-- Epong AI — user_preferences table (per-user personalization)
-- Run this in the Supabase SQL Editor
-- ───────────────────────────────────────────────────────────

create table if not exists public.user_preferences (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  prefs             jsonb not null default '{}',
  behavior_profile  text not null default '',
  insights          jsonb not null default '[]',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id)
);

create index if not exists user_preferences_user_idx
  on public.user_preferences (user_id);

-- RLS — users can only access their own preferences
alter table public.user_preferences enable row level security;

create policy "own prefs select" on public.user_preferences
  for select using (auth.uid() = user_id);

create policy "own prefs insert" on public.user_preferences
  for insert with check (auth.uid() = user_id);

create policy "own prefs update" on public.user_preferences
  for update using (auth.uid() = user_id);

create policy "own prefs delete" on public.user_preferences
  for delete using (auth.uid() = user_id);
