do $migration$
declare
  v_definition text;
  v_needle text := E'  /* Reverse the stock created by the original invoice. */\n  for v_old in\n';
  v_guard text := E'  -- Editing a historical purchase can corrupt shared batch stock or metadata.\n  -- Block it when any original batch is referenced by another purchase, a sale, or later stock movement.\n  if exists (\n    select 1\n    from public.purchase_items pi\n    where pi.purchase_invoice_id = p_purchase_invoice_id\n      and pi.batch_id is not null\n      and (\n        exists (\n          select 1 from public.purchase_items other_pi\n          where other_pi.batch_id = pi.batch_id\n            and other_pi.purchase_invoice_id <> p_purchase_invoice_id\n        )\n        or exists (\n          select 1 from public.sale_items si\n          where si.batch_id = pi.batch_id\n        )\n        or exists (\n          select 1 from public.stock_movements sm\n          where sm.batch_id = pi.batch_id\n            and sm.store_id = p_store_id\n            and sm.reference_id is distinct from p_purchase_invoice_id\n            and sm.created_at > v_invoice.created_at\n        )\n      )\n  ) then\n    raise exception ''Cannot safely edit this purchase bill because one or more original batches are shared with another bill or have subsequent stock activity. Correct the stock through the stock reconciliation workflow instead.'';\n  end if;\n\n';
begin
  v_definition := pg_get_functiondef(
    'public.pharmdesk_edit_purchase(uuid,uuid,uuid,text,date,jsonb,numeric,numeric,numeric,numeric,numeric,text)'::regprocedure
  );

  if position(v_needle in v_definition) = 0 then
    raise exception 'Expected original purchase stock-reversal block was not found; refusing to modify function';
  end if;

  if position('Cannot safely edit this purchase bill because one or more original batches are shared with another bill or have subsequent stock activity' in v_definition) > 0 then
    raise exception 'Purchase edit stock-safety guard already exists; refusing duplicate migration';
  end if;

  v_definition := replace(v_definition, v_needle, v_guard || v_needle);
  execute v_definition;
end;
$migration$;