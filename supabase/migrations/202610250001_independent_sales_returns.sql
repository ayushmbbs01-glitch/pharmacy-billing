-- Allow a return that is not tied to a particular original invoice.
ALTER TABLE public.sales_returns
  ALTER COLUMN original_sale_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.pharmdesk_process_independent_sales_return(
  p_store_id uuid,
  p_customer_id uuid,
  p_refund_method public.refund_method,
  p_refund_amount numeric,
  p_reason text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_batch_id uuid;
  v_quantity numeric;
  v_amount numeric;
  v_return_to_stock boolean;
  v_item_count integer := 0;
  v_customer_store uuid;
  v_product_store uuid;
  v_batch_store uuid;
  v_batch_product uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT public.pharmdesk_user_can_access_store(p_store_id) THEN
    RAISE EXCEPTION 'You do not have access to this store';
  END IF;
  IF p_refund_amount IS NULL OR p_refund_amount < 0 THEN
    RAISE EXCEPTION 'Refund amount cannot be negative';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A return must contain at least one product';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT c.store_id INTO v_customer_store
    FROM public.customers c
    WHERE c.id = p_customer_id AND c.is_active = true;
    IF NOT FOUND OR v_customer_store <> p_store_id THEN
      RAISE EXCEPTION 'Choose an active customer from this store';
    END IF;
  END IF;
  IF p_refund_method = 'store_credit' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Choose a customer before posting this return to their credit statement';
  END IF;

  INSERT INTO public.sales_returns (
    store_id, original_sale_id, customer_id, refund_method, refund_amount, reason, processed_by
  ) VALUES (
    p_store_id, NULL, p_customer_id, p_refund_method, p_refund_amount, p_reason, auth.uid()
  ) RETURNING id INTO v_return_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_count := v_item_count + 1;
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_batch_id := NULLIF(v_item->>'batch_id', '')::uuid;
    v_quantity := COALESCE(NULLIF(v_item->>'quantity_units', '')::numeric, 0);
    v_amount := COALESCE(NULLIF(v_item->>'amount', '')::numeric, 0);
    v_return_to_stock := COALESCE((v_item->>'return_to_stock')::boolean, false);

    IF v_product_id IS NULL OR v_batch_id IS NULL THEN
      RAISE EXCEPTION 'Every returned product must have a batch selected';
    END IF;
    IF v_quantity <= 0 OR v_amount < 0 THEN
      RAISE EXCEPTION 'Return quantities must be positive and amounts cannot be negative';
    END IF;

    SELECT sp.store_id INTO v_product_store
    FROM public.store_products sp
    WHERE sp.store_id = p_store_id AND sp.product_id = v_product_id AND sp.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The returned product is not active in this store';
    END IF;

    SELECT b.store_id, b.product_id INTO v_batch_store, v_batch_product
    FROM public.batches b
    WHERE b.id = v_batch_id
    FOR UPDATE;
    IF NOT FOUND OR v_batch_store <> p_store_id OR v_batch_product <> v_product_id THEN
      RAISE EXCEPTION 'The selected batch does not belong to this product and store';
    END IF;

    INSERT INTO public.sales_return_items (
      sales_return_id, original_sale_item_id, product_id, batch_id,
      quantity_units, amount, return_to_stock, notes
    ) VALUES (
      v_return_id, NULL, v_product_id, v_batch_id,
      v_quantity, v_amount, v_return_to_stock, NULLIF(v_item->>'notes', '')
    );

    IF v_return_to_stock THEN
      UPDATE public.batches
      SET current_stock_units = current_stock_units + v_quantity,
          updated_at = now()
      WHERE id = v_batch_id AND store_id = p_store_id;

      INSERT INTO public.stock_movements (
        store_id, product_id, batch_id, movement_type, quantity_units,
        reference_id, reference_number, notes, performed_by
      ) VALUES (
        p_store_id, v_product_id, v_batch_id, 'sale_return', v_quantity,
        v_return_id, 'RETURN-' || upper(substr(v_return_id::text, 1, 8)),
        'Independent sales return; stock restored after operator condition check',
        auth.uid()
      );
    END IF;
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'A return must contain at least one product';
  END IF;

  IF p_refund_method = 'store_credit' THEN
    INSERT INTO public.customer_credit_transactions (
      store_id, customer_id, sale_id, transaction_type, amount, notes, performed_by
    ) VALUES (
      p_store_id, p_customer_id, NULL, 'credit_refund', p_refund_amount,
      'Sales return ' || upper(substr(v_return_id::text, 1, 8)) ||
        CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN ': ' || p_reason ELSE '' END,
      auth.uid()
    );
  END IF;

  INSERT INTO public.audit_logs (
    store_id, user_id, action, entity_type, entity_id, new_values, metadata
  ) VALUES (
    p_store_id, auth.uid(), 'sales_return_created', 'sales_return', v_return_id,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'refund_method', p_refund_method,
      'refund_amount', p_refund_amount,
      'item_count', v_item_count
    ),
    jsonb_build_object('reason', p_reason, 'independent_return', true)
  );

  RETURN v_return_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pharmdesk_process_independent_sales_return(uuid, uuid, public.refund_method, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmdesk_process_independent_sales_return(uuid, uuid, public.refund_method, numeric, text, jsonb) TO authenticated;
