import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const money = (n = 0) =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const today = () => new Date().toISOString().slice(0, 10)

function initials(name = 'User') {
  return name
    .split(' ')
    .map(x => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Button({ children, onClick, variant = 'primary', disabled = false, type = 'button' }) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Modal({ title, children, onClose, width = '600px' }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder = '', type = 'text', required = false }) {
  return (
    <label className="field">
      <span>{label}{required && ' *'}</span>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

function Empty({ title, text }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

/* ---------------- AUTH ---------------- */

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand-mark">P</div>
        <h1>PharmDesk</h1>
        <p>Pharmacy billing & inventory management</p>

        <form onSubmit={login}>
          <Field label="Email" value={email} onChange={setEmail} type="email" required />
          <Field label="Password" value={password} onChange={setPassword} type="password" required />

          {error && <div className="message error">{error}</div>}

          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}

/* ---------------- APP SHELL ---------------- */

function Sidebar({ page, setPage, storeName }) {
  const items = [
    ['dashboard', 'Dashboard'],
    ['sales', 'Sales'],
    ['inventory', 'Inventory'],
    ['purchases', 'Purchases'],
    ['customers', 'Customers'],
    ['suppliers', 'Suppliers'],
    ['reports', 'Reports'],
    ['alerts', 'Alerts'],
    ['settings', 'Settings'],
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark small">P</div>
        <div>
          <strong>PharmDesk</strong>
          <span>{storeName || 'Pharmacy'}</span>
        </div>
      </div>

      <nav>
        {items.map(([id, label]) => (
          <button
            key={id}
            className={page === id ? 'nav-item active' : 'nav-item'}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-status">
        <span className="status-dot" />
        <div>
          <strong>Cloud Connected</strong>
          <small>All systems operational</small>
        </div>
      </div>
    </aside>
  )
}

function Topbar({ profile, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-search">
        Search products, customers, invoices…
      </div>

      <div className="topbar-user">
        <div className="avatar">{initials(profile?.full_name)}</div>
        <div>
          <strong>{profile?.full_name || 'User'}</strong>
          <small>{profile?.role || 'User'}</small>
        </div>
        <button onClick={onLogout}>Logout</button>
      </div>
    </header>
  )
}

/* ---------------- DASHBOARD ---------------- */

function Dashboard({ storeId, setPage }) {
  const [stats, setStats] = useState({
    sales: 0,
    purchases: 0,
    bills: 0,
    lowStock: 0,
    expiry: 0,
  })
  const [recent, setRecent] = useState([])

  useEffect(() => {
    if (!storeId) return
    load()
  }, [storeId])

  async function load() {
    const start = `${today()}T00:00:00`
    const end = `${today()}T23:59:59`

    const [{ data: sales }, { data: purchases }, { data: bills }, { data: batches }] =
      await Promise.all([
        supabase
          .from('sales')
          .select('grand_total')
          .eq('store_id', storeId)
          .eq('status', 'completed')
          .gte('bill_datetime', start)
          .lte('bill_datetime', end),

        supabase
          .from('purchase_invoices')
          .select('total_amount')
          .eq('store_id', storeId)
          .gte('invoice_date', today()),

        supabase
          .from('sales')
          .select('id,invoice_number,bill_datetime,grand_total,customer_id')
          .eq('store_id', storeId)
          .eq('status', 'completed')
          .order('bill_datetime', { ascending: false })
          .limit(5),

        supabase
          .from('batches')
          .select('current_stock_units,expiry_date')
          .eq('store_id', storeId)
          .eq('is_active', true),
      ])

    const low = (batches || []).filter(x => Number(x.current_stock_units) <= 5)
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 90)

    const expiry = (batches || []).filter(x =>
      new Date(x.expiry_date) <= expiryDate &&
      new Date(x.expiry_date) >= new Date()
    )

    setStats({
      sales: (sales || []).reduce((a, x) => a + Number(x.grand_total || 0), 0),
      purchases: (purchases || []).reduce((a, x) => a + Number(x.total_amount || 0), 0),
      bills: bills?.length || 0,
      lowStock: low.length,
      expiry: expiry.length,
    })

    setRecent(bills || [])
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Here’s what’s happening at your pharmacy today.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span>Today's Sales</span>
          <strong>{money(stats.sales)}</strong>
        </div>
        <div className="stat-card">
          <span>Today's Purchases</span>
          <strong>{money(stats.purchases)}</strong>
        </div>
        <div className="stat-card">
          <span>Bills</span>
          <strong>{stats.bills}</strong>
        </div>
        <div className="stat-card warning">
          <span>Low Stock</span>
          <strong>{stats.lowStock}</strong>
        </div>
        <div className="stat-card warning">
          <span>Near Expiry</span>
          <strong>{stats.expiry}</strong>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Recent Sales</h2>
            <Button variant="secondary" onClick={() => setPage('sales')}>
              View all
            </Button>
          </div>

          {recent.length === 0 ? (
            <Empty title="No sales yet" text="Completed sales will appear here." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(s => (
                    <tr key={s.id}>
                      <td>{s.invoice_number}</td>
                      <td>{new Date(s.bill_datetime).toLocaleString('en-IN')}</td>
                      <td>{money(s.grand_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Quick Actions</h2>
          </div>

          <div className="quick-actions">
            <Button onClick={() => setPage('sales')}>＋ New Sale</Button>
            <Button onClick={() => setPage('purchases')}>＋ New Purchase</Button>
            <Button onClick={() => setPage('inventory')}>＋ Add Product</Button>
            <Button onClick={() => setPage('customers')}>＋ Add Customer</Button>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------------- PRODUCT FORM ---------------- */

function ProductModal({ storeId, onClose, onSaved }) {
  const [form, setForm] = useState({
    product_name: '',
    generic_name: '',
    strength: '',
    dosage_form: '',
    manufacturer: '',
    category: '',
    pack_size: '',
    gst_rate: '0',
    default_discount_percent: '0',
  })

  const set = (key, value) => setForm(x => ({ ...x, [key]: value }))

  async function save() {
    if (!form.product_name.trim()) return

    const { data: category } = await supabase
      .from('product_categories')
      .select('id')
      .eq('store_id', storeId)
      .ilike('category_name', form.category.trim())
      .maybeSingle()

    let categoryId = category?.id

    if (!categoryId && form.category.trim()) {
      const { data } = await supabase
        .from('product_categories')
        .insert({
          store_id: storeId,
          category_name: form.category.trim(),
        })
        .select('id')
        .single()

      categoryId = data?.id
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        product_name: form.product_name.trim(),
        generic_name: form.generic_name.trim() || null,
        strength: form.strength.trim() || null,
        dosage_form: form.dosage_form.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        category_id: categoryId || null,
        pack_size: form.pack_size.trim() || null,
        gst_rate: Number(form.gst_rate || 0),
        default_discount_percent: Number(form.default_discount_percent || 0),
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    const { error: linkError } = await supabase
      .from('store_products')
      .insert({
        store_id: storeId,
        product_id: product.id,
        is_active: true,
      })

    if (linkError) {
      alert(linkError.message)
      return
    }

    onSaved(product)
  }

  return (
    <Modal title="Add New Product" onClose={onClose} width="760px">
      <div className="form-grid two">
        <Field label="Product / Brand Name" required value={form.product_name} onChange={v => set('product_name', v)} />
        <Field label="Generic / Composition" value={form.generic_name} onChange={v => set('generic_name', v)} />
        <Field label="Strength" value={form.strength} onChange={v => set('strength', v)} placeholder="e.g. 650 mg" />
        <Field label="Dosage Form" value={form.dosage_form} onChange={v => set('dosage_form', v)} placeholder="Tablet / Capsule / Syrup" />
        <Field label="Manufacturer" value={form.manufacturer} onChange={v => set('manufacturer', v)} />
        <Field label="Category" value={form.category} onChange={v => set('category', v)} />
        <Field label="Pack Size" value={form.pack_size} onChange={v => set('pack_size', v)} placeholder="e.g. 10 tablets" />
        <Field label="GST %" type="number" value={form.gst_rate} onChange={v => set('gst_rate', v)} />
        <Field label="Default Discount %" type="number" value={form.default_discount_percent} onChange={v => set('default_discount_percent', v)} />
      </div>

      <div className="ai-helper">
        <strong>AI-assisted product information</strong>
        <p>
          AI suggestions can be added here later. Nothing will be committed
          automatically without your approval.
        </p>
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save Product</Button>
      </div>
    </Modal>
  )
}

/* ---------------- INVENTORY ---------------- */

function Inventory({ storeId }) {
  const [tab, setTab] = useState('products')
  const [products, setProducts] = useState([])
  const [batches, setBatches] = useState([])
  const [search, setSearch] = useState('')
  const [showProduct, setShowProduct] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('store_products')
      .select(`
        id,
        product_id,
        products (
          id,
          product_name,
          generic_name,
          strength,
          dosage_form,
          manufacturer,
          pack_size,
          gst_rate,
          default_discount_percent
        )
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)

    setProducts(data || [])

    const { data: batchData } = await supabase
      .from('batches')
      .select(`
        id,
        batch_number,
        expiry_date,
        current_stock_units,
        mrp_per_pack,
        purchase_rate_per_pack,
        product_id,
        products (product_name)
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('expiry_date')

    setBatches(batchData || [])
  }

  useEffect(() => {
    if (storeId) load()
  }, [storeId])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return products

    return products.filter(x => {
      const p = x.products || {}
      return [
        p.product_name,
        p.generic_name,
        p.strength,
        p.dosage_form,
        p.manufacturer,
        p.pack_size,
      ].join(' ').toLowerCase().includes(q)
    })
  }, [products, search])

  const expiry = batches.filter(x => {
    const d = new Date(x.expiry_date)
    const limit = new Date()
    limit.setDate(limit.getDate() + 90)
    return d <= limit
  })

  const low = batches.filter(x => Number(x.current_stock_units) <= 5)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Manage products, batches and stock.</p>
        </div>
        <Button onClick={() => setShowProduct(true)}>＋ Add Product</Button>
      </div>

      <div className="tabs">
        {[
          ['products', 'Products'],
          ['batches', 'Batches'],
          ['expiry', 'Expiry'],
          ['low', 'Low Stock'],
          ['dead', 'Dead Stock'],
          ['reconcile', 'Stock Reconciliation'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'tab active' : 'tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <section className="panel">
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Search product, brand, composition, manufacturer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <Empty title="No products found" text="Add a product or change your search." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Composition</th>
                    <th>Manufacturer</th>
                    <th>Pack</th>
                    <th>GST</th>
                    <th>Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const p = row.products || {}
                    return (
                      <tr key={row.id}>
                        <td><strong>{p.product_name}</strong><br /><small>{p.strength}</small></td>
                        <td>{p.generic_name || '—'}</td>
                        <td>{p.manufacturer || '—'}</td>
                        <td>{p.pack_size || '—'}</td>
                        <td>{p.gst_rate || 0}%</td>
                        <td>{p.default_discount_percent || 0}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'batches' && (
        <StockTable rows={batches} />
      )}

      {tab === 'expiry' && (
        <StockTable rows={expiry} expiry />
      )}

      {tab === 'low' && (
        <StockTable rows={low} />
      )}

      {tab === 'dead' && (
        <Empty
          title="Dead Stock"
          text="Dead-stock intelligence will use movement history and expiry risk once sufficient transaction history is available."
        />
      )}

      {tab === 'reconcile' && (
        <Empty
          title="Stock Reconciliation"
          text="Physical stock reconciliation will be connected to the stock adjustment workflow."
        />
      )}

      {showProduct && (
        <ProductModal
          storeId={storeId}
          onClose={() => setShowProduct(false)}
          onSaved={() => {
            setShowProduct(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function StockTable({ rows, expiry = false }) {
  if (!rows.length) {
    return <Empty title="Nothing to show" text="No matching inventory records were found." />
  }

  return (
    <section className="panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>Stock</th>
              <th>Purchase Rate</th>
              <th>MRP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(x => (
              <tr key={x.id}>
                <td>{x.products?.product_name || '—'}</td>
                <td>{x.batch_number}</td>
                <td className={expiry ? 'danger-text' : ''}>
                  {x.expiry_date}
                </td>
                <td>{x.current_stock_units}</td>
                <td>{money(x.purchase_rate_per_pack)}</td>
                <td>{money(x.mrp_per_pack)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ---------------- CUSTOMER ---------------- */

function CustomerModal({ storeId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
  })

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) {
      alert('Customer name and phone are required.')
      return
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        store_id: storeId,
        customer_type: 'named',
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || null,
      })
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    onSaved(data)
  }

  return (
    <Modal title="Add Customer" onClose={onClose}>
      <Field label="Customer Name" required value={form.name} onChange={v => setForm({ ...form, name: v })} />
      <Field label="Phone" required value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
      <Field label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} />

      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save Customer</Button>
      </div>
    </Modal>
  )
}

function Customers({ storeId }) {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name')

    setCustomers(data || [])
  }

  useEffect(() => {
    if (storeId) load()
  }, [storeId])

  const filtered = customers.filter(c =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p>Customer records, credit and purchase history.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>＋ Add Customer</Button>
      </div>

      <section className="panel">
        <input
          className="search-input"
          placeholder="Search customer by name or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="table-wrap">
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
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.address || '—'}</td>
                  <td>{c.customer_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showAdd && (
        <CustomerModal
          storeId={storeId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ---------------- SUPPLIERS ---------------- */

function SupplierModal({ storeId, onClose, onSaved }) {
  const [form, setForm] = useState({
    supplier_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    gstin: '',
  })

  async function save() {
    if (!form.supplier_name.trim()) {
      alert('Supplier / purchase party name is required.')
      return
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        store_id: storeId,
        supplier_name: form.supplier_name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        gstin: form.gstin.trim() || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    onSaved(data)
  }

  return (
    <Modal title="Add Purchase Party" onClose={onClose}>
      <div className="form-grid two">
        <Field label="Party / Supplier Name" required value={form.supplier_name} onChange={v => setForm({ ...form, supplier_name: v })} />
        <Field label="Contact Person" value={form.contact_person} onChange={v => setForm({ ...form, contact_person: v })} />
        <Field label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
        <Field label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
        <Field label="GSTIN" value={form.gstin} onChange={v => setForm({ ...form, gstin: v })} />
        <Field label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} />
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save Purchase Party</Button>
      </div>
    </Modal>
  )
}

function Suppliers({ storeId }) {
  const [suppliers, setSuppliers] = useState([])
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('supplier_name')

    setSuppliers(data || [])
  }

  useEffect(() => {
    if (storeId) load()
  }, [storeId])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Suppliers</h1>
          <p>Purchase parties and supplier records.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>＋ Add Purchase Party</Button>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>GSTIN</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id}>
                  <td>{s.supplier_name}</td>
                  <td>{s.contact_person || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.gstin || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showAdd && (
        <SupplierModal
          storeId={storeId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ---------------- SALES ---------------- */

function Sales({ storeId, userId }) {
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [batches, setBatches] = useState([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [showCustomer, setShowCustomer] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data: ps } = await supabase
      .from('store_products')
      .select(`
        product_id,
        products (
          id,
          product_name,
          generic_name,
          strength,
          default_discount_percent,
          gst_rate
        )
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)

    const { data: cs } = await supabase
      .from('customers')
      .select('id,name,phone')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name')

    const { data: bs } = await supabase
      .from('batches')
      .select('id,product_id,batch_number,expiry_date,current_stock_units,mrp_per_pack,units_per_pack')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .gt('current_stock_units', 0)
      .order('expiry_date')

    setProducts(ps || [])
    setCustomers(cs || [])
    setBatches(bs || [])
  }

  useEffect(() => {
    if (storeId) load()
  }, [storeId])

  const matches = products.filter(x => {
    const p = x.products || {}
    return `${p.product_name} ${p.generic_name || ''} ${p.strength || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  }).slice(0, 8)

  function addProduct(row) {
    const p = row.products
    const batch = batches.find(b => b.product_id === p.id)

    if (!batch) {
      alert('No available stock batch found for this product.')
      return
    }

    setCart(old => [
      ...old,
      {
        key: `${p.id}-${Date.now()}`,
        product_id: p.id,
        batch_id: batch.id,
        name: p.product_name,
        batch: batch.batch_number,
        quantity: 1,
        units_per_pack: batch.units_per_pack || 1,
        mrp: Number(batch.mrp_per_pack || 0),
        discount: Number(p.default_discount_percent || 0),
        gst: Number(p.gst_rate || 0),
      },
    ])

    setSearch('')
  }

  function updateItem(key, field, value) {
    setCart(old => old.map(x =>
      x.key === key ? { ...x, [field]: Number(value) } : x
    ))
  }

  function removeItem(key) {
    setCart(old => old.filter(x => x.key !== key))
  }

  const subtotal = cart.reduce((sum, x) =>
    sum + x.quantity * x.mrp * (1 - x.discount / 100), 0)

  const gst = cart.reduce((sum, x) => {
    const taxable = x.quantity * x.mrp * (1 - x.discount / 100)
    return sum + taxable * x.gst / 100
  }, 0)

  const total = subtotal + gst

  async function completeSale() {
    if (!cart.length) {
      alert('Add at least one product.')
      return
    }

    setBusy(true)

    const items = cart.map(x => ({
      product_id: x.product_id,
      batch_id: x.batch_id,
      unit_type: 'pack',
      quantity_entered: x.quantity,
      quantity_units: x.quantity * x.units_per_pack,
      units_per_pack: x.units_per_pack,
      mrp_per_pack: x.mrp,
      selling_price_per_pack: x.mrp,
      default_discount_percent: x.discount,
      discount_percent: x.discount,
      gst_rate: x.gst,
    }))

    const payments = [
      {
        payment_method: paymentMethod,
        amount: total,
      },
    ]

    const { error } = await supabase.rpc('pharmdesk_complete_sale', {
      p_store_id: storeId,
      p_customer_id: customerId || null,
      p_bill_datetime: new Date().toISOString(),
      p_bill_discount_amount: 0,
      p_notes: null,
      p_items: items,
      p_payments: payments,
    })

    if (error) {
      alert(error.message)
    } else {
      alert('Sale completed successfully.')
      setCart([])
      setCustomerId('')
      load()
    }

    setBusy(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sales</h1>
          <p>Create bills, manage customers and complete payments.</p>
        </div>
      </div>

      <div className="billing-layout">
        <section className="panel">
          <div className="billing-top">
            <div className="customer-selector">
              <label>Customer</label>
              <div className="inline-select">
                <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Walk-in Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.phone}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={() => setShowCustomer(true)}>
                  ＋ Add Customer
                </Button>
              </div>
            </div>
          </div>

          <div className="product-search">
            <input
              className="search-input"
              placeholder="Search product by name, brand or composition…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {search && (
              <div className="search-results">
                {matches.map(row => (
                  <button key={row.product_id} onClick={() => addProduct(row)}>
                    <strong>{row.products.product_name}</strong>
                    <span>{row.products.generic_name} {row.products.strength}</span>
                  </button>
                ))}

                {!matches.length && (
                  <div className="no-match">
                    <span>No matching product found.</span>
                    <Button variant="secondary">＋ Add New Product</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <Empty title="No items in this bill" text="Search for a product above to begin." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Qty</th>
                    <th>MRP</th>
                    <th>Discount</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cart.map(x => (
                    <tr key={x.key}>
                      <td>{x.name}</td>
                      <td>{x.batch}</td>
                      <td>
                        <input
                          className="small-input"
                          type="number"
                          min="1"
                          value={x.quantity}
                          onChange={e => updateItem(x.key, 'quantity', e.target.value)}
                        />
                      </td>
                      <td>{money(x.mrp)}</td>
                      <td>
                        <input
                          className="small-input"
                          type="number"
                          min="0"
                          value={x.discount}
                          onChange={e => updateItem(x.key, 'discount', e.target.value)}
                        />
                      </td>
                      <td>
                        {money(
                          x.quantity * x.mrp *
                          (1 - x.discount / 100)
                        )}
                      </td>
                      <td>
                        <button className="danger-link" onClick={() => removeItem(x.key)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="billing-summary panel">
          <h2>Bill Summary</h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>

          <div className="summary-row">
            <span>GST</span>
            <strong>{money(gst)}</strong>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>

          <label className="field">
            <span>Payment Method</span>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="credit">Credit / Udhar</option>
            </select>
          </label>

          <Button disabled={busy || !cart.length} onClick={completeSale}>
            {busy ? 'Completing…' : 'Complete Sale'}
          </Button>
        </aside>
      </div>

      {showCustomer && (
        <CustomerModal
          storeId={storeId}
          onClose={() => setShowCustomer(false)}
          onSaved={customer => {
            setShowCustomer(false)
            setCustomers(old => [...old, customer])
            setCustomerId(customer.id)
          }}
        />
      )}
    </div>
  )
}

/* ---------------- PURCHASES ---------------- */

function Purchases({ storeId, userId }) {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [showSupplier, setShowSupplier] = useState(false)
  const [showProduct, setShowProduct] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data: ss } = await supabase
      .from('suppliers')
      .select('id,supplier_name')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('supplier_name')

    const { data: ps } = await supabase
      .from('store_products')
      .select(`
        product_id,
        products (
          id,
          product_name,
          generic_name,
          strength,
          gst_rate
        )
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)

    setSuppliers(ss || [])
    setProducts(ps || [])
  }

  useEffect(() => {
    if (storeId) load()
  }, [storeId])

  const matches = products.filter(x =>
    `${x.products?.product_name || ''} ${x.products?.generic_name || ''} ${x.products?.strength || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  ).slice(0, 8)

  function addProduct(row) {
    setItems(old => [
      ...old,
      {
        key: `${row.product_id}-${Date.now()}`,
        product_id: row.product_id,
        name: row.products.product_name,
        batch_number: '',
        expiry_date: '',
        paid_packs: 1,
        free_packs: 0,
        loose_units: 0,
        purchase_rate_per_pack: 0,
        mrp_per_pack: 0,
        gst_rate: Number(row.products.gst_rate || 0),
      },
    ])
    setSearch('')
  }

  function updateItem(key, field, value) {
    setItems(old => old.map(x =>
      x.key === key
        ? {
            ...x,
            [field]: ['paid_packs', 'free_packs', 'loose_units', 'purchase_rate_per_pack', 'mrp_per_pack', 'gst_rate'].includes(field)
              ? Number(value)
              : value,
          }
        : x
    ))
  }

  function removeItem(key) {
    setItems(old => old.filter(x => x.key !== key))
  }

  const subtotal = items.reduce(
    (a, x) => a + x.paid_packs * x.purchase_rate_per_pack,
    0
  )

  const gst = items.reduce(
    (a, x) => a + x.paid_packs * x.purchase_rate_per_pack * x.gst_rate / 100,
    0
  )

  const total = subtotal + gst

  async function savePurchase() {
    if (!supplierId) {
      alert('Select a purchase party.')
      return
    }

    if (!invoiceNumber.trim()) {
      alert('Enter the supplier invoice number.')
      return
    }

    if (!items.length) {
      alert('Add at least one product.')
      return
    }

    setBusy(true)

    const payload = items.map(x => ({
      product_id: x.product_id,
      batch_number: x.batch_number,
      expiry_date: x.expiry_date,
      paid_packs: x.paid_packs,
      free_packs: x.free_packs,
      loose_units: x.loose_units,
      purchase_rate_per_pack: x.purchase_rate_per_pack,
      mrp_per_pack: x.mrp_per_pack,
      gst_rate: x.gst_rate,
    }))

    const { error } = await supabase.rpc('pharmdesk_complete_purchase', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_invoice_number: invoiceNumber,
      p_invoice_date: invoiceDate,
      p_items: payload,
      p_discount_amount: 0,
      p_cgst_amount: gst / 2,
      p_sgst_amount: gst / 2,
      p_igst_amount: 0,
      p_other_charges: 0,
      p_notes: null,
    })

    if (error) {
      alert(error.message)
    } else {
      alert('Purchase saved successfully.')
      setItems([])
      setInvoiceNumber('')
      load()
    }

    setBusy(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Purchases</h1>
          <p>Record supplier invoices and add stock.</p>
        </div>
      </div>

      <div className="billing-layout">
        <section className="panel">
          <div className="form-grid two">
            <label className="field">
              <span>Purchase Party</span>
              <div className="inline-select">
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.supplier_name}</option>
                  ))}
                </select>
                <Button variant="secondary" onClick={() => setShowSupplier(true)}>
                  ＋ Add Purchase Party
                </Button>
              </div>
            </label>

            <Field
              label="Invoice Number"
              required
              value={invoiceNumber}
              onChange={setInvoiceNumber}
            />

            <Field
              label="Invoice Date"
              type="date"
              value={invoiceDate}
              onChange={setInvoiceDate}
            />
          </div>

          <div className="product-search">
            <input
              className="search-input"
              placeholder="Search product to add to purchase…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {search && (
              <div className="search-results">
                {matches.map(row => (
                  <button key={row.product_id} onClick={() => addProduct(row)}>
                    <strong>{row.products.product_name}</strong>
                    <span>{row.products.generic_name} {row.products.strength}</span>
                  </button>
                ))}

                {!matches.length && (
                  <div className="no-match">
                    <span>No matching product found.</span>
                    <Button variant="secondary" onClick={() => setShowProduct(true)}>
                      ＋ Add New Product
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <Empty title="No products added" text="Search and add products to this purchase invoice." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th>Paid</th>
                    <th>Free</th>
                    <th>Purchase Rate</th>
                    <th>MRP</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map(x => (
                    <tr key={x.key}>
                      <td>{x.name}</td>
                      <td>
                        <input className="small-input" value={x.batch_number} onChange={e => updateItem(x.key, 'batch_number', e.target.value)} />
                      </td>
                      <td>
                        <input className="small-input" type="date" value={x.expiry_date} onChange={e => updateItem(x.key, 'expiry_date', e.target.value)} />
                      </td>
                      <td>
                        <input className="small-input" type="number" value={x.paid_packs} onChange={e => updateItem(x.key, 'paid_packs', e.target.value)} />
                      </td>
                      <td>
                        <input className="small-input" type="number" value={x.free_packs} onChange={e => updateItem(x.key, 'free_packs', e.target.value)} />
                      </td>
                      <td>
                        <input className="small-input" type="number" value={x.purchase_rate_per_pack} onChange={e => updateItem(x.key, 'purchase_rate_per_pack', e.target.value)} />
                      </td>
                      <td>
                        <input className="small-input" type="number" value={x.mrp_per_pack} onChange={e => updateItem(x.key, 'mrp_per_pack', e.target.value)} />
                      </td>
                      <td>
                        <button className="danger-link" onClick={() => removeItem(x.key)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="billing-summary panel">
          <h2>Invoice Summary</h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>

          <div className="summary-row">
            <span>GST</span>
            <strong>{money(gst)}</strong>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>

          <Button disabled={busy || !items.length} onClick={savePurchase}>
            {busy ? 'Saving…' : 'Save Purchase'}
          </Button>
        </aside>
      </div>

      {showSupplier && (
        <SupplierModal
          storeId={storeId}
          onClose={() => setShowSupplier(false)}
          onSaved={supplier => {
            setShowSupplier(false)
            setSuppliers(old => [...old, supplier])
            setSupplierId(supplier.id)
          }}
        />
      )}

      {showProduct && (
        <ProductModal
          storeId={storeId}
          onClose={() => setShowProduct(false)}
          onSaved={product => {
            setShowProduct(false)
            load()
            addProduct({
              product_id: product.id,
              products: product,
            })
          }}
        />
      )}
    </div>
  )
}

/* ---------------- REPORTS / ALERTS / SETTINGS ---------------- */

function Reports() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Sales, purchases and inventory reporting.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><span>Sales</span><strong>—</strong></div>
        <div className="stat-card"><span>Purchases</span><strong>—</strong></div>
        <div className="stat-card"><span>Gross Profit</span><strong>—</strong></div>
        <div className="stat-card"><span>GST</span><strong>—</strong></div>
      </div>

      <Empty
        title="Reporting engine"
        text="The reporting screens are connected to the transaction database and will be expanded with date ranges, GST, profit, stock movement and custom reports."
      />
    </div>
  )
}

function Alerts() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>Inventory and payment alerts that need attention.</p>
        </div>
      </div>

      <Empty
        title="No active alerts"
        text="Low stock, expiry, dead stock, supplier dues and customer credit alerts will appear here."
      />
    </div>
  )
}

function Settings({ storeName }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Store and PharmDesk configuration.</p>
        </div>
      </div>

      <section className="panel">
        <h2>Store Settings</h2>
        <p className="muted">Current store: {storeName}</p>

        <div className="settings-list">
          <div>Billing preferences</div>
          <div>User roles and permissions</div>
          <div>GST configuration</div>
          <div>Invoice / printing preferences</div>
          <div>Audit trail</div>
          <div>Cloud and integration settings</div>
        </div>
      </section>
    </div>
  )
}

/* ---------------- MAIN APP ---------------- */

function PharmacyApp({ session, profile, store }) {
  const [page, setPage] = useState('dashboard')

  async function logout() {
    await supabase.auth.signOut()
  }

  function renderPage() {
    switch (page) {
      case 'sales':
        return <Sales storeId={store.id} userId={session.user.id} />
      case 'inventory':
        return <Inventory storeId={store.id} />
      case 'purchases':
        return <Purchases storeId={store.id} userId={session.user.id} />
      case 'customers':
        return <Customers storeId={store.id} />
      case 'suppliers':
        return <Suppliers storeId={store.id} />
      case 'reports':
        return <Reports />
      case 'alerts':
        return <Alerts />
      case 'settings':
        return <Settings storeName={store.store_name} />
      default:
        return <Dashboard storeId={store.id} setPage={setPage} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} storeName={store.store_name} />

      <main className="main-area">
        <Topbar profile={profile} onLogout={logout} />

        <div className="content-area">
          {renderPage()}
        </div>
      </main>

      <div className="mobile-nav">
        <button onClick={() => setPage('dashboard')}>Home</button>
        <button onClick={() => setPage('sales')}>Sales</button>
        <button onClick={() => setPage('inventory')}>Stock</button>
        <button onClick={() => setPage('purchases')}>Purchase</button>
        <button onClick={() => setPage('customers')}>Customers</button>
      </div>
    </div>
  )
}

/* ---------------- ROOT ---------------- */

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [store, setStore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function initialize() {
      const { data } = await supabase.auth.getSession()

      if (!mounted) return

      setSession(data.session)

      if (data.session) {
        await loadUserData(data.session.user.id)
      } else {
        setLoading(false)
      }
    }

    async function loadUserData(userId) {
      const { data: p } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      const { data: membership } = await supabase
        .from('store_memberships')
        .select(`
          store_id,
          role,
          stores (
            id,
            store_name
          )
        `)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()

      if (!mounted) return

      setProfile(p || {
        full_name: 'User',
        role: membership?.role || 'salesperson',
      })

      setStore(membership?.stores || null)
      setLoading(false)
    }

    initialize()

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return

        setSession(newSession)

        if (newSession) {
          setLoading(true)
          await loadUserData(newSession.user.id)
        } else {
          setProfile(null)
          setStore(null)
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="brand-mark">P</div>
        <strong>Loading PharmDesk…</strong>
      </div>
    )
  }

  if (!session) return <LoginScreen />

  if (!store) {
    return (
      <div className="loading-screen">
        <h2>No pharmacy store assigned</h2>
        <p>Your account is authenticated, but no store membership was found.</p>
      </div>
    )
  }

  return (
    <PharmacyApp
      session={session}
      profile={profile}
      store={store}
    />
  )
}