revoke all on function public.pharmdesk_mark_supplier_invoices_paid(uuid, uuid[], date, text, text) from public;
revoke all on function public.pharmdesk_mark_supplier_invoices_paid(uuid, uuid[], date, text, text) from anon;
grant execute on function public.pharmdesk_mark_supplier_invoices_paid(uuid, uuid[], date, text, text) to authenticated;
grant execute on function public.pharmdesk_mark_supplier_invoices_paid(uuid, uuid[], date, text, text) to service_role;
