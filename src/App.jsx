import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'sales', label: 'Sales', icon: '▣' },
  { id: 'inventory', label: 'Inventory', icon: '▤' },
  { id: 'purchases', label: 'Purchases', icon: '🛒' },
  { id: 'customers', label: 'Customers', icon: '♙' },
  { id: 'reports', label: 'Reports', icon: '▥' },
  { id: 'alerts', label: 'Alerts', icon: '♧' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const recentSales = [
  {
    invoice: 'INV-1028',
    date: '19 Sep 2026, 06:12 PM',
    customer: 'Walk-in',
    items: 3,
    total: '₹860.00',
    payment: 'Cash',
  },
  {
    invoice: 'INV-1027',
    date: '19 Sep 2026, 05:48 PM',
    customer: 'Rahul Patel',
    items: 5,
    total: '₹1,420.00',
    payment: 'UPI',
  },
  {
    invoice: 'INV-1026',
    date: '19 Sep 2026, 04:21 PM',
    customer: 'Walk-in',
    items: 2,
    total: '₹320.00',
    payment: 'Cash',
  },
  {
    invoice: 'INV-1025',
    date: '19 Sep 2026, 01:15 PM',
    customer: 'Priya Shah',
    items: 4,
    total: '₹980.00',
    payment: 'Card',
  },
  {
    invoice: 'INV-1024',
    date: '19 Sep 2026, 11:03 AM',
    customer: 'Walk-in',
    items: 1,
    total: '₹150.00',
    payment: 'Cash',
  },
]

const alerts = [
  {
    type: 'danger',
    product: 'Paracetamol 500mg',
    message: 'Stock below minimum',
    value: '5 left',
  },
  {
    type: 'warning',
    product: 'Amoxicillin 500mg',
    message: 'Expiring in 30 days',
    value: '12 units',
  },
  {
    type: 'warning',
    product: 'Pantoprazole 40mg',
    message: 'Expiring in 60 days',
    value: '18 units',
  },
  {
    type: 'danger',
    product: 'Cetirizine 10mg',
    message: 'Out of stock',
    value: '0 left',
  },
  {
    type: 'warning',
    product: 'Atorvastatin 10mg',
    message: 'Expiring in 90 days',
    value: '25 units',
  },
]

const products = [
  {
    name: 'Paracetamol 500mg',
    composition: 'Paracetamol',
    batch: 'PAR5001',
    expiry: '12/2027',
    stock: 5,
    mrp: '₹12.50',
  },
  {
    name: 'Amoxicillin 500mg',
    composition: 'Amoxicillin',
    batch: 'AMX5002',
    expiry: '06/2027',
    stock: 25,
    mrp: '₹45.00',
  },
  {
    name: 'Pantoprazole 40mg',
    composition: 'Pantoprazole',
    batch: 'PAN4002',
    expiry: '04/2027',
    stock: 18,
    mrp: '₹68.00',
  },
  {
    name: 'Cetirizine 10mg',
    composition: 'Cetirizine',
    batch: 'CET1002',
    expiry: '12/2027',
    stock: 0,
    mrp: '₹32.00',
  },
  {
    name: 'Atorvastatin 10mg',
    composition: 'Atorvastatin',
    batch: 'ATO1002',
    expiry: '03/2027',
    stock: 25,
    mrp: '₹82.00',
  },
]

function StatCard({ icon, title, value, change, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone || ''}`}>{icon}</div>

      <div className="stat-content">
        <span>{title}</span>
        <strong>{value}</strong>

        {change && (
          <small className={change.startsWith('+') ? 'positive' : ''}>
            {change}
          </small>
        )}
      </div>
    </div>
  )
}

function PageHeader({ title, description, action, onAction }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>

      {action && (
        <button className="primary-button" onClick={onAction}>
          + {action}
        </button>
      )}
    </div>
  )
}

function Dashboard({ setPage, storeName }) {
  return (
    <>
      <PageHeader
        title="Good evening"
        description={`Here's what's happening at ${storeName} today.`}
      />

      <div className="stat-grid">
        <StatCard
          icon="₹"
          title="Today's Sales"
          value="₹12,480.00"
          change="+12% from yesterday"
          tone="green"
        />

        <StatCard
          icon="▣"
          title="Bills Count"
          value="28"
          change="+8% from yesterday"
          tone="blue"
        />

        <StatCard
          icon="🛒"
          title="Today's Purchases"
          value="₹8,200.00"
          change="+5% from yesterday"
          tone="purple"
        />

        <StatCard
          icon="!"
          title="Low Stock Items"
          value="12"
          change="Needs attention"
          tone="orange"
        />

        <StatCard
          icon="◷"
          title="Near Expiry (90 days)"
          value="8"
          change="+ Review soon"
          tone="cyan"
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel recent-sales">
          <div className="panel-header">
            <h2>Recent Sales</h2>

            <button
              className="text-button"
              onClick={() => setPage('sales')}
            >
              View all →
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date & Time</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                </tr>
              </thead>

              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.invoice}>
                    <td>
                      <button className="invoice-link">
                        {sale.invoice}
                      </button>
                    </td>
                    <td>{sale.date}</td>
                    <td>{sale.customer}</td>
                    <td>{sale.items}</td>
                    <td>{sale.total}</td>
                    <td>
                      <span className="payment-badge">
                        {sale.payment}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel quick-actions">
          <div className="panel-header">
            <h2>Quick Actions</h2>
          </div>

          <button
            className="quick-action"
            onClick={() => setPage('sales')}
          >
            <span className="quick-icon blue">▣</span>

            <span>
              <strong>New Sale</strong>
              <small>Create a billing invoice</small>
            </span>

            <b>›</b>
          </button>

          <button
            className="quick-action"
            onClick={() => setPage('purchases')}
          >
            <span className="quick-icon purple">🛒</span>

            <span>
              <strong>New Purchase</strong>
              <small>Record supplier invoice</small>
            </span>

            <b>›</b>
          </button>

          <button
            className="quick-action"
            onClick={() => setPage('inventory')}
          >
            <span className="quick-icon green">＋</span>

            <span>
              <strong>Add Product</strong>
              <small>Add a new medicine</small>
            </span>

            <b>›</b>
          </button>

          <button
            className="quick-action"
            onClick={() => setPage('customers')}
          >
            <span className="quick-icon orange">♙</span>

            <span>
              <strong>Add Customer</strong>
              <small>Create customer profile</small>
            </span>

            <b>›</b>
          </button>
        </section>

        <section className="panel alerts-panel">
          <div className="panel-header">
            <h2>Alerts</h2>

            <button
              className="text-button"
              onClick={() => setPage('alerts')}
            >
              View all →
            </button>
          </div>

          {alerts.map((alert, index) => (
            <div className="alert-row" key={index}>
              <span className={`alert-dot ${alert.type}`} />

              <div>
                <strong>{alert.product}</strong>
                <small>{alert.message}</small>
              </div>

              <span className="alert-value">{alert.value}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}

function Sales() {
  return (
    <>
      <PageHeader
        title="Sales"
        description="Manage billing, returns and customer transactions."
        action="New Sale"
      />

      <div className="section-tabs">
        <button className="active">New Sale</button>
        <button>Draft Bills</button>
        <button>Completed Bills</button>
        <button>Returns</button>
        <button>Customer / Credit</button>
      </div>

      <div className="sales-layout">
        <section className="panel sales-products">
          <div className="search-box">
            <span>⌕</span>

            <input
              type="text"
              placeholder="Search product by name, brand or composition..."
            />
          </div>

          <div className="empty-state">
            <div className="empty-icon">▣</div>

            <h3>Start a new sale</h3>

            <p>
              Search for a medicine, OTC product, cosmetic or medical
              device to add it to the bill.
            </p>
          </div>
        </section>

        <section className="panel bill-summary">
          <h2>Bill Summary</h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <strong>₹0.00</strong>
          </div>

          <div className="summary-row">
            <span>Discount</span>
            <strong>₹0.00</strong>
          </div>

          <div className="summary-row">
            <span>GST</span>
            <strong>₹0.00</strong>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <strong>₹0.00</strong>
          </div>

          <button className="primary-button full-width">
            Complete Sale
          </button>
        </section>
      </div>
    </>
  )
}

function Inventory() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadProducts() {
    setLoading(true)
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('You are not signed in.')
      setLoading(false)
      return
    }

    const { data: membership, error: membershipError } =
      await supabase
        .from('store_memberships')
        .select('store_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

    if (membershipError) {
      setError(membershipError.message)
      setLoading(false)
      return
    }

    if (!membership?.store_id) {
      setError('No active pharmacy store is connected to this account.')
      setLoading(false)
      return
    }

    const { data, error: productsError } = await supabase
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
            dosage_form,
            composition_ingredients (
              ingredient_name,
              strength_value,
              strength_unit
            )
          )
        )
      `)
      .eq('store_id', membership.store_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (productsError) {
      setError(productsError.message)
      setLoading(false)
      return
    }

    setProducts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const filteredProducts = products.filter((item) => {
    const product = item.products

    if (!product) return false

    const searchText = search.toLowerCase().trim()

    if (!searchText) return true

    const productName = product.product_name || ''
    const genericName = product.generic_display_name || ''
    const manufacturer = product.manufacturer || ''
    const strength = product.strength_display || ''
    const dosageForm = product.dosage_form || ''
    const category =
      product.product_categories?.name || ''
    const composition =
      product.compositions?.name || ''

    return [
      productName,
      genericName,
      manufacturer,
      strength,
      dosageForm,
      category,
      composition,
    ]
      .join(' ')
      .toLowerCase()
      .includes(searchText)
  })

  function getComposition(product) {
    if (!product?.compositions) {
      return product?.generic_display_name || '—'
    }

    const ingredients =
      product.compositions.composition_ingredients || []

    if (ingredients.length === 0) {
      return product.compositions.name || '—'
    }

    return ingredients
      .map((ingredient) => {
        const strength =
          ingredient.strength_value != null
            ? `${ingredient.strength_value} ${ingredient.strength_unit || ''}`.trim()
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
          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <h3>Loading inventory...</h3>
            <p>
              PharmDesk is loading the products for this pharmacy.
            </p>
          </div>
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
      />

      <div className="section-tabs">
        <button className="active">Products</button>
        <button>Batches</button>
        <button>Expiry</button>
        <button>Low Stock</button>
        <button>Dead Stock</button>
        <button>Stock Reconciliation</button>
      </div>

      <section className="panel">
        <div className="search-row">
          <div className="search-box">
            <span>⌕</span>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by product, brand, manufacturer or composition..."
            />
          </div>

          <button className="filter-button">
            Filters
          </button>
        </div>

        {error && (
          <div
            style={{
              margin: '16px 0',
              padding: '12px 14px',
              borderRadius: '8px',
              background: '#fff0ee',
              color: '#c0392b',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        {!error && filteredProducts.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">▤</div>

            <h3>
              {search
                ? 'No products found'
                : 'No products added yet'}
            </h3>

            <p>
              {search
                ? 'Try another product name, manufacturer or composition.'
                : 'Add your first product to start building the pharmacy inventory.'}
            </p>
          </div>
        )}

        {!error && filteredProducts.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Composition</th>
                  <th>Manufacturer</th>
                  <th>Pack</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Discount</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((item) => {
                  const product = item.products

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {product.product_name}
                        </strong>

                        {product.strength_display && (
                          <small
                            style={{
                              display: 'block',
                              marginTop: '3px',
                              color: '#7b8a9d',
                            }}
                          >
                            {product.strength_display}
                            {product.dosage_form
                              ? ` • ${product.dosage_form}`
                              : ''}
                          </small>
                        )}
                      </td>

                      <td>{getComposition(product)}</td>

                      <td>
                        {product.manufacturer || '—'}
                      </td>

                      <td>
                        {product.pack_quantity
                          ? `${product.pack_quantity} ${product.pack_unit || ''}`
                          : '—'}
                      </td>

                      <td>
                        {product.product_categories?.name ||
                          '—'}
                      </td>

                      <td>
                        {item.default_selling_price != null
                          ? `₹${Number(
                              item.default_selling_price,
                            ).toFixed(2)}`
                          : '—'}
                      </td>

                      <td>
                        {item.default_discount_percent != null
                          ? `${Number(
                              item.default_discount_percent,
                            )}%`
                          : '0%'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function Purchases() {
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Manage supplier invoices, purchase orders and payments."
        action="New Purchase"
      />

      <div className="section-tabs">
        <button className="active">New Purchase</button>
        <button>Supplier Invoices</button>
        <button>Pending Payments</button>
        <button>Purchase Orders</button>
        <button>AI Recommendations</button>
      </div>

      <div className="sales-layout">
        <section className="panel sales-products">
          <div className="form-row">
            <select>
              <option>Select supplier</option>
              <option>ABC Pharma</option>
              <option>Medico Distributors</option>
              <option>HealthCare Pharma</option>
            </select>

            <input type="date" />
          </div>

          <div className="empty-state compact">
            <div className="empty-icon">🛒</div>

            <h3>Add products to purchase</h3>

            <p>
              Products, batches, purchase rates, MRP, schemes and
              quantities will appear here.
            </p>
          </div>
        </section>

        <section className="panel bill-summary">
          <h2>Invoice Summary</h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <strong>₹0.00</strong>
          </div>

          <div className="summary-row">
            <span>Discount</span>
            <strong>₹0.00</strong>
          </div>

          <div className="summary-row">
            <span>GST</span>
            <strong>₹0.00</strong>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <strong>₹0.00</strong>
          </div>

          <button className="primary-button full-width">
            Save Purchase
          </button>
        </section>
      </div>
    </>
  )
}

function Customers() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Manage customer profiles, credit and purchase history."
        action="Add Customer"
      />

      <div className="section-tabs">
        <button className="active">Customer List</button>
        <button>Customer Credit</button>
        <button>Purchase History</button>
      </div>

      <section className="panel">
        <div className="search-row">
          <div className="search-box">
            <span>⌕</span>

            <input
              type="text"
              placeholder="Search customer by name or phone..."
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Total Purchases</th>
                <th>Credit Balance</th>
                <th>Last Purchase</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td><strong>Rahul Patel</strong></td>
                <td>9876543210</td>
                <td>₹12,460.00</td>
                <td>₹0.00</td>
                <td>19 Sep 2026</td>
                <td>•••</td>
              </tr>

              <tr>
                <td><strong>Priya Shah</strong></td>
                <td>9876543211</td>
                <td>₹5,220.00</td>
                <td>₹1,200.00</td>
                <td>18 Sep 2026</td>
                <td>•••</td>
              </tr>

              <tr>
                <td><strong>Amit Kumar</strong></td>
                <td>9876543212</td>
                <td>₹6,900.00</td>
                <td>₹0.00</td>
                <td>17 Sep 2026</td>
                <td>•••</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function Reports() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Understand sales, purchases, inventory, GST and profitability."
      />

      <div className="report-filter">
        <button className="active">
          01 Sep 2026 → 19 Sep 2026
        </button>

        <button>Apply</button>
      </div>

      <div className="stat-grid report-stats">
        <StatCard
          icon="₹"
          title="Total Sales"
          value="₹2,48,320"
          tone="green"
        />

        <StatCard
          icon="₹"
          title="Total Purchases"
          value="₹1,82,450"
          tone="purple"
        />

        <StatCard
          icon="₹"
          title="Gross Profit"
          value="₹65,870"
          tone="blue"
        />

        <StatCard
          icon="▣"
          title="Bill Count"
          value="482"
          tone="orange"
        />
      </div>

      <section className="panel report-chart">
        <div className="panel-header">
          <h2>Sales Trend</h2>

          <select>
            <option>Daily</option>
            <option>Weekly</option>
            <option>Monthly</option>
          </select>
        </div>

        <div className="chart-placeholder">
          <div className="chart-line" />
          <span>Sales chart will appear here</span>
        </div>
      </section>
    </>
  )
}

function Alerts() {
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Review stock, expiry, payment and system alerts."
      />

      <section className="panel">
        {alerts.map((alert, index) => (
          <div className="large-alert-row" key={index}>
            <span className={`alert-dot ${alert.type}`} />

            <div>
              <strong>{alert.product}</strong>
              <p>{alert.message}</p>
            </div>

            <span>{alert.value}</span>

            <button className="text-button">Review →</button>
          </div>
        ))}
      </section>
    </>
  )
}

function Settings({ store, user, role }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your store, users, billing preferences and controls."
      />

      <div className="section-tabs">
        <button className="active">Store Settings</button>
        <button>Users</button>
        <button>Billing Preferences</button>
        <button>GST</button>
        <button>Integrations</button>
        <button>Audit Trail</button>
      </div>

      <section className="panel settings-panel">
        <div className="form-grid">
          <label>
            Store Name
            <input
              type="text"
              value={store?.name || ''}
              readOnly
            />
          </label>

          <label>
            Phone
            <input
              type="text"
              value={store?.phone || ''}
              placeholder="Not configured"
              readOnly
            />
          </label>

          <label className="full">
            Address
            <input
              type="text"
              value={store?.address || ''}
              placeholder="Not configured"
              readOnly
            />
          </label>

          <label>
            Your account
            <input
              type="text"
              value={user?.email || ''}
              readOnly
            />
          </label>

          <label>
            Your role
            <input
              type="text"
              value={role || ''}
              readOnly
            />
          </label>

          <label>
            Default payment method
            <select defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="credit">Credit</option>
            </select>
          </label>

          <label>
            Near-expiry alert
            <select defaultValue="90">
              <option value="90">90 days</option>
              <option value="60">60 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>

        <button className="primary-button">
          Save Changes
        </button>
      </section>
    </>
  )
}

function PharmacyApp() {
  const [page, setPage] = useState('dashboard')
  const [store, setStore] = useState(null)
  const [role, setRole] = useState(null)
  const [user, setUser] = useState(null)
  const [storeLoading, setStoreLoading] = useState(true)
  const [storeError, setStoreError] = useState('')

  useEffect(() => {
    async function loadStore() {
      setStoreLoading(true)
      setStoreError('')

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        setStoreError('Your session could not be found.')
        setStoreLoading(false)
        return
      }

      setUser(currentUser)

      const { data, error } = await supabase
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
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (error) {
        setStoreError(error.message)
        setStoreLoading(false)
        return
      }

      if (!data?.stores) {
        setStoreError(
          'This account is not connected to an active pharmacy store.'
        )
        setStoreLoading(false)
        return
      }

      setStore(data.stores)
      setRole(data.role)
      setStoreLoading(false)
    }

    loadStore()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (storeLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f5f7fb',
          color: '#687a90',
          fontSize: '13px',
        }}
      >
        Loading PharmDesk...
      </div>
    )
  }

  if (storeError || !store) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f5f7fb',
          padding: '20px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            background: '#ffffff',
            border: '1px solid #e7ecf2',
            borderRadius: '14px',
            padding: '32px',
            textAlign: 'center',
            boxShadow: '0 12px 40px rgba(16, 32, 51, 0.08)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 16px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '13px',
              background: '#087ff5',
              color: '#ffffff',
              fontSize: '24px',
              fontWeight: 800,
            }}
          >
            +
          </div>

          <h2
            style={{
              margin: '0 0 10px',
              color: '#172b4d',
            }}
          >
            PharmDesk
          </h2>

          <p
            style={{
              margin: '0 0 20px',
              color: '#687a90',
              fontSize: '13px',
              lineHeight: 1.6,
            }}
          >
            {storeError || 'No pharmacy store is connected to this account.'}
          </p>

          <button
            className="primary-button"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const currentPage =
    navigation.find((item) => item.id === page) || navigation[0]

  const renderPage = () => {
    switch (page) {
      case 'sales':
        return <Sales />

      case 'inventory':
        return <Inventory />

      case 'purchases':
        return <Purchases />

      case 'customers':
        return <Customers />

      case 'reports':
        return <Reports />

      case 'alerts':
        return <Alerts />

      case 'settings':
        return (
          <Settings
            store={store}
            user={user}
            role={role}
          />
        )

      default:
        return (
          <Dashboard
            setPage={setPage}
            storeName={store.name}
          />
        )
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">✚</div>

          <div>
            <strong>PharmDesk</strong>
            <span>{store.name}</span>
          </div>
        </div>

        <nav className="main-nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}

              {item.id === 'alerts' && (
                <em className="nav-alert">5</em>
              )}
            </button>
          ))}
        </nav>

        <div className="connection-status">
          <span className="status-dot" />

          <div>
            <strong>Cloud Connected</strong>
            <small>All systems operational</small>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark">✚</div>
            <strong>PharmDesk</strong>
          </div>

          <div className="global-search">
            <span>⌕</span>

            <input
              type="text"
              placeholder="Search products, customers, invoices..."
            />

            <kbd>⌘ K</kbd>
          </div>

          <div className="topbar-actions">
            <button className="icon-button">♧</button>

            <div className="user-menu">
              <div className="avatar">
                {(user?.email || 'U').charAt(0).toUpperCase()}
              </div>

              <div>
                <strong>
                  {user?.email || 'User'}
                </strong>

                <small>
                  {role || 'User'}
                </small>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={handleSignOut}
                title="Sign out"
              >
                ↪
              </button>
            </div>
          </div>
        </header>

        <div className="content">
          <div className="breadcrumb">
            {store.name}
            <span>/</span>
            {currentPage.label}
          </div>

          {renderPage()}
        </div>
      </main>
    </div>
  )
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event) {
    event.preventDefault()

    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    }

    setLoading(false)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f5f7fb',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '390px',
          background: '#ffffff',
          border: '1px solid #e7ecf2',
          borderRadius: '14px',
          padding: '32px',
          boxShadow: '0 12px 40px rgba(16, 32, 51, 0.08)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 14px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '13px',
              background: '#087ff5',
              color: '#ffffff',
              fontSize: '24px',
              fontWeight: 800,
            }}
          >
            +
          </div>

          <h1
            style={{
              margin: 0,
              color: '#172b4d',
              fontSize: '24px',
            }}
          >
            PharmDesk
          </h1>

          <p
            style={{
              margin: '7px 0 0',
              color: '#7b8a9d',
              fontSize: '12px',
            }}
          >
            Pharmacy management system
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <label
            style={{
              display: 'block',
              marginBottom: '7px',
              color: '#53677e',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Email address
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            required
            style={{
              width: '100%',
              height: '42px',
              padding: '0 12px',
              marginBottom: '16px',
              border: '1px solid #dfe6ee',
              borderRadius: '7px',
              fontSize: '12px',
            }}
          />

          <label
            style={{
              display: 'block',
              marginBottom: '7px',
              color: '#53677e',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
            style={{
              width: '100%',
              height: '42px',
              padding: '0 12px',
              marginBottom: '18px',
              border: '1px solid #dfe6ee',
              borderRadius: '7px',
              fontSize: '12px',
            }}
          />

          {error && (
            <div
              style={{
                marginBottom: '15px',
                padding: '10px',
                borderRadius: '7px',
                background: '#fff0ee',
                color: '#c0392b',
                fontSize: '11px',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: '42px',
              border: 0,
              borderRadius: '7px',
              background: '#087ff5',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f5f7fb',
          color: '#687a90',
          fontSize: '13px',
        }}
      >
        Loading PharmDesk...
      </div>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return <PharmacyApp />
}

export default App