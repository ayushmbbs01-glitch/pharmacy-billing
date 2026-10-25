alter table public.supplier_payments
  add column if not exists idempotency_key text;

create unique index if not exists supplier_payments_store_idempotency_key_uidx
  on public.supplier_payments(store_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists public.pharmdesk_record_supplier_payment(
  uuid, uuid, numeric, public.supplier_payment_method, date, text, text, jsonb
);

create function public.pharmdesk_record_supplier_payment(
  p_store_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_method public.supplier_payment_method,
  p_payment_date date default current_date,
  p_reference_number text default null,
  p_notes text default null,
  p_allocations jsonb default '[]'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment_id uuid;
  v_existing public.supplier_payments%rowtype;
  v_alloc jsonb;
  v_invoice_id uuid;
  v_locked_invoice_id uuid;
  v_alloc_amount numeric;
  v_total_alloc numeric := 0;
  v_incoming_count integer;
  v_existing_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.pharmdesk_user_can_access_store(p_store_id) then
    raise exception 'You are not authorised to access this store';
  end if;

  if not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and store_id = p_store_id and is_active
  ) then
    raise exception 'Supplier does not belong to this store';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Payment allocations must be an array';
  end if;

  if jsonb_array_length(p_allocations) = 0 then
    raise exception 'At least one bill allocation is required';
  end if;

  if nullif(trim(p_idempotency_key), '') is not null then
    perform pg_advisory_xact_lock(hashtext(p_store_id::text || ':' || trim(p_idempotency_key)));

    select * into v_existing
    from public.supplier_payments
    where store_id = p_store_id
      and idempotency_key = trim(p_idempotency_key);

    if found then
      if v_existing.supplier_id <> p_supplier_id
         or v_existing.amount <> p_amount
         or v_existing.payment_method <> p_payment_method
         or v_existing.payment_date <> coalesce(p_payment_date, current_date) then
        raise exception 'This payment request key was already used with different payment details';
      end if;

      select count(*) into v_incoming_count
      from jsonb_array_elements(p_allocations);

      select count(*) into v_existing_count
      from public.supplier_payment_allocations
      where supplier_payment_id = v_existing.id;

      if v_incoming_count <> v_existing_count or exists (
        select 1
        from jsonb_array_elements(p_allocations) as incoming(value)
        where not exists (
          select 1
          from public.supplier_payment_allocations existing
          where existing.supplier_payment_id = v_existing.id
            and existing.purchase_invoice_id = nullif(incoming.value->>'purchase_invoice_id','')::uuid
            and existing.allocated_amount = coalesce((incoming.value->>'allocated_amount')::numeric,0)
        )
      ) then
        raise exception 'This payment request key was already used with different bill allocations';
      end if;

      return v_existing.id;
    end if;
  end if;

  for v_locked_invoice_id in
    select pi.id
    from public.purchase_invoices pi
    where pi.store_id = p_store_id
      and pi.supplier_id = p_supplier_id
      and pi.id in (
        select distinct nullif(x.value->>'purchase_invoice_id', '')::uuid
        from jsonb_array_elements(p_allocations) as x(value)
      )
    order by pi.id
    for update
  loop
    null;
  end loop;

  insert into public.supplier_payments(
    store_id, supplier_id, payment_date, payment_method,
    amount, reference_number, notes, paid_by, idempotency_key
  )
  values (
    p_store_id, p_supplier_id, coalesce(p_payment_date, current_date), p_payment_method,
    p_amount, nullif(trim(p_reference_number), ''),
    nullif(trim(p_notes), ''), auth.uid(), nullif(trim(p_idempotency_key), '')
  )
  returning id into v_payment_id;

  for v_alloc in select value from jsonb_array_elements(p_allocations)
  loop
    v_invoice_id := nullif(v_alloc->>'purchase_invoice_id', '')::uuid;
    v_alloc_amount := coalesce((v_alloc->>'allocated_amount')::numeric, 0);

    if v_invoice_id is null or v_alloc_amount <= 0 then
      raise exception 'Invalid supplier payment allocation';
    end if;

    if not exists (
      select 1 from public.purchase_invoices pi
      where pi.id = v_invoice_id
        and pi.store_id = p_store_id
        and pi.supplier_id = p_supplier_id
    ) then
      raise exception 'Selected bill does not belong to this supplier/store';
    end if;

    if v_alloc_amount > greatest(
      (
        select pi.total_amount from public.purchase_invoices pi
        where pi.id = v_invoice_id
      ) - coalesce((
        select sum(a.allocated_amount) from public.supplier_payment_allocations a
        where a.purchase_invoice_id = v_invoice_id
      ), 0),
      0
    ) then
      raise exception 'Payment allocation exceeds bill due amount';
    end if;

    insert into public.supplier_payment_allocations(
      supplier_payment_id, purchase_invoice_id, allocated_amount
    )
    values (v_payment_id, v_invoice_id, v_alloc_amount);

    v_total_alloc := v_total_alloc + v_alloc_amount;
  end loop;

  if v_total_alloc <= 0 then
    raise exception 'At least one bill allocation is required';
  end if;

  if v_total_alloc > p_amount then
    raise exception 'Allocated amount cannot exceed payment amount';
  end if;

  update public.purchase_invoices pi
  set payment_status = case
        when coalesce((select sum(a.allocated_amount) from public.supplier_payment_allocations a where a.purchase_invoice_id = pi.id), 0) >= pi.total_amount then 'paid'
        when coalesce((select sum(a.allocated_amount) from public.supplier_payment_allocations a where a.purchase_invoice_id = pi.id), 0) > 0 then 'partial'
        else 'unpaid'
      end,
      updated_at = now()
  where pi.id in (
    select (x.value->>'purchase_invoice_id')::uuid
    from jsonb_array_elements(p_allocations) as x(value)
  );

  insert into public.audit_logs(store_id, user_id, action, entity_type, entity_id, details)
  values (
    p_store_id, auth.uid(), 'record_supplier_payment', 'supplier_payment', v_payment_id,
    jsonb_build_object('supplier_id', p_supplier_id, 'amount', p_amount, 'allocated', v_total_alloc,
      'idempotency_key_present', nullif(trim(p_idempotency_key), '') is not null)
  );

  return v_payment_id;
end;
$function$;

grant execute on function public.pharmdesk_record_supplier_payment(
  uuid, uuid, numeric, public.supplier_payment_method, date, text, text, jsonb, text
) to authenticated, service_role;
revoke all on function public.pharmdesk_record_supplier_payment(
  uuid, uuid, numeric, public.supplier_payment_method, date, text, text, jsonb, text
) from public, anon;
