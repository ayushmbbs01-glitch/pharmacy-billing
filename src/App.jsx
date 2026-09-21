import { useState } from 'react'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'sales', label: 'New Sale', icon: '＋' },
  { id: 'inventory', label: 'Inventory', icon: '▣' },
  { id: 'purchases', label: 'Purchases', icon: '↓' },
  { id: 'customers', label: 'Customers', icon: '♙' },
  { id: 'reports', label: 'Reports', icon: '▥' },
  { id: 'alerts', label: 'Alerts', icon: '!' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)

  const currentPage =
    menuItems.find((item) => item.id === activePage) || menuItems[0]

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-area">
          <button
            className="menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="brand-icon">+</div>

          <div>
            <div className="brand-name">Pharmacy Billing</div>
            <div className="store-name">Main Store</div>
          </div>
        </div>

        <div className="topbar-right">
          <button className="notification-button" onClick={() => setActivePage('alerts')}>
            🔔
            <span className="notification-dot">3</span>
          </button>

          <div className="user-profile">
            <div className="avatar">U</div>
            <div className="user-details">
              <strong>User</strong>
              <span>Administrator</span>
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-heading">MENU</div>

          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => {
                setActivePage(item.id)
                setMenuOpen(false)
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}

          <div className="sidebar-footer">
            <div className="connection-status">
              <span className="status-dot"></span>
              Cloud connected
            </div>
          </div>
        </aside>

        {menuOpen && (
          <button
            className="sidebar-overlay"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          />
        )}

        <main className="main-content">
          <div className="page-header">
            <div>
              <h1>{currentPage.label}</h1>
              <p>
                {activePage === 'dashboard'
                  ? 'Overview of your pharmacy'
                  : `Manage ${currentPage.label.toLowerCase()}`}
              </p>
            </div>

            {activePage === 'dashboard' && (
              <button
                className="primary-button"
                onClick={() => setActivePage('sales')}
              >
                + New Sale
              </button>
            )}
          </div>

          {activePage === 'dashboard' && <Dashboard setActivePage={setActivePage} />}
          {activePage === 'sales' && <NewSale />}
          {activePage === 'inventory' && <Inventory />}
          {activePage === 'purchases' && <Purchases />}
          {activePage === 'customers' && <Customers />}
          {activePage === 'reports' && <Reports />}
          {activePage === 'alerts' && <Alerts />}
          {activePage === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  )
}

function Dashboard({ setActivePage }) {
  return (
    <>
      <section className="stats-grid">
        <StatCard title="Today's Sales" value="₹0.00" subtitle="0 bills" icon="₹" />
        <StatCard title="Today's Purchases" value="₹0.00" subtitle="0 invoices" icon="↓" />
        <StatCard title="Low Stock" value="0" subtitle="Products need attention" icon="!" />
        <StatCard title="Near Expiry" value="0" subtitle="Within 90 days" icon="◷" />
      </section>

      <section className="dashboard-grid">
        <div className="panel quick-actions">
          <div className="panel-header">
            <div>
              <h2>Quick Actions</h2>
              <p>Common pharmacy tasks</p>
            </div>
          </div>

          <div className="action-grid">
            <ActionButton
              icon="＋"
              title="New Sale"
              text="Create a billing invoice"
              onClick={() => setActivePage('sales')}
            />
            <ActionButton
              icon="▣"
              title="Inventory"
              text="Check stock and batches"
              onClick={() => setActivePage('inventory')}
            />
            <ActionButton
              icon="↓"
              title="New Purchase"
              text="Record supplier invoice"
              onClick={() => setActivePage('purchases')}
            />
            <ActionButton
              icon="♙"
              title="Customers"
              text="View customer history"
              onClick={() => setActivePage('customers')}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Alerts</h2>
              <p>Things requiring attention</p>
            </div>
            <button
              className="text-button"
              onClick={() => setActivePage('alerts')}
            >
              View all
            </button>
          </div>

          <div className="empty-state small">
            <div className="empty-icon">✓</div>
            <strong>No active alerts</strong>
            <span>Your pharmacy is up to date.</span>
          </div>
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-header">
          <div>
            <h2>Recent Sales</h2>
            <p>Your latest transactions will appear here.</p>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-icon">₹</div>
          <strong>No sales yet</strong>
          <span>Start by creating your first sale.</span>
          <button
            className="primary-button"
            onClick={() => setActivePage('sales')}
          >
            Create New Sale
          </button>
        </div>
      </section>
    </>
  )
}

function StatCard({ title, value, subtitle, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-title">{title}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-subtitle">{subtitle}</div>
      </div>
    </div>
  )
}

function ActionButton({ icon, title, text, onClick }) {
  return (
    <button className="action-button" onClick={onClick}>
      <div className="action-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      <span className="arrow">›</span>
    </button>
  )
}

function PagePlaceholder({ title, description, icon }) {
  return (
    <div className="panel page-placeholder">
      <div className="large-placeholder-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <span className="coming-soon">Module ready for database connection</span>
    </div>
  )
}

function NewSale() {
  return (
    <div className="sale-layout">
      <div className="panel sale-main">
        <div className="panel-header">
          <div>
            <h2>New Sale</h2>
            <p>Search for a medicine or product to add it to the bill.</p>
          </div>
          <span className="draft-badge">Draft • Auto-save</span>
        </div>

        <div className="search-box">
          <span>⌕</span>
          <input
            type="text"
            placeholder="Search product, brand or composition..."
          />
        </div>

        <div className="empty-state">
          <div className="empty-icon">▣</div>
          <strong>No products added</strong>
          <span>Search for a product above to begin the sale.</span>
        </div>
      </div>

      <div className="panel bill-summary">
        <div className="panel-header">
          <div>
            <h2>Bill Summary</h2>
            <p>Current sale</p>
          </div>
        </div>

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

        <button className="primary-button full-width" disabled>
          Complete Sale
        </button>
      </div>
    </div>
  )
}

function Inventory() {
  return (
    <PagePlaceholder
      title="Inventory"
      description="Products, batches, stock levels, expiry tracking and physical reconciliation will appear here."
      icon="▣"
    />
  )
}

function Purchases() {
  return (
    <PagePlaceholder
      title="Purchases"
      description="Supplier invoices, purchase items, purchase rates, schemes and supplier payments will appear here."
      icon="↓"
    />
  )
}

function Customers() {
  return (
    <PagePlaceholder
      title="Customers"
      description="Customer profiles, previous bills, credit transactions and store credit will appear here."
      icon="♙"
    />
  )
}

function Reports() {
  return (
    <PagePlaceholder
      title="Reports"
      description="Sales, purchases, stock movement, profit and other pharmacy reports will appear here."
      icon="▥"
    />
  )
}

function Alerts() {
  return (
    <PagePlaceholder
      title="Alerts"
      description="Low stock, expiry, dead stock, payment dues and purchase recommendations will appear here."
      icon="!"
    />
  )
}

function Settings() {
  return (
    <PagePlaceholder
      title="Settings"
      description="Store settings, users, billing preferences, GST and other configuration will appear here."
      icon="⚙"
    />
  )
}

export default App
