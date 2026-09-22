import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

/* =========================================================
   HELPERS
========================================================= */

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function initials(value) {
  if (!value) return 'P'

  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

/* =========================================================
   SHARED UI
========================================================= */

function PageHeader({
  title,
  description,
  action,
  onAction,
}) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <div className="breadcrumb">
          PharmDesk
          <span>/</span>
          {title}
        </div>

        <h1>{title}</h1>

        {description && (
          <p>{description}</p>
        )}
      </div>

      {action && (
        <button
          className="primary-button"
          onClick={onAction}
        >
          + {action}
        </button>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone = 'blue',
}) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-card-top">
        <div className="stat-icon">
          {icon}
        </div>

        <span>{label}</span>
      </div>

      <strong className="stat-value">
        {value}
      </strong>

      {detail && (
        <small className="stat-detail">
          {detail}
        </small>
      )}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose()
        }
      }}
    >
      <div
        className={`modal ${
          wide ? 'modal-wide' : ''
        }`}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
          </div>

          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  required = false,
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && (
          <b className="required-mark">
            {' '}*
          </b>
        )}
      </span>

      {children}
    </label>
  )
}

function EmptyState({
  title,
  description,
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        ▤
      </div>

      <h3>{title}</h3>

      {description && (
        <p>{description}</p>
      )}
    </div>
  )
}

function Message({
  type = 'success',
  children,
}) {
  if (!children) return null

  return (
    <div className={`${type}-message`}>
      {children}
    </div>
  )
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({
  store,
  onNavigate,
}) {
  const [stats, setStats] = useState({
    sales: 0,
    purchases: 0,
    products: 0,
    lowStock: 0,
  })

  const [recentSales, setRecentSales] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  useEffect(() => {
    async function loadDashboard() {
      if (!store?.id) return

      setLoading(true)

      const today =
        new Date()
          .toISOString()
          .slice(0, 10)

      const [
        salesResult,
        purchasesResult,
        productsResult,
        batchesResult,
        recentResult,
      ] = await Promise.all([
        supabase
          .from('sales')
          .select('grand_total')
          .eq('store_id', store.id)
          .eq('status', 'completed')
          .gte(
            'bill_datetime',
            `${today}T00:00:00`,
          )
          .lt(
            'bill_datetime',
            `${today}T23:59:59.999`,
          ),

        supabase
          .from('purchase_invoices')
          .select('total_amount')
          .eq('store_id', store.id)
          .eq('invoice_date', today),

        supabase
          .from('store_products')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq('store_id', store.id)
          .eq('is_active', true),

        supabase
          .from('batches')
          .select(
            'product_id,current_stock_units',
          )
          .eq('store_id', store.id)
          .eq('is_active', true),

        supabase
          .from('sales')
          .select(
            `
              id,
              invoice_number,
              grand_total,
              bill_datetime,
              customer_id,
              customers (
                name
              )
            `,
          )
          .eq('store_id', store.id)
          .eq('status', 'completed')
          .order('bill_datetime', {
            ascending: false,
          })
          .limit(5),
      ])

      const sales =
        (salesResult.data || []).reduce(
          (sum, row) =>
            sum +
            Number(
              row.grand_total || 0,
            ),
          0,
        )

      const purchases =
        (purchasesResult.data || []).reduce(
          (sum, row) =>
            sum +
            Number(
              row.total_amount || 0,
            ),
          0,
        )

      const lowStock =
        (batchesResult.data || []).filter(
          (batch) =>
            Number(
              batch.current_stock_units || 0,
            ) <= 0,
        ).length

      setStats({
        sales,
        purchases,
        products:
          productsResult.count || 0,
        lowStock,
      })

      setRecentSales(
        recentResult.data || [],
      )

      setLoading(false)
    }

    loadDashboard()
  }, [store?.id])

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Overview of ${
          store?.name ||
          'your pharmacy'
        }`}
      />

      <div className="stats-grid">
        <StatCard
          label="Today's Sales"
          value={
            loading
              ? '…'
              : formatCurrency(
                  stats.sales,
                )
          }
          detail="Completed bills today"
          icon="₹"
          tone="blue"
        />

        <StatCard
          label="Today's Purchases"
          value={
            loading
              ? '…'
              : formatCurrency(
                  stats.purchases,
                )
          }
          detail="Supplier invoices today"
          icon="↓"
          tone="green"
        />

        <StatCard
          label="Active Products"
          value={
            loading
              ? '…'
              : stats.products
          }
          detail="Products in this store"
          icon="▤"
          tone="purple"
        />

        <StatCard
          label="Stock Alerts"
          value={
            loading
              ? '…'
              : stats.lowStock
          }
          detail="Currently out of stock"
          icon="!"
          tone="orange"
        />
      </div>

      <div className="dashboard-main-grid">
        <section className="panel recent-sales-panel">
          <div className="panel-header">
            <div>
              <h2>Recent sales</h2>
              <p>
                Latest completed pharmacy bills
              </p>
            </div>

            <button
              className="text-button"
              onClick={() =>
                onNavigate('Sales')
              }
            >
              View sales →
            </button>
          </div>

          {recentSales.length === 0 ? (
            <EmptyState
              title="No sales yet"
              description="Completed bills will appear here."
            />
          ) : (
            <div className="recent-sales-list">
              {recentSales.map(
                (sale) => (
                  <div
                    className="recent-sale"
                    key={sale.id}
                  >
                    <div className="recent-sale-icon">
                      ₹
                    </div>

                    <div className="recent-sale-main">
                      <strong>
                        {sale.invoice_number ||
                          'Sale'}
                      </strong>

                      <span>
                        {sale.customers
                          ?.name ||
                          'Walk-in customer'}
                      </span>
                    </div>

                    <div className="recent-sale-right">
                      <strong>
                        {formatCurrency(
                          sale.grand_total,
                        )}
                      </strong>

                      <span>
                        {new Date(
                          sale.bill_datetime,
                        ).toLocaleTimeString(
                          'en-IN',
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )}
                      </span>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        <section className="panel quick-actions-panel">
          <div className="panel-header">
            <div>
              <h2>Quick actions</h2>
              <p>
                Common pharmacy operations
              </p>
            </div>
          </div>

          <div className="quick-actions">
            <button
              className="quick-action"
              onClick={() =>
                onNavigate('Sales')
              }
            >
              <span className="quick-action-icon blue">
                ₹
              </span>

              <span>
                <strong>New Sale</strong>
                <small>
                  Create a customer bill
                </small>
              </span>

              <b>→</b>
            </button>

            <button
              className="quick-action"
              onClick={() =>
                onNavigate('Purchases')
              }
            >
              <span className="quick-action-icon green">
                ↓
              </span>

              <span>
                <strong>New Purchase</strong>
                <small>
                  Receive supplier stock
                </small>
              </span>

              <b>→</b>
            </button>

            <button
              className="quick-action"
              onClick={() =>
                onNavigate('Inventory')
              }
            >
              <span className="quick-action-icon purple">
                ▤
              </span>

              <span>
                <strong>Inventory</strong>
                <small>
                  Check stock and batches
                </small>
              </span>

              <b>→</b>
            </button>

            <button
              className="quick-action"
              onClick={() =>
                onNavigate('Reports')
              }
            >
              <span className="quick-action-icon orange">
                ▥
              </span>

              <span>
                <strong>Reports</strong>
                <small>
                  Review pharmacy activity
                </small>
              </span>

              <b>→</b>
            </button>
          </div>
        </section>
      </div>

      <section className="panel system-panel">
        <div className="system-status">
          <span className="status-dot" />

          <div>
            <strong>
              PharmDesk is connected
            </strong>

            <p>
              Your pharmacy data is being
              stored securely in the connected
              cloud database.
            </p>
          </div>

          <span className="connected-badge">
            Cloud Connected
          </span>
        </div>
      </section>
    </>
  )
}

/* =========================================================
   SALES
========================================================= */

function Sales({ store }) {
  const [products, setProducts] =
    useState([])

  const [customers, setCustomers] =
    useState([])

  const [search, setSearch] =
    useState('')

  const [cart, setCart] =
    useState([])

  const [customerId, setCustomerId] =
    useState('')

  const [billDiscount, setBillDiscount] =
    useState(0)

  const [paymentRows, setPaymentRows] =
    useState([
      {
        payment_method: 'cash',
        amount: '',
      },
    ])

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [error, setError] =
    useState('')

  useEffect(() => {
    loadProducts()
    loadCustomers()
  }, [store?.id])

  async function loadProducts() {
    if (!store?.id) return

    const { data } = await supabase
      .from('store_products')
      .select(`
        id,
        product_id,
        default_selling_price,
        default_discount_percent,
        products (
          id,
          product_name,
          generic_display_name,
          manufacturer,
          dosage_form,
          strength_display,
          gst_rate
        )
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('created_at', {
        ascending: false,
      })

    setProducts(data || [])
  }

  async function loadCustomers() {
    if (!store?.id) return

    const { data } = await supabase
      .from('customers')
      .select(
        'id,name,phone,customer_type',
      )
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('name')

    setCustomers(data || [])
  }

  async function addProduct(item) {
    setError('')

    const product = item.products

    const {
      data: batches,
      error: batchError,
    } = await supabase
      .from('batches')
      .select(`
        id,
        batch_number,
        expiry_date,
        units_per_pack,
        mrp_per_pack,
        current_stock_units
      `)
      .eq('store_id', store.id)
      .eq('product_id', item.product_id)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .order('expiry_date', {
        ascending: true,
      })

    if (batchError) {
      setError(batchError.message)
      return
    }

    if (!batches?.length) {
      setError(
        `${product.product_name} has no available stock.`,
      )
      return
    }

    const batch = batches[0]

    const existing = cart.find(
      (row) =>
        row.product_id ===
        item.product_id,
    )

    if (existing) {
      updateCartItem(
        cart.findIndex(
          (row) =>
            row.product_id ===
            item.product_id,
        ),
        {
          quantity_entered:
            Number(
              existing.quantity_entered,
            ) + 1,
        },
      )

      return
    }

    setCart([
      ...cart,
      {
        product_id:
          item.product_id,
        batch_id: batch.id,
        product_name:
          product.product_name,
        generic_display_name:
          product.generic_display_name ||
          '',
        manufacturer:
          product.manufacturer || '',
        strength_display:
          product.strength_display || '',
        dosage_form:
          product.dosage_form || '',
        unit_type: 'pack',
        quantity_entered: 1,
        quantity_units:
          Number(
            batch.units_per_pack || 1,
          ),
        units_per_pack:
          Number(
            batch.units_per_pack || 1,
          ),
        mrp_per_pack:
          Number(
            batch.mrp_per_pack || 0,
          ),
        selling_price_per_pack:
          Number(
            item.default_selling_price ??
              batch.mrp_per_pack ??
              0,
          ),
        default_discount_percent:
          Number(
            item.default_discount_percent ||
              0,
          ),
        discount_percent:
          Number(
            item.default_discount_percent ||
              0,
          ),
        gst_rate:
          Number(
            product.gst_rate || 0,
          ),
        expiry_date:
          batch.expiry_date,
        batch_number:
          batch.batch_number,
      },
    ])

    setSearch('')
  }

  function updateCartItem(
    index,
    changes,
  ) {
    setCart((current) =>
      current.map(
        (item, itemIndex) => {
          if (
            itemIndex !== index
          ) {
            return item
          }

          const next = {
            ...item,
            ...changes,
          }

          if (
            next.unit_type ===
            'pack'
          ) {
            next.quantity_units =
              Number(
                next.quantity_entered ||
                  0,
              ) *
              Number(
                next.units_per_pack ||
                  1,
              )
          } else {
            next.quantity_units =
              Number(
                next.quantity_entered ||
                  0,
              )
          }

          return next
        },
      ),
    )
  }

  function removeCartItem(index) {
    setCart((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index,
      ),
    )
  }

  const filteredProducts =
    products.filter((item) => {
      const p = item.products
      const q =
        search
          .toLowerCase()
          .trim()

      if (!q) return false

      return [
        p?.product_name,
        p?.generic_display_name,
        p?.manufacturer,
        p?.strength_display,
        p?.dosage_form,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })

  const totals = useMemo(() => {
    let subtotal = 0
    let itemDiscount = 0
    let gst = 0

    cart.forEach((item) => {
      const packPrice =
        Number(
          item.selling_price_per_pack ||
            0,
        )

      const quantity =
        Number(
          item.quantity_entered || 0,
        )

      const gross =
        item.unit_type === 'pack'
          ? quantity * packPrice
          : quantity *
            (packPrice /
              Math.max(
                Number(
                  item.units_per_pack ||
                    1,
                ),
                1,
              ))

      const discountAmount =
        gross *
        Number(
          item.discount_percent || 0,
        ) /
        100

      const afterDiscount =
        gross - discountAmount

      const rate =
        Number(
          item.gst_rate || 0,
        )

      const taxable =
        rate > 0
          ? afterDiscount /
            (1 + rate / 100)
          : afterDiscount

      const gstAmount =
        afterDiscount - taxable

      subtotal += gross
      itemDiscount +=
        discountAmount
      gst += gstAmount
    })

    const billDiscountAmount =
      Math.max(
        0,
        Number(
          billDiscount || 0,
        ),
      )

    const total = Math.max(
      0,
      subtotal -
        itemDiscount -
        billDiscountAmount,
    )

    const paid =
      paymentRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.amount || 0,
          ),
        0,
      )

    return {
      subtotal,
      itemDiscount,
      gst,
      billDiscount:
        billDiscountAmount,
      total,
      paid,
      due: Math.max(
        0,
        total - paid,
      ),
    }
  }, [
    cart,
    billDiscount,
    paymentRows,
  ])

  async function completeSale() {
    setError('')
    setMessage('')

    if (!cart.length) {
      setError(
        'Add at least one product to the bill.',
      )
      return
    }

    const payments =
      paymentRows
        .filter(
          (row) =>
            Number(
              row.amount || 0,
            ) > 0,
        )
        .map((row) => ({
          payment_method:
            row.payment_method,
          amount: Number(
            row.amount,
          ),
        }))

    if (
      totals.due > 0 &&
      !customerId
    ) {
      setError(
        'Select a named customer when there is an outstanding amount.',
      )
      return
    }

    if (
      totals.paid >
      totals.total
    ) {
      setError(
        'Payment exceeds the bill total.',
      )
      return
    }

    setLoading(true)

    const {
      data,
      error: saleError,
    } = await supabase.rpc(
      'pharmdesk_complete_sale',
      {
        p_store_id: store.id,
        p_customer_id:
          customerId || null,
        p_bill_datetime:
          new Date().toISOString(),
        p_bill_discount_amount:
          Number(
            billDiscount || 0,
          ),
        p_notes: null,
        p_items: cart.map(
          (item) => ({
            product_id:
              item.product_id,
            batch_id:
              item.batch_id,
            unit_type:
              item.unit_type,
            quantity_entered:
              Number(
                item.quantity_entered,
              ),
            units_per_pack:
              Number(
                item.units_per_pack,
              ),
            mrp_per_pack:
              Number(
                item.mrp_per_pack,
              ),
            selling_price_per_pack:
              Number(
                item.selling_price_per_pack,
              ),
            default_discount_percent:
              Number(
                item.default_discount_percent,
              ),
            discount_percent:
              Number(
                item.discount_percent,
              ),
            gst_rate:
              Number(
                item.gst_rate,
              ),
          }),
        ),
        p_payments: payments,
      },
    )

    setLoading(false)

    if (saleError) {
      setError(
        saleError.message,
      )
      return
    }

    setMessage(
      data?.invoice_number
        ? `Sale completed: ${data.invoice_number}`
        : 'Sale completed successfully.',
    )

    setCart([])
    setCustomerId('')
    setBillDiscount(0)

    setPaymentRows([
      {
        payment_method: 'cash',
        amount: '',
      },
    ])

    setSearch('')
  }

  function addPaymentRow() {
    setPaymentRows([
      ...paymentRows,
      {
        payment_method: 'upi',
        amount: '',
      },
    ])
  }

  function updatePayment(
    index,
    changes,
  ) {
    setPaymentRows((current) =>
      current.map(
        (row, rowIndex) =>
          rowIndex === index
            ? {
                ...row,
                ...changes,
              }
            : row,
      ),
    )
  }

  return (
    <>
      <PageHeader
        title="Sales"
        description="Create pharmacy bills and record payments."
      />

      <Message type="success">
        {message}
      </Message>

      <Message type="error">
        {error}
      </Message>

      <div className="billing-layout">
        <section className="panel billing-main">
          <div className="panel-header">
            <div>
              <h2>New Sale</h2>
              <p>
                Search by brand, composition,
                manufacturer or strength.
              </p>
            </div>
          </div>

          <div className="search-box large-search">
            <span>⌕</span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search brand, composition or manufacturer..."
            />
          </div>

          {search && (
            <div className="search-results">
              {filteredProducts.length ===
              0 ? (
                <div className="search-empty">
                  No matching products
                  found.
                </div>
              ) : (
                filteredProducts
                  .slice(0, 8)
                  .map((item) => {
                    const p =
                      item.products

                    return (
                      <button
                        className="search-result"
                        key={item.id}
                        onClick={() =>
                          addProduct(
                            item,
                          )
                        }
                      >
                        <div>
                          <strong>
                            {
                              p.product_name
                            }
                          </strong>

                          <span>
                            {p.generic_display_name ||
                              ''}
                            {p.strength_display
                              ? ` • ${p.strength_display}`
                              : ''}
                          </span>
                        </div>

                        <b>
                          {formatCurrency(
                            item.default_selling_price,
                          )}
                        </b>
                      </button>
                    )
                  })
              )}
            </div>
          )}

          <div className="cart-table">
            <div className="cart-header">
              <span>Product</span>
              <span>Unit</span>
              <span>Qty</span>
              <span>Discount</span>
              <span>Total</span>
              <span />
            </div>

            {cart.length === 0 ? (
              <EmptyState
                title="No products in this bill"
                description="Search for a product above to begin."
              />
            ) : (
              cart.map(
                (item, index) => {
                  const packPrice =
                    Number(
                      item.selling_price_per_pack ||
                        0,
                    )

                  const quantity =
                    Number(
                      item.quantity_entered ||
                        0,
                    )

                  const gross =
                    item.unit_type ===
                    'pack'
                      ? quantity *
                        packPrice
                      : quantity *
                        (packPrice /
                          Math.max(
                            Number(
                              item.units_per_pack ||
                                1,
                            ),
                            1,
                          ))

                  const discount =
                    gross *
                    Number(
                      item.discount_percent ||
                        0,
                    ) /
                    100

                  return (
                    <div
                      className="cart-row"
                      key={`${item.product_id}-${index}`}
                    >
                      <div className="cart-product">
                        <strong>
                          {
                            item.product_name
                          }
                        </strong>

                        <small>
                          {
                            item.batch_number
                          }

                          {item.expiry_date
                            ? ` • Exp ${item.expiry_date}`
                            : ''}
                        </small>
                      </div>

                      <select
                        value={
                          item.unit_type
                        }
                        onChange={(
                          event,
                        ) =>
                          updateCartItem(
                            index,
                            {
                              unit_type:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                      >
                        <option value="pack">
                          Pack
                        </option>

                        <option value="unit">
                          Tablet / Unit
                        </option>
                      </select>

                      <input
                        className="small-input"
                        type="number"
                        min="1"
                        value={
                          item.quantity_entered
                        }
                        onChange={(
                          event,
                        ) =>
                          updateCartItem(
                            index,
                            {
                              quantity_entered:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />

                      <input
                        className="small-input"
                        type="number"
                        min="0"
                        max="100"
                        value={
                          item.discount_percent
                        }
                        onChange={(
                          event,
                        ) =>
                          updateCartItem(
                            index,
                            {
                              discount_percent:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />

                      <strong>
                        {formatCurrency(
                          gross -
                            discount,
                        )}
                      </strong>

                      <button
                        className="delete-button"
                        onClick={() =>
                          removeCartItem(
                            index,
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  )
                },
              )
            )}
          </div>
        </section>

        <aside className="billing-sidebar">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Customer</h2>
                <p>
                  Optional for walk-in
                  sales.
                </p>
              </div>
            </div>

            <select
              value={customerId}
              onChange={(event) =>
                setCustomerId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Walk-in / Anonymous
              </option>

              {customers.map(
                (customer) => (
                  <option
                    key={customer.id}
                    value={
                      customer.id
                    }
                  >
                    {customer.name}

                    {customer.phone
                      ? ` • ${customer.phone}`
                      : ''}
                  </option>
                ),
              )}
            </select>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>
                  Bill Summary
                </h2>
              </div>
            </div>

            <div className="summary-line">
              <span>
                Subtotal
              </span>

              <b>
                {formatCurrency(
                  totals.subtotal,
                )}
              </b>
            </div>

            <div className="summary-line">
              <span>
                Item discount
              </span>

              <b>
                −{' '}
                {formatCurrency(
                  totals.itemDiscount,
                )}
              </b>
            </div>

            <div className="summary-line">
              <span>
                Bill discount
              </span>

              <input
                className="summary-input"
                type="number"
                min="0"
                value={
                  billDiscount
                }
                onChange={(
                  event,
                ) =>
                  setBillDiscount(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </div>

            <div className="summary-line">
              <span>
                GST included
              </span>

              <b>
                {formatCurrency(
                  totals.gst,
                )}
              </b>
            </div>

            <div className="grand-total">
              <span>Total</span>

              <strong>
                {formatCurrency(
                  totals.total,
                )}
              </strong>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Payment</h2>
              </div>

              <button
                className="text-button"
                onClick={
                  addPaymentRow
                }
              >
                + Split
              </button>
            </div>

            {paymentRows.map(
              (row, index) => (
                <div
                  className="payment-row"
                  key={index}
                >
                  <select
                    value={
                      row.payment_method
                    }
                    onChange={(
                      event,
                    ) =>
                      updatePayment(
                        index,
                        {
                          payment_method:
                            event
                              .target
                              .value,
                        },
                      )
                    }
                  >
                    <option value="cash">
                      Cash
                    </option>

                    <option value="upi">
                      UPI
                    </option>

                    <option value="card">
                      Card
                    </option>

                    <option value="credit">
                      Credit
                    </option>
                  </select>

                  <input
                    type="number"
                    min="0"
                    value={
                      row.amount
                    }
                    onChange={(
                      event,
                    ) =>
                      updatePayment(
                        index,
                        {
                          amount:
                            event
                              .target
                              .value,
                        },
                      )
                    }
                    placeholder="Amount"
                  />
                </div>
              ),
            )}

            <div className="summary-line">
              <span>Paid</span>

              <b>
                {formatCurrency(
                  totals.paid,
                )}
              </b>
            </div>

            <div className="summary-line">
              <span>Due</span>

              <b>
                {formatCurrency(
                  totals.due,
                )}
              </b>
            </div>

            <button
              className="primary-button full-width"
              disabled={
                loading ||
                !cart.length
              }
              onClick={
                completeSale
              }
            >
              {loading
                ? 'Processing…'
                : 'Complete Sale'}
            </button>
          </section>
        </aside>
      </div>
    </>
  )
}

/* =========================================================
   PURCHASES
========================================================= */

function Purchases({ store }) {
  const [suppliers, setSuppliers] =
    useState([])

  const [products, setProducts] =
    useState([])

  const [supplierId, setSupplierId] =
    useState('')

  const [
    invoiceNumber,
    setInvoiceNumber,
  ] = useState('')

  const [invoiceDate, setInvoiceDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10),
    )

  const [search, setSearch] =
    useState('')

  const [items, setItems] =
    useState([])

  const [discount, setDiscount] =
    useState(0)

  const [cgst, setCgst] =
    useState(0)

  const [sgst, setSgst] =
    useState(0)

  const [igst, setIgst] =
    useState(0)

  const [
    otherCharges,
    setOtherCharges,
  ] = useState(0)

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [error, setError] =
    useState('')

  useEffect(() => {
    loadSuppliers()
    loadProducts()
  }, [store?.id])

  async function loadSuppliers() {
    if (!store?.id) return

    const { data } =
      await supabase
        .from('suppliers')
        .select(
          'id,supplier_name,phone,gstin',
        )
        .eq(
          'store_id',
          store.id,
        )
        .eq(
          'is_active',
          true,
        )
        .order(
          'supplier_name',
        )

    setSuppliers(data || [])
  }

  async function loadProducts() {
    if (!store?.id) return

    const { data } =
      await supabase
        .from('store_products')
        .select(`
          id,
          product_id,
          default_selling_price,
          products (
            id,
            product_name,
            generic_display_name,
            manufacturer,
            strength_display,
            gst_rate
          )
        `)
        .eq(
          'store_id',
          store.id,
        )
        .eq(
          'is_active',
          true,
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        )

    setProducts(data || [])
  }

  const searchResults =
    products.filter(
      (item) => {
        const p =
          item.products

        const q =
          search
            .toLowerCase()
            .trim()

        if (!q) return false

        return [
          p?.product_name,
          p?.generic_display_name,
          p?.manufacturer,
          p?.strength_display,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      },
    )

  function addItem(item) {
    const p =
      item.products

    const exists =
      items.find(
        (row) =>
          row.product_id ===
          item.product_id,
      )

    if (exists) return

    setItems([
      ...items,
      {
        product_id:
          item.product_id,
        product_name:
          p.product_name,
        paid_packs: 1,
        free_packs: 0,
        loose_units: 0,
        units_per_pack: 1,
        batch_number: '',
        expiry_date: '',
        purchase_rate_per_pack: 0,
        mrp_per_pack:
          Number(
            item.default_selling_price ||
              0,
          ),
        supplier_discount_percent: 0,
        gst_rate:
          Number(
            p.gst_rate || 0,
          ),
      },
    ])

    setSearch('')
  }

  function updateItem(
    index,
    changes,
  ) {
    setItems((current) =>
      current.map(
        (item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...changes,
              }
            : item,
      ),
    )
  }

  function removeItem(index) {
    setItems((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index,
      ),
    )
  }

  const subtotal =
    items.reduce(
      (sum, item) =>
        sum +
        Number(
          item.paid_packs || 0,
        ) *
          Number(
            item.purchase_rate_per_pack ||
              0,
          ),
      0,
    )

  const total =
    subtotal -
    Number(discount || 0) +
    Number(cgst || 0) +
    Number(sgst || 0) +
    Number(igst || 0) +
    Number(otherCharges || 0)

  async function completePurchase() {
    setError('')
    setMessage('')

    if (!supplierId) {
      setError(
        'Select a supplier.',
      )
      return
    }

    if (!invoiceNumber.trim()) {
      setError(
        'Enter the supplier invoice number.',
      )
      return
    }

    if (!items.length) {
      setError(
        'Add at least one product.',
      )
      return
    }

    for (const item of items) {
      if (!item.batch_number) {
        setError(
          `Enter batch number for ${item.product_name}.`,
        )
        return
      }

      if (!item.expiry_date) {
        setError(
          `Enter expiry date for ${item.product_name}.`,
        )
        return
      }

      if (
        Number(
          item.paid_packs || 0,
        ) +
          Number(
            item.free_packs || 0,
          ) +
          Number(
            item.loose_units || 0,
          ) <=
        0
      ) {
        setError(
          `Enter a quantity for ${item.product_name}.`,
        )
        return
      }
    }

    setLoading(true)

    const {
      error: purchaseError,
    } = await supabase.rpc(
      'pharmdesk_complete_purchase',
      {
        p_store_id: store.id,
        p_supplier_id:
          supplierId,
        p_invoice_number:
          invoiceNumber.trim(),
        p_invoice_date:
          invoiceDate,
        p_items: items.map(
          (item) => ({
            product_id:
              item.product_id,
            batch_number:
              item.batch_number,
            expiry_date:
              item.expiry_date,
            units_per_pack:
              Number(
                item.units_per_pack ||
                  1,
              ),
            paid_packs:
              Number(
                item.paid_packs ||
                  0,
              ),
            free_packs:
              Number(
                item.free_packs ||
                  0,
              ),
            loose_units:
              Number(
                item.loose_units ||
                  0,
              ),
            purchase_rate_per_pack:
              Number(
                item.purchase_rate_per_pack ||
                  0,
              ),
            mrp_per_pack:
              Number(
                item.mrp_per_pack ||
                  0,
              ),
            supplier_discount_percent:
              Number(
                item.supplier_discount_percent ||
                  0,
              ),
            gst_rate:
              Number(
                item.gst_rate ||
                  0,
              ),
          }),
        ),
        p_discount_amount:
          Number(
            discount || 0,
          ),
        p_cgst_amount:
          Number(cgst || 0),
        p_sgst_amount:
          Number(sgst || 0),
        p_igst_amount:
          Number(igst || 0),
        p_other_charges:
          Number(
            otherCharges || 0,
          ),
        p_notes: null,
      },
    )

    setLoading(false)

    if (purchaseError) {
      setError(
        purchaseError.message,
      )
      return
    }

    setMessage(
      'Purchase received and stock updated successfully.',
    )

    setSupplierId('')
    setInvoiceNumber('')
    setItems([])
    setDiscount(0)
    setCgst(0)
    setSgst(0)
    setIgst(0)
    setOtherCharges(0)
  }

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Receive supplier invoices and add stock."
      />

      <Message type="success">
        {message}
      </Message>

      <Message type="error">
        {error}
      </Message>

      <section className="panel">
        <div className="form-grid three">
          <Field
            label="Supplier"
            required
          >
            <select
              value={supplierId}
              onChange={(event) =>
                setSupplierId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Select supplier
              </option>

              {suppliers.map(
                (supplier) => (
                  <option
                    key={
                      supplier.id
                    }
                    value={
                      supplier.id
                    }
                  >
                    {
                      supplier.supplier_name
                    }
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field
            label="Supplier invoice number"
            required
          >
            <input
              value={
                invoiceNumber
              }
              onChange={(
                event,
              ) =>
                setInvoiceNumber(
                  event.target
                    .value,
                )
              }
              placeholder="e.g. INV-45821"
            />
          </Field>

          <Field
            label="Invoice date"
            required
          >
            <input
              type="date"
              value={
                invoiceDate
              }
              onChange={(
                event,
              ) =>
                setInvoiceDate(
                  event.target
                    .value,
                )
              }
            />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Products</h2>
            <p>
              Add products appearing on
              the supplier invoice.
            </p>
          </div>
        </div>

        <div className="search-box large-search">
          <span>⌕</span>

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search product or composition..."
          />
        </div>

        {search && (
          <div className="search-results">
            {searchResults
              .slice(0, 8)
              .map((item) => (
                <button
                  className="search-result"
                  key={item.id}
                  onClick={() =>
                    addItem(item)
                  }
                >
                  <div>
                    <strong>
                      {
                        item
                          .products
                          ?.product_name
                      }
                    </strong>

                    <span>
                      {
                        item
                          .products
                          ?.generic_display_name ||
                        ''
                      }
                    </span>
                  </div>
                </button>
              ))}
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            title="No products added"
            description="Search for a product above to add it to the purchase invoice."
          />
        ) : (
          <div className="purchase-items">
            {items.map(
              (item, index) => (
                <div
                  className="purchase-item"
                  key={`${item.product_id}-${index}`}
                >
                  <div className="purchase-item-title">
                    <strong>
                      {
                        item.product_name
                      }
                    </strong>

                    <button
                      className="delete-button"
                      onClick={() =>
                        removeItem(
                          index,
                        )
                      }
                    >
                      ×
                    </button>
                  </div>

                  <div className="form-grid four">
                    <Field
                      label="Batch number"
                      required
                    >
                      <input
                        value={
                          item.batch_number
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              batch_number:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field
                      label="Expiry"
                      required
                    >
                      <input
                        type="date"
                        value={
                          item.expiry_date
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              expiry_date:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="Units / pack">
                      <input
                        type="number"
                        min="1"
                        value={
                          item.units_per_pack
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              units_per_pack:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="Paid packs">
                      <input
                        type="number"
                        min="0"
                        value={
                          item.paid_packs
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              paid_packs:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="Free / scheme">
                      <input
                        type="number"
                        min="0"
                        value={
                          item.free_packs
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              free_packs:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="Loose units">
                      <input
                        type="number"
                        min="0"
                        value={
                          item.loose_units
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              loose_units:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="Purchase rate">
                      <input
                        type="number"
                        min="0"
                        value={
                          item.purchase_rate_per_pack
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              purchase_rate_per_pack:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="MRP">
                      <input
                        type="number"
                        min="0"
                        value={
                          item.mrp_per_pack
                        }
                        onChange={(
                          event,
                        ) =>
                          updateItem(
                            index,
                            {
                              mrp_per_pack:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Invoice totals</h2>
          </div>
        </div>

        <div className="form-grid five">
          <Field label="Discount">
            <input
              type="number"
              min="0"
              value={
                discount
              }
              onChange={(
                event,
              ) =>
                setDiscount(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </Field>

          <Field label="CGST">
            <input
              type="number"
              min="0"
              value={cgst}
              onChange={(
                event,
              ) =>
                setCgst(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </Field>

          <Field label="SGST">
            <input
              type="number"
              min="0"
              value={sgst}
              onChange={(
                event,
              ) =>
                setSgst(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </Field>

          <Field label="IGST">
            <input
              type="number"
              min="0"
              value={igst}
              onChange={(
                event,
              ) =>
                setIgst(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </Field>

          <Field label="Other charges">
            <input
              type="number"
              min="0"
              value={
                otherCharges
              }
              onChange={(
                event,
              ) =>
                setOtherCharges(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </Field>
        </div>

        <div className="purchase-total">
          <span>
            Total purchase
          </span>

          <strong>
            {formatCurrency(
              Math.max(
                0,
                total,
              ),
            )}
          </strong>
        </div>

        <button
          className="primary-button"
          disabled={
            loading ||
            items.length === 0
          }
          onClick={
            completePurchase
          }
        >
          {loading
            ? 'Processing…'
            : 'Complete Purchase'}
        </button>
      </section>
    </>
  )
}

/* =========================================================
   INVENTORY
========================================================= */

function Inventory({ store }) {
  const [products, setProducts] =
    useState([])

  const [search, setSearch] =
    useState('')

  const [activeTab, setActiveTab] =
    useState('Products')

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  async function loadProducts() {
    if (!store?.id) return

    setLoading(true)
    setError('')

    const {
      data,
      error: productsError,
    } = await supabase
      .from('store_products')
      .select(`
        id,
        product_id,
        default_selling_price,
        default_discount_percent,
        minimum_stock,
        reorder_level,
        products (
          id,
          product_name,
          generic_display_name,
          manufacturer,
          dosage_form,
          strength_display,
          pack_quantity,
          pack_unit,
          gst_rate,
          product_categories (
            name
          ),
          compositions (
            name,
            composition_ingredients (
              ingredient_name,
              strength_value,
              strength_unit
            )
          )
        )
      `)
      .eq(
        'store_id',
        store.id,
      )
      .eq(
        'is_active',
        true,
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )

    if (productsError) {
      setError(
        productsError.message,
      )
      setLoading(false)
      return
    }

    setProducts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadProducts()
  }, [store?.id])

  const filteredProducts =
    products.filter(
      (item) => {
        const product =
          item.products

        if (!product) {
          return false
        }

        const q =
          search
            .toLowerCase()
            .trim()

        if (!q) return true

        return [
          product.product_name,
          product.generic_display_name,
          product.manufacturer,
          product.strength_display,
          product.dosage_form,
          product
            .product_categories
            ?.name,
          product.compositions
            ?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      },
    )

  function getComposition(
    product,
  ) {
    if (!product?.compositions) {
      return (
        product?.generic_display_name ||
        '—'
      )
    }

    const ingredients =
      product.compositions
        .composition_ingredients ||
      []

    if (!ingredients.length) {
      return (
        product.compositions
          .name || '—'
      )
    }

    return ingredients
      .map((ingredient) => {
        const strength =
          ingredient.strength_value !=
          null
            ? `${ingredient.strength_value} ${
                ingredient.strength_unit ||
                ''
              }`.trim()
            : ''

        return strength
          ? `${ingredient.ingredient_name} ${strength}`
          : ingredient.ingredient_name
      })
      .join(' + ')
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Inventory"
          description="Manage products, batches, expiry and physical stock."
        />

        <section className="panel">
          <EmptyState
            title="Loading inventory..."
            description="PharmDesk is loading the products for this pharmacy."
          />
        </section>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Manage products, batches, expiry and physical stock."
        action="Add Product"
        onAction={() => {
          setError(
            'Product creation will be connected to the product master in the next backend step.',
          )
        }}
      />

      <Message type="error">
        {error}
      </Message>

      <div className="section-tabs">
        {[
          'Products',
          'Batches',
          'Expiry',
          'Low Stock',
          'Dead Stock',
          'Stock Reconciliation',
        ].map((tab) => (
          <button
            key={tab}
            className={
              activeTab === tab
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveTab(tab)
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Products' ? (
        <section className="panel">
          <div className="search-row">
            <div className="search-box">
              <span>⌕</span>

              <input
                value={search}
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event.target
                      .value,
                  )
                }
                placeholder="Search by product, brand, manufacturer or composition..."
              />
            </div>

            <button className="filter-button">
              Filters
            </button>
          </div>

          {!error &&
            filteredProducts.length ===
              0 && (
              <EmptyState
                title={
                  search
                    ? 'No products found'
                    : 'No products added yet'
                }
                description={
                  search
                    ? 'Try another product name, manufacturer or composition.'
                    : 'Add your first product to start building the pharmacy inventory.'
                }
              />
            )}

          {!error &&
            filteredProducts.length >
              0 && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Product
                      </th>
                      <th>
                        Composition
                      </th>
                      <th>
                        Manufacturer
                      </th>
                      <th>
                        Pack
                      </th>
                      <th>
                        Category
                      </th>
                      <th>
                        Price
                      </th>
                      <th>
                        Discount
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProducts.map(
                      (item) => {
                        const product =
                          item.products

                        return (
                          <tr
                            key={
                              item.id
                            }
                          >
                            <td>
                              <strong>
                                {
                                  product.product_name
                                }
                              </strong>

                              <small>
                                {
                                  product.strength_display
                                }

                                {product.dosage_form
                                  ? ` • ${product.dosage_form}`
                                  : ''}
                              </small>
                            </td>

                            <td>
                              {getComposition(
                                product,
                              )}
                            </td>

                            <td>
                              {product.manufacturer ||
                                '—'}
                            </td>

                            <td>
                              {product.pack_quantity
                                ? `${product.pack_quantity} ${
                                    product.pack_unit ||
                                    ''
                                  }`
                                : '—'}
                            </td>

                            <td>
                              {product
                                .product_categories
                                ?.name ||
                                '—'}
                            </td>

                            <td>
                              {formatCurrency(
                                item.default_selling_price,
                              )}
                            </td>

                            <td>
                              {Number(
                                item.default_discount_percent ||
                                  0,
                              )}
                              %
                            </td>
                          </tr>
                        )
                      },
                    )}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      ) : (
        <section className="panel">
          <EmptyState
            title={`${activeTab} module`}
            description="The section is already part of the PharmDesk navigation. Its database-backed controls will be activated in the next integrated backend step."
          />
        </section>
      )}
    </>
  )
}

/* =========================================================
   CUSTOMERS
========================================================= */

function Customers({ store }) {
  const [customers, setCustomers] =
    useState([])

  const [search, setSearch] =
    useState('')

  const [showForm, setShowForm] =
    useState(false)

  const [name, setName] =
    useState('')

  const [phone, setPhone] =
    useState('')

  const [address, setAddress] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  async function loadCustomers() {
    if (!store?.id) return

    const { data } =
      await supabase
        .from('customers')
        .select(
          'id,name,phone,address,customer_type,created_at',
        )
        .eq(
          'store_id',
          store.id,
        )
        .eq(
          'is_active',
          true,
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        )

    setCustomers(data || [])
  }

  useEffect(() => {
    loadCustomers()
  }, [store?.id])

  async function createCustomer() {
    setError('')

    if (!name.trim()) {
      setError(
        'Customer name is required.',
      )
      return
    }

    if (!phone.trim()) {
      setError(
        'Phone number is required for a named customer.',
      )
      return
    }

    setLoading(true)

    const {
      error: customerError,
    } = await supabase
      .from('customers')
      .insert({
        store_id: store.id,
        customer_type:
          'named',
        name: name.trim(),
        phone: phone.trim(),
        address:
          address.trim() ||
          null,
      })

    setLoading(false)

    if (customerError) {
      setError(
        customerError.message,
      )
      return
    }

    setName('')
    setPhone('')
    setAddress('')
    setShowForm(false)

    loadCustomers()
  }

  const filtered =
    customers.filter(
      (customer) =>
        [
          customer.name,
          customer.phone,
          customer.address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(
            search
              .toLowerCase()
              .trim(),
          ),
    )

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer records, billing history and credit accounts."
        action="Add Customer"
        onAction={() => {
          setError('')
          setShowForm(true)
        }}
      />

      {showForm && (
        <Modal
          title="Add Customer"
          onClose={() =>
            setShowForm(false)
          }
        >
          <Message type="error">
            {error}
          </Message>

          <div className="form-grid">
            <Field
              label="Customer name"
              required
            >
              <input
                value={name}
                onChange={(event) =>
                  setName(
                    event.target
                      .value,
                  )
                }
              />
            </Field>

            <Field
              label="Phone number"
              required
            >
              <input
                value={phone}
                onChange={(event) =>
                  setPhone(
                    event.target
                      .value,
                  )
                }
                inputMode="tel"
              />
            </Field>

            <Field label="Address">
              <textarea
                value={address}
                onChange={(event) =>
                  setAddress(
                    event.target
                      .value,
                  )
                }
              />
            </Field>
          </div>

          <button
            className="primary-button"
            disabled={loading}
            onClick={
              createCustomer
            }
          >
            {loading
              ? 'Saving…'
              : 'Save Customer'}
          </button>
        </Modal>
      )}

      <section className="panel">
        <div className="search-box">
          <span>⌕</span>

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search customers..."
          />
        </div>

        {filtered.length ===
        0 ? (
          <EmptyState
            title="No customers found"
            description="Named customers will appear here."
          />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Type</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(
                  (customer) => (
                    <tr
                      key={
                        customer.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            customer.name
                          }
                        </strong>
                      </td>

                      <td>
                        {customer.phone ||
                          '—'}
                      </td>

                      <td>
                        {customer.address ||
                          '—'}
                      </td>

                      <td>
                        {customer.customer_type ===
                        'named'
                          ? 'Named'
                          : 'Walk-in'}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

/* =========================================================
   REPORTS
========================================================= */

function Reports({ store }) {
  const [fromDate, setFromDate] =
    useState(
      new Date(
        Date.now() -
          6 *
            24 *
            60 *
            60 *
            1000,
      )
        .toISOString()
        .slice(0, 10),
    )

  const [toDate, setToDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10),
    )

  const [salesTotal, setSalesTotal] =
    useState(0)

  const [
    purchaseTotal,
    setPurchaseTotal,
  ] = useState(0)

  const [salesCount, setSalesCount] =
    useState(0)

  const [loading, setLoading] =
    useState(false)

  async function loadReports() {
    if (!store?.id) return

    setLoading(true)

    const start =
      `${fromDate}T00:00:00`

    const end =
      `${toDate}T23:59:59.999`

    const [
      salesResult,
      purchaseResult,
    ] = await Promise.all([
      supabase
        .from('sales')
        .select(
          'grand_total',
          {
            count: 'exact',
          },
        )
        .eq(
          'store_id',
          store.id,
        )
        .eq(
          'status',
          'completed',
        )
        .gte(
          'bill_datetime',
          start,
        )
        .lte(
          'bill_datetime',
          end,
        ),

      supabase
        .from(
          'purchase_invoices',
        )
        .select(
          'total_amount',
        )
        .eq(
          'store_id',
          store.id,
        )
        .gte(
          'invoice_date',
          fromDate,
        )
        .lte(
          'invoice_date',
          toDate,
        ),
    ])

    setSalesTotal(
      (
        salesResult.data ||
        []
      ).reduce(
        (sum, row) =>
          sum +
          Number(
            row.grand_total ||
              0,
          ),
        0,
      ),
    )

    setSalesCount(
      salesResult.count ||
        0,
    )

    setPurchaseTotal(
      (
        purchaseResult.data ||
        []
      ).reduce(
        (sum, row) =>
          sum +
          Number(
            row.total_amount ||
              0,
          ),
        0,
      ),
    )

    setLoading(false)
  }

  useEffect(() => {
    loadReports()
  }, [store?.id])

  return (
    <>
      <PageHeader
        title="Reports"
        description="Review sales, purchases and pharmacy activity."
      />

      <section className="panel">
        <div className="form-grid three">
          <Field label="From">
            <input
              type="date"
              value={fromDate}
              onChange={(
                event,
              ) =>
                setFromDate(
                  event.target
                    .value,
                )
              }
            />
          </Field>

          <Field label="To">
            <input
              type="date"
              value={toDate}
              onChange={(
                event,
              ) =>
                setToDate(
                  event.target
                    .value,
                )
              }
            />
          </Field>

          <div className="field-button">
            <button
              className="primary-button"
              onClick={
                loadReports
              }
            >
              {loading
                ? 'Loading…'
                : 'Run Report'}
            </button>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        <StatCard
          label="Sales"
          value={formatCurrency(
            salesTotal,
          )}
          detail={`${salesCount} completed bills`}
          icon="₹"
        />

        <StatCard
          label="Purchases"
          value={formatCurrency(
            purchaseTotal,
          )}
          detail="Supplier invoices"
          icon="↓"
          tone="green"
        />

        <StatCard
          label="Gross movement"
          value={formatCurrency(
            salesTotal +
              purchaseTotal,
          )}
          detail="Sales + purchases"
          icon="↕"
          tone="purple"
        />
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              Report centre
            </h2>

            <p>
              Reporting modules can be
              expanded without changing
              the dashboard architecture.
            </p>
          </div>
        </div>

        <div className="report-list">
          <div>
            <strong>
              Sales report
            </strong>

            <span>
              Bills, payments,
              discounts and GST.
            </span>
          </div>

          <div>
            <strong>
              Purchase report
            </strong>

            <span>
              Supplier invoices and
              purchase values.
            </span>
          </div>

          <div>
            <strong>
              Stock report
            </strong>

            <span>
              Current inventory and
              stock movements.
            </span>
          </div>

          <div>
            <strong>
              Credit report
            </strong>

            <span>
              Customer outstanding
              balances.
            </span>
          </div>

          <div>
            <strong>
              Supplier dues
            </strong>

            <span>
              Outstanding supplier
              invoices and payments.
            </span>
          </div>
        </div>
      </section>
    </>
  )
}

/* =========================================================
   ALERTS
========================================================= */

function Alerts({ store }) {
  const [alerts, setAlerts] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  async function loadAlerts() {
    if (!store?.id) return

    setLoading(true)

    const { data } =
      await supabase
        .from('alerts')
        .select(
          'id,alert_type,title,message,severity,is_resolved,created_at',
        )
        .eq(
          'store_id',
          store.id,
        )
        .eq(
          'is_resolved',
          false,
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        )

    setAlerts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAlerts()
  }, [store?.id])

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Stock, expiry, payment and system alerts."
      />

      <section className="panel">
        {loading ? (
          <EmptyState
            title="Loading alerts..."
            description="Checking the pharmacy alerts."
          />
        ) : alerts.length ===
          0 ? (
          <EmptyState
            title="No active alerts"
            description="There are currently no unresolved pharmacy alerts."
          />
        ) : (
          <div className="alert-list">
            {alerts.map(
              (alert) => (
                <div
                  className="alert-item"
                  key={alert.id}
                >
                  <div className="alert-symbol">
                    !
                  </div>

                  <div className="alert-content">
                    <strong>
                      {alert.title ||
                        alert.alert_type}
                    </strong>

                    <p>
                      {alert.message ||
                        'Review this alert.'}
                    </p>
                  </div>

                  <span
                    className={`alert-severity ${
                      alert.severity ||
                      'info'
                    }`}
                  >
                    {alert.severity ||
                      'info'}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </>
  )
}

/* =========================================================
   SETTINGS
========================================================= */

function Settings({
  store,
  user,
  role,
}) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Pharmacy and account configuration."
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              Pharmacy
            </h2>

            <p>
              Current store information
            </p>
          </div>
        </div>

        <div className="settings-grid">
          <div>
            <span>Store</span>
            <strong>
              {store?.name ||
                '—'}
            </strong>
          </div>

          <div>
            <span>Phone</span>
            <strong>
              {store?.phone ||
                '—'}
            </strong>
          </div>

          <div>
            <span>Email</span>
            <strong>
              {store?.email ||
                '—'}
            </strong>
          </div>

          <div>
            <span>GSTIN</span>
            <strong>
              {store?.gstin ||
                '—'}
            </strong>
          </div>

          <div>
            <span>
              Drug licence
            </span>

            <strong>
              {store?.drug_license_number ||
                '—'}
            </strong>
          </div>

          <div>
            <span>
              Address
            </span>

            <strong>
              {store?.address ||
                '—'}
            </strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              Current account
            </h2>
          </div>
        </div>

        <div className="settings-grid">
          <div>
            <span>Email</span>

            <strong>
              {user?.email ||
                '—'}
            </strong>
          </div>

          <div>
            <span>Role</span>

            <strong>
              {role ||
                '—'}
            </strong>
          </div>
        </div>
      </section>
    </>
  )
}

/* =========================================================
   MAIN APPLICATION
========================================================= */

function PharmacyApp({
  currentUser,
  onSignOut,
}) {
  const [store, setStore] =
    useState(null)

  const [role, setRole] =
    useState(null)

  const [page, setPage] =
    useState('Dashboard')

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  useEffect(() => {
    loadStore()
  }, [currentUser?.id])

  async function loadStore() {
    if (!currentUser?.id) return

    setLoading(true)
    setError('')

    const {
      data,
      error: membershipError,
    } =
      await supabase
        .from('store_memberships')
        .select(`
          store_id,
          role,
          stores (
            id,
            name,
            address,
            phone,
            email,
            gstin,
            drug_license_number
          )
        `)
        .eq(
          'user_id',
          currentUser.id,
        )
        .eq(
          'is_active',
          true,
        )
        .limit(1)
        .maybeSingle()

    if (membershipError) {
      setError(
        membershipError.message,
      )
      setLoading(false)
      return
    }

    if (!data?.stores) {
      setError(
        'No active pharmacy store is connected to this account.',
      )
      setLoading(false)
      return
    }

    setStore(data.stores)
    setRole(data.role)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-logo">
          P
        </div>

        <strong>
          Loading PharmDesk…
        </strong>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-loading">
        <div className="error-message">
          {error}
        </div>

        <button
          className="secondary-button"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
    )
  }

  const navigation = [
    {
      name: 'Dashboard',
      icon: '⌂',
    },
    {
      name: 'Sales',
      icon: '₹',
    },
    {
      name: 'Purchases',
      icon: '↓',
    },
    {
      name: 'Inventory',
      icon: '▤',
    },
    {
      name: 'Customers',
      icon: '♙',
    },
    {
      name: 'Reports',
      icon: '▥',
    },
    {
      name: 'Alerts',
      icon: '!',
    },
    {
      name: 'Settings',
      icon: '⚙',
    },
  ]

  function navigate(nextPage) {
    setPage(nextPage)
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  function renderPage() {
    switch (page) {
      case 'Dashboard':
        return (
          <Dashboard
            store={store}
            onNavigate={navigate}
          />
        )

      case 'Sales':
        return (
          <Sales
            store={store}
          />
        )

      case 'Purchases':
        return (
          <Purchases
            store={store}
          />
        )

      case 'Inventory':
        return (
          <Inventory
            store={store}
          />
        )

      case 'Customers':
        return (
          <Customers
            store={store}
          />
        )

      case 'Reports':
        return (
          <Reports
            store={store}
          />
        )

      case 'Alerts':
        return (
          <Alerts
            store={store}
          />
        )

      case 'Settings':
        return (
          <Settings
            store={store}
            user={currentUser}
            role={role}
          />
        )

      default:
        return (
          <Dashboard
            store={store}
            onNavigate={navigate}
          />
        )
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            P
          </div>

          <div className="brand-copy">
            <strong>
              PharmDesk
            </strong>

            <span>
              {store?.name ||
                ''}
            </span>
          </div>
        </div>

        <div className="sidebar-connection">
          <span className="status-dot" />
          <span>
            Cloud Connected
          </span>
        </div>

        <nav className="sidebar-nav">
          {navigation.map(
            (item) => (
              <button
                key={item.name}
                className={
                  page ===
                  item.name
                    ? 'nav-item active'
                    : 'nav-item'
                }
                onClick={() =>
                  navigate(
                    item.name,
                  )
                }
              >
                <span className="nav-icon">
                  {item.icon}
                </span>

                <span>
                  {item.name}
                </span>
              </button>
            ),
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-mini">
            <div className="avatar">
              {initials(
                currentUser?.email,
              )}
            </div>

            <div className="user-mini-copy">
              <strong>
                {role ||
                  'User'}
              </strong>

              <span>
                {currentUser?.email ||
                  ''}
              </span>
            </div>
          </div>

          <button
            className="signout-button"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">
              {page}
            </div>

            <div className="topbar-store">
              {store?.name}
            </div>
          </div>

          <div className="topbar-right">
            <div className="global-search">
              <span>⌕</span>

              <input
                placeholder="Search..."
                onFocus={() =>
                  navigate(
                    'Inventory',
                  )
                }
              />
            </div>

            <button
              className="topbar-alert"
              onClick={() =>
                navigate(
                  'Alerts',
                )
              }
              aria-label="Alerts"
            >
              !
            </button>

            <div className="topbar-user">
              <div className="avatar small">
                {initials(
                  currentUser?.email,
                )}
              </div>

              <div>
                <strong>
                  {role ||
                    'User'}
                </strong>

                <span>
                  {store?.name}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="content">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}

/* =========================================================
   LOGIN
========================================================= */

function LoginScreen() {
  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  async function signIn(event) {
    event.preventDefault()

    setLoading(true)
    setError('')

    const {
      error: signInError,
    } =
      await supabase.auth.signInWithPassword(
        {
          email:
            email.trim(),
          password,
        },
      )

    setLoading(false)

    if (signInError) {
      setError(
        signInError.message,
      )
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark large">
            P
          </div>

          <div>
            <strong>
              PharmDesk
            </strong>

            <span>
              Pharmacy Management
            </span>
          </div>
        </div>

        <h1>
          Welcome back
        </h1>

        <p className="login-description">
          Sign in to access your
          pharmacy.
        </p>

        <Message type="error">
          {error}
        </Message>

        <form
          className="login-form"
          onSubmit={signIn}
        >
          <Field
            label="Email"
            required
          >
            <input
              type="email"
              value={email}
              onChange={(
                event,
              ) =>
                setEmail(
                  event.target
                    .value,
                )
              }
              autoComplete="email"
              required
            />
          </Field>

          <Field
            label="Password"
            required
          >
            <input
              type="password"
              value={password}
              onChange={(
                event,
              ) =>
                setPassword(
                  event.target
                    .value,
                )
              }
              autoComplete="current-password"
              required
            />
          </Field>

          <button
            className="primary-button full-width"
            type="submit"
            disabled={
              loading
            }
          >
            {loading
              ? 'Signing in…'
              : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* =========================================================
   ROOT
========================================================= */

function App() {
  const [session, setSession] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(
        ({
          data,
        }) => {
          if (!mounted) return

          setSession(
            data.session,
          )

          setLoading(false)
        },
      )

    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          nextSession,
        ) => {
          setSession(
            nextSession,
          )

          setLoading(false)
        },
      )

    return () => {
      mounted = false

      listener.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-logo">
          P
        </div>

        <strong>
          Loading PharmDesk…
        </strong>
      </div>
    )
  }

  if (!session?.user) {
    return <LoginScreen />
  }

  return (
    <PharmacyApp
      currentUser={
        session.user
      }
      onSignOut={signOut}
    />
  )
}

export default App