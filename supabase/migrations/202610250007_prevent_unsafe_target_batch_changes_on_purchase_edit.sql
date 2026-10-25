CREATE OR REPLACE FUNCTION public.pharmdesk_edit_purchase(p_store_id uuid, p_purchase_invoice_id uuid, p_supplier_id uuid, p_invoice_number text, p_invoice_date date, p_items jsonb, p_discount_amount numeric DEFAULT 0, p_cgst_amount numeric DEFAULT 0, p_sgst_amount numeric DEFAULT 0, p_igst_amount numeric DEFAULT 0, p_other_charges numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invoice record;
  v_item jsonb;
  v_old record;
  v_product_id uuid;
  v_batch_id uuid;
  v_batch_number text;
  v_expiry_date date;
  v_units_per_pack numeric;
  v_paid_packs numeric;
  v_free_packs numeric;
  v_loose_units numeric;
  v_purchase_rate numeric;
  v_mrp numeric;
  v_gst_rate numeric;
  v_supplier_discount numeric;
  v_total_units numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_paid_amount numeric := 0;
begin
  if not public.pharmdesk_user_can_access_store(p_store_id) then
    raise exception 'You do not have access to this store';
  end if;

  select * into v_invoice
  from public.purchase_invoices
  where id = p_purchase_invoice_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Purchase invoice not found';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Purchase must contain at least one item';
  end if;

  if not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and store_id = p_store_id and is_active
  ) then
    raise exception 'Invalid supplier for this store';
  end if;

  if coalesce(trim(p_invoice_number), '') = '' then
    raise exception 'Supplier invoice number is required';
  end if;

  if exists (
    select 1 from public.purchase_invoices
    where store_id = p_store_id
      and id <> p_purchase_invoice_id
      and lower(trim(invoice_number)) = lower(trim(p_invoice_number))
  ) then
    raise exception 'A purchase invoice with this invoice number already exists';
  end if;

  select coalesce(sum(spa.allocated_amount), 0)
  into v_paid_amount
  from public.supplier_payment_allocations spa
  where spa.purchase_invoice_id = p_purchase_invoice_id;

  if v_paid_amount > 0 and p_supplier_id <> v_invoice.supplier_id then
    raise exception 'This purchase bill has supplier payments allocated to it. Remove or reallocate those payments before editing the bill';
  end if;

  if coalesce(p_discount_amount,0) < 0
     or coalesce(p_cgst_amount,0) < 0
     or coalesce(p_sgst_amount,0) < 0
     or coalesce(p_igst_amount,0) < 0
     or coalesce(p_other_charges,0) < 0 then
    raise exception 'Purchase charges and discount cannot be negative';
  end if;

  -- Do not reuse a different existing batch when editing an invoice if that batch has any other stock or bill history.
  -- The batch metadata is shared across transactions; changing it here could alter expiry, pack size, or MRP for other records.
  if exists (
    select 1
    from jsonb_array_elements(p_items) incoming(value)
    join public.batches target
      on target.store_id = p_store_id
     and target.product_id = nullif(incoming.value->>'product_id','')::uuid
     and target.batch_number = trim(coalesce(incoming.value->>'batch_number',''))
    where not exists (
      select 1
      from public.purchase_items original_item
      where original_item.purchase_invoice_id = p_purchase_invoice_id
        and original_item.batch_id = target.id
    )
    and (
      exists (
        select 1 from public.purchase_items other_item
        where other_item.batch_id = target.id
      )
      or exists (
        select 1 from public.sale_items sold_item
        where sold_item.batch_id = target.id
      )
      or exists (
        select 1 from public.stock_movements movement
        where movement.batch_id = target.id
          and movement.store_id = p_store_id
      )
    )
  ) then
    raise exception 'Cannot safely reuse another existing batch while editing this purchase bill. Keep the original batch or correct stock through stock reconciliation.';
  end if;

  -- Editing a historical purchase can corrupt shared batch stock or metadata.
  -- Block it when any original batch is referenced by another purchase, a sale, or later stock movement.
  if exists (
    select 1
    from public.purchase_items pi
    where pi.purchase_invoice_id = p_purchase_invoice_id
      and pi.batch_id is not null
      and (
        exists (
          select 1 from public.purchase_items other_pi
          where other_pi.batch_id = pi.batch_id
            and other_pi.purchase_invoice_id <> p_purchase_invoice_id
        )
        or exists (
          select 1 from public.sale_items si
          where si.batch_id = pi.batch_id
        )
        or exists (
          select 1 from public.stock_movements sm
          where sm.batch_id = pi.batch_id
            and sm.store_id = p_store_id
            and sm.reference_id is distinct from p_purchase_invoice_id
            and sm.created_at > v_invoice.created_at
        )
      )
  ) then
    raise exception 'Cannot safely edit this purchase bill because one or more original batches are shared with another bill or have subsequent stock activity. Correct the stock through the stock reconciliation workflow instead.';
  end if;

  /* Reverse the stock created by the original invoice. */
  for v_old in
    select pi.id,
           pi.product_id,
           pi.batch_id,
           pi.paid_packs,
           pi.free_packs,
           pi.loose_units,
           b.units_per_pack
    from public.purchase_items pi
    left join public.batches b on b.id = pi.batch_id
    where pi.purchase_invoice_id = p_purchase_invoice_id
    for update
  loop
    if v_old.batch_id is null then
      raise exception 'Existing purchase item % has no batch and cannot be edited safely', v_old.id;
    end if;

    v_total_units :=
      (coalesce(v_old.paid_packs,0) + coalesce(v_old.free_packs,0))
      * coalesce(v_old.units_per_pack,1)
      + coalesce(v_old.loose_units,0);

    if v_total_units > 0 then
      update public.batches
      set current_stock_units = current_stock_units - v_total_units,
          is_active = case when current_stock_units - v_total_units > 0 then true else is_active end,
          updated_at = now()
      where id = v_old.batch_id
        and store_id = p_store_id
        and product_id = v_old.product_id
        and current_stock_units >= v_total_units;

      if not found then
        raise exception 'Cannot edit invoice because its original stock has already been consumed or otherwise changed for batch %', v_old.batch_id;
      end if;

      insert into public.stock_movements(
        store_id, product_id, batch_id, movement_type, quantity_units,
        reference_id, reference_number, notes, performed_by
      )
      values(
        p_store_id, v_old.product_id, v_old.batch_id, 'adjustment',
        -v_total_units, p_purchase_invoice_id,
        trim(p_invoice_number),
        'Reverse stock from edited purchase bill',
        auth.uid()
      );
    end if;
  end loop;

  delete from public.purchase_items
  where purchase_invoice_id = p_purchase_invoice_id;

  update public.purchase_invoices
  set supplier_id = p_supplier_id,
      invoice_number = trim(p_invoice_number),
      invoice_date = coalesce(p_invoice_date, invoice_date),
      discount_amount = round(coalesce(p_discount_amount,0),2),
      cgst_amount = round(coalesce(p_cgst_amount,0),2),
      sgst_amount = round(coalesce(p_sgst_amount,0),2),
      igst_amount = round(coalesce(p_igst_amount,0),2),
      other_charges = round(coalesce(p_other_charges,0),2),
      notes = p_notes,
      updated_at = now()
  where id = p_purchase_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_batch_number := trim(coalesce(v_item->>'batch_number',''));
    v_expiry_date := nullif(v_item->>'expiry_date','')::date;
    v_units_per_pack := coalesce(nullif(v_item->>'units_per_pack','')::numeric,1);
    v_paid_packs := coalesce(nullif(v_item->>'paid_packs','')::numeric,0);
    v_free_packs := coalesce(nullif(v_item->>'free_packs','')::numeric,0);
    v_loose_units := coalesce(nullif(v_item->>'loose_units','')::numeric,0);
    v_purchase_rate := coalesce(nullif(v_item->>'purchase_rate_per_pack','')::numeric,0);
    v_mrp := coalesce(nullif(v_item->>'mrp_per_pack','')::numeric,0);
    v_gst_rate := coalesce(nullif(v_item->>'gst_rate','')::numeric,0);
    v_supplier_discount := coalesce(nullif(v_item->>'supplier_discount_percent','')::numeric,0);

    if v_product_id is null then raise exception 'Every purchase item requires a product'; end if;
    if not exists (select 1 from public.products where id=v_product_id and is_active) then
      raise exception 'Invalid or inactive product';
    end if;
    if v_batch_number='' then raise exception 'Batch number is required for every purchase item'; end if;
    if v_expiry_date is null or v_expiry_date <= current_date then raise exception 'Expiry date must be in the future'; end if;
    if v_units_per_pack <= 0 then raise exception 'Units per pack must be greater than zero'; end if;
    if v_paid_packs < 0 or v_free_packs < 0 or v_loose_units < 0 then raise exception 'Purchase quantities cannot be negative'; end if;
    if v_purchase_rate < 0 or v_mrp < 0 then raise exception 'Purchase rate and MRP cannot be negative'; end if;
    if v_gst_rate < 0 or v_gst_rate > 100 then raise exception 'GST rate must be between 0 and 100'; end if;
    if v_supplier_discount < 0 or v_supplier_discount > 100 then raise exception 'Supplier discount must be between 0 and 100 percent'; end if;

    v_total_units := (v_paid_packs + v_free_packs) * v_units_per_pack + v_loose_units;
    if v_total_units <= 0 then raise exception 'Every purchase item must contain stock'; end if;

    select id into v_batch_id
    from public.batches
    where store_id=p_store_id and product_id=v_product_id and batch_number=v_batch_number
    for update;

    if v_batch_id is not null then
      update public.batches
      set expiry_date=v_expiry_date,
          units_per_pack=v_units_per_pack,
          purchase_rate_per_pack=round(v_purchase_rate,2),
          mrp_per_pack=round(v_mrp,2),
          current_stock_units=current_stock_units + v_total_units,
          is_active=true,
          updated_at=now()
      where id=v_batch_id;
    else
      insert into public.batches(
        store_id,product_id,batch_number,expiry_date,units_per_pack,
        purchase_rate_per_pack,mrp_per_pack,current_stock_units,is_active
      )
      values(
        p_store_id,v_product_id,v_batch_number,v_expiry_date,v_units_per_pack,
        round(v_purchase_rate,2),round(v_mrp,2),v_total_units,true
      )
      returning id into v_batch_id;
    end if;

    insert into public.purchase_items(
      purchase_invoice_id,product_id,batch_id,paid_packs,free_packs,loose_units,
      purchase_rate_per_pack,mrp_per_pack,supplier_discount_percent,gst_rate,
      purchase_packaging_level_id,mrp_packaging_level_id
    )
    values(
      p_purchase_invoice_id,v_product_id,v_batch_id,v_paid_packs,v_free_packs,v_loose_units,
      round(v_purchase_rate,2),round(v_mrp,2),round(v_supplier_discount,2),round(v_gst_rate,2),
      nullif(v_item->>'purchase_packaging_level_id','')::uuid,
      nullif(v_item->>'mrp_packaging_level_id','')::uuid
    );

    insert into public.stock_movements(
      store_id,product_id,batch_id,movement_type,quantity_units,
      reference_id,reference_number,notes,performed_by
    )
    values(
      p_store_id,v_product_id,v_batch_id,'purchase',v_total_units,
      p_purchase_invoice_id,trim(p_invoice_number),'Purchase stock after bill edit',auth.uid()
    );

    insert into public.supplier_products(
      supplier_id,product_id,last_purchase_rate,last_purchase_date,is_preferred
    )
    values(p_supplier_id,v_product_id,round(v_purchase_rate,2),coalesce(p_invoice_date,current_date),false)
    on conflict (supplier_id,product_id)
    do update set last_purchase_rate=excluded.last_purchase_rate,
                  last_purchase_date=excluded.last_purchase_date,
                  updated_at=now();

    v_subtotal := v_subtotal + (v_paid_packs * v_purchase_rate);
  end loop;

  v_subtotal := round(v_subtotal,2);
  v_total := round(
    v_subtotal - round(coalesce(p_discount_amount,0),2)
    + round(coalesce(p_cgst_amount,0),2)
    + round(coalesce(p_sgst_amount,0),2)
    + round(coalesce(p_igst_amount,0),2)
    + round(coalesce(p_other_charges,0),2), 2
  );

  if v_total < 0 then raise exception 'Purchase total cannot be negative'; end if;

  if v_paid_amount > v_total then raise exception 'Edited purchase total cannot be lower than payments already allocated to this bill'; end if;

  update public.purchase_invoices
  set subtotal=v_subtotal,
      total_amount=v_total,
      payment_status=case when v_paid_amount > 0 and v_paid_amount >= v_total then 'paid' when v_paid_amount > 0 then 'partial' else 'unpaid' end,
      updated_at=now()
  where id=p_purchase_invoice_id;

  insert into public.audit_logs(
    store_id,user_id,action,entity_type,entity_id,old_values,new_values,metadata
  )
  values(
    p_store_id,auth.uid(),'purchase_edited','purchase_invoice',p_purchase_invoice_id,
    jsonb_build_object('invoice_number',v_invoice.invoice_number,'supplier_id',v_invoice.supplier_id,'total_amount',v_invoice.total_amount),
    jsonb_build_object('invoice_number',trim(p_invoice_number),'supplier_id',p_supplier_id,'total_amount',v_total),
    jsonb_build_object('reason','Completed purchase bill edited')
  );

  return p_purchase_invoice_id;
end;
$function$

