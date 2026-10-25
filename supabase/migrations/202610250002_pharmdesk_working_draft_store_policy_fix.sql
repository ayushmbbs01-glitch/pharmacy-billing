drop policy if exists "Users can delete their own PharmDesk drafts" on public.pharmdesk_working_drafts;
create policy "Users can delete their own PharmDesk drafts" on public.pharmdesk_working_drafts for delete to authenticated using (user_id = (select auth.uid()) and public.pharmdesk_user_can_access_store(store_id));
drop policy if exists "Users can update their own PharmDesk drafts" on public.pharmdesk_working_drafts;
create policy "Users can update their own PharmDesk drafts" on public.pharmdesk_working_drafts for update to authenticated using (user_id = (select auth.uid()) and public.pharmdesk_user_can_access_store(store_id)) with check (user_id = (select auth.uid()) and public.pharmdesk_user_can_access_store(store_id));

-- Enable Supabase Realtime so open forms can receive safe cross-device draft updates.
alter publication supabase_realtime add table public.pharmdesk_working_drafts;
