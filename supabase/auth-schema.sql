-- ───────────────────────────────────────────────────────────
-- Epong AI — Updated schema with user_id + auth-scoped RLS
-- Run this in the Supabase SQL Editor to enable per-user data
-- isolation with Google/Apple login.
-- ───────────────────────────────────────────────────────────

-- Add user_id column to conversations (links to auth.users)
alter table public.conversations
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists conversations_user_idx
  on public.conversations (user_id, updated_at desc);

-- user_memory already has user_id from memory-schema.sql; ensure it's there
alter table public.user_memory
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists user_memory_user_idx
  on public.user_memory (user_id, created_at desc);

-- ── Update RLS to be auth-scoped (each user only sees their own data) ──

-- Drop old permissive policies
drop policy if exists "anon all conversations" on public.conversations;
drop policy if exists "anon all messages" on public.messages;
drop policy if exists "anon all user_memory" on public.user_memory;

-- Conversations: users can only CRUD their own
create policy "own conversations select" on public.conversations
  for select using (auth.uid() = user_id);
create policy "own conversations insert" on public.conversations
  for insert with check (auth.uid() = user_id);
create policy "own conversations update" on public.conversations
  for update using (auth.uid() = user_id);
create policy "own conversations delete" on public.conversations
  for delete using (auth.uid() = user_id);

-- Messages: accessible if the parent conversation belongs to the user
create policy "own messages select" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "own messages insert" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "own messages delete" on public.messages
  for delete using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- user_memory: users can only CRUD their own
create policy "own memory select" on public.user_memory
  for select using (auth.uid() = user_id);
create policy "own memory insert" on public.user_memory
  for insert with check (auth.uid() = user_id);
create policy "own memory update" on public.user_memory
  for update using (auth.uid() = user_id);
create policy "own memory delete" on public.user_memory
  for delete using (auth.uid() = user_id);
