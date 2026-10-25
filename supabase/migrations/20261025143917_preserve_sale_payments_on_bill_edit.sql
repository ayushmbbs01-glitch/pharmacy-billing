-- Preserve recorded payments when editing completed sales.
-- Bill details may be edited, but actual tender history remains immutable.
CREATE OR REPLACE FUNCTION public.pharmdesk_edit_sale(p_store_id uuid, p_sale_id uuid, p_customer_id uuid, p_bill_datetime timestamp with time zone, p_bill_discount_amount numeric, p_notes text, p_items jsonb, p_payments jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

DECLARE
    v_user_id uuid := auth.uid();

    v_sale public.sales%ROWTYPE;

    v_old_customer_id uuid;

    v_old_amount_due numeric := 0;
    v_new_amount_due numeric := 0;

    v_subtotal numeric := 0;
    v_item_discount_total numeric := 0;
    v_taxable_before_bill_discount numeric := 0;

    v_taxable_amount numeric := 0;
    v_cgst_amount numeric := 0;
    v_sgst_amount numeric := 0;
    v_igst_amount numeric := 0;

    v_grand_total numeric := 0;
    v_amount_paid numeric := 0;
    v_amount_due numeric := 0;
    v_round_off numeric := 0;

    v_bill_discount numeric := greatest(coalesce(p_bill_discount_amount, 0), 0);

    v_item jsonb;
    v_payment jsonb;

    v_product_id uuid;
    v_batch_id uuid;
    v_sale_item_id uuid;

    v_unit_type public.sale_unit_type;

    v_quantity_entered numeric;
    v_quantity_units numeric;
    v_units_per_pack numeric;

    v_mrp_per_pack numeric;
    v_selling_price_per_pack numeric;

    v_default_discount_percent numeric;
    v_discount_percent numeric;
    v_discount_amount numeric;

    v_gst_rate numeric;
    v_line_gross numeric;
    v_line_taxable numeric;

    v_item_cgst numeric;
    v_item_sgst numeric;
    v_item_igst numeric;

    v_payment_method public.payment_method;
    v_payment_amount numeric;

    v_old_credit_exists boolean := false;
    v_new_credit numeric := 0;

    v_old_item record;

BEGIN

    /* ============================================================
       1. BASIC AUTHORIZATION
       ============================================================ */

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required';
    END IF;

    IF NOT public.pharmdesk_user_can_access_store(p_store_id) THEN
        RAISE EXCEPTION 'You are not authorised to edit sales for this store';
    END IF;


    /* ============================================================
       2. VALIDATE INPUT
       ============================================================ */

    IF p_sale_id IS NULL THEN
        RAISE EXCEPTION 'Sale ID is required';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one sale item is required';
    END IF;

    IF p_payments IS NULL
       OR jsonb_typeof(p_payments) <> 'array' THEN
        RAISE EXCEPTION 'Payments must be an array';
    END IF;

    IF v_bill_discount < 0 THEN
        RAISE EXCEPTION 'Bill discount cannot be negative';
    END IF;


    /* ============================================================
       3. LOCK THE SALE
       ============================================================ */

    SELECT *
    INTO v_sale
    FROM public.sales
    WHERE id = p_sale_id
      AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found for this store';
    END IF;

    IF v_sale.status <> 'completed' THEN
        RAISE EXCEPTION
            'Only completed sales can be edited. Current status: %',
            v_sale.status;
    END IF;

    v_old_customer_id := v_sale.customer_id;
    v_old_amount_due := greatest(coalesce(v_sale.amount_due, 0), 0);


    /* ============================================================
       4. CUSTOMER VALIDATION
       ============================================================ */

    IF p_customer_id IS NOT NULL THEN

        IF NOT EXISTS (
            SELECT 1
            FROM public.customers c
            WHERE c.id = p_customer_id
              AND c.store_id = p_store_id
              AND c.is_active = true
        ) THEN
            RAISE EXCEPTION 'Selected customer does not belong to this store';
        END IF;

    END IF;


    /* ============================================================
       5. CHECK EXISTING CREDIT HISTORY
       
       We do NOT delete historical credit payments/adjustments.
       They remain part of the customer's ledger.

       The sale's original credit-sale entry will be compensated
       through credit_adjustment entries.
       ============================================================ */

    SELECT EXISTS (
        SELECT 1
        FROM public.customer_credit_transactions cct
        WHERE cct.sale_id = p_sale_id
          AND cct.transaction_type = 'credit_sale'
    )
    INTO v_old_credit_exists;


    /* ============================================================
       6. RESTORE STOCK FROM THE ORIGINAL SALE
       
       Old sale quantity is returned to its original batch.
       A sale_return movement is created to preserve the audit trail.
       ============================================================ */

    -- Prevent a historical edit from restoring units that may already have been sold or removed later.
    -- This deliberately errs on the safe side: later outbound movement from any original batch blocks the edit.
    IF EXISTS (
        SELECT 1
        FROM public.sale_items si
        WHERE si.sale_id = p_sale_id
          AND si.batch_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot safely edit this sale because an original item has no batch recorded';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sale_items si
        JOIN public.stock_movements sm
          ON sm.batch_id = si.batch_id
         AND sm.store_id = p_store_id
        WHERE si.sale_id = p_sale_id
          AND si.batch_id IS NOT NULL
          AND sm.reference_id IS DISTINCT FROM p_sale_id
          AND sm.created_at > v_sale.created_at
          AND sm.quantity_units < 0

    ) THEN
        RAISE EXCEPTION 'Cannot safely edit this older sale because its original batch has later stock-out movements. Use a sales return or stock adjustment instead.';
    END IF;

    FOR v_old_item IN
        SELECT
            si.id,
            si.product_id,
            si.batch_id,
            si.quantity_units
        FROM public.sale_items si
        WHERE si.sale_id = p_sale_id
        FOR UPDATE
    LOOP

        IF v_old_item.batch_id IS NOT NULL THEN

            UPDATE public.batches b
            SET
                current_stock_units =
                    b.current_stock_units + v_old_item.quantity_units,
                updated_at = now()
            WHERE b.id = v_old_item.batch_id
              AND b.store_id = p_store_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Original batch % could not be found',
                    v_old_item.batch_id;
            END IF;

            INSERT INTO public.stock_movements (
                store_id,
                product_id,
                batch_id,
                movement_type,
                quantity_units,
                reference_id,
                reference_number,
                notes,
                performed_by
            )
            VALUES (
                p_store_id,
                v_old_item.product_id,
                v_old_item.batch_id,
                'sale_return',
                v_old_item.quantity_units,
                p_sale_id,
                v_sale.invoice_number,
                'Automatic stock reversal caused by sale edit',
                v_user_id
            );

        END IF;

    END LOOP;


    /* ============================================================
       7. REMOVE CURRENT SALE ITEMS
       ============================================================ */

    DELETE FROM public.sale_items
    WHERE sale_id = p_sale_id;


    /* ============================================================
       8. CALCULATE NEW SALE ITEMS
       ============================================================ */

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP

        v_product_id :=
            NULLIF(v_item->>'product_id', '')::uuid;

        v_batch_id :=
            NULLIF(v_item->>'batch_id', '')::uuid;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Every sale item requires a product';
        END IF;

        v_quantity_entered :=
            coalesce((v_item->>'quantity_entered')::numeric, 0);

        IF v_quantity_entered <= 0 THEN
            RAISE EXCEPTION
                'Sale quantity must be greater than zero';
        END IF;

        v_unit_type :=
            coalesce(
                NULLIF(v_item->>'unit_type', '')::public.sale_unit_type,
                'pack'::public.sale_unit_type
            );

        v_units_per_pack :=
            coalesce(
                NULLIF(v_item->>'units_per_pack', '')::numeric,
                1
            );

        IF v_units_per_pack <= 0 THEN
            RAISE EXCEPTION 'Units per pack must be greater than zero';
        END IF;

        IF v_unit_type = 'pack' THEN
            v_quantity_units :=
                v_quantity_entered * v_units_per_pack;
        ELSE
            v_quantity_units :=
                v_quantity_entered;
        END IF;

        v_mrp_per_pack :=
            coalesce(
                NULLIF(v_item->>'mrp_per_pack', '')::numeric,
                0
            );

        v_selling_price_per_pack :=
            coalesce(
                NULLIF(v_item->>'selling_price_per_pack', '')::numeric,
                0
            );

        v_default_discount_percent :=
            greatest(
                coalesce(
                    NULLIF(v_item->>'default_discount_percent', '')::numeric,
                    0
                ),
                0
            );

        v_discount_percent :=
            greatest(
                coalesce(
                    NULLIF(v_item->>'discount_percent', '')::numeric,
                    v_default_discount_percent
                ),
                0
            );

        IF v_discount_percent > 100 THEN
            RAISE EXCEPTION
                'Item discount cannot exceed 100%%';
        END IF;

        v_gst_rate :=
            greatest(
                coalesce(
                    NULLIF(v_item->>'gst_rate', '')::numeric,
                    0
                ),
                0
            );

        IF v_gst_rate > 100 THEN
            RAISE EXCEPTION
                'GST rate cannot exceed 100%%';
        END IF;


        /* --------------------------------------------------------
           Validate product
           -------------------------------------------------------- */

        IF NOT EXISTS (
            SELECT 1
            FROM public.products p
            WHERE p.id = v_product_id
              AND p.is_active = true
        ) THEN
            RAISE EXCEPTION
                'Product % does not exist or is inactive',
                v_product_id;
        END IF;


        /* --------------------------------------------------------
           Validate batch
           -------------------------------------------------------- */

        IF v_batch_id IS NULL THEN
            RAISE EXCEPTION
                'Every sale item must have a batch';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.batches b
            WHERE b.id = v_batch_id
              AND b.store_id = p_store_id
              AND b.product_id = v_product_id
              AND b.is_active = true
        ) THEN
            RAISE EXCEPTION
                'Selected batch is invalid for this product/store';
        END IF;


        /* --------------------------------------------------------
           Calculate line values
           -------------------------------------------------------- */

        IF v_unit_type = 'pack' THEN

            v_line_gross :=
                v_quantity_entered *
                v_selling_price_per_pack;

        ELSE

            v_line_gross :=
                v_quantity_entered *
                (
                    v_selling_price_per_pack /
                    v_units_per_pack
                );

        END IF;

        v_discount_amount :=
            round(
                v_line_gross *
                v_discount_percent /
                100,
                2
            );

        v_line_taxable :=
            greatest(
                v_line_gross - v_discount_amount,
                0
            );

        v_subtotal :=
            v_subtotal + v_line_gross;

        v_item_discount_total :=
            v_item_discount_total + v_discount_amount;

        v_taxable_before_bill_discount :=
            v_taxable_before_bill_discount +
            v_line_taxable;

    END LOOP;


    /* ============================================================
       9. BILL DISCOUNT
       
       The bill discount is distributed proportionally across the
       taxable value of the individual items.
       ============================================================ */

    IF v_bill_discount >
       v_taxable_before_bill_discount THEN

        v_bill_discount :=
            v_taxable_before_bill_discount;

    END IF;

    v_taxable_amount :=
        greatest(
            v_taxable_before_bill_discount -
            v_bill_discount,
            0
        );


    /* ============================================================
       10. INSERT NEW ITEMS AND APPLY NEW STOCK
       ============================================================ */

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP

        v_product_id :=
            NULLIF(v_item->>'product_id', '')::uuid;

        v_batch_id :=
            NULLIF(v_item->>'batch_id', '')::uuid;

        v_quantity_entered :=
            (v_item->>'quantity_entered')::numeric;

        v_unit_type :=
            coalesce(
                NULLIF(v_item->>'unit_type', '')::public.sale_unit_type,
                'pack'::public.sale_unit_type
            );

        v_units_per_pack :=
            coalesce(
                NULLIF(v_item->>'units_per_pack', '')::numeric,
                1
            );

        IF v_unit_type = 'pack' THEN
            v_quantity_units :=
                v_quantity_entered *
                v_units_per_pack;
        ELSE
            v_quantity_units :=
                v_quantity_entered;
        END IF;

        v_mrp_per_pack :=
            coalesce(
                NULLIF(v_item->>'mrp_per_pack', '')::numeric,
                0
            );

        v_selling_price_per_pack :=
            coalesce(
                NULLIF(v_item->>'selling_price_per_pack', '')::numeric,
                0
            );

        v_default_discount_percent :=
            greatest(
                coalesce(
                    NULLIF(v_item->>'default_discount_percent', '')::numeric,
                    0
                ),
                0
            );

        v_discount_percent :=
            greatest(
                coalesce(
                    NULLIF(v_item->>'discount_percent', '')::numeric,
                    v_default_discount_percent
                ),
                0
            );

        v_gst_rate :=
            greatest(
                coalesce(
                    NULLIF(v_item->>'gst_rate', '')::numeric,
                    0
                ),
                0
            );


        IF v_unit_type = 'pack' THEN

            v_line_gross :=
                v_quantity_entered *
                v_selling_price_per_pack;

        ELSE

            v_line_gross :=
                v_quantity_entered *
                (
                    v_selling_price_per_pack /
                    v_units_per_pack
                );

        END IF;

        v_discount_amount :=
            round(
                v_line_gross *
                v_discount_percent /
                100,
                2
            );

        v_line_taxable :=
            greatest(
                v_line_gross -
                v_discount_amount,
                0
            );


        /* --------------------------------------------------------
           Proportional bill-level discount
           -------------------------------------------------------- */

        DECLARE
            v_bill_discount_share numeric := 0;
            v_final_taxable numeric := 0;
        BEGIN

            IF v_taxable_before_bill_discount > 0 THEN

                v_bill_discount_share :=
                    v_bill_discount *
                    (
                        v_line_taxable /
                        v_taxable_before_bill_discount
                    );

            END IF;

            v_final_taxable :=
                greatest(
                    v_line_taxable -
                    v_bill_discount_share,
                    0
                );


            /* ----------------------------------------------------
               GST
               ---------------------------------------------------- */

            v_item_cgst :=
                round(
                    v_final_taxable *
                    v_gst_rate /
                    200,
                    2
                );

            v_item_sgst :=
                round(
                    v_final_taxable *
                    v_gst_rate /
                    200,
                    2
                );

            v_item_igst := 0;


            INSERT INTO public.sale_items (
                sale_id,
                product_id,
                batch_id,
                unit_type,
                quantity_entered,
                quantity_units,
                units_per_pack,
                mrp_per_pack,
                selling_price_per_pack,
                default_discount_percent,
                discount_percent,
                discount_amount,
                taxable_amount,
                gst_rate,
                cgst_amount,
                sgst_amount,
                igst_amount,
                line_total,
                sale_packaging_level_id,
                mrp_packaging_level_id
            )
            VALUES (
                p_sale_id,
                v_product_id,
                v_batch_id,
                v_unit_type,
                v_quantity_entered,
                v_quantity_units,
                v_units_per_pack,
                v_mrp_per_pack,
                v_selling_price_per_pack,
                v_default_discount_percent,
                v_discount_percent,
                v_discount_amount,
                v_final_taxable,
                v_gst_rate,
                v_item_cgst,
                v_item_sgst,
                v_item_igst,
                v_final_taxable +
                    v_item_cgst +
                    v_item_sgst +
                    v_item_igst,
                NULLIF(
                    v_item->>'sale_packaging_level_id',
                    ''
                )::uuid,
                NULLIF(
                    v_item->>'mrp_packaging_level_id',
                    ''
                )::uuid
            );


            v_cgst_amount :=
                v_cgst_amount +
                v_item_cgst;

            v_sgst_amount :=
                v_sgst_amount +
                v_item_sgst;

            v_igst_amount :=
                v_igst_amount +
                v_item_igst;

        END;


        /* --------------------------------------------------------
           Lock batch again before deducting new stock
           -------------------------------------------------------- */

        PERFORM 1
        FROM public.batches b
        WHERE b.id = v_batch_id
          AND b.store_id = p_store_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Batch % is no longer available',
                v_batch_id;
        END IF;


        /* --------------------------------------------------------
           Stock validation
           -------------------------------------------------------- */

        IF (
            SELECT b.current_stock_units
            FROM public.batches b
            WHERE b.id = v_batch_id
        ) < v_quantity_units THEN

            RAISE EXCEPTION
                'Insufficient stock for batch %. Required: %, available: %',
                v_batch_id,
                v_quantity_units,
                (
                    SELECT b.current_stock_units
                    FROM public.batches b
                    WHERE b.id = v_batch_id
                );

        END IF;


        /* --------------------------------------------------------
           Deduct new stock
           -------------------------------------------------------- */

        UPDATE public.batches
        SET
            current_stock_units =
                current_stock_units -
                v_quantity_units,
            updated_at = now()
        WHERE id = v_batch_id
          AND store_id = p_store_id;


        INSERT INTO public.stock_movements (
            store_id,
            product_id,
            batch_id,
            movement_type,
            quantity_units,
            reference_id,
            reference_number,
            notes,
            performed_by
        )
        VALUES (
            p_store_id,
            v_product_id,
            v_batch_id,
            'sale',
            -v_quantity_units,
            p_sale_id,
            v_sale.invoice_number,
            'Stock movement caused by edited sale',
            v_user_id
        );

    END LOOP;


    /* ============================================================
       11. PRESERVE RECORDED PAYMENTS
       Existing payment rows represent money actually received.
       Do not replace them as part of editing sale details.
       ============================================================ */

    SELECT COALESCE(SUM(sp.amount), 0)
    INTO v_amount_paid
    FROM public.sale_payments sp
    WHERE sp.sale_id = p_sale_id;


    /* ============================================================
       12. FINAL BILL TOTALS
       ============================================================ */

    v_grand_total :=
        v_taxable_amount +
        v_cgst_amount +
        v_sgst_amount +
        v_igst_amount;

    v_grand_total :=
        round(v_grand_total);

    v_round_off :=
        v_grand_total -
        (
            v_taxable_amount +
            v_cgst_amount +
            v_sgst_amount +
            v_igst_amount
        );

    v_amount_due :=
        greatest(
            v_grand_total -
            v_amount_paid,
            0
        );

    v_new_amount_due :=
        v_amount_due;


    /* ============================================================
       13. PAYMENT SANITY CHECK
       ============================================================ */

    IF v_amount_paid > v_grand_total THEN
        RAISE EXCEPTION
            'Payment total (%) cannot exceed bill total (%)',
            v_amount_paid,
            v_grand_total;
    END IF;


    IF v_amount_due > 0 AND p_customer_id IS NULL THEN
        RAISE EXCEPTION 'A named customer is required for a sale with an outstanding balance';
    END IF;


    /* ============================================================
       14. CUSTOMER CREDIT HANDLING
       
       Historical credit entries are NOT deleted.

       Instead:
       old customer:
           reverse old outstanding amount with credit_adjustment

       new customer:
           add new outstanding amount with credit_adjustment
       ============================================================ */

    IF v_old_customer_id IS NOT NULL
       AND v_old_amount_due > 0 THEN

        INSERT INTO public.customer_credit_transactions (
            store_id,
            customer_id,
            sale_id,
            transaction_type,
            amount,
            notes,
            performed_by
        )
        VALUES (
            p_store_id,
            v_old_customer_id,
            p_sale_id,
            'credit_adjustment',
            -v_old_amount_due,
            'Credit reversed because sale was edited',
            v_user_id
        );

    END IF;


    IF p_customer_id IS NOT NULL
       AND v_new_amount_due > 0 THEN

        INSERT INTO public.customer_credit_transactions (
            store_id,
            customer_id,
            sale_id,
            transaction_type,
            amount,
            notes,
            performed_by
        )
        VALUES (
            p_store_id,
            p_customer_id,
            p_sale_id,
            'credit_adjustment',
            v_new_amount_due,
            'Credit created because edited sale has outstanding balance',
            v_user_id
        );

    END IF;


    /* ============================================================
       15. PAYMENT HISTORY IS PRESERVED
       Payment corrections, refunds and credit settlements must use
       their dedicated workflows, not rewrite a completed bill.
       ============================================================ */


    /* ============================================================
       16. UPDATE SALE HEADER
       ============================================================ */

    UPDATE public.sales
    SET
        customer_id = p_customer_id,
        bill_datetime = coalesce(
            p_bill_datetime,
            bill_datetime
        ),
        subtotal = v_subtotal,
        item_discount_total = v_item_discount_total,
        bill_discount_amount = v_bill_discount,
        taxable_amount = v_taxable_amount,
        cgst_amount = v_cgst_amount,
        sgst_amount = v_sgst_amount,
        igst_amount = v_igst_amount,
        round_off = v_round_off,
        grand_total = v_grand_total,
        amount_paid = v_amount_paid,
        amount_due = v_amount_due,
        notes = p_notes,
        is_past_dated =
            (
                coalesce(
                    p_bill_datetime,
                    bill_datetime
                )::date < current_date
            ),
        updated_at = now()
    WHERE id = p_sale_id
      AND store_id = p_store_id;


    /* ============================================================
       17. AUDIT LOG
       ============================================================ */

    INSERT INTO public.audit_logs (
        store_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        metadata
    )
    VALUES (
        p_store_id,
        v_user_id,
        'sale_edited',
        'sale',
        p_sale_id,

        jsonb_build_object(
            'invoice_number', v_sale.invoice_number,
            'customer_id', v_old_customer_id,
            'bill_datetime', v_sale.bill_datetime,
            'subtotal', v_sale.subtotal,
            'item_discount_total', v_sale.item_discount_total,
            'bill_discount_amount', v_sale.bill_discount_amount,
            'taxable_amount', v_sale.taxable_amount,
            'cgst_amount', v_sale.cgst_amount,
            'sgst_amount', v_sale.sgst_amount,
            'igst_amount', v_sale.igst_amount,
            'round_off', v_sale.round_off,
            'grand_total', v_sale.grand_total,
            'amount_paid', v_sale.amount_paid,
            'amount_due', v_sale.amount_due,
            'notes', v_sale.notes
        ),

        jsonb_build_object(
            'invoice_number', v_sale.invoice_number,
            'customer_id', p_customer_id,
            'bill_datetime', p_bill_datetime,
            'subtotal', v_subtotal,
            'item_discount_total', v_item_discount_total,
            'bill_discount_amount', v_bill_discount,
            'taxable_amount', v_taxable_amount,
            'cgst_amount', v_cgst_amount,
            'sgst_amount', v_sgst_amount,
            'igst_amount', v_igst_amount,
            'round_off', v_round_off,
            'grand_total', v_grand_total,
            'amount_paid', v_amount_paid,
            'amount_due', v_amount_due,
            'notes', p_notes
        ),

        jsonb_build_object(
            'reason', 'Completed sale edited',
            'performed_by', v_user_id,
            'old_amount_due', v_old_amount_due,
            'new_amount_due', v_new_amount_due
        )
    );


    RETURN p_sale_id;

END;
$function$

