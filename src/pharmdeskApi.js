import { supabase } from './supabaseClient'

/**
 * PharmDesk frontend API layer.
 *
 * UI components should call this module instead of scattering Supabase/RPC
 * calls throughout App.jsx. Every function is intentionally small and maps
 * to one backend operation.
 */

const call = async (name, args = {}) => {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

const select = async (table, query = {}) => {
  let q = supabase.from(table).select(query.select || '*')
  for (const [key, value] of Object.entries(query.eq || {})) q = q.eq(key, value)
  if (query.order) {
    for (const item of query.order) q = q.order(item.column, { ascending: item.ascending !== false })
  }
  if (query.limit) q = q.limit(query.limit)
  if (query.single) q = q.single()
  else if (query.maybeSingle) q = q.maybeSingle()
  const { data, error } = await q
  if (error) throw error
  return data
}

const invoke = async (name, body, options = {}) => {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    ...options,
  })
  if (error) throw error
  return data
}

export const PharmDeskAPI = {
  // ---------------------------------------------------------------------------
  // Auth / store
  // ---------------------------------------------------------------------------

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  },

  async getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data
},

  async getUser() {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    return data.user
  },

  userCanAccessStore(storeId) {
    return call('pharmdesk_user_can_access_store', { p_store_id: storeId })
  },

  getStores() {
    return select('stores', {
      select: '*',
      eq: { is_active: true },
      order: [{ column: 'name' }],
    })
  },

async getStoresForUser(userId) {
  const { data, error } = await supabase
    .from('store_memberships')
    .select('store_id, stores(*)')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) throw error

  return (data || [])
    .map((row) => row.stores)
    .filter(Boolean)
    .filter((store) => store.is_active !== false)
},

async getUserProfile(userId) {
  return select('user_profiles', {
    select: '*',
    eq: { id: userId },
    maybeSingle: true,
  })
},

  getStoreMembers(storeId) {
    return select('store_memberships', {
      select: '*, user_profiles(id,full_name,phone,is_active)',
      eq: { store_id: storeId, is_active: true },
    })
  },

  // ---------------------------------------------------------------------------
  // Dashboard / alerts
  // ---------------------------------------------------------------------------

  dashboard(storeId, date) {
    return call('pharmdesk_dashboard_summary', {
      p_store_id: storeId,
      p_date: date || undefined,
    })
  },

async dashboardSnapshot(storeId, startDate, expiryDays = 90) {
  const start = startDate || new Date().toISOString().slice(0, 10)

  const startDateObj = new Date(`${start}T00:00:00`)
  const endDateObj = new Date(startDateObj)
  endDateObj.setDate(
    endDateObj.getDate() + Number(expiryDays || 90),
  )

  const end = endDateObj.toISOString().slice(0, 10)

  const [
    salesResult,
    purchasesResult,
    batchesResult,
    expiryResult,
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('*')
      .eq('store_id', storeId)
      .gte('bill_datetime', `${start}T00:00:00`)
      .lt('bill_datetime', `${start}T23:59:59.999`),

    supabase
      .from('purchase_invoices')
      .select('*')
      .eq('store_id', storeId)
      .eq('invoice_date', start),

    supabase
      .from('batches')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .gt('current_stock_units', 0),

    supabase
      .from('batches')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .gte('expiry_date', start)
      .lte('expiry_date', end),
  ])

  for (const result of [
    salesResult,
    purchasesResult,
    batchesResult,
    expiryResult,
  ]) {
    if (result.error) throw result.error
  }

  return {
    sales: salesResult.data || [],
    purchases: purchasesResult.data || [],
    batches: batchesResult.data || [],
    expiry: expiryResult.data || [],
  }
},

  refreshAlerts(storeId) {
    return call('pharmdesk_refresh_stock_alerts', {
      p_store_id: storeId,
    })
  },

  refreshRiskSnapshots(storeId, date) {
    return call('pharmdesk_refresh_risk_snapshots', {
      p_store_id: storeId,
      p_snapshot_date: date || undefined,
    })
  },

  alerts(storeId, unreadOnly = false, limit = 100) {
    return call('pharmdesk_alerts_list', {
      p_store_id: storeId,
      p_unread_only: unreadOnly,
      p_limit: limit,
    })
  },

  markAlert(storeId, alertId, resolve = false) {
    return call('pharmdesk_mark_alert', {
      p_store_id: storeId,
      p_alert_id: alertId,
      p_resolve: resolve,
    })
  },

  // ---------------------------------------------------------------------------
  // Categories / compositions / products
  // ---------------------------------------------------------------------------

  categories() {
    return select('product_categories', {
      select: '*',
      eq: { is_active: true },
      order: [{ column: 'name' }],
    })
  },

  saveCategory(categoryId, name, description, isActive = true) {
    return call('pharmdesk_save_category', {
      p_category_id: categoryId || null,
      p_name: name,
      p_description: description || null,
      p_is_active: isActive,
    })
  },

  searchCompositions(query, limit = 20) {
    return call('pharmdesk_search_compositions', {
      p_query: query || '',
      p_limit: limit,
    })
  },

  saveComposition({
    compositionId = null,
    dosageForm = null,
    source = null,
    sourceReference = null,
    ingredients = [],
  }) {
    return call('pharmdesk_save_composition', {
      p_composition_id: compositionId,
      p_dosage_form: dosageForm,
      p_source: source,
      p_source_reference: sourceReference,
      p_ingredients: ingredients,
    })
  },

  searchProducts(storeId, query, limit = 30) {
    return call('pharmdesk_search_products', {
      p_store_id: storeId,
      p_query: query || '',
      p_limit: limit,
    })
  },

  saveProduct({
    storeId,
    productId = null,
    productName,
    genericDisplayName = null,
    categoryId = null,
    compositionId = null,
    manufacturer = null,
    dosageForm = null,
    strengthDisplay = null,
    packQuantity = 1,
    packUnit = null,
    hsnCode = null,
    gstRate = 0,
    defaultSellingPrice = 0,
    defaultDiscountPercent = 0,
    minimumStock = 0,
    reorderLevel = 0,
    isActive = true,
  }) {
    return call('pharmdesk_save_product', {
      p_store_id: storeId,
      p_product_id: productId,
      p_product_name: productName,
      p_generic_display_name: genericDisplayName,
      p_category_id: categoryId,
      p_composition_id: compositionId,
      p_manufacturer: manufacturer,
      p_dosage_form: dosageForm,
      p_strength_display: strengthDisplay,
      p_pack_quantity: packQuantity,
      p_pack_unit: packUnit,
      p_hsn_code: hsnCode,
      p_gst_rate: gstRate,
      p_default_selling_price: defaultSellingPrice,
      p_default_discount_percent: defaultDiscountPercent,
      p_minimum_stock: minimumStock,
      p_reorder_level: reorderLevel,
      p_is_active: isActive,
    })
  },

  deleteProduct(storeId, productId) {
    return call('pharmdesk_delete_product', {
      p_store_id: storeId,
      p_product_id: productId,
    })
  },

  productBatches(storeId, productId, includeExpired = false) {
    return call('pharmdesk_product_batches', {
      p_store_id: storeId,
      p_product_id: productId,
      p_include_expired: includeExpired,
    })
  },

  alternativeBrands(storeId, productId, limit = 30) {
    return call('pharmdesk_alternative_brands', {
      p_store_id: storeId,
      p_product_id: productId,
      p_limit: limit,
    })
  },

  savePackagingConfig(productId, configId, configName, levels) {
    return call('pharmdesk_save_packaging_config', {
      p_product_id: productId,
      p_config_id: configId || null,
      p_config_name: configName,
      p_levels: levels,
    })
  },

  packagingToStockUnits(packagingLevelId) {
    return call('pharmdesk_packaging_to_stock_units', {
      p_packaging_level_id: packagingLevelId,
    })
  },

  packagingConfigs(productId) {
    return select('product_packaging_configs', {
      select: '*, product_packaging_levels(*)',
      eq: { product_id: productId, is_active: true },
      order: [{ column: 'created_at', ascending: true }],
    })
  },

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------

  customers(storeId, search = '') {
    let query = supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name')

    if (search.trim()) {
      const s = search.trim()
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`)
    }

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  saveCustomer({
    storeId,
    customerId = null,
    name,
    phone,
    address = null,
    referredDoctorName = null,
    referredDoctorAddress = null,
    isActive = true,
  }) {
    return call('pharmdesk_save_customer_extended', {
      p_store_id: storeId,
      p_customer_id: customerId,
      p_name: name,
      p_phone: phone,
      p_address: address,
      p_referred_doctor_name: referredDoctorName,
      p_referred_doctor_address: referredDoctorAddress,
      p_is_active: isActive,
    })
  },

  customerSummary(storeId, customerId) {
    return call('pharmdesk_customer_summary', {
      p_store_id: storeId,
      p_customer_id: customerId,
    })
  },

  customerCreditReport(storeId) {
    return call('pharmdesk_customer_credit_report', {
      p_store_id: storeId,
    })
  },

  recordCustomerCreditPayment(storeId, customerId, amount, notes = null) {
    return call('pharmdesk_record_customer_credit_payment', {
      p_store_id: storeId,
      p_customer_id: customerId,
      p_amount: amount,
      p_notes: notes,
    })
  },

  customerSales(storeId, customerId) {
    return select('sales', {
      select: '*, sale_items(*, products(product_name,generic_display_name)), sale_payments(*)',
      eq: { store_id: storeId, customer_id: customerId },
      order: [{ column: 'bill_datetime', ascending: false }],
    })
  },

  // ---------------------------------------------------------------------------
  // Suppliers / purchase parties
  // ---------------------------------------------------------------------------

  suppliers(storeId, search = '') {
    let query = supabase
      .from('suppliers')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('supplier_name')

    if (search.trim()) {
      const s = search.trim()
      query = query.or(`supplier_name.ilike.%${s}%,phone.ilike.%${s}%,gstin.ilike.%${s}%`)
    }

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  saveSupplier({
    storeId,
    supplierId = null,
    supplierName,
    phone = null,
    email = null,
    gstin = null,
    drugLicenseNumber = null,
    address = null,
    isActive = true,
  }) {
    return call('pharmdesk_save_supplier_extended', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_supplier_name: supplierName,
      p_phone: phone,
      p_email: email,
      p_gstin: gstin,
      p_drug_license_number: drugLicenseNumber,
      p_address: address,
      p_is_active: isActive,
    })
  },

  supplierProductReport(storeId, supplierId, months = 3) {
    return call('pharmdesk_supplier_product_report', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_months: months,
    })
  },

  supplierOrderCandidates(storeId, supplierId, months = 3) {
    return call('pharmdesk_supplier_order_candidates', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_months: months,
    })
  },

  supplierOrderProducts(storeId, supplierId, view, months = 3) {
    return call('pharmdesk_supplier_order_products', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_view: view, // purchased | catalog
      p_months: months,
    })
  },

  supplierOrderCatalogue(storeId, supplierId, months = 3) {
    return call('pharmdesk_get_supplier_order_catalogue', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_months: months,
    })
  },

  createSupplierOrder({
    storeId,
    supplierId,
    items,
    notes = null,
    aiGenerated = false,
    aiSummary = null,
  }) {
    return call('pharmdesk_create_supplier_order', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_items: items,
      p_notes: notes,
      p_ai_generated: aiGenerated,
      p_ai_summary: aiSummary,
    })
  },

  supplierOrderDetail(storeId, orderId) {
    return call('pharmdesk_supplier_order_detail', {
      p_store_id: storeId,
      p_order_id: orderId,
    })
  },

  updateSupplierOrderStatus(storeId, orderId, status, notes = null) {
    return call('pharmdesk_update_supplier_order_status', {
      p_store_id: storeId,
      p_order_id: orderId,
      p_status: status,
      p_notes: notes,
    })
  },

  supplierPaymentHistory(storeId, supplierId, monthStart, monthEnd) {
    return call('pharmdesk_supplier_payment_history', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_month_start: monthStart,
      p_month_end: monthEnd,
    })
  },

  recordSupplierPayment({
    storeId,
    supplierId,
    amount,
    paymentMethod,
    paymentDate,
    referenceNumber = null,
    notes = null,
    allocations = [],
  }) {
    return call('pharmdesk_record_supplier_payment', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_payment_date: paymentDate,
      p_reference_number: referenceNumber,
      p_notes: notes,
      p_allocations: allocations,
    })
  },

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------

  nextInvoiceNumber(storeId) {
    return call('pharmdesk_next_invoice_number', {
      p_store_id: storeId,
    })
  },

  completePurchase({
    storeId,
    supplierId,
    invoiceNumber,
    invoiceDate,
    items,
    discountAmount = 0,
    cgstAmount = 0,
    sgstAmount = 0,
    igstAmount = 0,
    otherCharges = 0,
    notes = null,
  }) {
    return call('pharmdesk_complete_purchase', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_invoice_number: invoiceNumber,
      p_invoice_date: invoiceDate,
      p_items: items,
      p_discount_amount: discountAmount,
      p_cgst_amount: cgstAmount,
      p_sgst_amount: sgstAmount,
      p_igst_amount: igstAmount,
      p_other_charges: otherCharges,
      p_notes: notes,
    })
  },

  editPurchase({
    storeId,
    purchaseInvoiceId,
    supplierId,
    invoiceNumber,
    invoiceDate,
    items,
    discountAmount = 0,
    cgstAmount = 0,
    sgstAmount = 0,
    igstAmount = 0,
    otherCharges = 0,
    notes = null,
  }) {
    return call('pharmdesk_edit_purchase', {
      p_store_id: storeId,
      p_purchase_invoice_id: purchaseInvoiceId,
      p_supplier_id: supplierId,
      p_invoice_number: invoiceNumber,
      p_invoice_date: invoiceDate,
      p_items: items,
      p_discount_amount: discountAmount,
      p_cgst_amount: cgstAmount,
      p_sgst_amount: sgstAmount,
      p_igst_amount: igstAmount,
      p_other_charges: otherCharges,
      p_notes: notes,
    })
  },

  purchaseInvoiceDetail(storeId, invoiceId) {
    return call('pharmdesk_purchase_invoice_detail', {
      p_store_id: storeId,
      p_invoice_id: invoiceId,
    })
  },

  purchaseInvoices(storeId, startDate = null, endDate = null, supplierId = null) {
    let query = supabase
      .from('purchase_invoices')
      .select('*, suppliers(supplier_name,phone,gstin,drug_license_number)')
      .eq('store_id', storeId)
      .order('invoice_date', { ascending: true })
      .order('invoice_number', { ascending: true })

    if (startDate) query = query.gte('invoice_date', startDate)
    if (endDate) query = query.lte('invoice_date', endDate)
    if (supplierId) query = query.eq('supplier_id', supplierId)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  monthlyPurchaseSummary(storeId, monthStart, monthEnd, supplierId = null) {
    return call('pharmdesk_monthly_purchase_summary', {
      p_store_id: storeId,
      p_month_start: monthStart,
      p_month_end: monthEnd,
      p_supplier_id: supplierId,
    })
  },

  selectedPurchaseSummary(storeId, invoiceIds) {
    return call('pharmdesk_selected_purchase_summary', {
      p_store_id: storeId,
      p_purchase_invoice_ids: invoiceIds,
    })
  },

  monthlyPurchaseGstSummary(storeId, monthStart, monthEnd, supplierId = null) {
    return call('pharmdesk_monthly_purchase_gst_summary', {
      p_store_id: storeId,
      p_month_start: monthStart,
      p_month_end: monthEnd,
      p_supplier_id: supplierId,
    })
  },

  // ---------------------------------------------------------------------------
  // Sales
  // ---------------------------------------------------------------------------

  completeSale({
    storeId,
    customerId = null,
    billDatetime = null,
    billDiscountAmount = 0,
    notes = null,
    items,
    payments,
  }) {
    return call('pharmdesk_complete_sale', {
      p_store_id: storeId,
      p_customer_id: customerId,
      p_bill_datetime: billDatetime,
      p_bill_discount_amount: billDiscountAmount,
      p_notes: notes,
      p_items: items,
      p_payments: payments,
    })
  },

  editSale({
    storeId,
    saleId,
    customerId = null,
    billDatetime = null,
    billDiscountAmount = 0,
    notes = null,
    items,
    payments,
  }) {
    return call('pharmdesk_edit_sale', {
      p_store_id: storeId,
      p_sale_id: saleId,
      p_customer_id: customerId,
      p_bill_datetime: billDatetime,
      p_bill_discount_amount: billDiscountAmount,
      p_notes: notes,
      p_items: items,
      p_payments: payments,
    })
  },

  sales(storeId, startDate = null, endDate = null) {
    let query = supabase
      .from('sales')
      .select('*, customers(name,phone), sale_items(*,products(product_name,generic_display_name),batches(batch_number,expiry_date)), sale_payments(*)')
      .eq('store_id', storeId)
      .order('bill_datetime', { ascending: false })

    if (startDate) query = query.gte('bill_datetime', `${startDate}T00:00:00`)
    if (endDate) query = query.lt('bill_datetime', `${endDate}T23:59:59.999`)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  processSalesReturn({
    storeId,
    originalSaleId,
    refundMethod,
    refundAmount,
    reason = null,
    items,
  }) {
    return call('pharmdesk_process_sales_return', {
      p_store_id: storeId,
      p_original_sale_id: originalSaleId,
      p_refund_method: refundMethod,
      p_refund_amount: refundAmount,
      p_reason: reason,
      p_items: items,
    })
  },

  // ---------------------------------------------------------------------------
  // Drafts
  // ---------------------------------------------------------------------------

  saveDraft(storeId, saleId, payload, deviceLabel = null) {
    return call('pharmdesk_save_draft_bill', {
      p_store_id: storeId,
      p_sale_id: saleId || null,
      p_payload: payload || {},
      p_device_label: deviceLabel,
    })
  },

  getMyDrafts(storeId) {
    return call('pharmdesk_get_my_drafts', {
      p_store_id: storeId,
    })
  },

  // ---------------------------------------------------------------------------
  // Inventory / reconciliation
  // ---------------------------------------------------------------------------

  inventory(storeId, { activeOnly = true } = {}) {
    let query = supabase
      .from('store_products')
      .select(`
        *,
        products(
          id,product_name,generic_display_name,category_id,composition_id,
          manufacturer,dosage_form,strength_display,pack_quantity,pack_unit,
          hsn_code,gst_rate,is_active,
          product_categories(id,name),
          compositions(id,name,dosage_form,is_verified)
        )
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    if (activeOnly) query = query.eq('is_active', true)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  batches(storeId, productId = null) {
    let query = supabase
      .from('batches')
      .select('*,products(product_name,generic_display_name)')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('expiry_date', { ascending: true })

    if (productId) query = query.eq('product_id', productId)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  adjustStock(storeId, batchId, physicalStockUnits, reason = null) {
    return call('pharmdesk_adjust_stock', {
      p_store_id: storeId,
      p_batch_id: batchId,
      p_physical_stock_units: physicalStockUnits,
      p_reason: reason,
    })
  },

  stockMovements(storeId, productId = null, batchId = null) {
    let query = supabase
      .from('stock_movements')
      .select('*,products(product_name),batches(batch_number,expiry_date)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    if (productId) query = query.eq('product_id', productId)
    if (batchId) query = query.eq('batch_id', batchId)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  stockReconciliations(storeId, productId = null) {
    let query = supabase
      .from('stock_reconciliations')
      .select('*,products(product_name),batches(batch_number,expiry_date)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    if (productId) query = query.eq('product_id', productId)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  // ---------------------------------------------------------------------------
  // Supplier catalogue
  // ---------------------------------------------------------------------------

  startSupplierCatalogueImport(storeId, supplierId, filename, sourceType) {
    return call('pharmdesk_start_supplier_catalogue_import', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_source_filename: filename,
      p_source_type: sourceType,
    })
  },

  saveSupplierCataloguePreview({
    storeId,
    supplierId,
    importId,
    catalogueName,
    catalogueVersion,
    effectiveDate,
    rows,
  }) {
    return call('pharmdesk_save_supplier_catalogue_preview', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_import_id: importId,
      p_catalogue_name: catalogueName,
      p_catalogue_version: catalogueVersion,
      p_effective_date: effectiveDate,
      p_rows: rows,
    })
  },

  approveSupplierCatalogue(storeId, supplierId, importId, catalogueId) {
    return call('pharmdesk_approve_supplier_catalogue', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_import_id: importId,
      p_catalogue_id: catalogueId,
    })
  },

  matchSupplierCatalogueProducts(storeId, supplierId, catalogueId) {
    return call('pharmdesk_match_supplier_catalogue_products', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_catalogue_id: catalogueId,
    })
  },

  supplierCatalogueReview(storeId, catalogueId) {
    return call('pharmdesk_supplier_catalogue_review', {
      p_store_id: storeId,
      p_catalogue_id: catalogueId,
    })
  },

  saveCatalogueMatch(storeId, catalogueProductId, productId, status) {
    return call('pharmdesk_save_catalogue_match', {
      p_store_id: storeId,
      p_catalogue_product_id: catalogueProductId,
      p_product_id: productId || null,
      p_status: status,
    })
  },

  addCatalogueAlias(storeId, catalogueProductId, productId) {
    return call('pharmdesk_record_catalogue_product_alias', {
      p_store_id: storeId,
      p_catalogue_product_id: catalogueProductId,
      p_product_id: productId,
    })
  },

  extractSupplierCatalogue(file, storeId, supplierId) {
    const form = new FormData()
    form.append('file', file)
    form.append('store_id', storeId)
    form.append('supplier_id', supplierId)
    return invoke('ai-supplier-catalogue-extract', form)
  },

  // ---------------------------------------------------------------------------
  // AI invoice / recommendations
  // ---------------------------------------------------------------------------

  extractInvoice(file, storeId, supplierId = null) {
    const form = new FormData()
    form.append('file', file)
    form.append('store_id', storeId)
    if (supplierId) form.append('supplier_id', supplierId)
    return invoke('ai-invoice-extract', form)
  },

  generatePurchaseRecommendations(storeId) {
    return invoke('ai-purchase-recommendation', {
      store_id: storeId,
    })
  },

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  reports(storeId, startDate, endDate) {
    return call('pharmdesk_reports', {
      p_store_id: storeId,
      p_start_date: startDate,
      p_end_date: endDate,
    })
  },

  salesReport(storeId, startDate, endDate) {
    return this.sales(storeId, startDate, endDate)
  },

  purchaseReport(storeId, startDate, endDate, supplierId = null) {
    return this.purchaseInvoices(storeId, startDate, endDate, supplierId)
  },

  inventoryReport(storeId) {
    return this.inventory(storeId)
  },

  auditTrail(storeId, startDate = null, endDate = null) {
    let query = supabase
      .from('audit_logs')
      .select('*, user_profiles(full_name,phone)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`)
    if (endDate) query = query.lt('created_at', `${endDate}T23:59:59.999`)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  // ---------------------------------------------------------------------------
  // Day closing
  // ---------------------------------------------------------------------------

  dayClosingPreview(storeId, date) {
    return call('pharmdesk_day_closing_preview', {
      p_store_id: storeId,
      p_date: date,
    })
  },

  closeDay(storeId, date, notes = null) {
    return call('pharmdesk_close_day', {
      p_store_id: storeId,
      p_date: date,
      p_notes: notes,
    })
  },

  dayClosings(storeId, startDate = null, endDate = null) {
    let query = supabase
      .from('day_closings')
      .select('*')
      .eq('store_id', storeId)
      .order('closing_date', { ascending: false })

    if (startDate) query = query.gte('closing_date', startDate)
    if (endDate) query = query.lte('closing_date', endDate)

    return query.then(({ data, error }) => {
      if (error) throw error
      return data
    })
  },

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  getStoreSettings(storeId) {
    return select('store_settings', {
      select: '*',
      eq: { store_id: storeId },
      maybeSingle: true,
    })
  },

  getStore(storeId) {
    return select('stores', {
      select: '*',
      eq: { id: storeId },
      maybeSingle: true,
    })
  },

  updateStore(storeId, patch) {
    return supabase
      .from('stores')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error
        return data
      })
  },

  updateStoreSettings(storeId, patch) {
    return supabase
      .from('store_settings')
      .upsert({ store_id: storeId, ...patch, updated_at: new Date().toISOString() })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error
        return data
      })
  },

  // ---------------------------------------------------------------------------
  // Generic direct reads for screens that need richer drill-down data.
  // These still respect RLS.
  // ---------------------------------------------------------------------------

  async saleDetail(storeId, saleId) {
    const [sale, items, payments, returns] = await Promise.all([
      select('sales', {
        select: '*,customers(name,phone,address,referred_doctor_name,referred_doctor_address)',
        eq: { id: saleId, store_id: storeId },
        maybeSingle: true,
      }),
      select('sale_items', {
        select: '*,products(product_name,generic_display_name,manufacturer,dosage_form,strength_display),batches(batch_number,expiry_date,units_per_pack)',
        eq: { sale_id: saleId },
      }),
      select('sale_payments', {
        select: '*',
        eq: { sale_id: saleId },
        order: [{ column: 'created_at' }],
      }),
      select('sales_returns', {
        select: '*,sales_return_items(*)',
        eq: { original_sale_id: saleId },
        order: [{ column: 'created_at' }],
      }),
    ])
    return { sale, items, payments, returns }
  },

  supplierOutstanding(storeId, supplierId = null) {
    return this.monthlyPurchaseSummary(
      storeId,
      '2000-01-01',
      '2999-12-31',
      supplierId,
    )
  },
}

export {
  call as pharmdeskRpc,
  select as pharmdeskSelect,
  invoke as pharmdeskInvoke,
  pharmdeskDb
}

export default PharmDeskAPI