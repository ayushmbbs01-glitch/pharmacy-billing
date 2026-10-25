-- Event-trigger functions are invoked by PostgreSQL, not by app clients.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
