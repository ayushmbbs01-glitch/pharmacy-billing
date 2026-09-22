import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

/* =========================================================
   CONSTANTS
========================================================= */

const NAV_ITEMS = [
  'Dashboard',
  'Sales',
  'Purchases',
  'Inventory',
  'Customers',
  'Reports',
  'Alerts',
  'Settings',
]

const INVENTORY_TABS = [
  'Products',
  'Batches',
  'Expiry',
  'Low Stock',
  'Dead Stock',
  'Stock Reconciliation',
]

const SALES_TABS = [
  'New Sale',
  'Draft Bills',
  'Completed Bills',
  'Returns',
  'Customers',
  'Credit',
]

const PURCHASE_TABS = [
  'New Purchase',
  'Supplier Invoices',
  'Pending Payments',
  'Purchase Orders',
  'AI Recommendations',
]

/* =========================================================
   HELPERS
========================================================= */

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const dateText = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN')
}

const dateTimeText = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN')
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s.+/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const levenshtein = (a, b) => {
  a = normalize(a)
  b = normalize(b)
  if (!a) return b.length
  if (!b) return a.length

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]

    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }

    for (let j = 0; j <= b.length; j++) prev[j] = current[j]
  }

  return prev[b.length]
}

const fuzzyScore = (query, text) => {
  const q = normalize(query)
  const t = normalize(text)

  if (!q) return 0
  if (!t) return -Infinity

  if (t === q) return 1000
  if (t.includes(q)) return 800 - t.length / 100

  const qTokens = q.split(/\s+/).filter(Boolean)
  const tTokens = t.split(/\s+/).filter(Boolean)

  let score = 0

  for (const qt of qTokens) {
    let best = Infinity

    for (const tt of tTokens) {
      if (tt.includes(qt) || qt.includes(tt)) {
        best = Math.min(best, 0)
      } else {
        best = Math.min(best, levenshtein(qt, tt))
      }
    }

    if (best <= 1) score += 100
    else if (best <= 2) score += 60
    else if (best <= 3) score += 25
    else score -= 30
  }

  return score
}

const matchesSearch = (query, ...values) => {
  if (!normalize(query)) return true
  const joined = values.filter(Boolean).join(' ')
  return fuzzyScore(query, joined) > 0
}

const emptySaleItem = () => ({
  id: crypto.randomUUID(),
  product: null,
  batch: null,
  batches: [],
  quantity: 1,
  unitType: 'pack',
  unitsPerPack: 1,
  sellingPricePerPack: 0,
  mrpPerPack: 0,
  discountPercent: 0,
  gstRate: 0,
  packagingLevelId: null,
  packagingName: 'Pack',
  stockUnitsPerSaleUnit: 1,
})

const emptyPurchaseItem = () => ({
  id: crypto.randomUUID(),
  product: null,
  batchNumber: '',
  expiryDate: '',
  paidPacks: 0,
  freePacks: 0,
  looseUnits: 0,
  purchaseRatePerPack: 0,
  mrpPerPack: 0,
  supplierDiscountPercent: 0,
  gstRate: 0,
})

const sum = (arr) => arr.reduce((a, b) => a + Number(b || 0), 0)

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await supabase.auth.getSession()

      if (mounted) {
        setSession(data.session || null)
        setLoading(false)
      }
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) return <LoadingScreen />
  if (!session) return <LoginScreen />

  return <PharmacyApp session={session} />
}

/* =========================================================
   AUTH
========================================================= */

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-card">
        <h2>PharmDesk</h2>
        <p>Loading LABDHI PHARMA…</p>
      </div>
    </div>
  )
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const login = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) setError(authError.message)
    setBusy(false)
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={login}>
        <h1>PharmDesk</h1>
        <p>LABDHI PHARMA</p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="error-box">{error}</div>}

        <button disabled={busy} className="primary-button">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

/* =========================================================
   MAIN SHELL
========================================================= */

function PharmacyApp({ session }) {
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [store, setStore] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStore()
  }, [session.user.id])

  const loadStore = async () => {
    setLoading(true)

    const { data: membership } = await supabase
      .from('store_memberships')
      .select('store_id, role')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (membership?.store_id) {
      const { data } = await supabase
        .from('stores')
        .select('*')
        .eq('id', membership.store_id)
        .maybeSingle()

      setStore(data || null)
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    setProfile(userProfile || null)
    setLoading(false)
  }

  if (loading) return <LoadingScreen />

  const renderPage = () => {
    switch (activeNav) {
      case 'Dashboard':
        return <Dashboard store={store} />
      case 'Sales':
        return <SalesModule store={store} session={session} />
      case 'Purchases':
        return <PurchasesModule store={store} session={session} />
      case 'Inventory':
        return <InventoryModule store={store} session={session} />
      case 'Customers':
        return <CustomersModule store={store} />
      case 'Reports':
        return <Reports store={store} />
      case 'Alerts':
        return <AlertsModule store={store} />
      case 'Settings':
        return <SettingsModule store={store} profile={profile} />
      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>PharmDesk</strong>
            <span>{store?.name || 'Pharmacy'}</span>
          </div>
        </div>

        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={activeNav === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <button
          className="logout-button"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </aside>

      <main className="main-content">{renderPage()}</main>
    </div>
  )
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({ store }) {
  const [stats, setStats] = useState({
    sales: 0,
    purchases: 0,
    lowStock: 0,
    expiry: 0,
  })

  useEffect(() => {
    if (!store?.id) return

    const load = async () => {
      const start = todayISO()

      const { data: sales } = await supabase
        .from('sales')
        .select('grand_total')
        .eq('store_id', store.id)
        .eq('status', 'completed')
        .gte('bill_datetime', `${start}T00:00:00`)

      const { data: purchases } = await supabase
        .from('purchase_invoices')
        .select('total_amount')
        .eq('store_id', store.id)
        .eq('invoice_date', start)

      const { data: lowStock } = await supabase
        .from('batches')
        .select('id')
        .eq('store_id', store.id)
        .gt('current_stock_units', 0)

      const expiryLimit = new Date()
      expiryLimit.setDate(expiryLimit.getDate() + 90)

      const { data: expiry } = await supabase
        .from('batches')
        .select('id')
        .eq('store_id', store.id)
        .gt('current_stock_units', 0)
        .lte('expiry_date', expiryLimit.toISOString().slice(0, 10))

      setStats({
        sales: sum((sales || []).map((x) => x.grand_total)),
        purchases: sum((purchases || []).map((x) => x.total_amount)),
        lowStock: lowStock?.length || 0,
        expiry: expiry?.length || 0,
      })
    }

    load()
  }, [store?.id])

  return (
    <div>
      <ModuleHeader
        title="Dashboard"
        subtitle={store?.name || 'Pharmacy overview'}
      />

      <div className="stats-grid">
        <StatCard title="Today's Sales" value={money(stats.sales)} />
        <StatCard title="Today's Purchases" value={money(stats.purchases)} />
        <StatCard title="Stock Batches" value={stats.lowStock} />
        <StatCard title="Near Expiry" value={stats.expiry} />
      </div>

      <PanelList title="PharmDesk">
        <p className="muted">
          Your pharmacy data is stored in Supabase and is not dependent on the
          browser remaining open.
        </p>
      </PanelList>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div className="stat-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  )
}

/* =========================================================
   SALES
========================================================= */

function SalesModule({ store, session }) {
  const [tab, setTab] = useState('New Sale')

  return (
    <div>
      <ModuleHeader
        title="Sales"
        subtitle="Billing, customers, returns and credit"
      />

      <TabBar tabs={SALES_TABS} active={tab} onChange={setTab} />

      {tab === 'New Sale' && <NewSale store={store} session={session} />}
      {tab === 'Draft Bills' && <DraftBills store={store} />}
      {tab === 'Completed Bills' && <CompletedBills store={store} />}
      {tab === 'Returns' && <SalesReturns store={store} />}
      {tab === 'Customers' && <CustomerHistoryList store={store} />}
      {tab === 'Credit' && <CustomerCredit store={store} />}
    </div>
  )
}

function NewSale({ store, session }) {
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [items, setItems] = useState([emptySaleItem()])
  const [payments, setPayments] = useState([{ method: 'cash', amount: 0 }])
  const [billDiscount, setBillDiscount] = useState(0)
  const [billDate, setBillDate] = useState(todayISO())
  const [customerModal, setCustomerModal] = useState(false)
  const [productModal, setProductModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [alternatives, setAlternatives] = useState([])

  useEffect(() => {
    if (!store?.id) return
    loadCustomers()
    loadProducts()
  }, [store?.id])

  const loadCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('name')

    setCustomers(data || [])
  }

  const loadProducts = async () => {
    const { data } = await supabase
      .from('store_products')
      .select(`
        *,
        products (
          id,
          product_name,
          generic_display_name,
          composition_id,
          manufacturer,
          dosage_form,
          gst_rate,
          is_active
        )
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)

    setProducts(
      (data || [])
        .filter((x) => x.products?.is_active !== false)
        .map((x) => ({
          ...x.products,
          storeProductId: x.id,
          default_selling_price: x.default_selling_price,
          default_discount_percent: x.default_discount_percent,
          minimum_stock: x.minimum_stock,
          reorder_level: x.reorder_level,
        })),
    )
  }

  const filteredCustomers = useMemo(() => {
    return customers
      .filter((c) =>
        matchesSearch(customerQuery, c.name, c.phone, c.address),
      )
      .slice(0, 10)
  }, [customers, customerQuery])

  const filteredProducts = useMemo(() => {
    return products
      .map((p) => ({
        p,
        score: fuzzyScore(
          productQuery,
          `${p.product_name} ${p.generic_display_name || ''} ${
            p.manufacturer || ''
          }`,
        ),
      }))
      .filter((x) => !productQuery || x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.p)
  }, [products, productQuery])

  const chooseProduct = async (product) => {
    setProductQuery('')

    const { data: batches } = await supabase
      .from('batches')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', product.id)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .order('expiry_date', { ascending: true })

    const available = batches || []

    const batch = available[0] || null

    const newItem = {
      ...emptySaleItem(),
      product,
      batches: available,
      batch,
      unitsPerPack: batch?.units_per_pack || 1,
      sellingPricePerPack:
        Number(product.default_selling_price || batch?.mrp_per_pack || 0),
      mrpPerPack: Number(batch?.mrp_per_pack || 0),
      discountPercent: Number(product.default_discount_percent || 0),
      gstRate: Number(product.gst_rate || 0),
    }

    setItems((current) => {
      const existingEmpty =
        current.length === 1 && !current[0].product ? 0 : -1

      if (existingEmpty === 0) return [newItem]
      return [...current, newItem]
    })

    if (product.composition_id) {
      const { data } = await supabase
        .from('store_products')
        .select(`
          id,
          default_selling_price,
          products (
            id,
            product_name,
            generic_display_name,
            composition_id,
            manufacturer,
            dosage_form
          )
        `)
        .eq('store_id', store.id)
        .eq('is_active', true)

      setAlternatives(
        (data || [])
          .map((x) => x.products)
          .filter(
            (x) =>
              x?.composition_id === product.composition_id &&
              x.id !== product.id,
          ),
      )
    } else {
      setAlternatives([])
    }
  }

  const updateItem = (id, patch) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  const removeItem = (id) => {
    setItems((current) => {
      const next = current.filter((x) => x.id !== id)
      return next.length ? next : [emptySaleItem()]
    })
  }

  const subtotal = sum(
    items
      .filter((x) => x.product)
      .map(
        (x) =>
          Number(x.quantity || 0) *
          Number(x.sellingPricePerPack || 0),
      ),
  )

  const itemDiscount = sum(
    items
      .filter((x) => x.product)
      .map(
        (x) =>
          Number(x.quantity || 0) *
          Number(x.sellingPricePerPack || 0) *
          (Number(x.discountPercent || 0) / 100),
      ),
  )

  const taxableBeforeBillDiscount = Math.max(
    0,
    subtotal - itemDiscount,
  )

  const finalTaxable = Math.max(
    0,
    taxableBeforeBillDiscount - Number(billDiscount || 0),
  )

  const gst = sum(
    items
      .filter((x) => x.product)
      .map((x) => {
        const line =
          Number(x.quantity || 0) *
          Number(x.sellingPricePerPack || 0) *
          (1 - Number(x.discountPercent || 0) / 100)

        const share =
          taxableBeforeBillDiscount > 0
            ? line / taxableBeforeBillDiscount
            : 0

        return (
          Math.max(0, finalTaxable) *
          share *
          (Number(x.gstRate || 0) / 100)
        )
      }),
  )

  const grandTotal = finalTaxable + gst
  const paidAmount = sum(payments.map((x) => x.amount))
  const dueAmount = Math.max(0, grandTotal - paidAmount)

  const saveSale = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const validItems = items.filter((x) => x.product)

      if (!validItems.length) throw new Error('Add at least one product.')

      for (const item of validItems) {
        if (!item.batch?.id) {
          throw new Error(
            `Select a batch for ${item.product.product_name}.`,
          )
        }

        if (Number(item.quantity) <= 0) {
          throw new Error(
            `Quantity must be greater than zero for ${item.product.product_name}.`,
          )
        }
      }

      const saleItems = validItems.map((item) => ({
        product_id: item.product.id,
        batch_id: item.batch.id,
        sale_unit_type: item.unitType,
        quantity_entered: Number(item.quantity),
        units_per_pack: Number(item.unitsPerPack || 1),
        mrp_per_pack: Number(item.mrpPerPack || 0),
        selling_price_per_pack: Number(
          item.sellingPricePerPack || 0,
        ),
        discount_percent: Number(item.discountPercent || 0),
        gst_rate: Number(item.gstRate || 0),
      }))

      const paymentRows = payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({
          payment_method: p.method,
          amount: Number(p.amount),
        }))

      const { data, error } = await supabase.rpc(
        'pharmdesk_complete_sale',
        {
          p_store_id: store.id,
          p_customer_id: selectedCustomer?.id || null,
          p_customer_type: selectedCustomer ? 'named' : 'walk_in',
          p_bill_datetime: `${billDate}T${new Date()
            .toTimeString()
            .slice(0, 8)}`,
          p_bill_discount_amount: Number(billDiscount || 0),
          p_items: saleItems,
          p_payments: paymentRows,
        },
      )

      if (error) throw error

      setMessage(`Sale completed successfully: ${data}`)
      setSelectedCustomer(null)
      setItems([emptySaleItem()])
      setPayments([{ method: 'cash', amount: 0 }])
      setBillDiscount(0)
      setAlternatives([])
    } catch (error) {
      setMessage(error.message || 'Unable to complete sale.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={saveSale}>
      <div className="two-column">
        <div>
          <PanelList title="Customer">
            <div className="search-row">
              <input
                value={
                  selectedCustomer
                    ? `${selectedCustomer.name} • ${selectedCustomer.phone || ''}`
                    : customerQuery
                }
                placeholder="Search customer by name or phone"
                onChange={(e) => {
                  setSelectedCustomer(null)
                  setCustomerQuery(e.target.value)
                }}
              />

              <button
                type="button"
                className="secondary-button"
                onClick={() => setCustomerModal(true)}
              >
                + Add Customer
              </button>
            </div>

            {!selectedCustomer && customerQuery && (
              <div className="suggestion-list">
                {filteredCustomers.map((customer) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer)
                      setCustomerQuery('')
                    }}
                  >
                    <strong>{customer.name}</strong>
                    <span>{customer.phone || 'No phone'}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedCustomer && (
              <div className="selected-record">
                <strong>{selectedCustomer.name}</strong>
                <span>{selectedCustomer.phone || 'No phone'}</span>
              </div>
            )}

            {!selectedCustomer && !customerQuery && (
              <div className="muted">
                Walk-in customer. A named customer can be selected above.
              </div>
            )}
          </PanelList>

          <PanelList title="Products">
            <div className="search-row">
              <input
                value={productQuery}
                placeholder="Search medicine, composition, manufacturer…"
                onChange={(e) => setProductQuery(e.target.value)}
              />

              <button
                type="button"
                className="secondary-button"
                onClick={() => setProductModal(true)}
              >
                + Add New Product
              </button>
            </div>

            {productQuery && (
              <div className="suggestion-list">
                {filteredProducts.map((product) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={product.id}
                    onClick={() => chooseProduct(product)}
                  >
                    <strong>{product.product_name}</strong>
                    <span>
                      {product.generic_display_name ||
                        product.manufacturer ||
                        product.dosage_form ||
                        ''}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {alternatives.length > 0 && (
              <div className="alternative-box">
                <strong>Other brands with the same composition</strong>

                <div className="chip-row">
                  {alternatives.map((p) => (
                    <button
                      type="button"
                      className="chip"
                      key={p.id}
                      onClick={() => chooseProduct(p)}
                    >
                      {p.product_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PanelList>

          <PanelList title="Bill Items">
            {items.map((item) => (
              <SaleItemRow
                key={item.id}
                item={item}
                onChange={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </PanelList>
        </div>

        <div>
          <PanelList title="Bill Details">
            <label>
              Bill date
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
              />
            </label>

            <label>
              Bill discount
              <input
                type="number"
                min="0"
                step="0.01"
                value={billDiscount}
                onChange={(e) => setBillDiscount(e.target.value)}
              />
            </label>

            <div className="totals">
              <div>
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <div>
                <span>Item discounts</span>
                <strong>{money(itemDiscount)}</strong>
              </div>
              <div>
                <span>Bill discount</span>
                <strong>{money(billDiscount)}</strong>
              </div>
              <div>
                <span>GST</span>
                <strong>{money(gst)}</strong>
              </div>
              <div className="grand-total">
                <span>Total</span>
                <strong>{money(grandTotal)}</strong>
              </div>
            </div>
          </PanelList>

          <PanelList title="Payments">
            {payments.map((payment, index) => (
              <div className="payment-row" key={index}>
                <select
                  value={payment.method}
                  onChange={(e) => {
                    const next = [...payments]
                    next[index] = {
                      ...next[index],
                      method: e.target.value,
                    }
                    setPayments(next)
                  }}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="credit">Credit</option>
                </select>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payment.amount}
                  onChange={(e) => {
                    const next = [...payments]
                    next[index] = {
                      ...next[index],
                      amount: e.target.value,
                    }
                    setPayments(next)
                  }}
                />

                {payments.length > 1 && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      setPayments(
                        payments.filter((_, i) => i !== index),
                      )
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setPayments([
                  ...payments,
                  { method: 'upi', amount: 0 },
                ])
              }
            >
              + Split Payment
            </button>

            <div className="payment-summary">
              <div>
                <span>Paid</span>
                <strong>{money(paidAmount)}</strong>
              </div>
              <div>
                <span>Due</span>
                <strong>{money(dueAmount)}</strong>
              </div>
            </div>
          </PanelList>

          {message && (
            <div className="message-box">{message}</div>
          )}

          <button
            className="primary-button large"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Completing sale…' : `Complete Sale • ${money(grandTotal)}`}
          </button>
        </div>
      </div>

      {customerModal && (
        <CustomerModal
          store={store}
          onClose={() => setCustomerModal(false)}
          onCreated={(customer) => {
            setCustomers((x) => [customer, ...x])
            setSelectedCustomer(customer)
            setCustomerModal(false)
          }}
        />
      )}

      {productModal && (
        <ProductModal
          store={store}
          onClose={() => setProductModal(false)}
          onCreated={(product) => {
            loadProductsAfterCreate(
              product,
              products,
              setProducts,
            )
            setProductModal(false)
          }}
        />
      )}
    </form>
  )
}

async function loadProductsAfterCreate(product, current, setter) {
  const { data } = await supabase
    .from('store_products')
    .select(`
      *,
      products (
        id,
        product_name,
        generic_display_name,
        composition_id,
        manufacturer,
        dosage_form,
        gst_rate,
        is_active
      )
    `)
    .eq('product_id', product.id)
    .limit(1)
    .maybeSingle()

  if (data?.products) {
    setter([
      {
        ...data.products,
        storeProductId: data.id,
        default_selling_price: data.default_selling_price,
        default_discount_percent: data.default_discount_percent,
        minimum_stock: data.minimum_stock,
        reorder_level: data.reorder_level,
      },
      ...current.filter((x) => x.id !== product.id),
    ])
  }
}

function SaleItemRow({ item, onChange, onRemove }) {
  const lineTotal =
    Number(item.quantity || 0) *
    Number(item.sellingPricePerPack || 0) *
    (1 - Number(item.discountPercent || 0) / 100)

  return (
    <div className="transaction-item">
      <div className="item-title">
        <strong>{item.product?.product_name || 'Product not selected'}</strong>

        {item.product?.generic_display_name && (
          <span>{item.product.generic_display_name}</span>
        )}
      </div>

      {item.product && (
        <div className="item-grid">
          <label>
            Batch
            <select
              value={item.batch?.id || ''}
              onChange={(e) => {
                const batch = item.batches.find(
                  (b) => b.id === e.target.value,
                )

                onChange({
                  batch,
                  unitsPerPack: batch?.units_per_pack || 1,
                  mrpPerPack: batch?.mrp_per_pack || 0,
                })
              }}
            >
              <option value="">Select batch</option>

              {item.batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batch_number} • Exp {dateText(batch.expiry_date)} •
                  Stock {batch.current_stock_units}
                </option>
              ))}
            </select>
          </label>

          <label>
            Sale type
            <select
              value={item.unitType}
              onChange={(e) =>
                onChange({ unitType: e.target.value })
              }
            >
              <option value="pack">Strip / Pack</option>
              <option value="unit">Tablet / Unit</option>
            </select>
          </label>

          <label>
            Quantity
            <input
              type="number"
              min="0.01"
              value={item.quantity}
              onChange={(e) =>
                onChange({ quantity: e.target.value })
              }
            />
          </label>

          <label>
            Selling price
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.sellingPricePerPack}
              onChange={(e) =>
                onChange({
                  sellingPricePerPack: e.target.value,
                })
              }
            />
          </label>

          <label>
            Discount %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={item.discountPercent}
              onChange={(e) =>
                onChange({
                  discountPercent: e.target.value,
                })
              }
            />
          </label>

          <label>
            GST %
            <input
              type="number"
              min="0"
              max="100"
              value={item.gstRate}
              onChange={(e) =>
                onChange({ gstRate: e.target.value })
              }
            />
          </label>
        </div>
      )}

      <div className="item-footer">
        <strong>{money(lineTotal)}</strong>

        <button
          type="button"
          className="danger-button"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

/* =========================================================
   CUSTOMER HISTORY
========================================================= */

function CustomerHistoryList({ store }) {
  const [customers, setCustomers] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('customers')
      .select('*')
      .eq('store_id', store.id)
      .order('name')
      .then(({ data }) => setCustomers(data || []))
  }, [store?.id])

  const filtered = customers.filter((c) =>
    matchesSearch(query, c.name, c.phone),
  )

  return (
    <PanelList title="Customers">
      <input
        placeholder="Search customer"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="record-list">
        {filtered.map((customer) => (
          <button
            className="record-row"
            key={customer.id}
            onClick={() => setSelected(customer)}
          >
            <div>
              <strong>{customer.name || 'Walk-in Customer'}</strong>
              <span>{customer.phone || 'No phone'}</span>
            </div>

            <span>View history →</span>
          </button>
        ))}
      </div>

      {selected && (
        <CustomerHistoryModal
          customer={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </PanelList>
  )
}

function CustomerHistoryModal({ customer, onClose }) {
  const [sales, setSales] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [customer.id])

  const loadHistory = async () => {
    setLoading(true)

    const { data: salesData } = await supabase
      .from('sales')
      .select(
        'id, invoice_number, bill_datetime, grand_total, amount_paid, amount_due, status',
      )
      .eq('customer_id', customer.id)
      .order('bill_datetime', { ascending: false })

    const saleRows = salesData || []
    setSales(saleRows)

    if (saleRows.length) {
      const { data: itemRows } = await supabase
        .from('sale_items')
        .select(`
          *,
          products (
            id,
            product_name,
            generic_display_name
          ),
          batches (
            batch_number,
            expiry_date
          )
        `)
        .in(
          'sale_id',
          saleRows.map((x) => x.id),
        )

      setItems(itemRows || [])
    } else {
      setItems([])
    }

    setLoading(false)
  }

  const medicineHistory = useMemo(() => {
    const map = new Map()

    for (const item of items) {
      const product = item.products
      if (!product) continue

      const key = product.id

      if (!map.has(key)) {
        map.set(key, {
          product,
          quantity: 0,
          lastDate: null,
          lastPrice: 0,
        })
      }

      const entry = map.get(key)
      entry.quantity += Number(item.quantity_entered || 0)
      entry.lastPrice = Number(
        item.selling_price_per_pack || 0,
      )

      const sale = sales.find((s) => s.id === item.sale_id)

      if (
        sale &&
        (!entry.lastDate ||
          new Date(sale.bill_datetime) >
            new Date(entry.lastDate))
      ) {
        entry.lastDate = sale.bill_datetime
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.lastDate || 0) -
        new Date(a.lastDate || 0),
    )
  }, [items, sales])

  return (
    <Modal title={`${customer.name} • Purchase History`} onClose={onClose}>
      {loading ? (
        <LoadingInline />
      ) : (
        <>
          <div className="history-header">
            <strong>{customer.name}</strong>
            <span>{customer.phone || 'No phone'}</span>
          </div>

          <h3>Medicines previously purchased</h3>

          <div className="record-list">
            {medicineHistory.length === 0 && (
              <EmptyState text="No previous medicine purchases found." />
            )}

            {medicineHistory.map((entry) => (
              <div className="record-row static" key={entry.product.id}>
                <div>
                  <strong>{entry.product.product_name}</strong>
                  <span>
                    {entry.product.generic_display_name || ''}
                  </span>
                </div>

                <div className="record-right">
                  <span>
                    Qty: {entry.quantity}
                  </span>
                  <span>
                    Last: {dateText(entry.lastDate)}
                  </span>
                  <strong>{money(entry.lastPrice)}</strong>
                </div>
              </div>
            ))}
          </div>

          <h3>Previous bills</h3>

          <div className="record-list">
            {sales.map((sale) => (
              <div className="record-row static" key={sale.id}>
                <div>
                  <strong>{sale.invoice_number}</strong>
                  <span>{dateTimeText(sale.bill_datetime)}</span>
                </div>

                <div className="record-right">
                  <span>{sale.status}</span>
                  <strong>{money(sale.grand_total)}</strong>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

/* =========================================================
   SALES LISTS
========================================================= */

function DraftBills({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('sales')
      .select('*')
      .eq('store_id', store.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Draft Bills">
      {rows.length === 0 ? (
        <EmptyState text="No cloud-saved draft bills yet." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div className="record-row static" key={row.id}>
              <div>
                <strong>{row.invoice_number || 'Draft'}</strong>
                <span>{dateTimeText(row.created_at)}</span>
              </div>
              <strong>{money(row.grand_total)}</strong>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

function CompletedBills({ store }) {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('sales')
      .select('*')
      .eq('store_id', store.id)
      .in('status', ['completed', 'returned'])
      .order('bill_datetime', { ascending: false })
      .limit(200)
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  const filtered = rows.filter((x) =>
    matchesSearch(
      query,
      x.invoice_number,
      x.bill_datetime,
      x.status,
    ),
  )

  return (
    <PanelList title="Completed Bills">
      <input
        placeholder="Search invoice"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="record-list">
        {filtered.map((row) => (
          <div className="record-row static" key={row.id}>
            <div>
              <strong>{row.invoice_number}</strong>
              <span>{dateTimeText(row.bill_datetime)}</span>
            </div>

            <div className="record-right">
              <span>{row.status}</span>
              <strong>{money(row.grand_total)}</strong>
            </div>
          </div>
        ))}
      </div>
    </PanelList>
  )
}

function SalesReturns({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('sales_returns')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Sales Returns">
      {rows.length === 0 ? (
        <EmptyState text="No sales returns recorded." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div className="record-row static" key={row.id}>
              <div>
                <strong>{row.id.slice(0, 8)}</strong>
                <span>{dateTimeText(row.created_at)}</span>
              </div>
              <strong>{money(row.refund_amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

function CustomerCredit({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('customer_credit_transactions')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Customer Credit">
      {rows.length === 0 ? (
        <EmptyState text="No credit transactions." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div className="record-row static" key={row.id}>
              <div>
                <strong>{row.transaction_type}</strong>
                <span>{dateTimeText(row.created_at)}</span>
              </div>
              <strong>{money(row.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

/* =========================================================
   PURCHASES
========================================================= */

function PurchasesModule({ store }) {
  const [tab, setTab] = useState('New Purchase')

  return (
    <div>
      <ModuleHeader
        title="Purchases"
        subtitle="Supplier invoices, stock intake and purchase planning"
      />

      <TabBar tabs={PURCHASE_TABS} active={tab} onChange={setTab} />

      {tab === 'New Purchase' && <NewPurchase store={store} />}
      {tab === 'Supplier Invoices' && <SupplierInvoices store={store} />}
      {tab === 'Pending Payments' && (
        <PendingSupplierPayments store={store} />
      )}
      {tab === 'Purchase Orders' && (
        <PurchaseOrders store={store} />
      )}
      {tab === 'AI Recommendations' && (
        <AIRecommendations store={store} />
      )}
    </div>
  )
}

function NewPurchase({ store }) {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [supplierQuery, setSupplierQuery] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayISO())
  const [items, setItems] = useState([emptyPurchaseItem()])
  const [supplierModal, setSupplierModal] = useState(false)
  const [productModal, setProductModal] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!store?.id) return

    loadSuppliers()
    loadProducts()
  }, [store?.id])

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('supplier_name')

    setSuppliers(data || [])
  }

  const loadProducts = async () => {
    const { data } = await supabase
      .from('store_products')
      .select(`
        *,
        products (
          id,
          product_name,
          generic_display_name,
          manufacturer,
          composition_id,
          gst_rate,
          is_active
        )
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)

    setProducts(
      (data || [])
        .filter((x) => x.products?.is_active !== false)
        .map((x) => ({
          ...x.products,
          default_selling_price: x.default_selling_price,
          default_discount_percent: x.default_discount_percent,
        })),
    )
  }

  const supplierResults = suppliers
    .filter((x) =>
      matchesSearch(
        supplierQuery,
        x.supplier_name,
        x.phone,
        x.email,
        x.gstin,
        x.drug_license_number,
      ),
    )
    .slice(0, 10)

  const productResults = products
    .map((p) => ({
      p,
      score: fuzzyScore(
        productQuery,
        `${p.product_name} ${p.generic_display_name || ''} ${
          p.manufacturer || ''
        }`,
      ),
    }))
    .filter((x) => !productQuery || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.p)

  const chooseProduct = (product) => {
    setProductQuery('')

    setItems((current) => {
      const item = {
        ...emptyPurchaseItem(),
        product,
        gstRate: Number(product.gst_rate || 0),
      }

      if (
        current.length === 1 &&
        !current[0].product
      ) {
        return [item]
      }

      return [...current, item]
    })
  }

  const updateItem = (id, patch) => {
    setItems((current) =>
      current.map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    )
  }

  const removeItem = (id) => {
    setItems((current) => {
      const next = current.filter((x) => x.id !== id)
      return next.length ? next : [emptyPurchaseItem()]
    })
  }

  const subtotal = sum(
    items.map((item) => {
      const packs =
        Number(item.paidPacks || 0) +
        Number(item.freePacks || 0)

      const rate = Number(item.purchaseRatePerPack || 0)

      return Number(item.paidPacks || 0) * rate
    }),
  )

  const completePurchase = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      if (!selectedSupplier) {
        throw new Error('Select a supplier.')
      }

      if (!invoiceNumber.trim()) {
        throw new Error('Invoice number is required.')
      }

      const validItems = items.filter((x) => x.product)

      if (!validItems.length) {
        throw new Error('Add at least one product.')
      }

      const payload = validItems.map((item) => ({
        product_id: item.product.id,
        batch_number: item.batchNumber,
        expiry_date: item.expiryDate,
        paid_packs: Number(item.paidPacks || 0),
        free_packs: Number(item.freePacks || 0),
        loose_units: Number(item.looseUnits || 0),
        purchase_rate_per_pack: Number(
          item.purchaseRatePerPack || 0,
        ),
        mrp_per_pack: Number(item.mrpPerPack || 0),
        supplier_discount_percent: Number(
          item.supplierDiscountPercent || 0,
        ),
        gst_rate: Number(item.gstRate || 0),
        units_per_pack: Number(
          item.unitsPerPack || 1,
        ),
      }))

      const { data, error } = await supabase.rpc(
        'pharmdesk_complete_purchase',
        {
          p_store_id: store.id,
          p_supplier_id: selectedSupplier.id,
          p_invoice_number: invoiceNumber.trim(),
          p_invoice_date: invoiceDate,
          p_items: payload,
        },
      )

      if (error) throw error

      setMessage(`Purchase completed successfully: ${data}`)
      setInvoiceNumber('')
      setItems([emptyPurchaseItem()])
    } catch (error) {
      setMessage(error.message || 'Unable to complete purchase.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={completePurchase}>
      <div className="two-column">
        <div>
          <PanelList title="Purchase Party / Supplier">
            <div className="search-row">
              <input
                value={
                  selectedSupplier
                    ? selectedSupplier.supplier_name
                    : supplierQuery
                }
                placeholder="Search supplier"
                onChange={(e) => {
                  setSelectedSupplier(null)
                  setSupplierQuery(e.target.value)
                }}
              />

              <button
                type="button"
                className="secondary-button"
                onClick={() => setSupplierModal(true)}
              >
                + Add Purchase Party
              </button>
            </div>

            {!selectedSupplier && supplierQuery && (
              <div className="suggestion-list">
                {supplierResults.map((supplier) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={supplier.id}
                    onClick={() => {
                      setSelectedSupplier(supplier)
                      setSupplierQuery('')
                    }}
                  >
                    <strong>{supplier.supplier_name}</strong>
                    <span>{supplier.phone || ''}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedSupplier && (
              <div className="selected-record">
                <strong>
                  {selectedSupplier.supplier_name}
                </strong>
                <span>
                  {selectedSupplier.phone || 'No phone'}
                </span>
              </div>
            )}
          </PanelList>

          <PanelList title="Products">
            <div className="search-row">
              <input
                value={productQuery}
                placeholder="Search product"
                onChange={(e) => setProductQuery(e.target.value)}
              />

              <button
                type="button"
                className="secondary-button"
                onClick={() => setProductModal(true)}
              >
                + Add New Product
              </button>
            </div>

            {productQuery && (
              <div className="suggestion-list">
                {productResults.map((product) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={product.id}
                    onClick={() => chooseProduct(product)}
                  >
                    <strong>{product.product_name}</strong>
                    <span>
                      {product.generic_display_name ||
                        product.manufacturer ||
                        ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </PanelList>

          <PanelList title="Purchase Items">
            {items.map((item) => (
              <PurchaseItemRow
                key={item.id}
                item={item}
                onChange={(patch) =>
                  updateItem(item.id, patch)
                }
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </PanelList>
        </div>

        <div>
          <PanelList title="Invoice">
            <label>
              Invoice number
              <input
                value={invoiceNumber}
                onChange={(e) =>
                  setInvoiceNumber(e.target.value)
                }
                required
              />
            </label>

            <label>
              Invoice date
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) =>
                  setInvoiceDate(e.target.value)
                }
              />
            </label>

            <div className="totals">
              <div className="grand-total">
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
            </div>
          </PanelList>

          {message && (
            <div className="message-box">{message}</div>
          )}

          <button
            className="primary-button large"
            type="submit"
            disabled={busy}
          >
            {busy
              ? 'Completing purchase…'
              : `Complete Purchase • ${money(subtotal)}`}
          </button>
        </div>
      </div>

      {supplierModal && (
        <SupplierModal
          store={store}
          onClose={() => setSupplierModal(false)}
          onCreated={(supplier) => {
            setSuppliers((x) => [supplier, ...x])
            setSelectedSupplier(supplier)
            setSupplierModal(false)
          }}
        />
      )}

      {productModal && (
        <ProductModal
          store={store}
          onClose={() => setProductModal(false)}
          onCreated={(product) => {
            setProductModal(false)
            loadProductsAfterCreate(
              product,
              products,
              setProducts,
            )
          }}
        />
      )}
    </form>
  )
}

function PurchaseItemRow({ item, onChange, onRemove }) {
  const paid =
    Number(item.paidPacks || 0) *
    Number(item.purchaseRatePerPack || 0)

  return (
    <div className="transaction-item">
      <div className="item-title">
        <strong>
          {item.product?.product_name || 'Product not selected'}
        </strong>
      </div>

      {item.product && (
        <div className="item-grid">
          <label>
            Batch
            <input
              value={item.batchNumber}
              onChange={(e) =>
                onChange({ batchNumber: e.target.value })
              }
              placeholder="Batch number"
            />
          </label>

          <label>
            Expiry
            <input
              type="date"
              value={item.expiryDate}
              onChange={(e) =>
                onChange({ expiryDate: e.target.value })
              }
            />
          </label>

          <label>
            Units / pack
            <input
              type="number"
              min="1"
              value={item.unitsPerPack || 1}
              onChange={(e) =>
                onChange({
                  unitsPerPack: e.target.value,
                })
              }
            />
          </label>

          <label>
            Paid packs
            <input
              type="number"
              min="0"
              value={item.paidPacks}
              onChange={(e) =>
                onChange({ paidPacks: e.target.value })
              }
            />
          </label>

          <label>
            Free packs
            <input
              type="number"
              min="0"
              value={item.freePacks}
              onChange={(e) =>
                onChange({ freePacks: e.target.value })
              }
            />
          </label>

          <label>
            Loose units
            <input
              type="number"
              min="0"
              value={item.looseUnits}
              onChange={(e) =>
                onChange({ looseUnits: e.target.value })
              }
            />
          </label>

          <label>
            Purchase rate
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.purchaseRatePerPack}
              onChange={(e) =>
                onChange({
                  purchaseRatePerPack: e.target.value,
                })
              }
            />
          </label>

          <label>
            MRP / pack
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.mrpPerPack}
              onChange={(e) =>
                onChange({
                  mrpPerPack: e.target.value,
                })
              }
            />
          </label>

          <label>
            GST %
            <input
              type="number"
              min="0"
              max="100"
              value={item.gstRate}
              onChange={(e) =>
                onChange({ gstRate: e.target.value })
              }
            />
          </label>
        </div>
      )}

      <div className="item-footer">
        <strong>{money(paid)}</strong>

        <button
          type="button"
          className="danger-button"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

/* =========================================================
   SUPPLIER HISTORY
========================================================= */

function SupplierInvoices({ store }) {
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('purchase_invoices')
      .select(`
        *,
        suppliers (
          supplier_name
        )
      `)
      .eq('store_id', store.id)
      .order('invoice_date', { ascending: false })
      .limit(200)
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Supplier Invoices">
      <div className="record-list">
        {rows.map((row) => (
          <button
            className="record-row"
            key={row.id}
            onClick={() => setSelected(row.suppliers)}
          >
            <div>
              <strong>{row.invoice_number}</strong>
              <span>
                {row.suppliers?.supplier_name || 'Supplier'}
              </span>
            </div>

            <div className="record-right">
              <span>{dateText(row.invoice_date)}</span>
              <strong>{money(row.total_amount)}</strong>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <SupplierHistoryModal
          supplier={selected}
          store={store}
          onClose={() => setSelected(null)}
        />
      )}
    </PanelList>
  )
}

function SupplierHistoryModal({ supplier, store, onClose }) {
  const [invoices, setInvoices] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [supplier?.id])

  const loadHistory = async () => {
    if (!supplier?.id) {
      setLoading(false)
      return
    }

    setLoading(true)

    const { data: invoiceRows } = await supabase
      .from('purchase_invoices')
      .select(
        'id, invoice_number, invoice_date, total_amount, payment_status',
      )
      .eq('store_id', store.id)
      .eq('supplier_id', supplier.id)
      .order('invoice_date', { ascending: false })

    setInvoices(invoiceRows || [])

    if (invoiceRows?.length) {
      const { data: itemRows } = await supabase
        .from('purchase_items')
        .select(`
          *,
          products (
            id,
            product_name,
            generic_display_name
          ),
          batches (
            batch_number,
            expiry_date
          )
        `)
        .in(
          'purchase_invoice_id',
          invoiceRows.map((x) => x.id),
        )

      setItems(itemRows || [])
    }

    setLoading(false)
  }

  const productHistory = useMemo(() => {
    const map = new Map()

    for (const item of items) {
      if (!item.products) continue

      const key = item.products.id

      if (!map.has(key)) {
        map.set(key, {
          product: item.products,
          packs: 0,
          lastRate: 0,
          lastDate: null,
          lastBatch: null,
        })
      }

      const entry = map.get(key)

      entry.packs +=
        Number(item.paid_packs || 0) +
        Number(item.free_packs || 0)

      entry.lastRate = Number(
        item.purchase_rate_per_pack || 0,
      )

      entry.lastBatch =
        item.batches?.batch_number ||
        item.batch_number ||
        null

      const invoice = invoices.find(
        (x) => x.id === item.purchase_invoice_id,
      )

      if (
        invoice &&
        (!entry.lastDate ||
          new Date(invoice.invoice_date) >
            new Date(entry.lastDate))
      ) {
        entry.lastDate = invoice.invoice_date
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.lastDate || 0) -
        new Date(a.lastDate || 0),
    )
  }, [items, invoices])

  return (
    <Modal
      title={`${supplier.supplier_name} • Purchase History`}
      onClose={onClose}
    >
      {loading ? (
        <LoadingInline />
      ) : (
        <>
          <h3>Products previously purchased from this supplier</h3>

          <div className="record-list">
            {productHistory.length === 0 && (
              <EmptyState text="No previous purchases found." />
            )}

            {productHistory.map((entry) => (
              <div
                className="record-row static"
                key={entry.product.id}
              >
                <div>
                  <strong>
                    {entry.product.product_name}
                  </strong>
                  <span>
                    {entry.product.generic_display_name || ''}
                  </span>
                </div>

                <div className="record-right">
                  <span>
                    Qty: {entry.packs} packs
                  </span>
                  <span>
                    Last: {dateText(entry.lastDate)}
                  </span>
                  <span>
                    Batch: {entry.lastBatch || '—'}
                  </span>
                  <strong>
                    {money(entry.lastRate)}
                  </strong>
                </div>
              </div>
            ))}
          </div>

          <h3>Previous invoices</h3>

          <div className="record-list">
            {invoices.map((invoice) => (
              <div
                className="record-row static"
                key={invoice.id}
              >
                <div>
                  <strong>{invoice.invoice_number}</strong>
                  <span>
                    {dateText(invoice.invoice_date)}
                  </span>
                </div>

                <div className="record-right">
                  <span>{invoice.payment_status}</span>
                  <strong>
                    {money(invoice.total_amount)}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

function PendingSupplierPayments({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('purchase_invoices')
      .select(`
        *,
        suppliers (
          supplier_name
        )
      `)
      .eq('store_id', store.id)
      .in('payment_status', ['pending', 'partial', 'due'])
      .order('invoice_date', { ascending: true })
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Pending Supplier Payments">
      {rows.length === 0 ? (
        <EmptyState text="No pending supplier payments." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div
              className="record-row static"
              key={row.id}
            >
              <div>
                <strong>
                  {row.suppliers?.supplier_name || 'Supplier'}
                </strong>
                <span>{row.invoice_number}</span>
              </div>

              <strong>{money(row.total_amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

function PurchaseOrders({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('purchase_orders')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Purchase Orders">
      {rows.length === 0 ? (
        <EmptyState text="No purchase orders yet." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div
              className="record-row static"
              key={row.id}
            >
              <div>
                <strong>
                  {row.order_number || row.id.slice(0, 8)}
                </strong>
                <span>{row.status}</span>
              </div>
              <strong>{money(row.total_amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

function AIRecommendations({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('ai_purchase_recommendations')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="AI Purchase Recommendations">
      {rows.length === 0 ? (
        <EmptyState text="No AI purchase recommendations have been generated yet." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div
              className="record-row static"
              key={row.id}
            >
              <div>
                <strong>
                  {row.product_name ||
                    row.product_id ||
                    'Product'}
                </strong>
                <span>
                  Suggested quantity:{' '}
                  {row.recommended_quantity ??
                    row.suggested_quantity ??
                    '—'}
                </span>
              </div>

              <span>{row.status || 'pending'}</span>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

/* =========================================================
   INVENTORY
========================================================= */

function InventoryModule({ store }) {
  const [tab, setTab] = useState('Products')

  return (
    <div>
      <ModuleHeader
        title="Inventory"
        subtitle="Products, batches, expiry and reconciliation"
      />

      <TabBar
        tabs={INVENTORY_TABS}
        active={tab}
        onChange={setTab}
      />

      {tab === 'Products' && (
        <ProductsInventory store={store} />
      )}
      {tab === 'Batches' && (
        <BatchesInventory store={store} />
      )}
      {tab === 'Expiry' && (
        <ExpiryInventory store={store} />
      )}
      {tab === 'Low Stock' && (
        <LowStockInventory store={store} />
      )}
      {tab === 'Dead Stock' && (
        <DeadStockInventory store={store} />
      )}
      {tab === 'Stock Reconciliation' && (
        <StockReconciliation store={store} />
      )}
    </div>
  )
}

function ProductsInventory({ store }) {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('store_products')
      .select(`
        *,
        products (
          *
        )
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    setRows(data || [])
  }

  useEffect(() => {
    if (store?.id) load()
  }, [store?.id])

  const filtered = rows.filter((row) =>
    matchesSearch(
      query,
      row.products?.product_name,
      row.products?.generic_display_name,
      row.products?.manufacturer,
      row.products?.strength_display,
    ),
  )

  return (
    <PanelList title="Products">
      <div className="search-row">
        <input
          placeholder="Search product"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <button
          className="primary-button"
          onClick={() => setEditing({})}
        >
          + Product
        </button>
      </div>

      <div className="record-list">
        {filtered.map((row) => (
          <div className="record-row static" key={row.id}>
            <div>
              <strong>
                {row.products?.product_name}
              </strong>
              <span>
                {row.products?.generic_display_name ||
                  row.products?.manufacturer ||
                  '—'}
              </span>
            </div>

            <div className="record-right">
              <span>
                Discount: {row.default_discount_percent || 0}%
              </span>

              <strong>
                {money(row.default_selling_price)}
              </strong>

              <button
                className="secondary-button"
                onClick={() =>
                  setEditing({
                    ...row.products,
                    default_selling_price:
                      row.default_selling_price,
                    default_discount_percent:
                      row.default_discount_percent,
                    minimum_stock: row.minimum_stock,
                    reorder_level: row.reorder_level,
                  })
                }
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <ProductModal
          store={store}
          product={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </PanelList>
  )
}

function BatchesInventory({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('batches')
      .select(`
        *,
        products (
          product_name
        )
      `)
      .eq('store_id', store.id)
      .order('expiry_date')
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Batches">
      <div className="record-list">
        {rows.map((row) => (
          <div
            className="record-row static"
            key={row.id}
          >
            <div>
              <strong>
                {row.products?.product_name || 'Product'}
              </strong>
              <span>
                Batch {row.batch_number} • Exp{' '}
                {dateText(row.expiry_date)}
              </span>
            </div>

            <div className="record-right">
              <span>Stock</span>
              <strong>{row.current_stock_units}</strong>
            </div>
          </div>
        ))}
      </div>
    </PanelList>
  )
}

function ExpiryInventory({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    const limit = new Date()
    limit.setDate(limit.getDate() + 90)

    supabase
      .from('batches')
      .select(`
        *,
        products (
          product_name
        )
      `)
      .eq('store_id', store.id)
      .gt('current_stock_units', 0)
      .lte(
        'expiry_date',
        limit.toISOString().slice(0, 10),
      )
      .order('expiry_date')
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Expiry">
      <div className="record-list">
        {rows.map((row) => (
          <div
            className="record-row static"
            key={row.id}
          >
            <div>
              <strong>
                {row.products?.product_name}
              </strong>
              <span>
                Batch {row.batch_number}
              </span>
            </div>

            <div className="record-right">
              <span>{dateText(row.expiry_date)}</span>
              <strong>
                {row.current_stock_units}
              </strong>
            </div>
          </div>
        ))}
      </div>
    </PanelList>
  )
}

function LowStockInventory({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    const load = async () => {
      const { data } = await supabase
        .from('store_products')
        .select(`
          *,
          products (
            product_name
          )
        `)
        .eq('store_id', store.id)
        .eq('is_active', true)

      const result = []

      for (const row of data || []) {
        const { data: batches } = await supabase
          .from('batches')
          .select('current_stock_units')
          .eq('store_id', store.id)
          .eq('product_id', row.product_id)
          .eq('is_active', true)

        const stock = sum(
          (batches || []).map(
            (x) => x.current_stock_units,
          ),
        )

        if (stock <= Number(row.minimum_stock || 0)) {
          result.push({
            ...row,
            stock,
          })
        }
      }

      setRows(result)
    }

    load()
  }, [store?.id])

  return (
    <PanelList title="Low Stock">
      {rows.length === 0 ? (
        <EmptyState text="No products currently below minimum stock." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div
              className="record-row static"
              key={row.id}
            >
              <div>
                <strong>
                  {row.products?.product_name}
                </strong>
                <span>
                  Minimum {row.minimum_stock}
                </span>
              </div>

              <strong>{row.stock}</strong>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

function DeadStockInventory({ store }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('stock_risk_snapshots')
      .select('*')
      .eq('store_id', store.id)
      .eq('risk_type', 'dead_stock')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [store?.id])

  return (
    <PanelList title="Dead Stock">
      {rows.length === 0 ? (
        <EmptyState text="No dead-stock snapshots available." />
      ) : (
        <div className="record-list">
          {rows.map((row) => (
            <div
              className="record-row static"
              key={row.id}
            >
              <div>
                <strong>
                  {row.product_name ||
                    row.product_id ||
                    'Product'}
                </strong>
                <span>
                  {dateText(row.created_at)}
                </span>
              </div>

              <span>{row.current_stock_units}</span>
            </div>
          ))}
        </div>
      )}
    </PanelList>
  )
}

function StockReconciliation({ store }) {
  const [batches, setBatches] = useState([])
  const [selectedBatch, setSelectedBatch] = useState('')
  const [physical, setPhysical] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('batches')
      .select(`
        *,
        products (
          product_name
        )
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => setBatches(data || []))
  }, [store?.id])

  const selected = batches.find(
    (x) => x.id === selectedBatch,
  )

  const save = async () => {
    setMessage('')

    if (!selected) {
      setMessage('Select a batch.')
      return
    }

    const physicalNumber = Number(physical)

    if (!Number.isFinite(physicalNumber) || physicalNumber < 0) {
      setMessage('Enter a valid physical quantity.')
      return
    }

    const difference =
      physicalNumber -
      Number(selected.current_stock_units || 0)

    const { error } = await supabase
      .from('stock_reconciliations')
      .insert({
        store_id: store.id,
        batch_id: selected.id,
        system_stock_units:
          selected.current_stock_units,
        physical_stock_units: physicalNumber,
        difference_units: difference,
      })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(
      `Reconciliation recorded. Difference: ${difference}`,
    )
  }

  return (
    <PanelList title="Stock Reconciliation">
      <label>
        Batch
        <select
          value={selectedBatch}
          onChange={(e) => setSelectedBatch(e.target.value)}
        >
          <option value="">Select batch</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.products?.product_name} •{' '}
              {batch.batch_number} • Stock{' '}
              {batch.current_stock_units}
            </option>
          ))}
        </select>
      </label>

      <label>
        Physical stock
        <input
          type="number"
          min="0"
          value={physical}
          onChange={(e) => setPhysical(e.target.value)}
        />
      </label>

      {selected && (
        <div className="info-box">
          System stock: {selected.current_stock_units}
        </div>
      )}

      {message && <div className="message-box">{message}</div>}

      <button
        className="primary-button"
        onClick={save}
      >
        Record Reconciliation
      </button>

      <p className="muted">
        This records the reconciliation event. Actual stock
        adjustment should be performed through the dedicated
        stock-adjustment backend operation rather than silently
        changing the batch from the browser.
      </p>
    </PanelList>
  )
}

/* =========================================================
   CUSTOMERS
========================================================= */

function CustomersModule({ store }) {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [history, setHistory] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', store.id)
      .order('name')

    setRows(data || [])
  }

  useEffect(() => {
    if (store?.id) load()
  }, [store?.id])

  const filtered = rows.filter((x) =>
    matchesSearch(query, x.name, x.phone),
  )

  return (
    <div>
      <ModuleHeader
        title="Customers"
        subtitle="Customer records and purchase history"
      />

      <PanelList title="Customers">
        <div className="search-row">
          <input
            placeholder="Search customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <button
            className="primary-button"
            onClick={() => setModal(true)}
          >
            + Customer
          </button>
        </div>

        <div className="record-list">
          {filtered.map((customer) => (
            <div
              className="record-row static"
              key={customer.id}
            >
              <div>
                <strong>
                  {customer.name || 'Walk-in Customer'}
                </strong>
                <span>{customer.phone || '—'}</span>
              </div>

              <div className="record-right">
                <button
                  className="secondary-button"
                  onClick={() => setHistory(customer)}
                >
                  History
                </button>
              </div>
            </div>
          ))}
        </div>
      </PanelList>

      {modal && (
        <CustomerModal
          store={store}
          onClose={() => setModal(false)}
          onCreated={(customer) => {
            setRows((x) => [customer, ...x])
            setModal(false)
          }}
        />
      )}

      {history && (
        <CustomerHistoryModal
          customer={history}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  )
}

/* =========================================================
   REPORTS
========================================================= */

function Reports({ store }) {
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])

  const load = async () => {
    const { data: salesRows } = await supabase
      .from('sales')
      .select('*')
      .eq('store_id', store.id)
      .eq('status', 'completed')
      .gte('bill_datetime', `${from}T00:00:00`)
      .lte('bill_datetime', `${to}T23:59:59`)

    const { data: purchaseRows } = await supabase
      .from('purchase_invoices')
      .select('*')
      .eq('store_id', store.id)
      .gte('invoice_date', from)
      .lte('invoice_date', to)

    setSales(salesRows || [])
    setPurchases(purchaseRows || [])
  }

  useEffect(() => {
    if (store?.id) load()
  }, [store?.id])

  return (
    <div>
      <ModuleHeader
        title="Reports"
        subtitle="Sales and purchase overview"
      />

      <PanelList title="Date Range">
        <div className="inline-fields">
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>

          <button className="primary-button" onClick={load}>
            Refresh
          </button>
        </div>
      </PanelList>

      <div className="stats-grid">
        <StatCard
          title="Sales"
          value={money(
            sum(sales.map((x) => x.grand_total)),
          )}
        />
        <StatCard
          title="Purchases"
          value={money(
            sum(purchases.map((x) => x.total_amount)),
          )}
        />
        <StatCard
          title="Bills"
          value={sales.length}
        />
        <StatCard
          title="Purchase Invoices"
          value={purchases.length}
        />
      </div>
    </div>
  )
}

/* =========================================================
   ALERTS
========================================================= */

function AlertsModule({ store }) {
  const [rows, setRows] = useState([])

  const load = async () => {
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })

    setRows(data || [])
  }

  useEffect(() => {
    if (store?.id) load()
  }, [store?.id])

  const resolve = async (id) => {
    await supabase
      .from('alerts')
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)

    load()
  }

  return (
    <div>
      <ModuleHeader
        title="Alerts"
        subtitle="Expiry, stock and system alerts"
      />

      <PanelList title="Active Alerts">
        {rows.length === 0 ? (
          <EmptyState text="No unresolved alerts." />
        ) : (
          <div className="record-list">
            {rows.map((row) => (
              <div
                className="record-row static"
                key={row.id}
              >
                <div>
                  <strong>{row.alert_type}</strong>
                  <span>
                    {row.title ||
                      row.message ||
                      row.description ||
                      'Alert'}
                  </span>
                </div>

                <button
                  className="secondary-button"
                  onClick={() => resolve(row.id)}
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}
      </PanelList>
    </div>
  )
}

/* =========================================================
   SETTINGS
========================================================= */

function SettingsModule({ store, profile }) {
  const [currency, setCurrency] = useState('INR')
  const [expiryDays, setExpiryDays] = useState(90)
  const [deadStockDays, setDeadStockDays] = useState(60)
  const [allowPastDated, setAllowPastDated] = useState(true)
  const [allowWalkIn, setAllowWalkIn] = useState(true)
  const [salespersonRequired, setSalespersonRequired] =
    useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('store_settings')
      .select('*')
      .eq('store_id', store.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return

        setCurrency(data.currency || 'INR')
        setExpiryDays(data.expiry_alert_days ?? 90)
        setDeadStockDays(
          data.dead_stock_days ?? 60,
        )
        setAllowPastDated(
          data.allow_past_dated_bills ?? true,
        )
        setAllowWalkIn(
          data.allow_walk_in_customers ?? true,
        )
        setSalespersonRequired(
          data.salesperson_required ?? false,
        )
      })
  }, [store?.id])

  const save = async () => {
    const { error } = await supabase
      .from('store_settings')
      .upsert({
        store_id: store.id,
        currency,
        expiry_alert_days: Number(expiryDays),
        dead_stock_days: Number(deadStockDays),
        allow_past_dated_bills: allowPastDated,
        allow_walk_in_customers: allowWalkIn,
        salesperson_required: salespersonRequired,
        updated_at: new Date().toISOString(),
      })

    setMessage(
      error
        ? error.message
        : 'Settings saved successfully.',
    )
  }

  return (
    <div>
      <ModuleHeader
        title="Settings"
        subtitle={store?.name || 'Store settings'}
      />

      <PanelList title="Store">
        <div className="form-grid">
          <label>
            Store name
            <input value={store?.name || ''} disabled />
          </label>

          <label>
            Currency
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>

          <label>
            Expiry alert days
            <input
              type="number"
              min="1"
              value={expiryDays}
              onChange={(e) =>
                setExpiryDays(e.target.value)
              }
            />
          </label>

          <label>
            Dead stock days
            <input
              type="number"
              min="1"
              value={deadStockDays}
              onChange={(e) =>
                setDeadStockDays(e.target.value)
              }
            />
          </label>
        </div>

        <ToggleRow
          label="Allow walk-in customers"
          checked={allowWalkIn}
          onChange={setAllowWalkIn}
        />

        <ToggleRow
          label="Allow past-dated bills"
          checked={allowPastDated}
          onChange={setAllowPastDated}
        />

        <ToggleRow
          label="Require salesperson"
          checked={salespersonRequired}
          onChange={setSalespersonRequired}
        />

        {message && (
          <div className="message-box">{message}</div>
        )}

        <button
          className="primary-button"
          onClick={save}
        >
          Save Settings
        </button>
      </PanelList>

      <PanelList title="Signed-in User">
        <div className="history-header">
          <strong>{profile?.full_name || 'User'}</strong>
          <span>{profile?.phone || ''}</span>
        </div>
      </PanelList>
    </div>
  )
}

/* =========================================================
   CUSTOMER MODAL
========================================================= */

function CustomerModal({ store, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      if (!name.trim()) {
        throw new Error('Customer name is required.')
      }

      if (!phone.trim()) {
        throw new Error('Customer phone number is required.')
      }

      const payload = {
        store_id: store.id,
        customer_type: 'named',
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim() || null,
        is_active: true,
      }

      let result = await supabase
        .from('customers')
        .insert(payload)
        .select()
        .single()

      if (result.error) throw result.error

      onCreated(result.data)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add Customer" onClose={onClose}>
      <form onSubmit={save}>
        <label>
          Customer name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label>
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>

        <label>
          Address
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <ModalActions
          onClose={onClose}
          busy={busy}
          label="Save Customer"
        />
      </form>
    </Modal>
  )
}

/* =========================================================
   SUPPLIER MODAL
========================================================= */

function SupplierModal({ store, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [license, setLicense] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [gstin, setGstin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      if (!name.trim()) {
        throw new Error('Supplier name is required.')
      }

      const modernPayload = {
        store_id: store.id,
        supplier_name: name.trim(),
        drug_license_number: license.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        gstin: gstin.trim() || null,
        is_active: true,
      }

      let result = await supabase
        .from('suppliers')
        .insert(modernPayload)
        .select()
        .single()

      /*
       * The currently verified schema may still contain the old
       * contact_person column. If so, retry without the newer
       * drug_license_number field so supplier creation itself does
       * not become unusable.
       */
      if (
        result.error &&
        /drug_license_number|column/i.test(
          result.error.message || '',
        )
      ) {
        result = await supabase
          .from('suppliers')
          .insert({
            store_id: store.id,
            supplier_name: name.trim(),
            contact_person: license.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            address: address.trim() || null,
            gstin: gstin.trim() || null,
            is_active: true,
          })
          .select()
          .single()
      }

      if (result.error) throw result.error

      onCreated(result.data)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add Purchase Party" onClose={onClose}>
      <form onSubmit={save}>
        <label>
          Supplier / purchase party
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label>
          Drug licence number
          <input
            value={license}
            onChange={(e) => setLicense(e.target.value)}
          />
        </label>

        <label>
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          GSTIN
          <input
            value={gstin}
            onChange={(e) => setGstin(e.target.value)}
          />
        </label>

        <label>
          Address
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <ModalActions
          onClose={onClose}
          busy={busy}
          label="Save Purchase Party"
        />
      </form>
    </Modal>
  )
}

/* =========================================================
   COMPOSITION MODAL
========================================================= */

function CompositionModal({
  onClose,
  onCreated,
  initialComposition = null,
}) {
  const [dosageForm, setDosageForm] = useState(
    initialComposition?.dosage_form || '',
  )
  const [source, setSource] = useState(
    initialComposition?.source || 'manual',
  )
  const [sourceReference, setSourceReference] =
    useState(
      initialComposition?.source_reference || '',
    )

  const [ingredients, setIngredients] = useState(
    initialComposition?.ingredients?.length
      ? initialComposition.ingredients
      : [
          {
            ingredient_name: '',
            strength_value: '',
            strength_unit: 'mg',
            sequence_number: 1,
          },
        ],
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const updateIngredient = (index, patch) => {
    setIngredients((current) =>
      current.map((x, i) =>
        i === index ? { ...x, ...patch } : x,
      ),
    )
  }

  const addIngredient = () => {
    setIngredients((current) => [
      ...current,
      {
        ingredient_name: '',
        strength_value: '',
        strength_unit: 'mg',
        sequence_number: current.length + 1,
      },
    ])
  }

  const removeIngredient = (index) => {
    setIngredients((current) =>
      current
        .filter((_, i) => i !== index)
        .map((x, i) => ({
          ...x,
          sequence_number: i + 1,
        })),
    )
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      const clean = ingredients
        .filter((x) => x.ingredient_name.trim())
        .map((x, i) => ({
          ingredient_name: x.ingredient_name.trim(),
          strength_value: Number(x.strength_value),
          strength_unit: x.strength_unit,
          sequence_number: i + 1,
        }))

      if (!clean.length) {
        throw new Error('Add at least one ingredient.')
      }

      const { data, error: rpcError } =
        await supabase.rpc(
          'pharmdesk_save_composition',
          {
            p_composition_id:
              initialComposition?.id || null,
            p_dosage_form:
              dosageForm.trim() || null,
            p_source: source,
            p_source_reference:
              sourceReference.trim() || null,
            p_ingredients: clean,
          },
        )

      if (rpcError) throw rpcError

      onCreated(data)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Composition" onClose={onClose}>
      <form onSubmit={save}>
        <label>
          Dosage form
          <input
            value={dosageForm}
            onChange={(e) =>
              setDosageForm(e.target.value)
            }
            placeholder="Tablet / Capsule / Syrup"
          />
        </label>

        <label>
          Source
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>

        <label>
          Source reference
          <input
            value={sourceReference}
            onChange={(e) =>
              setSourceReference(e.target.value)
            }
          />
        </label>

        <h3>Ingredients</h3>

        {ingredients.map((ingredient, index) => (
          <div
            className="ingredient-row"
            key={index}
          >
            <input
              placeholder="Ingredient"
              value={ingredient.ingredient_name}
              onChange={(e) =>
                updateIngredient(index, {
                  ingredient_name: e.target.value,
                })
              }
            />

            <input
              type="number"
              min="0"
              step="any"
              placeholder="Strength"
              value={ingredient.strength_value}
              onChange={(e) =>
                updateIngredient(index, {
                  strength_value: e.target.value,
                })
              }
            />

            <input
              placeholder="Unit"
              value={ingredient.strength_unit}
              onChange={(e) =>
                updateIngredient(index, {
                  strength_unit: e.target.value,
                })
              }
            />

            {ingredients.length > 1 && (
              <button
                type="button"
                className="danger-button"
                onClick={() =>
                  removeIngredient(index)
                }
              >
                ×
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          className="secondary-button"
          onClick={addIngredient}
        >
          + Ingredient
        </button>

        {error && <div className="error-box">{error}</div>}

        <ModalActions
          onClose={onClose}
          busy={busy}
          label="Save Composition"
        />
      </form>
    </Modal>
  )
}

/* =========================================================
   PRODUCT MODAL
========================================================= */

function ProductModal({
  store,
  product = null,
  onClose,
  onCreated,
}) {
  const editing = Boolean(product?.id)

  const [categories, setCategories] = useState([])
  const [compositions, setCompositions] = useState([])
  const [compositionQuery, setCompositionQuery] =
    useState('')
  const [selectedComposition, setSelectedComposition] =
    useState(null)
  const [compositionModal, setCompositionModal] =
    useState(false)

  const [name, setName] = useState(
    product?.product_name || '',
  )
  const [manufacturer, setManufacturer] = useState(
    product?.manufacturer || '',
  )
  const [dosageForm, setDosageForm] = useState(
    product?.dosage_form || '',
  )
  const [categoryId, setCategoryId] = useState(
    product?.category_id || '',
  )
  const [hsn, setHsn] = useState(
    product?.hsn_code || '',
  )
  const [gst, setGst] = useState(
    product?.gst_rate ?? 0,
  )
  const [sellingPrice, setSellingPrice] =
    useState(
      product?.default_selling_price ?? 0,
    )
  const [discount, setDiscount] = useState(
    product?.default_discount_percent ?? 0,
  )
  const [minimumStock, setMinimumStock] =
    useState(product?.minimum_stock ?? 0)
  const [reorderLevel, setReorderLevel] =
    useState(product?.reorder_level ?? 0)

  const [packagingName, setPackagingName] =
    useState('Standard')

  const [packagingLevels, setPackagingLevels] =
    useState([
      {
        level_number: 1,
        unit_name: 'Tablet',
        units_per_parent: 1,
        is_purchase_unit: true,
        is_sale_unit: true,
        is_preferred_sale_unit: true,
        is_stock_unit: true,
      },
    ])

  const [existingPackagingId, setExistingPackagingId] =
    useState(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadMasterData()
  }, [store?.id, product?.id])

  const loadMasterData = async () => {
    const [{ data: categoryRows }, { data: compositionRows }] =
      await Promise.all([
        supabase
          .from('product_categories')
          .select('*')
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('compositions')
          .select(`
            *,
            composition_ingredients (
              ingredient_name,
              strength_value,
              strength_unit,
              sequence_number
            )
          `)
          .eq('is_active', true)
          .order('name'),
      ])

    setCategories(categoryRows || [])
    setCompositions(compositionRows || [])

    if (product?.composition_id) {
      const found = (compositionRows || []).find(
        (x) => x.id === product.composition_id,
      )

      if (found) setSelectedComposition(found)
    }

    if (product?.id) {
      const { data: configs } = await supabase
        .from('product_packaging_configs')
        .select(`
          *,
          product_packaging_levels (*)
        `)
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('is_default', {
          ascending: false,
        })
        .limit(1)

      const config = configs?.[0]

      if (config) {
        setExistingPackagingId(config.id)
        setPackagingName(config.name || 'Standard')

        const levels =
          config.product_packaging_levels
            ?.slice()
            .sort(
              (a, b) =>
                a.level_number - b.level_number,
            )

        if (levels?.length) {
          setPackagingLevels(levels)
        }
      }
    }
  }

  const filteredCompositions = compositions
    .map((composition) => ({
      composition,
      score: fuzzyScore(
        compositionQuery,
        [
          composition.name,
          ...(composition.composition_ingredients || []).map(
            (x) => x.ingredient_name,
          ),
        ].join(' '),
      ),
    }))
    .filter(
      (x) =>
        !compositionQuery ||
        x.score > 0,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => x.composition)

  const updatePackagingLevel = (
    index,
    patch,
  ) => {
    setPackagingLevels((current) =>
      current.map((x, i) =>
        i === index ? { ...x, ...patch } : x,
      ),
    )
  }

  const addPackagingLevel = () => {
    setPackagingLevels((current) => {
      const nextLevel = current.length + 1

      return [
        ...current.map((x) => ({
          ...x,
          is_stock_unit: false,
        })),
        {
          level_number: nextLevel,
          unit_name: '',
          units_per_parent: 1,
          is_purchase_unit: false,
          is_sale_unit: true,
          is_preferred_sale_unit: false,
          is_stock_unit: true,
        },
      ]
    })
  }

  const removePackagingLevel = (index) => {
    if (packagingLevels.length === 1) return

    setPackagingLevels((current) =>
      current
        .filter((_, i) => i !== index)
        .map((x, i) => ({
          ...x,
          level_number: i + 1,
          is_stock_unit:
            i === current.length - 2,
        })),
    )
  }

  const validatePackaging = () => {
    if (!packagingLevels.length) {
      throw new Error('Add at least one packaging level.')
    }

    const names = new Set()

    for (const level of packagingLevels) {
      if (!level.unit_name.trim()) {
        throw new Error(
          'Every packaging level needs a unit name.',
        )
      }

      const normalized = normalize(
        level.unit_name,
      )

      if (names.has(normalized)) {
        throw new Error(
          'Packaging unit names must be unique.',
        )
      }

      names.add(normalized)

      if (
        Number(level.units_per_parent) <= 0
      ) {
        throw new Error(
          'Units per parent must be greater than zero.',
        )
      }
    }

    const purchaseUnits =
      packagingLevels.filter(
        (x) => x.is_purchase_unit,
      )

    const stockUnits =
      packagingLevels.filter(
        (x) => x.is_stock_unit,
      )

    const preferredUnits =
      packagingLevels.filter(
        (x) => x.is_preferred_sale_unit,
      )

    if (purchaseUnits.length !== 1) {
      throw new Error(
        'Select exactly one purchase unit.',
      )
    }

    if (stockUnits.length !== 1) {
      throw new Error(
        'Select exactly one stock unit.',
      )
    }

    if (preferredUnits.length > 1) {
      throw new Error(
        'Select at most one preferred sale unit.',
      )
    }

    const stockIndex =
      packagingLevels.findIndex(
        (x) => x.is_stock_unit,
      )

    if (
      stockIndex !==
      packagingLevels.length - 1
    ) {
      throw new Error(
        'The stock unit must be the lowest packaging level.',
      )
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      if (!name.trim()) {
        throw new Error('Product name is required.')
      }

      if (
        Number(gst) < 0 ||
        Number(gst) > 100
      ) {
        throw new Error(
          'GST must be between 0 and 100.',
        )
      }

      if (
        Number(discount) < 0 ||
        Number(discount) > 100
      ) {
        throw new Error(
          'Discount must be between 0 and 100.',
        )
      }

      if (!selectedComposition) {
        throw new Error(
          'Select a composition or create one.',
        )
      }

      validatePackaging()

      const { data: productId, error: productError } =
        await supabase.rpc(
          'pharmdesk_save_product',
          {
            p_store_id: store.id,
            p_product_id: product?.id || null,
            p_product_name: name.trim(),
            p_generic_display_name:
              selectedComposition.name,
            p_category_id:
              categoryId || null,
            p_composition_id:
              selectedComposition.id,
            p_manufacturer:
              manufacturer.trim() || null,
            p_dosage_form:
              dosageForm.trim() || null,
            p_strength_display: null,
            p_pack_quantity: 1,
            p_pack_unit:
              packagingLevels[
                packagingLevels.length - 1
              ].unit_name,
            p_hsn_code:
              hsn.trim() || null,
            p_gst_rate: Number(gst || 0),
            p_default_selling_price:
              Number(sellingPrice || 0),
            p_default_discount_percent:
              Number(discount || 0),
            p_minimum_stock:
              Number(minimumStock || 0),
            p_reorder_level:
              Number(reorderLevel || 0),
            p_is_active: true,
          },
        )

      if (productError) throw productError

      const { error: packagingError } =
        await supabase.rpc(
          'pharmdesk_save_packaging_config',
          {
            p_store_id: store.id,
            p_product_id: productId,
            p_config_name:
              packagingName.trim() ||
              'Standard',
            p_levels: packagingLevels.map(
              (x, index) => ({
                ...x,
                level_number: index + 1,
                units_per_parent:
                  Number(
                    x.units_per_parent || 1,
                  ),
              }),
            ),
            p_packaging_config_id:
              existingPackagingId || null,
          },
        )

      if (packagingError) {
        throw packagingError
      }

      onCreated({ id: productId })
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={
        editing
          ? 'Edit Product'
          : 'Add New Product'
      }
      onClose={onClose}
    >
      <form onSubmit={save}>
        <label>
          Product / Brand name
          <input
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            placeholder="e.g. Dolo 650"
            required
          />
        </label>

        <label>
          Composition
          <input
            value={
              selectedComposition
                ? selectedComposition.name
                : compositionQuery
            }
            onChange={(e) => {
              setSelectedComposition(null)
              setCompositionQuery(e.target.value)
            }}
            placeholder="Search composition / ingredient"
          />

          {compositionQuery &&
            !selectedComposition && (
              <div className="suggestion-list">
                {filteredCompositions.map(
                  (composition) => (
                    <button
                      type="button"
                      className="suggestion"
                      key={composition.id}
                      onClick={() => {
                        setSelectedComposition(
                          composition,
                        )
                        setCompositionQuery('')
                      }}
                    >
                      <strong>
                        {composition.name}
                      </strong>

                      <span>
                        {composition.dosage_form ||
                          ''}
                      </span>
                    </button>
                  ),
                )}
              </div>
            )}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setCompositionModal(true)
            }
          >
            + Add Composition
          </button>
        </label>

        <div className="form-grid">
          <label>
            Manufacturer
            <input
              value={manufacturer}
              onChange={(e) =>
                setManufacturer(e.target.value)
              }
            />
          </label>

          <label>
            Dosage form
            <input
              value={dosageForm}
              onChange={(e) =>
                setDosageForm(e.target.value)
              }
            />
          </label>

          <label>
            Category
            <select
              value={categoryId}
              onChange={(e) =>
                setCategoryId(e.target.value)
              }
            >
              <option value="">Select category</option>

              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            HSN
            <input
              value={hsn}
              onChange={(e) =>
                setHsn(e.target.value)
              }
            />
          </label>

          <label>
            GST %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={gst}
              onChange={(e) =>
                setGst(e.target.value)
              }
            />
          </label>

          <label>
            Default selling price
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) =>
                setSellingPrice(e.target.value)
              }
            />
          </label>

          <label>
            Default discount %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discount}
              onChange={(e) =>
                setDiscount(e.target.value)
              }
            />
          </label>

          <label>
            Minimum stock
            <input
              type="number"
              min="0"
              value={minimumStock}
              onChange={(e) =>
                setMinimumStock(e.target.value)
              }
            />
          </label>

          <label>
            Reorder level
            <input
              type="number"
              min="0"
              value={reorderLevel}
              onChange={(e) =>
                setReorderLevel(e.target.value)
              }
            />
          </label>
        </div>

        <div className="packaging-section">
          <div className="section-heading">
            <div>
              <h3>Packaging</h3>
              <p className="muted">
                Define how the product is purchased,
                sold and physically stocked.
              </p>
            </div>
          </div>

          <label>
            Configuration name
            <input
              value={packagingName}
              onChange={(e) =>
                setPackagingName(e.target.value)
              }
            />
          </label>

          {packagingLevels.map(
            (level, index) => (
              <div
                className="packaging-card"
                key={index}
              >
                <div className="packaging-title">
                  <strong>
                    Level {index + 1}
                  </strong>

                  {packagingLevels.length > 1 && (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() =>
                        removePackagingLevel(index)
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="form-grid">
                  <label>
                    Unit name
                    <input
                      value={level.unit_name}
                      onChange={(e) =>
                        updatePackagingLevel(
                          index,
                          {
                            unit_name:
                              e.target.value,
                          },
                        )
                      }
                      placeholder="Tablet / Strip / Box"
                    />
                  </label>

                  <label>
                    Units per parent
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={
                        level.units_per_parent
                      }
                      disabled={index === 0}
                      onChange={(e) =>
                        updatePackagingLevel(
                          index,
                          {
                            units_per_parent:
                              e.target.value,
                          },
                        )
                      }
                    />
                  </label>
                </div>

                <div className="toggle-grid">
                  <ToggleRow
                    label="Purchase unit"
                    checked={
                      level.is_purchase_unit
                    }
                    onChange={() =>
                      setPackagingLevels(
                        packagingLevels.map(
                          (x, i) => ({
                            ...x,
                            is_purchase_unit:
                              i === index,
                          }),
                        ),
                      )
                    }
                  />

                  <ToggleRow
                    label="Sale unit"
                    checked={level.is_sale_unit}
                    onChange={(checked) =>
                      updatePackagingLevel(
                        index,
                        {
                          is_sale_unit: checked,
                          is_preferred_sale_unit:
                            checked
                              ? level.is_preferred_sale_unit
                              : false,
                        },
                      )
                    }
                  />

                  <ToggleRow
                    label="Preferred sale unit"
                    checked={
                      level.is_preferred_sale_unit
                    }
                    onChange={() =>
                      setPackagingLevels(
                        packagingLevels.map(
                          (x, i) => ({
                            ...x,
                            is_preferred_sale_unit:
                              i === index,
                            is_sale_unit:
                              i === index
                                ? true
                                : x.is_sale_unit,
                          }),
                        ),
                      )
                    }
                  />

                  <ToggleRow
                    label="Stock unit"
                    checked={level.is_stock_unit}
                    onChange={() =>
                      setPackagingLevels(
                        packagingLevels.map(
                          (x, i) => ({
                            ...x,
                            is_stock_unit:
                              i === index,
                          }),
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ),
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={addPackagingLevel}
          >
            + Add Packaging Level
          </button>

          <div className="info-box">
            Example: 1 Box → 10 Strips → 100 Tablets.
            The lowest level is the stock unit.
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <ModalActions
          onClose={onClose}
          busy={busy}
          label={
            editing
              ? 'Save Product'
              : 'Create Product'
          }
        />
      </form>

      {compositionModal && (
        <CompositionModal
          onClose={() =>
            setCompositionModal(false)
          }
          onCreated={async (compositionId) => {
            setCompositionModal(false)

            const { data } = await supabase
              .from('compositions')
              .select(`
                *,
                composition_ingredients (
                  ingredient_name,
                  strength_value,
                  strength_unit,
                  sequence_number
                )
              `)
              .eq('id', compositionId)
              .maybeSingle()

            if (data) {
              setCompositions((current) => [
                data,
                ...current.filter(
                  (x) => x.id !== data.id,
                ),
              ])
              setSelectedComposition(data)
            }
          }}
        />
      )}
    </Modal>
  )
}

/* =========================================================
   SHARED UI
========================================================= */

function ModuleHeader({ title, subtitle }) {
  return (
    <div className="module-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={
            active === tab
              ? 'tab active'
              : 'tab'
          }
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function PanelList({ title, children }) {
  return (
    <section className="panel">
      {title && (
        <div className="panel-header">
          <h2>{title}</h2>
        </div>
      )}

      <div className="panel-body">{children}</div>
    </section>
  )
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>
}

function LoadingInline() {
  return <div className="loading-inline">Loading…</div>
}

function ToggleRow({
  label,
  checked,
  onChange,
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>

      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) =>
          onChange(e.target.checked)
        }
      />
    </label>
  )
}

/* =========================================================
   MODAL
   iOS/iPad-safe scrolling
========================================================= */

function Modal({ title, onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        background: 'rgba(0,0,0,.45)',
      }}
    >
      <div
        className="modal"
        style={{
          width: 'min(760px, 100%)',
          height: 'calc(100vh - 24px)',
          maxHeight: 'calc(100dvh - 24px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          margin: 'auto',
        }}
      >
        <div
          className="modal-header"
          style={{
            flex: '0 0 auto',
          }}
        >
          <h2>{title}</h2>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div
          className="modal-body"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'scroll',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            paddingBottom: '40px',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function ModalActions({
  onClose,
  busy,
  label = 'Save',
}) {
  return (
    <div className="modal-actions">
      <button
        type="button"
        className="secondary-button"
        onClick={onClose}
        disabled={busy}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="primary-button"
        disabled={busy}
      >
        {busy ? 'Saving…' : label}
      </button>
    </div>
  )
}