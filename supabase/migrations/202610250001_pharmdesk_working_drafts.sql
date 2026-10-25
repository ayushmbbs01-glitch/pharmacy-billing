-- PharmDesk shared working drafts: cross-device recovery for unfinished work.
-- Run this migration in Supabase SQL Editor before enabling the client integration.
create table if not exists public.pharmdesk_working_drafts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null check (length(module_key) between 1 and 80),
  draft_key text not null default 'default' check (length(draft_key) between 1 and 160),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (store_id, user_id, module_key, draft_key)
);

create index if not exists pharmdesk_working_drafts_user_store_updated_idx
  on public.pharmdesk_working_drafts (user_id, store_id, updated_at desc);

alter table public.pharmdesk_working_drafts enable row level security;

drop policy if exists "Users can read their own PharmDesk drafts" on public.pharmdesk_working_drafts;
create policy "Users can read their own PharmDesk drafts"
  on public.pharmdesk_working_drafts for select
  to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can insert their own PharmDesk drafts" on public.pharmdesk_working_drafts;
create policy "Users can insert their own PharmDesk drafts"
  on public.pharmdesk_working_drafts for insert
  to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own PharmDesk drafts" on public.pharmdesk_working_drafts;
create policy "Users can update their own PharmDesk drafts"
  on public.pharmdesk_working_drafts for update
  to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own PharmDesk drafts" on public.pharmdesk_working_drafts;
create policy "Users can delete their own PharmDesk drafts"
  on public.pharmdesk_working_drafts for delete
  to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.pharmdesk_working_drafts to authenticated;
