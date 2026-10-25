do $migration$
declare
  v_definition text;
  v_needle text := E'    FOR v_old_item IN\n        SELECT\n            si.id,';
  v_guard text := E'    -- Prevent a historical edit from restoring units that may already have been sold or removed later.\n    -- This deliberately errs on the safe side: later outbound movement from any original batch blocks the edit.\n    IF EXISTS (\n        SELECT 1\n        FROM public.sale_items si\n        WHERE si.sale_id = p_sale_id\n          AND si.batch_id IS NULL\n    ) THEN\n        RAISE EXCEPTION ''Cannot safely edit this sale because an original item has no batch recorded'';\n    END IF;\n\n    IF EXISTS (\n        SELECT 1\n        FROM public.sale_items si\n        JOIN public.stock_movements sm\n          ON sm.batch_id = si.batch_id\n         AND sm.store_id = p_store_id\n        WHERE si.sale_id = p_sale_id\n          AND si.batch_id IS NOT NULL\n          AND sm.reference_id IS DISTINCT FROM p_sale_id\n          AND sm.created_at > v_sale.created_at\n          AND sm.quantity_units < 0\n          AND sm.movement_type IN (''sale'', ''adjustment'', ''damaged'', ''expired'')\n    ) THEN\n        RAISE EXCEPTION ''Cannot safely edit this older sale because its original batch has later stock-out movements. Use a sales return or stock adjustment instead.'';\n    END IF;\n\n';
begin
  v_definition := pg_get_functiondef(
    'public.pharmdesk_edit_sale(uuid,uuid,uuid,timestamp with time zone,numeric,text,jsonb,jsonb)'::regprocedure
  );

  if position(v_needle in v_definition) = 0 then
    raise exception 'Expected original sale stock-restoration loop was not found; refusing to modify function';
  end if;

  if position('Cannot safely edit this older sale because its original batch has later stock-out movements' in v_definition) > 0 then
    raise exception 'Sale edit stock-safety guard already exists; refusing duplicate migration';
  end if;

  v_definition := replace(v_definition, v_needle, v_guard || v_needle);
  execute v_definition;
end;
$migration$;