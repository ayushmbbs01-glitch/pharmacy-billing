create or replace function public.pharmdesk_mark_supplier_invoices_paid(
  p_store_id uuid,
  p_invoice_ids uuid[],
  p_payment_date date default current_date,
  p_payment_method text default null,
  p_notes text default null
)
returns table(payment_id uuid, purchase_invoice_id uuid, amount numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_supplier_id uuid;
  v_method public.supplier_payment_method;
  v_payment_id uuid;
  v_allocations jsonb;
  v_group_amount numeric;
  v_invoice record;
  v_locked_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.pharmdesk_user_can_access_store(p_store_id) then
    raise exception 'You do not have access to this store';
  end if;

  if p_invoice_ids is null or cardinality(p_invoice_ids) = 0 then
    raise exception 'Select at least one supplier invoice';
  end if;

  v_method := case lower(trim(coalesce(p_payment_method, 'cash')))
    when 'cash' then 'cash'::public.supplier_payment_method
    when 'upi' then 'upi'::public.supplier_payment_method
    when 'card' then 'card'::public.supplier_payment_method
    when 'bank transfer' then 'bank_transfer'::public.supplier_payment_method
    when 'bank_transfer' then 'bank_transfer'::public.supplier_payment_method
    when 'cheque' then 'cheque'::public.supplier_payment_method
    when 'other' then 'other'::public.supplier_payment_method
    else null
  end;

  if v_method is null then
    raise exception 'Unsupported supplier payment method';
  end if;

  -- Compatibility wrapper for older clients. Route all writes through the
  -- reconciled payment ledger and lock all selected invoices in stable order.
  for v_locked_id in
    select pi.id
    from public.purchase_invoices pi
    where pi.store_id = p_store_id
      and pi.id = any(p_invoice_ids)
    order by pi.id
    for update
  loop
    v_count := v_count + 1;
  end loop;

  if v_count <> (select count(distinct ids.invoice_id) from unnest(p_invoice_ids) as ids(invoice_id)) then
    raise exception 'One or more selected supplier invoices were not found in this store';
  end if;

  if exists (
    select 1
    from public.purchase_invoices pi
    where pi.store_id = p_store_id
      and pi.id = any(p_invoice_ids)
      and pi.payment_status not in ('unpaid', 'pending', 'partial', 'due')
  ) then
    raise exception 'One or more selected supplier invoices are no longer outstanding';
  end if;

  for v_supplier_id in
    select distinct pi.supplier_id
    from public.purchase_invoices pi
    where pi.store_id = p_store_id
      and pi.id = any(p_invoice_ids)
    order by pi.supplier_id
  loop
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'purchase_invoice_id', due_rows.id,
          'allocated_amount', due_rows.due_amount
        ) order by due_rows.id
      ), '[]'::jsonb),
      coalesce(sum(due_rows.due_amount), 0)
    into v_allocations, v_group_amount
    from (
      select
        pi.id,
        greatest(
          pi.total_amount - coalesce((
            select sum(a.allocated_amount)
            from public.supplier_payment_allocations a
            where a.purchase_invoice_id = pi.id
          ), 0),
          0
        ) as due_amount
      from public.purchase_invoices pi
      where pi.store_id = p_store_id
        and pi.supplier_id = v_supplier_id
        and pi.id = any(p_invoice_ids)
        and pi.payment_status in ('unpaid', 'pending', 'partial', 'due')
    ) due_rows
    where due_rows.due_amount > 0;

    if v_group_amount <= 0 or jsonb_array_length(v_allocations) = 0 then
      raise exception 'Selected supplier bills have no outstanding balance';
    end if;

    v_payment_id := public.pharmdesk_record_supplier_payment(
      p_store_id,
      v_supplier_id,
      v_group_amount,
      v_method,
      coalesce(p_payment_date, current_date),
      null,
      p_notes,
      v_allocations
    );

    for v_invoice in
      select
        (x.value->>'purchase_invoice_id')::uuid as invoice_id,
        (x.value->>'allocated_amount')::numeric as allocated_amount
      from jsonb_array_elements(v_allocations) as x(value)
    loop
      payment_id := v_payment_id;
      purchase_invoice_id := v_invoice.invoice_id;
      amount := v_invoice.allocated_amount;
      return next;
    end loop;
  end loop;
end;
$function$;
