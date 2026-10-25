do $migration$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.pharmdesk_edit_purchase(uuid,uuid,uuid,text,date,jsonb,numeric,numeric,numeric,numeric,numeric,text)'::regprocedure
  );

  if position('if v_paid_amount > 0 then' in v_definition) = 0 then
    raise exception 'Expected purchase payment guard was not found; refusing to modify function';
  end if;

  v_definition := replace(
    v_definition,
    'if v_paid_amount > 0 then',
    'if v_paid_amount > 0 and p_supplier_id <> v_invoice.supplier_id then'
  );

  v_definition := replace(
    v_definition,
    'if v_total < 0 then raise exception ''Purchase total cannot be negative''; end if;',
    'if v_total < 0 then raise exception ''Purchase total cannot be negative''; end if;' || E'\n\n  ' ||
    'if v_paid_amount > v_total then raise exception ''Edited purchase total cannot be lower than payments already allocated to this bill''; end if;'
  );

  v_definition := replace(
    v_definition,
    'payment_status=''unpaid'',',
    'payment_status=case when v_paid_amount > 0 and v_paid_amount >= v_total then ''paid'' when v_paid_amount > 0 then ''partial'' else ''unpaid'' end,'
  );

  if position('payment_status=''unpaid'',' in v_definition) > 0 then
    raise exception 'Could not update purchase payment status calculation; refusing to modify function';
  end if;

  execute v_definition;
end;
$migration$;