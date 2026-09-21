import { useState } from 'react'

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

function Dashboard({ setPage }) {
  return (
    <>
      <PageHeader
        title="Good evening, User"
        description="Here's what's happening at your pharmacy today."
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
                      <span className="payment-badge">{sale.payment}</span>
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
              placeholder="Search by product, brand or composition..."
            />
          </div>

          <button className="filter-button">Filters</button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Composition</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Stock</th>
                <th>MRP</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {products.map((product) => (
                <tr key={product.batch}>
                  <td>
                    <strong>{product.name}</strong>
                  </td>
                  <td>{product.composition}</td>
                  <td>{product.batch}</td>
                  <td>{product.expiry}</td>
                  <td>
                    <span
                      className={
                        product.stock === 0
                          ? 'stock-danger'
                          : product.stock < 10
                            ? 'stock-warning'
                            : 'stock-good'
                      }
                    >
                      {product.stock}
                    </span>
                  </td>
                  <td>{product.mrp}</td>
                  <td>
                    <button className="more-button">•••</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <button className="active">01 Sep 2026 → 19 Sep 2026</button>
        <button>Apply</button>
      </div>

      <div className="stat-grid report-stats">
        <StatCard icon="₹" title="Total Sales" value="₹2,48,320" tone="green" />
        <StatCard icon="₹" title="Total Purchases" value="₹1,82,450" tone="purple" />
        <StatCard icon="₹" title="Gross Profit" value="₹65,870" tone="blue" />
        <StatCard icon="▣" title="Bill Count" value="482" tone="orange" />
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

function Settings() {
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
            <input type="text" value="Main Store" readOnly />
          </label>

          <label>
            Phone
            <input type="text" value="+91 98765 43210" readOnly />
          </label>

          <label className="full">
            Address
            <input
              type="text"
              value="123 MG Road, Mumbai, Maharashtra"
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

        <button className="primary-button">Save Changes</button>
      </section>
    </>
  )
}

function App() {
  const [page, setPage] = useState('dashboard')

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
        return <Settings />

      default:
        return <Dashboard setPage={setPage} />
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">✚</div>

          <div>
            <strong>PharmacyPro</strong>
            <span>Main Store</span>
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
            <strong>PharmacyPro</strong>
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
              <div className="avatar">U</div>

              <div>
                <strong>User</strong>
                <small>Administrator</small>
              </div>

              <span>⌄</span>
            </div>
          </div>
        </header>

        <div className="content">
          <div className="breadcrumb">
            PharmacyPro <span>/</span> {currentPage.label}
          </div>

          {renderPage()}
        </div>
      </main>
    </div>
  )
}

export default App