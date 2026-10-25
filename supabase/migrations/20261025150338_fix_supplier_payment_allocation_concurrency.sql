create or replace function public.pharmdesk_record_supplier_payment(
  p_store_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_method public.supplier_payment_method,
  p_payment_date date default current_date,
  p_reference_number text default null,
  p_notes text default null,
  p_allocations jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment_id uuid;
  v_alloc jsonb;
  v_invoice_id uuid;
  v_locked_invoice_id uuid;
  v_alloc_amount numeric;
  v_total_alloc numeric := 0;
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

  /*
   * Serialize allocations against both other payments and purchase edits.
   * Lock all referenced invoices in a deterministic order to reduce deadlocks.
   * pharmdesk_edit_purchase also locks the invoice row before reading its
   * allocated payments, so payment allocation and invoice edits coordinate.
   */
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
    amount, reference_number, notes, paid_by
  )
  values (
    p_store_id, p_supplier_id, p_payment_date, p_payment_method,
    p_amount, nullif(trim(p_reference_number), ''),
    nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_payment_id;

  for v_alloc in
    select value from jsonb_array_elements(p_allocations)
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
        select pi.total_amount
        from public.purchase_invoices pi
        where pi.id = v_invoice_id
      ) - coalesce((
        select sum(a.allocated_amount)
        from public.supplier_payment_allocations a
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
        when coalesce((
          select sum(a.allocated_amount)
          from public.supplier_payment_allocations a
          where a.purchase_invoice_id = pi.id
        ), 0) >= pi.total_amount then 'paid'
        when coalesce((
          select sum(a.allocated_amount)
          from public.supplier_payment_allocations a
          where a.purchase_invoice_id = pi.id
        ), 0) > 0 then 'partial'
        else 'unpaid'
      end,
      updated_at = now()
  where pi.id in (
    select (x.value->>'purchase_invoice_id')::uuid
    from jsonb_array_elements(p_allocations) as x(value)
  );

  insert into public.audit_logs(
    store_id, user_id, action, entity_type, entity_id, details
  )
  values (
    p_store_id, auth.uid(), 'record_supplier_payment',
    'supplier_payment', v_payment_id,
    jsonb_build_object(
      'supplier_id', p_supplier_id,
      'amount', p_amount,
      'allocated', v_total_alloc
    )
  );

  return v_payment_id;
end;
$function$;
