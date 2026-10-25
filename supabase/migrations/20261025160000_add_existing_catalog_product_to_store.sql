create or replace function public.pharmdesk_add_existing_product_to_store(
  p_store_id uuid,
  p_product_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_store_product_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to add a catalog product to a store';
  end if;

  if not exists (
    select 1 from public.store_memberships
    where user_id = auth.uid()
      and store_id = p_store_id
      and is_active = true
  ) then
    raise exception 'You are not authorized to modify products for this store';
  end if;

  if not exists (
    select 1 from public.products
    where id = p_product_id and is_active = true
  ) then
    raise exception 'The selected catalog product does not exist or is inactive';
  end if;

  insert into public.store_products (
    store_id, product_id, default_selling_price,
    default_discount_percent, minimum_stock, reorder_level, is_active
  )
  values (p_store_id, p_product_id, 0, 0, 0, 0, true)
  on conflict (store_id, product_id)
  do update set is_active = true, updated_at = now()
  returning id into v_store_product_id;

  return v_store_product_id;
end;
$function$;

revoke all on function public.pharmdesk_add_existing_product_to_store(uuid, uuid) from public, anon;
grant execute on function public.pharmdesk_add_existing_product_to_store(uuid, uuid) to authenticated, service_role;
