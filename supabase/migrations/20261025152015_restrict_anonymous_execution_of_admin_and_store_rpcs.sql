-- Restrict administrative RPCs to signed-in callers; each function still
-- performs its own platform-admin authorization check.
revoke all on function public.pharmdesk_admin_activate_store(uuid, date) from public, anon;
revoke all on function public.pharmdesk_admin_approve_store_application(uuid, date) from public, anon;
revoke all on function public.pharmdesk_admin_create_store(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.pharmdesk_admin_list_store_applications() from public, anon;
revoke all on function public.pharmdesk_admin_list_stores() from public, anon;
revoke all on function public.pharmdesk_admin_reactivate_store(uuid, date) from public, anon;
revoke all on function public.pharmdesk_admin_reject_store_application(uuid, text) from public, anon;
revoke all on function public.pharmdesk_admin_suspend_store(uuid) from public, anon;
revoke all on function public.pharmdesk_is_platform_admin() from public, anon;

grant execute on function public.pharmdesk_admin_activate_store(uuid, date) to authenticated, service_role;
grant execute on function public.pharmdesk_admin_approve_store_application(uuid, date) to authenticated, service_role;
grant execute on function public.pharmdesk_admin_create_store(text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.pharmdesk_admin_list_store_applications() to authenticated, service_role;
grant execute on function public.pharmdesk_admin_list_stores() to authenticated, service_role;
grant execute on function public.pharmdesk_admin_reactivate_store(uuid, date) to authenticated, service_role;
grant execute on function public.pharmdesk_admin_reject_store_application(uuid, text) to authenticated, service_role;
grant execute on function public.pharmdesk_admin_suspend_store(uuid) to authenticated, service_role;
grant execute on function public.pharmdesk_is_platform_admin() to authenticated, service_role;

-- Store-scoped RPCs require a signed-in user; their internal store-access
-- checks remain the authorization boundary.
revoke all on function public.pharmdesk_archive_transaction_status(uuid, text, uuid) from public, anon;
revoke all on function public.pharmdesk_create_purchase_order(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.pharmdesk_get_supplier_purchase_catalogue(uuid, uuid) from public, anon;
revoke all on function public.pharmdesk_process_independent_sales_return(uuid, uuid, public.refund_method, numeric, text, jsonb) from public, anon;
revoke all on function public.pharmdesk_purchase_order_detail(uuid, uuid) from public, anon;
revoke all on function public.pharmdesk_reconcile_stock(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.pharmdesk_search_archive(uuid, text, uuid, uuid, text, integer) from public, anon;

grant execute on function public.pharmdesk_archive_transaction_status(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.pharmdesk_create_purchase_order(uuid, uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.pharmdesk_get_supplier_purchase_catalogue(uuid, uuid) to authenticated, service_role;
grant execute on function public.pharmdesk_process_independent_sales_return(uuid, uuid, public.refund_method, numeric, text, jsonb) to authenticated, service_role;
grant execute on function public.pharmdesk_purchase_order_detail(uuid, uuid) to authenticated, service_role;
grant execute on function public.pharmdesk_reconcile_stock(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.pharmdesk_search_archive(uuid, text, uuid, uuid, text, integer) to authenticated, service_role;
