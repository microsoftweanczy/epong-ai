-- ───────────────────────────────────────────────────────────
-- Aria — Personal AI Chatbot · Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)
-- ───────────────────────────────────────────────────────────

-- Conversations (chat threads)
create table if not exists public.conversations (
  id          uuid primary key,
  title       text not null default 'New Chat',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Messages within a conversation
create table if not exists public.messages (
  id              uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index if not exists conversations_updated_idx
  on public.conversations (updated_at desc);

-- ── Row Level Security ──────────────────────────────────────
-- For a personal single-user deployment, the anon key is enough.
-- For multi-user, add Supabase Auth and tighten these policies.

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Permissive policies for the anon role (personal app).
-- Replace with auth-based policies if you add user accounts.
create policy "anon all conversations" on public.conversations
  for all using (true) with check (true);

create policy "anon all messages" on public.messages
  for all using (true) with check (true);

-- ── Realtime (optional: live updates across devices) ────────
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
