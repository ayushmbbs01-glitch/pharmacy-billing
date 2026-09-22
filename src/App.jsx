import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'sales', label: 'Sales', icon: '▣' },
  { id: 'purchases', label: 'Purchases', icon: '▤' },
  { id: 'inventory', label: 'Inventory', icon: '▦' },
  { id: 'customers', label: 'Customers', icon: '♙' },
  { id: 'reports', label: 'Reports', icon: '◫' },
  { id: 'alerts', label: 'Alerts', icon: '!' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
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

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateText(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN')
}

function dateTimeText(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function emptySaleItem() {
  return {
    product_id: '',
    batch_id: '',
    product_name: '',
    batch_number: '',
    unit_type: 'pack',
    quantity_entered: 1,
    units_per_pack: 1,
    mrp_per_pack: 0,
    selling_price_per_pack: 0,
    default_discount_percent: 0,
    discount_percent: 0,
    gst_rate: 0,
  }
}

function emptyPurchaseItem() {
  return {
    product_id: '',
    product_name: '',
    batch_number: '',
    expiry_date: '',
    units_per_pack: 1,
    paid_packs: 0,
    free_packs: 0,
    loose_units: 0,
    purchase_rate_per_pack: 0,
    mrp_per_pack: 0,
    supplier_discount_percent: 0,
    gst_rate: 0,
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState(null)
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function initialize() {
      setLoading(true)

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setSession(currentSession)

      if (currentSession?.user) {
        await loadUserData(currentSession.user.id)
      }

      if (mounted) setLoading(false)
    }

    initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return

      setSession(nextSession)

      if (nextSession?.user) {
        await loadUserData(nextSession.user.id)
      } else {
        setStore(null)
        setProfile(null)
      }

      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function loadUserData(userId) {
    setError('')

    const [{ data: membership, error: membershipError }, { data: profileData }] =
      await Promise.all([
        supabase
          .from('store_memberships')
          .select('*, stores(*)')
          .eq('user_id', userId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
      ])

    if (membershipError) {
      setError(membershipError.message)
      return
    }

    setProfile(profileData || null)
    setStore(membership?.stores || null)

    if (!membership?.stores) {
      setError('No pharmacy store assigned to this account.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (!session) {
    return <LoginScreen />
  }

  if (!store) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-mark">P</div>
          <h1>PharmDesk</h1>
          <p className="muted">
            Your account is authenticated, but no active pharmacy store is
            assigned.
          </p>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn full" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <PharmacyApp
      store={store}
      profile={profile}
      session={session}
      onSignOut={signOut}
    />
  )
}

function LoadingScreen() {
  return (
    <div className="auth-page">
      <div className="loading-card">
        <div className="brand-mark">P</div>
        <div className="spinner" />
        <h2>Loading PharmDesk</h2>
        <p>Connecting to your pharmacy workspace…</p>
      </div>
    </div>
  )
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (loginError) setError(loginError.message)
    setBusy(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-wide">
        <div className="brand-mark">P</div>
        <div className="eyebrow">LABDHI PHARMA</div>
        <h1>PharmDesk</h1>
        <p className="muted">
          Pharmacy billing, inventory and business management.
        </p>

        <form onSubmit={login} className="form-stack">
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              placeholder="admin@example.com"
            />
          </label>

          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </label>

          {error && <div className="error-box">{error}</div>}

          <button className="primary-btn full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PharmacyApp({ store, profile, session, onSignOut }) {
  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [globalAlerts, setGlobalAlerts] = useState(0)

  useEffect(() => {
    async function loadAlertCount() {
      const { count } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('is_read', false)

      setGlobalAlerts(count || 0)
    }

    loadAlertCount()
  }, [store.id])

  function navigate(page) {
    setActivePage(page)
    setSidebarOpen(false)
  }

  const pageTitle =
    NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Dashboard'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">P</div>
          <div>
            <strong>PharmDesk</strong>
            <span>LABDHI PHARMA</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${
                activePage === item.id ? 'active' : ''
              }`}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>

              {item.id === 'alerts' && globalAlerts > 0 && (
                <span className="nav-badge">{globalAlerts}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-mini">
            <div className="avatar">
              {(profile?.full_name || session.user.email || 'P')
                .charAt(0)
                .toUpperCase()}
            </div>
            <div>
              <strong>{profile?.full_name || 'PharmDesk User'}</strong>
              <span>{session.user.email}</span>
            </div>
          </div>

          <button className="logout-btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <main className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="topbar-title">
            <span className="breadcrumb">PharmDesk</span>
            <h1>{pageTitle}</h1>
          </div>

          <div className="topbar-right">
            <div className="store-chip">
              <span className="status-dot" />
              {store.name}
            </div>
          </div>
        </header>

        <div className="page-content">
          {activePage === 'dashboard' && (
            <Dashboard store={store} navigate={navigate} />
          )}

          {activePage === 'sales' && (
            <SalesModule store={store} profile={profile} />
          )}

          {activePage === 'purchases' && (
            <PurchasesModule store={store} profile={profile} />
          )}

          {activePage === 'inventory' && <InventoryModule store={store} />}

          {activePage === 'customers' && (
            <CustomersModule store={store} />
          )}

          {activePage === 'reports' && <ReportsModule store={store} />}

          {activePage === 'alerts' && <AlertsModule store={store} />}

          {activePage === 'settings' && (
            <SettingsModule store={store} profile={profile} />
          )}
        </div>
      </main>
    </div>
  )
}

/* ============================================================
   DASHBOARD
============================================================ */

function Dashboard({ store, navigate }) {
  const [stats, setStats] = useState({
    sales: 0,
    bills: 0,
    stock: 0,
    alerts: 0,
  })
  const [recentSales, setRecentSales] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [store.id])

  async function loadDashboard() {
    setLoading(true)

    const start = `${todayISO()}T00:00:00`

    const [
      { data: sales },
      { count: bills },
      { count: stock },
      { count: alerts },
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('id, invoice_number, grand_total, bill_datetime, customers(name)')
        .eq('store_id', store.id)
        .eq('status', 'completed')
        .gte('bill_datetime', start)
        .order('bill_datetime', { ascending: false })
        .limit(8),

      supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('status', 'completed')
        .gte('bill_datetime', start),

      supabase
        .from('batches')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .gt('current_stock_units', 0),

      supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('is_resolved', false),
    ])

    const totalSales = (sales || []).reduce(
      (sum, sale) => sum + Number(sale.grand_total || 0),
      0,
    )

    setStats({
      sales: totalSales,
      bills: bills || 0,
      stock: stock || 0,
      alerts: alerts || 0,
    })

    setRecentSales(sales || [])
    setLoading(false)
  }

  return (
    <div className="dashboard">
      <section className="welcome-row">
        <div>
          <div className="eyebrow">PHARMACY WORKSPACE</div>
          <h2>Good morning</h2>
          <p>
            Here's what is happening at <strong>{store.name}</strong> today.
          </p>
        </div>

        <div className="date-card">
          <span>Today</span>
          <strong>
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </strong>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard
          label="Today's Sales"
          value={money(stats.sales)}
          icon="₹"
          loading={loading}
        />
        <StatCard
          label="Bills Today"
          value={stats.bills}
          icon="▣"
          loading={loading}
        />
        <StatCard
          label="Active Stock Batches"
          value={stats.stock}
          icon="▦"
          loading={loading}
        />
        <StatCard
          label="Open Alerts"
          value={stats.alerts}
          icon="!"
          loading={loading}
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Quick actions</h3>
              <p>Jump directly into common pharmacy tasks.</p>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={() => navigate('sales')}>
              <span>＋</span>
              <div>
                <strong>New Sale</strong>
                <small>Create a customer bill</small>
              </div>
            </button>

            <button onClick={() => navigate('purchases')}>
              <span>＋</span>
              <div>
                <strong>New Purchase</strong>
                <small>Receive supplier stock</small>
              </div>
            </button>

            <button onClick={() => navigate('inventory')}>
              <span>▦</span>
              <div>
                <strong>Inventory</strong>
                <small>Products and batches</small>
              </div>
            </button>

            <button onClick={() => navigate('customers')}>
              <span>♙</span>
              <div>
                <strong>Customers</strong>
                <small>History and credit</small>
              </div>
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Recent sales</h3>
              <p>Latest completed bills today.</p>
            </div>
          </div>

          {recentSales.length === 0 ? (
            <EmptyState
              icon="▣"
              title="No sales yet today"
              text="Completed bills will appear here."
            />
          ) : (
            <div className="list-table">
              {recentSales.map((sale) => (
                <div className="list-row" key={sale.id}>
                  <div>
                    <strong>{sale.invoice_number}</strong>
                    <span>
                      {sale.customers?.name || 'Walk-in Customer'} ·{' '}
                      {dateTimeText(sale.bill_datetime)}
                    </span>
                  </div>
                  <strong>{money(sale.grand_total)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, icon, loading }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{loading ? '…' : value}</strong>
      </div>
    </div>
  )
}

/* ============================================================
   SALES
============================================================ */

function SalesModule({ store, profile }) {
  const [tab, setTab] = useState('New Sale')

  return (
    <div className="module">
      <ModuleHeader
        eyebrow="SALES"
        title="Sales & Billing"
        description="Create bills, manage drafts, returns and customer credit."
      />

      <TabBar tabs={SALES_TABS} active={tab} onChange={setTab} />

      {tab === 'New Sale' && (
        <NewSale store={store} profile={profile} />
      )}

      {tab === 'Draft Bills' && <DraftBills store={store} />}

      {tab === 'Completed Bills' && (
        <CompletedBills store={store} />
      )}

      {tab === 'Returns' && <SalesReturns store={store} />}

      {tab === 'Customers' && <CustomersModule store={store} />}

      {tab === 'Credit' && <CustomerCredit store={store} />}
    </div>
  )
}

function NewSale({ store, profile }) {
  const [customer, setCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [batches, setBatches] = useState([])
  const [items, setItems] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [billDiscount, setBillDiscount] = useState(0)
  const [billDatetime, setBillDatetime] = useState(
    new Date().toISOString().slice(0, 16),
  )
  const [payments, setPayments] = useState([
    { payment_method: 'cash', amount: '' },
  ])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [store.id])

  async function loadProducts() {
    const { data } = await supabase
      .from('store_products')
      .select(`
        *,
        products(
          id,
          product_name,
          generic_display_name,
          manufacturer,
          dosage_form,
          strength_display,
          pack_quantity,
          pack_unit,
          gst_rate,
          is_active
        )
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .limit(500)

    setProducts(
      (data || [])
        .filter((row) => row.products?.is_active)
        .map((row) => ({
          ...row.products,
          default_selling_price: row.default_selling_price,
          default_discount_percent: row.default_discount_percent,
        })),
    )
  }

  async function searchCustomers(value) {
    setCustomerSearch(value)

    if (!value.trim()) {
      setCustomers([])
      return
    }

    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .or(`name.ilike.%${value}%,phone.ilike.%${value}%`)
      .limit(8)

    setCustomers(data || [])
  }

  async function loadBatches(productId) {
    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .order('expiry_date', { ascending: true })

    setBatches(data || [])
  }

  async function chooseProduct(product) {
    setProductSearch('')
    await loadBatches(product.id)

    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', product.id)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .order('expiry_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!data) {
      setMessage('This product has no available stock.')
      return
    }

    setItems((current) => [
      ...current,
      {
        ...emptySaleItem(),
        product_id: product.id,
        product_name: product.product_name,
        batch_id: data.id,
        batch_number: data.batch_number,
        units_per_pack: data.units_per_pack,
        mrp_per_pack: data.mrp_per_pack,
        selling_price_per_pack:
          product.default_selling_price || data.mrp_per_pack || 0,
        default_discount_percent:
          Number(product.default_discount_percent || 0),
        discount_percent:
          Number(product.default_discount_percent || 0),
        gst_rate: Number(product.gst_rate || 0),
      },
    ])
  }

  function updateItem(index, patch) {
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    )
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let itemDiscount = 0
    let taxable = 0
    let gst = 0

    items.forEach((item) => {
      const quantity = Number(item.quantity_entered || 0)
      const packUnits = Number(item.units_per_pack || 1)
      const price = Number(item.selling_price_per_pack || 0)
      const discount = Number(item.discount_percent || 0)
      const rate = Number(item.gst_rate || 0)

      const gross =
        item.unit_type === 'pack'
          ? quantity * price
          : (quantity / packUnits) * price

      const disc = gross * (discount / 100)
      const line = gross - disc
      const lineTaxable =
        rate > 0 ? line / (1 + rate / 100) : line

      subtotal += gross
      itemDiscount += disc
      taxable += lineTaxable
      gst += line - lineTaxable
    })

    const total = Math.max(
      0,
      subtotal - itemDiscount - Number(billDiscount || 0),
    )

    const paid = payments.reduce(
      (sum, payment) =>
        sum + Number(payment.amount || 0),
      0,
    )

    return {
      subtotal,
      itemDiscount,
      taxable,
      gst,
      total,
      paid,
      due: Math.max(0, total - paid),
    }
  }, [items, billDiscount, payments])

  function updatePayment(index, patch) {
    setPayments((current) =>
      current.map((payment, i) =>
        i === index ? { ...payment, ...patch } : payment,
      ),
    )
  }

  function addPayment() {
    setPayments((current) => [
      ...current,
      { payment_method: 'upi', amount: '' },
    ])
  }

  function removePayment(index) {
    if (payments.length === 1) return
    setPayments((current) => current.filter((_, i) => i !== index))
  }

  async function completeSale() {
    setMessage('')

    if (items.length === 0) {
      setMessage('Add at least one product.')
      return
    }

    if (totals.due > 0 && !customer) {
      setMessage(
        'A named customer is required when the bill has an outstanding amount.',
      )
      return
    }

    const payloadItems = items.map((item) => ({
      product_id: item.product_id,
      batch_id: item.batch_id,
      unit_type: item.unit_type,
      quantity_entered: Number(item.quantity_entered),
      units_per_pack: Number(item.units_per_pack),
      mrp_per_pack: Number(item.mrp_per_pack),
      selling_price_per_pack: Number(item.selling_price_per_pack),
      default_discount_percent: Number(
        item.default_discount_percent || 0,
      ),
      discount_percent: Number(item.discount_percent || 0),
      gst_rate: Number(item.gst_rate || 0),
    }))

    const payloadPayments = payments
      .filter((payment) => Number(payment.amount || 0) > 0)
      .map((payment) => ({
        payment_method: payment.payment_method,
        amount: Number(payment.amount),
      }))

    if (totals.paid > totals.total) {
      setMessage('Payment exceeds the bill total.')
      return
    }

    if (
      totals.due > 0 &&
      !payloadPayments.some(
        (payment) => payment.payment_method === 'credit',
      )
    ) {
      payloadPayments.push({
        payment_method: 'credit',
        amount: Number(totals.due.toFixed(2)),
      })
    }

    setBusy(true)

    const { data, error } = await supabase.rpc(
      'pharmdesk_complete_sale',
      {
        p_store_id: store.id,
        p_customer_id: customer?.id || null,
        p_bill_datetime: new Date(billDatetime).toISOString(),
        p_bill_discount_amount: Number(billDiscount || 0),
        p_notes: notes || null,
        p_items: payloadItems,
        p_payments: payloadPayments,
      },
    )

    if (error) {
      setMessage(error.message)
      setBusy(false)
      return
    }

    setMessage(`Sale completed successfully. Sale ID: ${data}`)
    setItems([])
    setCustomer(null)
    setCustomerSearch('')
    setBillDiscount(0)
    setPayments([{ payment_method: 'cash', amount: '' }])
    setNotes('')
    setBusy(false)
  }

  const filteredProducts = products.filter((product) => {
    const q = productSearch.toLowerCase().trim()
    if (!q) return false

    return [
      product.product_name,
      product.generic_display_name,
      product.manufacturer,
      product.strength_display,
      product.dosage_form,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q)
  })

  return (
    <div className="workspace-grid">
      <div className="workspace-main">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>New sale</h3>
              <p>Create a bill without leaving the current workflow.</p>
            </div>
          </div>

          <div className="form-grid two">
            <label>
              Customer
              <div className="search-with-action">
                <input
                  value={customerSearch}
                  onChange={(e) => searchCustomers(e.target.value)}
                  placeholder="Search name or phone"
                />
                <button
                  className="inline-btn"
                  onClick={() => setShowCustomerForm(true)}
                >
                  + Add
                </button>
              </div>

              {customer && (
                <div className="selected-chip">
                  <strong>{customer.name}</strong>
                  <span>{customer.phone}</span>
                  <button onClick={() => setCustomer(null)}>×</button>
                </div>
              )}

              {!customer &&
                customerSearch &&
                customers.length > 0 && (
                  <div className="suggestion-list">
                    {customers.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setCustomer(item)
                          setCustomerSearch(item.name)
                          setCustomers([])
                        }}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
            </label>

            <label>
              Bill date & time
              <input
                type="datetime-local"
                value={billDatetime}
                onChange={(e) => setBillDatetime(e.target.value)}
              />
            </label>
          </div>

          <div className="product-entry">
            <label>
              Add product
              <div className="search-with-action">
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search medicine, brand, generic or manufacturer"
                />
                <button
                  className="inline-btn"
                  onClick={() => setShowProductForm(true)}
                >
                  + New
                </button>
              </div>
            </label>

            {filteredProducts.length > 0 && (
              <div className="suggestion-list product-results">
                {filteredProducts.slice(0, 8).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => chooseProduct(product)}
                  >
                    <div>
                      <strong>{product.product_name}</strong>
                      <span>
                        {product.generic_display_name || 'No generic name'}
                      </span>
                    </div>
                    <small>
                      {product.strength_display || ''}{' '}
                      {product.dosage_form || ''}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sale-items">
            {items.length === 0 ? (
              <EmptyState
                icon="▣"
                title="No products added"
                text="Search for a product above to begin the bill."
              />
            ) : (
              items.map((item, index) => (
                <SaleItemRow
                  key={`${item.product_id}-${index}`}
                  item={item}
                  index={index}
                  batches={batches}
                  updateItem={updateItem}
                  removeItem={removeItem}
                />
              ))
            )}
          </div>

          <div className="form-grid two">
            <label>
              Bill discount
              <input
                type="number"
                min="0"
                value={billDiscount}
                onChange={(e) => setBillDiscount(e.target.value)}
              />
            </label>

            <label>
              Notes
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          {message && (
            <div
              className={
                message.includes('successfully')
                  ? 'success-box'
                  : 'error-box'
              }
            >
              {message}
            </div>
          )}
        </div>
      </div>

      <aside className="workspace-side">
        <div className="panel sticky-panel">
          <div className="panel-header">
            <div>
              <h3>Payment</h3>
              <p>Split payments are supported.</p>
            </div>
          </div>

          <div className="bill-total">
            <span>Grand total</span>
            <strong>{money(totals.total)}</strong>
          </div>

          <div className="payment-list">
            {payments.map((payment, index) => (
              <div className="payment-row" key={index}>
                <select
                  value={payment.payment_method}
                  onChange={(e) =>
                    updatePayment(index, {
                      payment_method: e.target.value,
                    })
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="credit">Credit</option>
                </select>

                <input
                  type="number"
                  min="0"
                  value={payment.amount}
                  onChange={(e) =>
                    updatePayment(index, {
                      amount: e.target.value,
                    })
                  }
                  placeholder="Amount"
                />

                {payments.length > 1 && (
                  <button
                    className="icon-btn"
                    onClick={() => removePayment(index)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button className="text-btn" onClick={addPayment}>
            + Add payment method
          </button>

          <div className="totals-list">
            <div>
              <span>Subtotal</span>
              <strong>{money(totals.subtotal)}</strong>
            </div>
            <div>
              <span>Item discount</span>
              <strong>-{money(totals.itemDiscount)}</strong>
            </div>
            <div>
              <span>GST included</span>
              <strong>{money(totals.gst)}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>{money(totals.paid)}</strong>
            </div>
            <div className="due">
              <span>Due</span>
              <strong>{money(totals.due)}</strong>
            </div>
          </div>

          <button
            className="primary-btn full"
            disabled={busy || items.length === 0}
            onClick={completeSale}
          >
            {busy ? 'Completing…' : 'Complete Sale'}
          </button>
        </div>
      </aside>

      {showCustomerForm && (
        <CustomerModal
          store={store}
          onClose={() => setShowCustomerForm(false)}
          onCreated={(newCustomer) => {
            setCustomer(newCustomer)
            setCustomerSearch(newCustomer.name)
            setShowCustomerForm(false)
          }}
        />
      )}

      {showProductForm && (
        <ProductModal
          store={store}
          onClose={() => setShowProductForm(false)}
          onCreated={async (product) => {
            setShowProductForm(false)
            await loadProducts()
            await chooseProduct(product)
          }}
        />
      )}
    </div>
  )
}

function SaleItemRow({
  item,
  index,
  updateItem,
  removeItem,
}) {
  const quantity =
    Number(item.quantity_entered || 0) *
    (item.unit_type === 'pack'
      ? Number(item.units_per_pack || 1)
      : 1)

  const gross =
    item.unit_type === 'pack'
      ? Number(item.quantity_entered || 0) *
        Number(item.selling_price_per_pack || 0)
      : (Number(item.quantity_entered || 0) /
          Number(item.units_per_pack || 1)) *
        Number(item.selling_price_per_pack || 0)

  const discount =
    gross * (Number(item.discount_percent || 0) / 100)

  return (
    <div className="sale-item-card">
      <div className="sale-item-top">
        <div>
          <strong>{item.product_name}</strong>
          <span>
            Batch {item.batch_number} · {quantity} units
          </span>
        </div>

        <button
          className="danger-text"
          onClick={() => removeItem(index)}
        >
          Remove
        </button>
      </div>

      <div className="form-grid four">
        <label>
          Sell as
          <select
            value={item.unit_type}
            onChange={(e) =>
              updateItem(index, {
                unit_type: e.target.value,
              })
            }
          >
            <option value="pack">Strip / Pack</option>
            <option value="unit">Tablets / Units</option>
          </select>
        </label>

        <label>
          Quantity
          <input
            type="number"
            min="0.01"
            value={item.quantity_entered}
            onChange={(e) =>
              updateItem(index, {
                quantity_entered: e.target.value,
              })
            }
          />
        </label>

        <label>
          Selling price / pack
          <input
            type="number"
            min="0"
            value={item.selling_price_per_pack}
            onChange={(e) =>
              updateItem(index, {
                selling_price_per_pack: e.target.value,
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
            value={item.discount_percent}
            onChange={(e) =>
              updateItem(index, {
                discount_percent: e.target.value,
              })
            }
          />
        </label>
      </div>

      <div className="sale-item-footer">
        <span>MRP {money(item.mrp_per_pack)}</span>
        <span>GST {item.gst_rate}%</span>
        <strong>{money(gross - discount)}</strong>
      </div>
    </div>
  )
}

function DraftBills({ store }) {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDrafts()
  }, [store.id])

  async function loadDrafts() {
    setLoading(true)

    const { data } = await supabase
      .from('sales')
      .select(`
        *,
        customers(name, phone)
      `)
      .eq('store_id', store.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })

    setDrafts(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Draft bills"
      subtitle="Incomplete bills saved for later."
      loading={loading}
      empty="No saved draft bills."
    >
      {drafts.map((draft) => (
        <div className="list-row" key={draft.id}>
          <div>
            <strong>{draft.invoice_number}</strong>
            <span>
              {draft.customers?.name || 'Walk-in'} ·{' '}
              {dateTimeText(draft.created_at)}
            </span>
          </div>
          <span className="status-pill warning">Draft</span>
        </div>
      ))}
    </PanelList>
  )
}

function CompletedBills({ store }) {
  const [sales, setSales] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSales()
  }, [store.id])

  async function loadSales() {
    setLoading(true)

    const { data } = await supabase
      .from('sales')
      .select(`
        *,
        customers(name, phone)
      `)
      .eq('store_id', store.id)
      .eq('status', 'completed')
      .order('bill_datetime', { ascending: false })
      .limit(200)

    setSales(data || [])
    setLoading(false)
  }

  const filtered = sales.filter((sale) =>
    [
      sale.invoice_number,
      sale.customers?.name,
      sale.customers?.phone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Completed bills</h3>
          <p>Search previous sales.</p>
        </div>
        <input
          className="compact-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Invoice / customer / phone"
        />
      </div>

      {loading ? (
        <LoadingInline />
      ) : filtered.length === 0 ? (
        <EmptyState title="No completed bills found." />
      ) : (
        <div className="list-table">
          {filtered.map((sale) => (
            <div className="list-row" key={sale.id}>
              <div>
                <strong>{sale.invoice_number}</strong>
                <span>
                  {sale.customers?.name || 'Walk-in Customer'} ·{' '}
                  {dateTimeText(sale.bill_datetime)}
                </span>
              </div>
              <div className="row-right">
                <strong>{money(sale.grand_total)}</strong>
                <span className="status-pill success">
                  {sale.amount_due > 0 ? 'Credit' : 'Paid'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SalesReturns({ store }) {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReturns()
  }, [store.id])

  async function loadReturns() {
    setLoading(true)

    const { data } = await supabase
      .from('sales_returns')
      .select(`
        *,
        sales:original_sale_id(invoice_number),
        customers:customer_id(name)
      `)
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(100)

    setSales(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Sales returns"
      subtitle="Return history and refunds."
      loading={loading}
      empty="No sales returns recorded."
    >
      {sales.map((item) => (
        <div className="list-row" key={item.id}>
          <div>
            <strong>
              {item.sales?.invoice_number || 'Original bill'}
            </strong>
            <span>
              {item.customers?.name || 'Walk-in'} ·{' '}
              {dateText(item.created_at)}
            </span>
          </div>
          <strong>{money(item.refund_amount)}</strong>
        </div>
      ))}
    </PanelList>
  )
}

function CustomerCredit({ store }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCredit()
  }, [store.id])

  async function loadCredit() {
    setLoading(true)

    const { data } = await supabase
      .from('customer_credit_transactions')
      .select(`
        *,
        customers:customer_id(name, phone)
      `)
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(200)

    setTransactions(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Customer credit"
      subtitle="Udhar and customer credit transactions."
      loading={loading}
      empty="No credit transactions found."
    >
      {transactions.map((item) => (
        <div className="list-row" key={item.id}>
          <div>
            <strong>{item.customers?.name || 'Customer'}</strong>
            <span>
              {item.transaction_type} · {dateTimeText(item.created_at)}
            </span>
          </div>
          <strong>{money(item.amount)}</strong>
        </div>
      ))}
    </PanelList>
  )
}

/* ============================================================
   PURCHASES
============================================================ */

function PurchasesModule({ store, profile }) {
  const [tab, setTab] = useState('New Purchase')

  return (
    <div className="module">
      <ModuleHeader
        eyebrow="PURCHASES"
        title="Purchases & Suppliers"
        description="Receive stock, manage supplier invoices and payments."
      />

      <TabBar tabs={PURCHASE_TABS} active={tab} onChange={setTab} />

      {tab === 'New Purchase' && (
        <NewPurchase store={store} profile={profile} />
      )}

      {tab === 'Supplier Invoices' && (
        <SupplierInvoices store={store} />
      )}

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

function NewPurchase({ store, profile }) {
  const [supplier, setSupplier] = useState(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [items, setItems] = useState([])
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayISO())
  const [discount, setDiscount] = useState(0)
  const [cgst, setCgst] = useState(0)
  const [sgst, setSgst] = useState(0)
  const [igst, setIgst] = useState(0)
  const [otherCharges, setOtherCharges] = useState(0)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [store.id])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select(`
        id,
        product_name,
        generic_display_name,
        manufacturer,
        strength_display,
        dosage_form,
        gst_rate
      `)
      .eq('is_active', true)
      .order('product_name')
      .limit(500)

    setProducts(data || [])
  }

  async function searchSuppliers(value) {
    setSupplierSearch(value)

    if (!value.trim()) {
      setSuppliers([])
      return
    }

    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .ilike('supplier_name', `%${value}%`)
      .limit(8)

    setSuppliers(data || [])
  }

  function addProduct(product) {
    setProductSearch('')

    setItems((current) => [
      ...current,
      {
        ...emptyPurchaseItem(),
        product_id: product.id,
        product_name: product.product_name,
        gst_rate: Number(product.gst_rate || 0),
      },
    ])
  }

  function updateItem(index, patch) {
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    )
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.paid_packs || 0) *
        Number(item.purchase_rate_per_pack || 0),
    0,
  )

  const total =
    subtotal -
    Number(discount || 0) +
    Number(cgst || 0) +
    Number(sgst || 0) +
    Number(igst || 0) +
    Number(otherCharges || 0)

  const filteredProducts = products.filter((product) =>
    [
      product.product_name,
      product.generic_display_name,
      product.manufacturer,
      product.strength_display,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(productSearch.toLowerCase()),
  )

  async function completePurchase() {
    setMessage('')

    if (!supplier) {
      setMessage('Select a supplier first.')
      return
    }

    if (!invoiceNumber.trim()) {
      setMessage('Supplier invoice number is required.')
      return
    }

    if (items.length === 0) {
      setMessage('Add at least one purchase item.')
      return
    }

    setBusy(true)

    const payload = items.map((item) => ({
      product_id: item.product_id,
      batch_number: item.batch_number,
      expiry_date: item.expiry_date,
      units_per_pack: Number(item.units_per_pack),
      paid_packs: Number(item.paid_packs || 0),
      free_packs: Number(item.free_packs || 0),
      loose_units: Number(item.loose_units || 0),
      purchase_rate_per_pack: Number(
        item.purchase_rate_per_pack || 0,
      ),
      mrp_per_pack: Number(item.mrp_per_pack || 0),
      supplier_discount_percent: Number(
        item.supplier_discount_percent || 0,
      ),
      gst_rate: Number(item.gst_rate || 0),
    }))

    const { data, error } = await supabase.rpc(
      'pharmdesk_complete_purchase',
      {
        p_store_id: store.id,
        p_supplier_id: supplier.id,
        p_invoice_number: invoiceNumber.trim(),
        p_invoice_date: invoiceDate,
        p_items: payload,
        p_discount_amount: Number(discount || 0),
        p_cgst_amount: Number(cgst || 0),
        p_sgst_amount: Number(sgst || 0),
        p_igst_amount: Number(igst || 0),
        p_other_charges: Number(otherCharges || 0),
        p_notes: notes || null,
      },
    )

    if (error) {
      setMessage(error.message)
      setBusy(false)
      return
    }

    setMessage(`Purchase received successfully. Invoice ID: ${data}`)
    setItems([])
    setSupplier(null)
    setSupplierSearch('')
    setInvoiceNumber('')
    setDiscount(0)
    setCgst(0)
    setSgst(0)
    setIgst(0)
    setOtherCharges(0)
    setNotes('')
    setBusy(false)
  }

  return (
    <div className="workspace-grid">
      <div className="workspace-main">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>New purchase</h3>
              <p>Receive supplier stock into inventory.</p>
            </div>
          </div>

          <div className="form-grid three">
            <label>
              Purchase party
              <div className="search-with-action">
                <input
                  value={supplierSearch}
                  onChange={(e) =>
                    searchSuppliers(e.target.value)
                  }
                  placeholder="Search supplier"
                />
                <button
                  className="inline-btn"
                  onClick={() => setShowSupplierForm(true)}
                >
                  + Add
                </button>
              </div>

              {supplier && (
                <div className="selected-chip">
                  <strong>{supplier.supplier_name}</strong>
                  <button onClick={() => setSupplier(null)}>
                    ×
                  </button>
                </div>
              )}

              {!supplier &&
                supplierSearch &&
                suppliers.length > 0 && (
                  <div className="suggestion-list">
                    {suppliers.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSupplier(item)
                          setSupplierSearch(item.supplier_name)
                          setSuppliers([])
                        }}
                      >
                        <strong>{item.supplier_name}</strong>
                        <span>{item.phone || 'No phone'}</span>
                      </button>
                    ))}
                  </div>
                )}
            </label>

            <label>
              Supplier invoice number
              <input
                value={invoiceNumber}
                onChange={(e) =>
                  setInvoiceNumber(e.target.value)
                }
                placeholder="e.g. INV-4582"
              />
            </label>

            <label>
              Invoice date
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </label>
          </div>

          <label>
            Add product
            <div className="search-with-action">
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search product"
              />
              <button
                className="inline-btn"
                onClick={() => setShowProductForm(true)}
              >
                + New Product
              </button>
            </div>
          </label>

          {filteredProducts.length > 0 && (
            <div className="suggestion-list product-results">
              {filteredProducts.slice(0, 8).map((product) => (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                >
                  <div>
                    <strong>{product.product_name}</strong>
                    <span>
                      {product.generic_display_name || 'No generic'}
                    </span>
                  </div>
                  <small>{product.manufacturer || ''}</small>
                </button>
              ))}
            </div>
          )}

          <div className="purchase-items">
            {items.length === 0 ? (
              <EmptyState
                icon="▤"
                title="No purchase items"
                text="Search for a product above to add stock."
              />
            ) : (
              items.map((item, index) => (
                <PurchaseItemRow
                  key={`${item.product_id}-${index}`}
                  item={item}
                  index={index}
                  updateItem={updateItem}
                  removeItem={removeItem}
                />
              ))
            )}
          </div>

          {message && (
            <div
              className={
                message.includes('successfully')
                  ? 'success-box'
                  : 'error-box'
              }
            >
              {message}
            </div>
          )}
        </div>
      </div>

      <aside className="workspace-side">
        <div className="panel sticky-panel">
          <div className="panel-header">
            <div>
              <h3>Invoice totals</h3>
              <p>Charges from the supplier invoice.</p>
            </div>
          </div>

          <div className="totals-list">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>

            <label>
              Discount
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </label>

            <label>
              CGST
              <input
                type="number"
                min="0"
                value={cgst}
                onChange={(e) => setCgst(e.target.value)}
              />
            </label>

            <label>
              SGST
              <input
                type="number"
                min="0"
                value={sgst}
                onChange={(e) => setSgst(e.target.value)}
              />
            </label>

            <label>
              IGST
              <input
                type="number"
                min="0"
                value={igst}
                onChange={(e) => setIgst(e.target.value)}
              />
            </label>

            <label>
              Other charges
              <input
                type="number"
                min="0"
                value={otherCharges}
                onChange={(e) =>
                  setOtherCharges(e.target.value)
                }
              />
            </label>

            <div className="grand-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
          </div>

          <label>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional purchase notes"
              rows="3"
            />
          </label>

          <button
            className="primary-btn full"
            disabled={busy || items.length === 0}
            onClick={completePurchase}
          >
            {busy ? 'Receiving…' : 'Receive Purchase'}
          </button>
        </div>
      </aside>

      {showSupplierForm && (
        <SupplierModal
          store={store}
          onClose={() => setShowSupplierForm(false)}
          onCreated={(newSupplier) => {
            setSupplier(newSupplier)
            setSupplierSearch(newSupplier.supplier_name)
            setShowSupplierForm(false)
          }}
        />
      )}

      {showProductForm && (
        <ProductModal
          store={store}
          onClose={() => setShowProductForm(false)}
          onCreated={async (product) => {
            setShowProductForm(false)
            await loadProducts()
            addProduct(product)
          }}
        />
      )}
    </div>
  )
}

function PurchaseItemRow({
  item,
  index,
  updateItem,
  removeItem,
}) {
  return (
    <div className="purchase-item-card">
      <div className="sale-item-top">
        <div>
          <strong>{item.product_name}</strong>
          <span>Purchase stock and batch information</span>
        </div>

        <button
          className="danger-text"
          onClick={() => removeItem(index)}
        >
          Remove
        </button>
      </div>

      <div className="form-grid four">
        <label>
          Batch
          <input
            value={item.batch_number}
            onChange={(e) =>
              updateItem(index, {
                batch_number: e.target.value,
              })
            }
            placeholder="Batch no."
          />
        </label>

        <label>
          Expiry
          <input
            type="date"
            value={item.expiry_date}
            onChange={(e) =>
              updateItem(index, {
                expiry_date: e.target.value,
              })
            }
          />
        </label>

        <label>
          Units / pack
          <input
            type="number"
            min="1"
            value={item.units_per_pack}
            onChange={(e) =>
              updateItem(index, {
                units_per_pack: e.target.value,
              })
            }
          />
        </label>

        <label>
          Purchase rate
          <input
            type="number"
            min="0"
            value={item.purchase_rate_per_pack}
            onChange={(e) =>
              updateItem(index, {
                purchase_rate_per_pack: e.target.value,
              })
            }
          />
        </label>

        <label>
          Paid packs
          <input
            type="number"
            min="0"
            value={item.paid_packs}
            onChange={(e) =>
              updateItem(index, {
                paid_packs: e.target.value,
              })
            }
          />
        </label>

        <label>
          Free packs
          <input
            type="number"
            min="0"
            value={item.free_packs}
            onChange={(e) =>
              updateItem(index, {
                free_packs: e.target.value,
              })
            }
          />
        </label>

        <label>
          Loose units
          <input
            type="number"
            min="0"
            value={item.loose_units}
            onChange={(e) =>
              updateItem(index, {
                loose_units: e.target.value,
              })
            }
          />
        </label>

        <label>
          MRP / pack
          <input
            type="number"
            min="0"
            value={item.mrp_per_pack}
            onChange={(e) =>
              updateItem(index, {
                mrp_per_pack: e.target.value,
              })
            }
          />
        </label>
      </div>
    </div>
  )
}

function SupplierInvoices({ store }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('purchase_invoices')
      .select(`
        *,
        suppliers(supplier_name, phone)
      `)
      .eq('store_id', store.id)
      .order('invoice_date', { ascending: false })
      .limit(200)

    setInvoices(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Supplier invoices"
      subtitle="Purchase invoice history."
      loading={loading}
      empty="No purchase invoices found."
    >
      {invoices.map((invoice) => (
        <div className="list-row" key={invoice.id}>
          <div>
            <strong>{invoice.invoice_number}</strong>
            <span>
              {invoice.suppliers?.supplier_name || 'Supplier'} ·{' '}
              {dateText(invoice.invoice_date)}
            </span>
          </div>

          <div className="row-right">
            <strong>{money(invoice.total_amount)}</strong>
            <span
              className={`status-pill ${
                invoice.payment_status === 'paid'
                  ? 'success'
                  : invoice.payment_status === 'partial'
                    ? 'warning'
                    : 'danger'
              }`}
            >
              {invoice.payment_status}
            </span>
          </div>
        </div>
      ))}
    </PanelList>
  )
}

function PendingSupplierPayments({ store }) {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('purchase_invoices')
      .select(`
        id,
        invoice_number,
        invoice_date,
        total_amount,
        payment_status,
        suppliers(supplier_name)
      `)
      .eq('store_id', store.id)
      .neq('payment_status', 'paid')
      .order('invoice_date', { ascending: true })

    setSuppliers(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Pending supplier payments"
      subtitle="Invoices requiring payment."
      loading={loading}
      empty="No pending supplier payments."
    >
      {suppliers.map((invoice) => (
        <div className="list-row" key={invoice.id}>
          <div>
            <strong>{invoice.suppliers?.supplier_name}</strong>
            <span>
              {invoice.invoice_number} ·{' '}
              {dateText(invoice.invoice_date)}
            </span>
          </div>
          <strong>{money(invoice.total_amount)}</strong>
        </div>
      ))}
    </PanelList>
  )
}

function PurchaseOrders({ store }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers(supplier_name)
      `)
      .eq('store_id', store.id)
      .order('order_date', { ascending: false })
      .limit(100)

    setOrders(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Purchase orders"
      subtitle="Supplier order planning."
      loading={loading}
      empty="No purchase orders yet."
    >
      {orders.map((order) => (
        <div className="list-row" key={order.id}>
          <div>
            <strong>{order.order_number || 'Purchase Order'}</strong>
            <span>
              {order.suppliers?.supplier_name || 'Supplier'} ·{' '}
              {dateText(order.order_date)}
            </span>
          </div>
          <span className="status-pill">
            {order.status}
          </span>
        </div>
      ))}
    </PanelList>
  )
}

function AIRecommendations({ store }) {
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('ai_purchase_recommendations')
      .select(`
        *,
        products(product_name),
        suppliers(supplier_name)
      `)
      .eq('store_id', store.id)
      .order('generated_at', { ascending: false })
      .limit(100)

    setRecommendations(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="AI purchase recommendations"
      subtitle="Recommendations generated from stock and movement data."
      loading={loading}
      empty="No recommendations available yet."
    >
      {recommendations.map((item) => (
        <div className="list-row" key={item.id}>
          <div>
            <strong>{item.products?.product_name}</strong>
            <span>
              {item.suppliers?.supplier_name || 'Supplier'} ·{' '}
              {item.reasoning || 'No reasoning provided'}
            </span>
          </div>
          <div className="row-right">
            <strong>{item.suggested_quantity}</strong>
            <span className="status-pill">
              {item.status}
            </span>
          </div>
        </div>
      ))}
    </PanelList>
  )
}

/* ============================================================
   INVENTORY
============================================================ */

function InventoryModule({ store }) {
  const [tab, setTab] = useState('Products')

  return (
    <div className="module">
      <ModuleHeader
        eyebrow="INVENTORY"
        title="Inventory"
        description="Products, batches, expiry and stock control."
      />

      <TabBar
        tabs={INVENTORY_TABS}
        active={tab}
        onChange={setTab}
      />

      {tab === 'Products' && <ProductsInventory store={store} />}
      {tab === 'Batches' && <BatchesInventory store={store} />}
      {tab === 'Expiry' && <ExpiryInventory store={store} />}
      {tab === 'Low Stock' && <LowStockInventory store={store} />}
      {tab === 'Dead Stock' && <DeadStockInventory store={store} />}
      {tab === 'Stock Reconciliation' && (
        <StockReconciliation store={store} />
      )}
    </div>
  )
}

function ProductsInventory({ store }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showProductForm, setShowProductForm] = useState(false)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('store_products')
      .select(`
        *,
        products(
          id,
          product_name,
          generic_display_name,
          manufacturer,
          dosage_form,
          strength_display,
          pack_quantity,
          pack_unit,
          hsn_code,
          gst_rate,
          product_categories(name)
        )
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    setProducts(data || [])
    setLoading(false)
  }

  const filtered = products.filter((row) =>
    [
      row.products?.product_name,
      row.products?.generic_display_name,
      row.products?.manufacturer,
      row.products?.strength_display,
      row.products?.dosage_form,
      row.products?.product_categories?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Products</h3>
            <p>Product master and store-specific selling settings.</p>
          </div>

          <div className="header-actions">
            <input
              className="compact-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products"
            />

            <button
              className="primary-btn"
              onClick={() => setShowProductForm(true)}
            >
              + Add Product
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingInline />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No products found"
            text="Add your first product to begin."
          />
        ) : (
          <div className="product-grid">
            {filtered.map((row) => (
              <div className="product-card" key={row.id}>
                <div>
                  <span className="product-category">
                    {row.products?.product_categories?.name ||
                      'Product'}
                  </span>
                  <h3>{row.products?.product_name}</h3>
                  <p>
                    {row.products?.generic_display_name ||
                      'Generic composition not assigned'}
                  </p>
                </div>

                <div className="product-meta">
                  <span>
                    {row.products?.strength_display || ''}
                  </span>
                  <span>
                    {row.products?.manufacturer || ''}
                  </span>
                </div>

                <div className="product-pricing">
                  <div>
                    <small>Selling price</small>
                    <strong>
                      {money(row.default_selling_price)}
                    </strong>
                  </div>
                  <div>
                    <small>Discount</small>
                    <strong>
                      {Number(
                        row.default_discount_percent || 0,
                      )}
                      %
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showProductForm && (
        <ProductModal
          store={store}
          onClose={() => setShowProductForm(false)}
          onCreated={() => {
            setShowProductForm(false)
            load()
          }}
        />
      )}
    </>
  )
}

function BatchesInventory({ store }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('batches')
      .select(`
        *,
        products(product_name, manufacturer, strength_display)
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('expiry_date', { ascending: true })
      .limit(500)

    setBatches(data || [])
    setLoading(false)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Stock batches</h3>
          <p>Batch-wise stock, purchase rate, MRP and expiry.</p>
        </div>
      </div>

      {loading ? (
        <LoadingInline />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Stock</th>
                <th>Purchase</th>
                <th>MRP</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <strong>{batch.products?.product_name}</strong>
                    <span>
                      {batch.products?.strength_display || ''}
                    </span>
                  </td>
                  <td>{batch.batch_number}</td>
                  <td>{dateText(batch.expiry_date)}</td>
                  <td>
                    {batch.current_stock_units}{' '}
                    <small>units</small>
                  </td>
                  <td>{money(batch.purchase_rate_per_pack)}</td>
                  <td>{money(batch.mrp_per_pack)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ExpiryInventory({ store }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + 90)

    const { data } = await supabase
      .from('batches')
      .select(`
        *,
        products(product_name)
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .lte('expiry_date', cutoff.toISOString().slice(0, 10))
      .order('expiry_date', { ascending: true })

    setBatches(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Expiry watch"
      subtitle="Stock expiring within the next 90 days."
      loading={loading}
      empty="No stock is currently within the 90-day expiry window."
    >
      {batches.map((batch) => (
        <div className="list-row" key={batch.id}>
          <div>
            <strong>{batch.products?.product_name}</strong>
            <span>
              Batch {batch.batch_number} · {batch.current_stock_units}{' '}
              units
            </span>
          </div>
          <span className="status-pill danger">
            {dateText(batch.expiry_date)}
          </span>
        </div>
      ))}
    </PanelList>
  )
}

function LowStockInventory({ store }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('store_products')
      .select(`
        *,
        products(product_name, generic_display_name)
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)

    const rows = data || []

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const { data: batches } = await supabase
          .from('batches')
          .select('current_stock_units')
          .eq('store_id', store.id)
          .eq('product_id', row.product_id)
          .eq('is_active', true)

        const stock = (batches || []).reduce(
          (sum, batch) =>
            sum + Number(batch.current_stock_units || 0),
          0,
        )

        return {
          ...row,
          stock,
        }
      }),
    )

    setProducts(
      enriched.filter(
        (row) => row.stock <= Number(row.reorder_level || 0),
      ),
    )

    setLoading(false)
  }

  return (
    <PanelList
      title="Low stock"
      subtitle="Products at or below their reorder level."
      loading={loading}
      empty="No products currently require replenishment."
    >
      {products.map((row) => (
        <div className="list-row" key={row.id}>
          <div>
            <strong>{row.products?.product_name}</strong>
            <span>
              Reorder level: {row.reorder_level || 0}
            </span>
          </div>
          <span className="status-pill warning">
            {row.stock} units
          </span>
        </div>
      ))}
    </PanelList>
  )
}

function DeadStockInventory({ store }) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('stock_risk_snapshots')
      .select(`
        *,
        products(product_name)
      `)
      .eq('store_id', store.id)
      .eq('risk_category', 'dead_stock')
      .order('snapshot_date', { ascending: false })
      .limit(100)

    setSnapshots(data || [])
    setLoading(false)
  }

  return (
    <PanelList
      title="Dead stock"
      subtitle="Stock identified as slow or non-moving."
      loading={loading}
      empty="No dead-stock snapshots available yet."
    >
      {snapshots.map((item) => (
        <div className="list-row" key={item.id}>
          <div>
            <strong>{item.products?.product_name}</strong>
            <span>
              {item.stock_units} units ·{' '}
              {item.days_to_expiry ?? '—'} days to expiry
            </span>
          </div>
          <span className="status-pill danger">
            Dead stock
          </span>
        </div>
      ))}
    </PanelList>
  )
}

function StockReconciliation({ store }) {
  const [batches, setBatches] = useState([])
  const [physical, setPhysical] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    const { data } = await supabase
      .from('batches')
      .select(`
        id,
        batch_number,
        current_stock_units,
        products(product_name)
      `)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .order('batch_number')
      .limit(200)

    setBatches(data || [])
  }

  async function saveReconciliation(batch) {
    const value = Number(physical[batch.id])

    if (!Number.isFinite(value) || value < 0) {
      setMessage('Enter a valid physical stock quantity.')
      return
    }

    setBusy(true)

    const difference =
      value - Number(batch.current_stock_units || 0)

    const { error } = await supabase
      .from('stock_reconciliations')
      .insert({
        store_id: store.id,
        product_id: batch.products?.id || null,
        batch_id: batch.id,
        system_stock_units: batch.current_stock_units,
        physical_stock_units: value,
        difference_units: difference,
        reason: 'Physical stock reconciliation',
      })

    if (error) setMessage(error.message)
    else setMessage('Reconciliation recorded.')

    setBusy(false)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>Stock reconciliation</h3>
          <p>Compare system stock with physical stock.</p>
        </div>
      </div>

      {message && <div className="success-box">{message}</div>}

      <div className="list-table">
        {batches.map((batch) => (
          <div className="list-row" key={batch.id}>
            <div>
              <strong>{batch.products?.product_name}</strong>
              <span>Batch {batch.batch_number}</span>
            </div>

            <span>
              System: <strong>{batch.current_stock_units}</strong>
            </span>

            <input
              className="small-input"
              type="number"
              min="0"
              value={physical[batch.id] ?? ''}
              onChange={(e) =>
                setPhysical((current) => ({
                  ...current,
                  [batch.id]: e.target.value,
                }))
              }
              placeholder="Physical"
            />

            <button
              className="secondary-btn"
              disabled={busy}
              onClick={() => saveReconciliation(batch)}
            >
              Record
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================================================
   CUSTOMERS
============================================================ */

function CustomersModule({ store }) {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('name')
      .limit(500)

    setCustomers(data || [])
    setLoading(false)
  }

  const filtered = customers.filter((customer) =>
    [customer.name, customer.phone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  return (
    <div className="module">
      <ModuleHeader
        eyebrow="CUSTOMERS"
        title="Customers"
        description="Customer profiles, history and credit relationships."
      />

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Customer directory</h3>
            <p>Named customers and their contact information.</p>
          </div>

          <div className="header-actions">
            <input
              className="compact-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
            />

            <button
              className="primary-btn"
              onClick={() => setShowModal(true)}
            >
              + Add Customer
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingInline />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No customers found"
            text="Add a customer to maintain named billing history."
          />
        ) : (
          <div className="customer-grid">
            {filtered.map((customer) => (
              <div className="customer-card" key={customer.id}>
                <div className="avatar large">
                  {customer.name?.charAt(0)?.toUpperCase() || 'C'}
                </div>

                <div>
                  <strong>{customer.name}</strong>
                  <span>{customer.phone}</span>
                  <small>
                    {customer.address || 'No address added'}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CustomerModal
          store={store}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ============================================================
   REPORTS
============================================================ */

function ReportsModule({ store }) {
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const [{ data: salesData }, { data: purchaseData }] =
      await Promise.all([
        supabase
          .from('sales')
          .select('grand_total, amount_paid, amount_due')
          .eq('store_id', store.id)
          .eq('status', 'completed')
          .limit(5000),

        supabase
          .from('purchase_invoices')
          .select('total_amount')
          .eq('store_id', store.id)
          .limit(5000),
      ])

    setSales(salesData || [])
    setPurchases(purchaseData || [])
    setLoading(false)
  }

  const salesTotal = sales.reduce(
    (sum, row) => sum + Number(row.grand_total || 0),
    0,
  )

  const collected = sales.reduce(
    (sum, row) => sum + Number(row.amount_paid || 0),
    0,
  )

  const customerDue = sales.reduce(
    (sum, row) => sum + Number(row.amount_due || 0),
    0,
  )

  const purchaseTotal = purchases.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0,
  )

  if (loading) {
    return (
      <div className="module">
        <ModuleHeader
          eyebrow="REPORTS"
          title="Reports"
          description="Business overview from your pharmacy data."
        />
        <LoadingInline />
      </div>
    )
  }

  return (
    <div className="module">
      <ModuleHeader
        eyebrow="REPORTS"
        title="Reports"
        description="Business overview from your pharmacy data."
      />

      <div className="stat-grid">
        <StatCard
          label="Total Sales"
          value={money(salesTotal)}
          icon="₹"
        />
        <StatCard
          label="Collected"
          value={money(collected)}
          icon="✓"
        />
        <StatCard
          label="Customer Due"
          value={money(customerDue)}
          icon="!"
        />
        <StatCard
          label="Purchases"
          value={money(purchaseTotal)}
          icon="▤"
        />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h3>Sales report</h3>
          <p className="muted">
            Current completed sales available in the system.
          </p>

          <div className="report-metric">
            <span>Completed bills</span>
            <strong>{sales.length}</strong>
          </div>

          <div className="report-metric">
            <span>Average bill</span>
            <strong>
              {money(sales.length ? salesTotal / sales.length : 0)}
            </strong>
          </div>
        </div>

        <div className="panel">
          <h3>Purchase report</h3>
          <p className="muted">
            Supplier purchase activity recorded in PharmDesk.
          </p>

          <div className="report-metric">
            <span>Purchase invoices</span>
            <strong>{purchases.length}</strong>
          </div>

          <div className="report-metric">
            <span>Average invoice</span>
            <strong>
              {money(
                purchases.length
                  ? purchaseTotal / purchases.length
                  : 0,
              )}
            </strong>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   ALERTS
============================================================ */

function AlertsModule({ store }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('alerts')
      .select(`
        *,
        products(product_name),
        suppliers(supplier_name),
        customers(name)
      `)
      .eq('store_id', store.id)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })
      .limit(200)

    setAlerts(data || [])
    setLoading(false)
  }

  async function resolve(id) {
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
    <div className="module">
      <ModuleHeader
        eyebrow="ALERTS"
        title="Alerts"
        description="Items requiring attention without interrupting normal billing."
      />

      <div className="panel">
        {loading ? (
          <LoadingInline />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon="✓"
            title="No open alerts"
            text="Everything currently recorded is within your alert thresholds."
          />
        ) : (
          <div className="alert-list">
            {alerts.map((alert) => (
              <div className="alert-card" key={alert.id}>
                <div className={`alert-icon ${alert.severity || ''}`}>
                  !
                </div>

                <div className="alert-content">
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                  <small>{dateTimeText(alert.created_at)}</small>
                </div>

                <button
                  className="secondary-btn"
                  onClick={() => resolve(alert.id)}
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   SETTINGS
============================================================ */

function SettingsModule({ store, profile }) {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    load()
  }, [store.id])

  async function load() {
    const { data } = await supabase
      .from('store_settings')
      .select('*')
      .eq('store_id', store.id)
      .maybeSingle()

    setSettings(data)

    if (data) {
      setForm(data)
    }
  }

  async function save() {
    setBusy(true)
    setMessage('')

    const payload = {
      store_id: store.id,
      currency: form.currency || 'INR',
      gst_enabled: form.gst_enabled ?? true,
      default_gst_mode:
        form.default_gst_mode || 'inclusive',
      invoice_prefix: form.invoice_prefix || 'INV',
      invoice_start_number:
        Number(form.invoice_start_number || 1),
      near_expiry_days:
        Number(form.near_expiry_days || 90),
      dead_stock_days:
        Number(form.dead_stock_days || 60),
      allow_past_dated_bills:
        form.allow_past_dated_bills ?? true,
      allow_walk_in_sales:
        form.allow_walk_in_sales ?? true,
      require_salesperson:
        form.require_salesperson ?? false,
    }

    const { error } = await supabase
      .from('store_settings')
      .upsert(payload)

    if (error) setMessage(error.message)
    else {
      setMessage('Settings saved successfully.')
      load()
    }

    setBusy(false)
  }

  function setField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  return (
    <div className="module">
      <ModuleHeader
        eyebrow="SETTINGS"
        title="Settings"
        description="Configure your pharmacy workspace."
      />

      <div className="settings-grid">
        <div className="panel">
          <h3>Store information</h3>

          <div className="settings-store">
            <div className="store-avatar">LP</div>
            <div>
              <strong>{store.name}</strong>
              <span>{store.phone || 'Phone not added'}</span>
              <span>{store.email || 'Email not added'}</span>
            </div>
          </div>

          <div className="form-grid two">
            <label>
              Currency
              <input
                value={form.currency || 'INR'}
                onChange={(e) =>
                  setField('currency', e.target.value)
                }
              />
            </label>

            <label>
              Invoice prefix
              <input
                value={form.invoice_prefix || 'INV'}
                onChange={(e) =>
                  setField('invoice_prefix', e.target.value)
                }
              />
            </label>

            <label>
              Near-expiry threshold (days)
              <input
                type="number"
                value={form.near_expiry_days || 90}
                onChange={(e) =>
                  setField(
                    'near_expiry_days',
                    e.target.value,
                  )
                }
              />
            </label>

            <label>
              Dead-stock threshold (days)
              <input
                type="number"
                value={form.dead_stock_days || 60}
                onChange={(e) =>
                  setField(
                    'dead_stock_days',
                    e.target.value,
                  )
                }
              />
            </label>
          </div>
        </div>

        <div className="panel">
          <h3>Billing preferences</h3>

          <div className="settings-list">
            <ToggleRow
              label="GST enabled"
              description="Use GST fields throughout billing."
              value={form.gst_enabled ?? true}
              onChange={(value) =>
                setField('gst_enabled', value)
              }
            />

            <ToggleRow
              label="Allow walk-in sales"
              description="Permit anonymous rush-hour billing."
              value={form.allow_walk_in_sales ?? true}
              onChange={(value) =>
                setField('allow_walk_in_sales', value)
              }
            />

            <ToggleRow
              label="Allow past-dated bills"
              description="Permit authorized users to create past-dated bills."
              value={form.allow_past_dated_bills ?? true}
              onChange={(value) =>
                setField(
                  'allow_past_dated_bills',
                  value,
                )
              }
            />

            <ToggleRow
              label="Require salesperson"
              description="Require a salesperson on every completed bill."
              value={form.require_salesperson ?? false}
              onChange={(value) =>
                setField('require_salesperson', value)
              }
            />
          </div>

          {message && <div className="success-box">{message}</div>}

          <button
            className="primary-btn"
            disabled={busy}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   MODALS
============================================================ */

function CustomerModal({ store, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    setError('')

    if (!name.trim() || !phone.trim()) {
      setError('Customer name and phone are required.')
      return
    }

    setBusy(true)

    const { data, error: insertError } = await supabase
      .from('customers')
      .insert({
        store_id: store.id,
        customer_type: 'named',
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim() || null,
        is_active: true,
      })
      .select('*')
      .single()

    if (insertError) {
      setError(insertError.message)
      setBusy(false)
      return
    }

    onCreated(data)
    setBusy(false)
  }

  return (
    <Modal title="Add customer" onClose={onClose}>
      <form className="form-stack" onSubmit={save}>
        <label>
          Customer name *
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </label>

        <label>
          Phone *
          <input
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
            rows="3"
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

function SupplierModal({ store, onClose, onCreated }) {
  const [supplierName, setSupplierName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gstin, setGstin] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    setError('')

    if (!supplierName.trim()) {
      setError('Supplier name is required.')
      return
    }

    setBusy(true)

    const { data, error: insertError } = await supabase
      .from('suppliers')
      .insert({
        store_id: store.id,
        supplier_name: supplierName.trim(),
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim() || null,
        address: address.trim() || null,
        is_active: true,
      })
      .select('*')
      .single()

    if (insertError) {
      setError(insertError.message)
      setBusy(false)
      return
    }

    onCreated(data)
    setBusy(false)
  }

  return (
    <Modal title="Add purchase party" onClose={onClose}>
      <form className="form-stack" onSubmit={save}>
        <label>
          Supplier / purchase party *
          <input
            value={supplierName}
            onChange={(e) =>
              setSupplierName(e.target.value)
            }
            autoFocus
            required
          />
        </label>

        <div className="form-grid two">
          <label>
            Contact person
            <input
              value={contactPerson}
              onChange={(e) =>
                setContactPerson(e.target.value)
              }
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
        </div>

        <label>
          Address
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows="3"
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

const STRENGTH_UNITS = ['mg', 'ml', 'mcg', 'g', 'IU', '%']

function emptyIngredientRow() {
  return {
    ingredient_name: '',
    strength_value: '',
    strength_unit: 'mg',
  }
}

function CompositionModal({ onClose, onCreated }) {
  const [dosageForm, setDosageForm] = useState('')
  const [ingredients, setIngredients] = useState([
    emptyIngredientRow(),
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function updateIngredient(index, patch) {
    setIngredients((current) =>
      current.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    )
  }

  function addIngredientRow() {
    setIngredients((current) => [
      ...current,
      emptyIngredientRow(),
    ])
  }

  function removeIngredientRow(index) {
    if (ingredients.length === 1) return
    setIngredients((current) =>
      current.filter((_, i) => i !== index),
    )
  }

  const generatedName = ingredients
    .filter((row) => row.ingredient_name.trim())
    .map((row) =>
      [
        row.ingredient_name.trim(),
        row.strength_value
          ? `${row.strength_value}${row.strength_unit || ''}`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(' + ')

  async function save(event) {
    event.preventDefault()
    setError('')

    const validIngredients = ingredients.filter((row) =>
      row.ingredient_name.trim(),
    )

    if (validIngredients.length === 0) {
      setError('Add at least one ingredient.')
      return
    }

    if (!generatedName.trim()) {
      setError('Enter ingredient names to build the composition.')
      return
    }

    setBusy(true)

    const { data: composition, error: compositionError } =
      await supabase
        .from('compositions')
        .insert({
          name: generatedName.trim(),
          dosage_form: dosageForm.trim() || null,
          is_verified: false,
          is_active: true,
        })
        .select('*')
        .single()

    if (compositionError) {
      setError(compositionError.message)
      setBusy(false)
      return
    }

    const ingredientRows = validIngredients.map((row, index) => ({
      composition_id: composition.id,
      ingredient_name: row.ingredient_name.trim(),
      strength_value: row.strength_value
        ? Number(row.strength_value)
        : null,
      strength_unit: row.strength_unit || null,
      sequence_number: index + 1,
    }))

    const { data: savedIngredients, error: ingredientsError } =
      await supabase
        .from('composition_ingredients')
        .insert(ingredientRows)
        .select('*')

    if (ingredientsError) {
      setError(ingredientsError.message)
      setBusy(false)
      return
    }

    onCreated({
      ...composition,
      composition_ingredients: savedIngredients || ingredientRows,
    })

    setBusy(false)
  }

  return (
    <Modal title="Add new composition" onClose={onClose}>
      <form className="form-stack" onSubmit={save}>
        <label>
          Dosage form
          <input
            value={dosageForm}
            onChange={(e) => setDosageForm(e.target.value)}
            placeholder="Tablet / Syrup / Cream"
          />
        </label>

        <div className="form-stack">
          {ingredients.map((row, index) => (
            <div className="form-grid three" key={index}>
              <label>
                Ingredient *
                <input
                  value={row.ingredient_name}
                  onChange={(e) =>
                    updateIngredient(index, {
                      ingredient_name: e.target.value,
                    })
                  }
                  autoFocus={index === 0}
                  placeholder="e.g. Paracetamol"
                  required
                />
              </label>

              <label>
                Strength
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.strength_value}
                  onChange={(e) =>
                    updateIngredient(index, {
                      strength_value: e.target.value,
                    })
                  }
                  placeholder="e.g. 650"
                />
              </label>

              <label>
                Unit
                <div className="search-with-action">
                  <select
                    value={row.strength_unit}
                    onChange={(e) =>
                      updateIngredient(index, {
                        strength_unit: e.target.value,
                      })
                    }
                  >
                    {STRENGTH_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>

                  {ingredients.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeIngredientRow(index)}
                    >
                      ×
                    </button>
                  )}
                </div>
              </label>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="text-btn"
          onClick={addIngredientRow}
        >
          + Add another ingredient
        </button>

        {generatedName && (
          <div className="selected-chip">
            <div>
              <strong>{generatedName}</strong>
              <span>This name will be saved for the composition.</span>
            </div>
          </div>
        )}

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

function ProductModal({ store, onClose, onCreated }) {
  const [categories, setCategories] = useState([])
  const [compositions, setCompositions] = useState([])

  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [dosageForm, setDosageForm] = useState('')
  const [compositionId, setCompositionId] = useState('')
  const [compositionSearch, setCompositionSearch] = useState('')
  const [showCompositionSuggestions, setShowCompositionSuggestions] =
    useState(false)

  const [categoryId, setCategoryId] = useState('')
  const [hsn, setHsn] = useState('')
  const [gst, setGst] = useState(0)
  const [sellingPrice, setSellingPrice] = useState('')
  const [discount, setDiscount] = useState(0)
  const [minimumStock, setMinimumStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showCompositionForm, setShowCompositionForm] =
    useState(false)

  async function loadMasterData() {
    const [
      { data: categoryData, error: categoryError },
      { data: compositionData, error: compositionError },
    ] = await Promise.all([
      supabase
        .from('product_categories')
        .select('*')
        .eq('is_active', true)
        .order('name'),

      supabase
        .from('compositions')
        .select(`
          id,
          name,
          dosage_form,
          is_verified,
          composition_ingredients(
            ingredient_name,
            strength_value,
            strength_unit,
            sequence_number
          )
        `)
        .eq('is_active', true)
        .order('name'),
    ])

    if (categoryError) {
      setError(categoryError.message)
      return
    }

    if (compositionError) {
      setError(compositionError.message)
      return
    }

    setCategories(categoryData || [])

    setCompositions(
      (compositionData || []).map((composition) => ({
        ...composition,
        composition_ingredients: (
          composition.composition_ingredients || []
        ).sort(
          (a, b) =>
            Number(a.sequence_number || 0) -
            Number(b.sequence_number || 0),
        ),
      })),
    )
  }

  useEffect(() => {
    loadMasterData()
  }, [])

  const selectedComposition = compositions.find(
    (composition) => composition.id === compositionId,
  )

  const filteredCompositions = useMemo(() => {
    const query = compositionSearch
      .trim()
      .toLowerCase()

    if (!query) {
      return compositions.slice(0, 10)
    }

    return compositions
      .filter((composition) => {
        const ingredientText = (
          composition.composition_ingredients || []
        )
          .map((ingredient) =>
            [
              ingredient.ingredient_name,
              ingredient.strength_value,
              ingredient.strength_unit,
            ]
              .filter(Boolean)
              .join(' '),
          )
          .join(' ')

        const searchableText = [
          composition.name,
          composition.dosage_form,
          ingredientText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchableText.includes(query)
      })
      .slice(0, 10)
  }, [compositions, compositionSearch])

  function chooseComposition(composition) {
    setCompositionId(composition.id)
    setCompositionSearch(composition.name)
    setShowCompositionSuggestions(false)

    if (composition.dosage_form) {
      setDosageForm(composition.dosage_form)
    }
  }

  function clearComposition() {
    setCompositionId('')
    setCompositionSearch('')
    setShowCompositionSuggestions(true)
  }

  async function save(event) {
    event.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Product name is required.')
      return
    }

    if (Number(gst || 0) < 0 || Number(gst || 0) > 100) {
      setError('GST must be between 0 and 100%.')
      return
    }

    setBusy(true)

    const { data: productId, error: productError } =
      await supabase.rpc('pharmdesk_save_product', {
        p_store_id: store.id,
        p_product_id: null,
        p_product_name: name.trim(),
        p_generic_display_name:
          selectedComposition?.name || null,
        p_category_id: categoryId || null,
        p_composition_id: compositionId || null,
        p_manufacturer: manufacturer.trim() || null,
        p_dosage_form:
          selectedComposition?.dosage_form ||
          dosageForm.trim() ||
          null,
        p_strength_display: null,
        p_pack_quantity: 1,
        p_pack_unit: null,
        p_hsn_code: hsn.trim() || null,
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
      })

    if (productError) {
      setError(productError.message)
      setBusy(false)
      return
    }

    const { data: product, error: fetchError } =
      await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()

    if (fetchError) {
      setError(fetchError.message)
      setBusy(false)
      return
    }

    onCreated(product)
    setBusy(false)
  }

  function handleCompositionCreated(newComposition) {
    setShowCompositionForm(false)

    setCompositions((current) => {
      const exists = current.some(
        (item) => item.id === newComposition.id,
      )

      if (exists) return current

      return [...current, newComposition].sort((a, b) =>
        a.name.localeCompare(b.name),
      )
    })

    setCompositionId(newComposition.id)
    setCompositionSearch(newComposition.name)
    setShowCompositionSuggestions(false)

    if (newComposition.dosage_form) {
      setDosageForm(newComposition.dosage_form)
    }
  }

  return (
    <>
      <Modal title="Add new product" onClose={onClose}>
        <form className="form-stack" onSubmit={save}>
          <div className="form-grid two">
            <label>
              Brand / product name *
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                placeholder="e.g. Crocin 650"
              />
            </label>

            <label>
              Manufacturer
              <input
                value={manufacturer}
                onChange={(e) =>
                  setManufacturer(e.target.value)
                }
                placeholder="e.g. GlaxoSmithKline"
              />
            </label>

            <label>
              Generic composition
              <div className="search-with-action">
                <input
                  value={compositionSearch}
                  onChange={(e) => {
                    setCompositionSearch(e.target.value)
                    setCompositionId('')
                    setShowCompositionSuggestions(true)
                  }}
                  onFocus={() =>
                    setShowCompositionSuggestions(true)
                  }
                  placeholder="Type composition or ingredient"
                  autoComplete="off"
                />

                <button
                  type="button"
                  className="inline-btn"
                  onClick={() =>
                    setShowCompositionForm(true)
                  }
                >
                  + Add New
                </button>
              </div>

              {showCompositionSuggestions && (
                <div className="suggestion-list">
                  {filteredCompositions.length > 0 ? (
                    filteredCompositions.map(
                      (composition) => (
                        <button
                          type="button"
                          key={composition.id}
                          onClick={() =>
                            chooseComposition(
                              composition,
                            )
                          }
                        >
                          <div>
                            <strong>
                              {composition.name}
                            </strong>

                            <span>
                              {composition.dosage_form ||
                                'Dosage form not specified'}
                            </span>
                          </div>

                          {!composition.is_verified && (
                            <small>
                              Manual
                            </small>
                          )}
                        </button>
                      ),
                    )
                  ) : (
                    <div className="empty-state">
                      <strong>
                        No matching composition
                      </strong>
                      <span>
                        Use “+ Add New” to create it.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {selectedComposition && (
                <div className="selected-chip">
                  <div>
                    <strong>
                      {selectedComposition.name}
                    </strong>

                    {selectedComposition
                      .composition_ingredients
                      ?.length > 0 && (
                      <span>
                        {selectedComposition.composition_ingredients
                          .map(
                            (ingredient) =>
                              `${ingredient.ingredient_name} ${ingredient.strength_value} ${ingredient.strength_unit}`,
                          )
                          .join(' + ')}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={clearComposition}
                  >
                    ×
                  </button>
                </div>
              )}
            </label>

            <label>
              Dosage form
              <input
                value={dosageForm}
                onChange={(e) =>
                  setDosageForm(e.target.value)
                }
                placeholder="Tablet / Syrup / Cream"
                disabled={Boolean(
                  selectedComposition?.dosage_form,
                )}
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
                <option value="">
                  Select category
                </option>

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
                value={sellingPrice}
                onChange={(e) =>
                  setSellingPrice(e.target.value)
                }
                placeholder="₹0.00"
              />
            </label>

            <label>
              Default discount %
              <input
                type="number"
                min="0"
                max="100"
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

          {error && <div className="error-box">{error}</div>}

          <ModalActions
            onClose={onClose}
            busy={busy}
            label="Save Product"
          />
        </form>
      </Modal>

      {showCompositionForm && (
        <CompositionModal
          onClose={() => setShowCompositionForm(false)}
          onCreated={handleCompositionCreated}
        />
      )}
    </>
  )
}

/* ============================================================
   SHARED COMPONENTS
============================================================ */

function ModuleHeader({ eyebrow, title, description }) {
  return (
    <section className="module-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  )
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={active === tab ? 'active' : ''}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function PanelList({
  title,
  subtitle,
  loading,
  empty,
  children,
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      {loading ? (
        <LoadingInline />
      ) : React.Children.count(children) === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="list-table">{children}</div>
      )}
    </div>
  )
}

function EmptyState({ icon = '○', title, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {text && <span>{text}</span>}
    </div>
  )
}

function LoadingInline() {
  return (
    <div className="loading-inline">
      <div className="spinner small" />
      <span>Loading…</span>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({ onClose, busy, label }) {
  return (
    <div className="modal-actions">
      <button
        type="button"
        className="secondary-btn"
        onClick={onClose}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="primary-btn"
        disabled={busy}
      >
        {busy ? 'Saving…' : label}
      </button>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>

      <button
        type="button"
        className={`toggle ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span />
      </button>
    </div>
  )
}

export default App
