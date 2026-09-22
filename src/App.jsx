import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const today = () => new Date().toISOString().slice(0, 10)

function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
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

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) setError(error.message)

    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">P</div>
        <h1>PharmDesk</h1>
        <p>Pharmacy billing & inventory management</p>

        <form onSubmit={submit}>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </Field>

          {error && <div className="error-message">{error}</div>}

          <Button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function Sidebar({ page, setPage, store }) {
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
      <div className="brand">
        <div className="brand-mark">P</div>
        <div>
          <strong>PharmDesk</strong>
          <small>{store?.name || 'Pharmacy'}</small>
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

      <div className="sidebar-footer">
        <small>LABDHI PHARMA</small>
      </div>
    </aside>
  )
}

function Topbar({ title, user, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
      </div>

      <div className="topbar-right">
        <span className="user-name">
          {user?.email || 'Administrator'}
        </span>

        <button className="logout-button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}

function Dashboard({ storeId }) {
  const [stats, setStats] = useState({
    sales: 0,
    purchases: 0,
    products: 0,
    lowStock: 0,
  })

  useEffect(() => {
    load()
  }, [storeId])

  async function load() {
    const start = today()

    const [
      salesResult,
      purchasesResult,
      productsResult,
      batchesResult,
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('grand_total')
        .eq('store_id', storeId)
        .eq('status', 'completed')
        .gte('bill_datetime', `${start}T00:00:00`),

      supabase
        .from('purchase_invoices')
        .select('total_amount')
        .eq('store_id', storeId)
        .eq('invoice_date', start),

      supabase
        .from('store_products')
        .select('id')
        .eq('store_id', storeId)
        .eq('is_active', true),

      supabase
        .from('batches')
        .select('current_stock_units')
        .eq('store_id', storeId)
        .eq('is_active', true),
    ])

    const sales = (salesResult.data || []).reduce(
      (sum, row) => sum + Number(row.grand_total || 0),
      0,
    )

    const purchases = (purchasesResult.data || []).reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0,
    )

    const lowStock = (batchesResult.data || []).filter(
      (row) => Number(row.current_stock_units || 0) <= 10,
    ).length

    setStats({
      sales,
      purchases,
      products: productsResult.data?.length || 0,
      lowStock,
    })
  }

  return (
    <div className="page-content">
      <div className="welcome">
        <div>
          <h2>Good morning</h2>
          <p>Here is today's pharmacy overview.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span>Today's Sales</span>
          <strong>{money(stats.sales)}</strong>
        </div>

        <div className="stat-card">
          <span>Today's Purchases</span>
          <strong>{money(stats.purchases)}</strong>
        </div>

        <div className="stat-card">
          <span>Active Products</span>
          <strong>{stats.products}</strong>
        </div>

        <div className="stat-card">
          <span>Low Stock</span>
          <strong>{stats.lowStock}</strong>
        </div>
      </div>

      <div className="dashboard-panel">
        <h2>PharmDesk</h2>
        <p>
          Your pharmacy billing and inventory system is connected successfully.
        </p>
      </div>
    </div>
  )
}

function ProductModal({ storeId, onClose, onSaved }) {
  const [form, setForm] = useState({
    product_name: '',
    generic_name: '',
    strength: '',
    dosage_form: '',
    manufacturer: '',
    category_id: '',
    pack_size: '',
    gst_rate: '',
    default_discount_percent: '',
  })

  const [categories, setCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    const { data } = await supabase
      .from('product_categories')
      .select('*')
      .order('name')

    setCategories(data || [])
  }

  function update(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        product_name: form.product_name.trim(),
        generic_name: form.generic_name.trim() || null,
        strength: form.strength.trim() || null,
        dosage_form: form.dosage_form.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        category_id: form.category_id || null,
        pack_size: form.pack_size.trim() || null,
        gst_rate: Number(form.gst_rate || 0),
        default_discount_percent: Number(
          form.default_discount_percent || 0,
        ),
      })
      .select()
      .single()

    if (productError) {
      setError(productError.message)
      setSaving(false)
      return
    }

    const { error: storeProductError } = await supabase
      .from('store_products')
      .insert({
        store_id: storeId,
        product_id: product.id,
        is_active: true,
      })

    if (storeProductError) {
      setError(storeProductError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved(product)
  }

  return (
    <Modal title="Add New Product" onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="Product name">
          <input
            value={form.product_name}
            onChange={(e) => update('product_name', e.target.value)}
            required
          />
        </Field>

        <Field label="Generic name">
          <input
            value={form.generic_name}
            onChange={(e) => update('generic_name', e.target.value)}
          />
        </Field>

        <Field label="Strength">
          <input
            value={form.strength}
            onChange={(e) => update('strength', e.target.value)}
          />
        </Field>

        <Field label="Dosage form">
          <input
            value={form.dosage_form}
            onChange={(e) => update('dosage_form', e.target.value)}
            placeholder="Tablet / Capsule / Syrup"
          />
        </Field>

        <Field label="Manufacturer">
          <input
            value={form.manufacturer}
            onChange={(e) => update('manufacturer', e.target.value)}
          />
        </Field>

        <Field label="Category">
          <select
            value={form.category_id}
            onChange={(e) => update('category_id', e.target.value)}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name || category.category_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Pack size">
          <input
            value={form.pack_size}
            onChange={(e) => update('pack_size', e.target.value)}
            placeholder="10 tablets"
          />
        </Field>

        <Field label="GST %">
          <input
            type="number"
            value={form.gst_rate}
            onChange={(e) => update('gst_rate', e.target.value)}
          />
        </Field>

        <Field label="Default discount %">
          <input
            type="number"
            value={form.default_discount_percent}
            onChange={(e) =>
              update('default_discount_percent', e.target.value)
            }
          />
        </Field>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Product'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Inventory({ storeId }) {
  const [tab, setTab] = useState('products')
  const [products, setProducts] = useState([])
  const [batches, setBatches] = useState([])
  const [search, setSearch] = useState('')
  const [showProductModal, setShowProductModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)

    const { data: storeProducts } = await supabase
      .from('store_products')
      .select(`
        id,
        product_id,
        is_active,
        products (
          id,
          product_name,
          generic_name,
          strength,
          dosage_form,
          manufacturer,
          category_id,
          pack_size,
          gst_rate,
          default_discount_percent
        )
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)

    const { data: batchData } = await supabase
      .from('batches')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('expiry_date')

    setProducts(storeProducts || [])
    setBatches(batchData || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [storeId])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return products

    return products.filter((row) => {
      const product = row.products || {}

      return [
        product.product_name,
        product.generic_name,
        product.strength,
        product.dosage_form,
        product.manufacturer,
        product.pack_size,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [products, search])

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h2>Inventory</h2>
          <p>Manage products, batches and stock.</p>
        </div>

        <Button onClick={() => setShowProductModal(true)}>
          + Add Product
        </Button>
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
        <>
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Search products, generic, strength or manufacturer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="loading">Loading inventory...</div>
          ) : filteredProducts.length === 0 ? (
            <Empty
              title="No products found"
              text="Add your first product to begin building the inventory."
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Generic</th>
                    <th>Strength</th>
                    <th>Manufacturer</th>
                    <th>Pack</th>
                    <th>GST</th>
                    <th>Discount</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((row) => {
                    const p = row.products || {}

                    return (
                      <tr key={row.id}>
                        <td><strong>{p.product_name}</strong></td>
                        <td>{p.generic_name || '—'}</td>
                        <td>{p.strength || '—'}</td>
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
        </>
      )}

      {tab === 'batches' && (
        <div className="table-wrap">
          {batches.length === 0 ? (
            <Empty title="No batches" text="No stock batches have been created yet." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Product ID</th>
                  <th>Expiry</th>
                  <th>Stock</th>
                  <th>Purchase Rate</th>
                  <th>MRP</th>
                </tr>
              </thead>

              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.batch_number}</td>
                    <td>{batch.product_id}</td>
                    <td>{batch.expiry_date || '—'}</td>
                    <td>{batch.current_stock_units || 0}</td>
                    <td>{money(batch.purchase_rate_per_pack)}</td>
                    <td>{money(batch.mrp_per_pack)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab !== 'products' && tab !== 'batches' && (
        <Empty
          title="Section ready"
          text="This inventory section will be connected to the full stock engine in the next implementation step."
        />
      )}

      {showProductModal && (
        <ProductModal
          storeId={storeId}
          onClose={() => setShowProductModal(false)}
          onSaved={() => {
            setShowProductModal(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function CustomerModal({ storeId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { data, error } = await supabase
      .from('customers')
      .insert({
        store_id: storeId,
        customer_type: 'named',
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved(data)
  }

  return (
    <Modal title="Add Customer" onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="Customer name">
          <input
            required
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
          />
        </Field>

        <Field label="Phone">
          <input
            required
            value={form.phone}
            onChange={(e) =>
              setForm({ ...form, phone: e.target.value })
            }
          />
        </Field>

        <Field label="Address">
          <textarea
            value={form.address}
            onChange={(e) =>
              setForm({ ...form, address: e.target.value })
            }
          />
        </Field>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Customers({ storeId }) {
  const [customers, setCustomers] = useState([])
  const [showModal, setShowModal] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .order('name')

    setCustomers(data || [])
  }

  useEffect(() => {
    load()
  }, [storeId])

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h2>Customers</h2>
          <p>Customer records and credit history.</p>
        </div>

        <Button onClick={() => setShowModal(true)}>
          + Add Customer
        </Button>
      </div>

      {customers.length === 0 ? (
        <Empty
          title="No customers"
          text="Customer records will appear here."
        />
      ) : (
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
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.address || '—'}</td>
                  <td>{customer.customer_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CustomerModal
          storeId={storeId}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function SupplierModal({ storeId, onClose, onSaved }) {
  const [form, setForm] = useState({
    supplier_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    gstin: '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

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
      setError(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved(data)
  }

  return (
    <Modal title="Add Purchase Party" onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="Supplier / Purchase Party">
          <input
            required
            value={form.supplier_name}
            onChange={(e) =>
              setForm({
                ...form,
                supplier_name: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Contact person">
          <input
            value={form.contact_person}
            onChange={(e) =>
              setForm({
                ...form,
                contact_person: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Phone">
          <input
            value={form.phone}
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value,
              })
            }
          />
        </Field>

        <Field label="GSTIN">
          <input
            value={form.gstin}
            onChange={(e) =>
              setForm({
                ...form,
                gstin: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Address">
          <textarea
            value={form.address}
            onChange={(e) =>
              setForm({
                ...form,
                address: e.target.value,
              })
            }
          />
        </Field>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Purchase Party'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Suppliers({ storeId }) {
  const [suppliers, setSuppliers] = useState([])
  const [showModal, setShowModal] = useState(false)

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
    load()
  }, [storeId])

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h2>Suppliers</h2>
          <p>Manage purchase parties and supplier information.</p>
        </div>

        <Button onClick={() => setShowModal(true)}>
          + Add Purchase Party
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <Empty
          title="No suppliers"
          text="Add a purchase party to begin recording purchases."
        />
      ) : (
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
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.supplier_name}</td>
                  <td>{supplier.contact_person || '—'}</td>
                  <td>{supplier.phone || '—'}</td>
                  <td>{supplier.gstin || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <SupplierModal
          storeId={storeId}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function Placeholder({ title, text }) {
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>

      <Empty
        title="Module connected"
        text="The database foundation is ready. This module will be expanded next."
      />
    </div>
  )
}

function PharmacyApp({ user, store, membership }) {
  const [page, setPage] = useState('dashboard')

  const titles = {
    dashboard: 'Dashboard',
    sales: 'Sales',
    inventory: 'Inventory',
    purchases: 'Purchases',
    customers: 'Customers',
    suppliers: 'Suppliers',
    reports: 'Reports',
    alerts: 'Alerts',
    settings: 'Settings',
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={setPage}
        store={store}
      />

      <main className="main-area">
        <Topbar
          title={titles[page]}
          user={user}
          onLogout={logout}
        />

        <div className="main-scroll">
          {page === 'dashboard' && (
            <Dashboard storeId={store.id} />
          )}

          {page === 'inventory' && (
            <Inventory storeId={store.id} />
          )}

          {page === 'customers' && (
            <Customers storeId={store.id} />
          )}

          {page === 'suppliers' && (
            <Suppliers storeId={store.id} />
          )}

          {page === 'sales' && (
            <Placeholder
              title="Sales"
              text="Billing and sales management."
            />
          )}

          {page === 'purchases' && (
            <Placeholder
              title="Purchases"
              text="Purchase invoices, stock intake and supplier payments."
            />
          )}

          {page === 'reports' && (
            <Placeholder
              title="Reports"
              text="Sales, purchase, stock and financial reports."
            />
          )}

          {page === 'alerts' && (
            <Placeholder
              title="Alerts"
              text="Expiry, stock, credit and purchase alerts."
            />
          )}

          {page === 'settings' && (
            <Placeholder
              title="Settings"
              text="Store and PharmDesk configuration."
            />
          )}
        </div>
      </main>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [store, setStore] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function initialise() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (!session?.user) {
        setUser(null)
        setLoading(false)
        return
      }

      await loadUserStore(session.user)

      if (mounted) setLoading(false)
    }

    async function authListener() {
      const { data } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (!session?.user) {
            setUser(null)
            setStore(null)
            setMembership(null)
            setLoading(false)
            return
          }

          setLoading(true)
          await loadUserStore(session.user)

          if (mounted) setLoading(false)
        },
      )

      return data.subscription
    }

    async function start() {
      await initialise()
      await authListener()
    }

    start()

    return () => {
      mounted = false
    }
  }, [])

  async function loadUserStore(currentUser) {
    setError('')
    setUser(currentUser)

    const { data: membershipData, error: membershipError } =
      await supabase
        .from('store_memberships')
        .select('id, user_id, store_id, role, is_active')
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

    if (membershipError) {
      setMembership(null)
      setStore(null)
      setError(membershipError.message)
      return
    }

    if (!membershipData) {
      setMembership(null)
      setStore(null)
      setError(
        'Your account is authenticated, but no active store membership was found.',
      )
      return
    }

    const { data: storeData, error: storeError } =
      await supabase
        .from('stores')
        .select('*')
        .eq('id', membershipData.store_id)
        .eq('is_active', true)
        .maybeSingle()

    if (storeError) {
      setMembership(membershipData)
      setStore(null)
      setError(storeError.message)
      return
    }

    if (!storeData) {
      setMembership(membershipData)
      setStore(null)
      setError(
        'Your store membership exists, but the associated store could not be loaded.',
      )
      return
    }

    setMembership(membershipData)
    setStore(storeData)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div>
          <strong>PharmDesk</strong>
          <span>Loading your pharmacy...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  if (!store) {
    return (
      <div className="loading-screen">
        <div className="error-card">
          <h1>No pharmacy store assigned</h1>
          <p>
            Your account is authenticated, but PharmDesk could not load
            the associated pharmacy.
          </p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            className="logout-button"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <PharmacyApp
      user={user}
      store={store}
      membership={membership}
    />
  )
}

export default App