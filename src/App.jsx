import React from 'react'
import { PharmDeskApp } from './PharmDeskModules'

/*
  PharmDesk architecture root.

  Business capabilities intentionally remain intact while the UI is being
  consolidated. The next step moves database operations behind
  pharmdeskApi.js; it does not remove business features.

  Modules covered: Dashboard, Sales, Purchases, Inventory, Customers,
  Reports, Alerts and Settings.

  Sales includes billing, customers, batches, pack/tablet mode, discounts,
  split payments, credit/store credit, drafts, returns, history and audit.
  Purchases includes purchase bills, suppliers, AI invoice import, catalogue,
  supplier orders, recommendations and supplier payments.
  Inventory includes products, compositions, packaging, batches, expiry,
  low/dead stock and reconciliation. Reports and settings retain their
  existing capabilities.

  The legacy purchase-order destination is no longer part of the active
  navigation; Supplier Orders is the canonical ordering workflow.
*/
export default function App() {
  return <PharmDeskApp />
}