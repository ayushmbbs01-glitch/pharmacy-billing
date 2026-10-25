do $migration$
declare
  v_definition text;
  v_needle text := E'    v_old_customer_id := v_sale.customer_id;\n    v_old_amount_due := greatest(coalesce(v_sale.amount_due, 0), 0);\n';
  v_guard text := E'\n    -- Preserve return records and their stock/refund history.\n    -- Correct returned bills through the sales-return workflow instead.\n    IF EXISTS (\n        SELECT 1\n        FROM public.sales_returns sr\n        WHERE sr.original_sale_id = p_sale_id\n    ) THEN\n        RAISE EXCEPTION ''This sale has recorded returns and cannot be edited. Use the sales return workflow to correct it.'';\n    END IF;\n';
  v_old_comment text := E'    -- Prevent a historical edit from restoring units that may already have been sold or removed later.\n    -- This deliberately errs on the safe side: later outbound movement from any original batch blocks the edit.';
  v_new_comment text := E'    -- Prevent a historical edit from altering stock after any later transaction changed an original batch.\n    -- Later purchases, returns, sales, or adjustments may change shared batch stock or metadata.';
  v_old_message text := 'Cannot safely edit this older sale because its original batch has later stock-out movements. Use a sales return or stock adjustment instead.';
  v_new_message text := 'Cannot safely edit this older sale because its original batch has later stock movements. Use a sales return or stock adjustment instead.';
begin
  v_definition := pg_get_functiondef(
    'public.pharmdesk_edit_sale(uuid,uuid,uuid,timestamp with time zone,numeric,text,jsonb,jsonb)'::regprocedure
  );

  if position('This sale has recorded returns and cannot be edited' in v_definition) = 0 then
    if position(v_needle in v_definition) = 0 then
      raise exception 'Expected sale edit insertion point was not found; refusing to modify function';
    end if;
    v_definition := replace(v_definition, v_needle, v_needle || v_guard);
  end if;

  if position(v_old_comment in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_comment, v_new_comment);
  elsif position(v_new_comment in v_definition) = 0 then
    raise exception 'Expected sale stock-safety comment was not found; refusing to modify function';
  end if;

  if position('          AND sm.quantity_units < 0' in v_definition) > 0 then
    v_definition := replace(v_definition, E'          AND sm.quantity_units < 0\n', '');
  elsif position('Cannot safely edit this older sale because its original batch has later stock movements' in v_definition) = 0 then
    raise exception 'Expected stock movement predicate was not found; refusing to modify function';
  end if;

  if position(v_old_message in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_message, v_new_message);
  elsif position(v_new_message in v_definition) = 0 then
    raise exception 'Expected sale stock-safety error message was not found; refusing to modify function';
  end if;

  execute v_definition;
end;
$migration$;
