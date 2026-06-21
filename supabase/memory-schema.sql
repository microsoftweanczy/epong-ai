-- ───────────────────────────────────────────────────────────
-- Epong AI — Additional schema: user_memory table
-- Run this in the Supabase SQL Editor (after the base schema)
-- ───────────────────────────────────────────────────────────

-- User memory — facts/preferences/goals the AI remembers about the user
create table if not exists public.user_memory (
  id          uuid primary key,
  content     text not null,
  category    text not null default 'fakta' check (category in ('fakta','preferensi','tujuan','konteks')),
  created_at  timestamptz not null default now()
);

create index if not exists user_memory_created_idx
  on public.user_memory (created_at desc);

-- RLS — permissive for anon (personal single-user app).
-- Add auth-based policies for multi-user.
alter table public.user_memory enable row level security;

create policy "anon all user_memory" on public.user_memory
  for all using (true) with check (true);

-- Realtime (optional)
alter publication supabase_realtime add table public.user_memory;
