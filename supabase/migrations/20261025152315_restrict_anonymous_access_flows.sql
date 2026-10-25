revoke all on function public.approve_store_access_request(uuid) from public, anon;
revoke all on function public.claim_approved_store_access() from public, anon;
revoke all on function public.create_store_access_request(uuid, text, public.app_role) from public, anon;
revoke all on function public.pharmdesk_submit_store_application(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.reject_store_access_request(uuid) from public, anon;

grant execute on function public.approve_store_access_request(uuid) to authenticated, service_role;
grant execute on function public.claim_approved_store_access() to authenticated, service_role;
grant execute on function public.create_store_access_request(uuid, text, public.app_role) to authenticated, service_role;
grant execute on function public.pharmdesk_submit_store_application(text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.reject_store_access_request(uuid) to authenticated, service_role;
