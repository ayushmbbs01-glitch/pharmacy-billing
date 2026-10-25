do $migration$
declare
  v_definition text;
  v_old text := '          AND sm.movement_type IN (''sale'', ''adjustment'', ''damaged'', ''expired'')';
begin
  v_definition := pg_get_functiondef(
    'public.pharmdesk_edit_sale(uuid,uuid,uuid,timestamp with time zone,numeric,text,jsonb,jsonb)'::regprocedure
  );

  if position('Cannot safely edit this older sale because its original batch has later stock-out movements' in v_definition) = 0 then
    raise exception 'Expected sale stock-safety guard was not found; refusing to modify function';
  end if;

  if position(v_old in v_definition) = 0 then
    if position('sm.quantity_units < 0' in v_definition) > 0 then
      raise exception 'Sale stock-safety guard already checks outbound quantities; refusing duplicate migration';
    end if;
    raise exception 'Expected movement-type filter was not found; refusing to modify function';
  end if;

  v_definition := replace(v_definition, v_old, '');
  execute v_definition;
end;
$migration$;