import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PharmDeskAPI, { pharmdeskDb } from './pharmdeskApi'
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
  'Purchase Parties',  
  'Pending Payments',  
  'Supplier Orders',  
  'Catalogue & Orders',  
  'AI Recommendations',  
]  
  
const REPORT_TABS = [  
  'Overview',  
  'Sales',  
  'Purchases',  
  'Customers',  
  'Suppliers',  
  'Products',  
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
  if (Number.isNaN(d.getTime())) return String(value)  
  return d.toLocaleDateString('en-IN')  
}  
  
const dateTimeText = (value) => {  
  if (!value) return '—'  
  const d = new Date(value)  
  if (Number.isNaN(d.getTime())) return String(value)  
  return d.toLocaleString('en-IN')  
}  
  
const localDateISO = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const localDateTimeForDb = (datePart) => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = Math.floor(absoluteOffset / 60)
  const offsetMins = absoluteOffset % 60
  const offset = `${sign}${pad(offsetHours)}:${pad(offsetMins)}`
  return `${datePart}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${offset}`
}

const todayISO = () => localDateISO(new Date())

const localDateFromStoredTimestamp = (value) => {
  if (!value) return todayISO()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? todayISO() : localDateISO(d)
}
  
const normalize = (value) =>  
  String(value || '')  
    .toLowerCase()  
    .normalize('NFKD')  
    .replace(/[^\w\s.+/-]/g, ' ')  
    .replace(/\s+/g, ' ')  
    .trim()  
  
const safeNumber = (value) => {  
  const n = Number(value)  
  return Number.isFinite(n) ? n : 0  
}  
  
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
  
    for (let j = 0; j <= b.length; j++) {  
      prev[j] = current[j]  
    }  
  }  
  
  return prev[b.length]  
}  
  
const fuzzyScore = (query, text) => {
  const q = normalize(query)
  const t = normalize(text)

  if (!q) return 0
  if (!t) return -Infinity
  if (t === q) return 1000

  // Match the query anywhere in the full value, including inside a word.
  // Example: para / acetamol / caffeine / caff match
  // "Paracetamol + Caffeine 50 mg".
  if (t.includes(q)) return 900 - t.length / 100

  const qTokens = q.split(/\s+/).filter(Boolean)
  const tTokens = t.split(/\s+/).filter(Boolean)
  let score = 0
  let matchedTokens = 0

  for (const qt of qTokens) {
    let best = Infinity
    let tokenMatched = false

    for (const tt of tTokens) {
      if (tt.includes(qt)) {
        best = 0
        tokenMatched = true
        break
      }

      if (qt.includes(tt)) {
        best = Math.min(best, 1)
        tokenMatched = true
      } else {
        best = Math.min(best, levenshtein(qt, tt))
      }
    }

    if (tokenMatched) matchedTokens += 1
    if (best === 0) score += 250
    else if (best <= 1) score += 120
    else if (best <= 2) score += 70
    else if (best <= 3) score += 30
    else score -= 40
  }

  return matchedTokens > 0 ? score + 100 : score
}

const matchesSearch = (query, ...values) => {
  if (!normalize(query)) return true
  return fuzzyScore(query, values.filter(Boolean).join(' ')) > 0
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
  unitsPerPack: 1,  
  batches: [],  
  selectedBatchId: '',  
})  
  
const sum = (arr) => arr.reduce((a, b) => a + safeNumber(b), 0)  
  
const supplierLicense = (supplier) =>  
  supplier?.drug_license_number || supplier?.contact_person || ''  
  
const paymentLabel = (value) => {  
  const map = {  
    cash: 'Cash',  
    upi: 'UPI',  
    card: 'Card',  
    credit: 'Credit',  
    bank_transfer: 'Bank transfer',  
    cheque: 'Cheque',  
    other: 'Other',  
  }  
  return map[value] || value || '—'  
}  
  
const customerLedgerVisual = (type) => {  
  const map = {  
    credit_sale: {  
      label: 'Credit sale',  
      background: '#fff1f2',  
      border: '#ef4444',  
      text: '#b91c1c',  
    },  
    paid_sale: {  
      label: 'Paid on the spot',  
      background: '#eff6ff',  
      border: '#3b82f6',  
      text: '#1d4ed8',  
    },  
    payment: {  
      label: 'Payment received',  
      background: '#ecfdf5',  
      border: '#22c55e',  
      text: '#15803d',  
    },  
    adjustment: {  
      label: 'Adjustment',  
      background: '#fffbeb',  
      border: '#f59e0b',  
      text: '#b45309',  
    },  
    refund: {  
      label: 'Refund',  
      background: '#f5f3ff',  
      border: '#8b5cf6',  
      text: '#6d28d9',  
    },  
  }  
  return map[type] || {  
    label: 'Account entry',  
    background: '#ffffff',  
    border: '#d1d5db',  
    text: '#374151',  
  }  
}  
  
/* =========================================================  
   APP  
========================================================= */  
  
export function PharmDeskApp() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [adminCheckComplete, setAdminCheckComplete] = useState(false)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const pathname =
          window.location.pathname.replace(/\/+$/, '') || '/'

        const isLoginEntry =
          pathname === '/login' ||
          pathname === '/signin'

        /*
          /login and /signin are public authentication entry points.

          If somebody opens the shared login link while another
          PharmDesk account is already stored in this browser,
          remove that existing session first.
        */
        if (isLoginEntry) {
          try {
            await PharmDeskAPI.signOut()
          } catch (signOutError) {
            console.warn(
              'Unable to clear existing session at login entry:',
              signOutError,
            )
          }

          if (mounted) {
            setSession(null)
            setPlatformAdmin(false)
            setAdminCheckComplete(true)
            setLoading(false)
          }

          return
        }

        const result =
          await PharmDeskAPI.getSession()

        const currentSession =
          result?.session ??
          result?.data?.session ??
          null

        if (mounted) {
          setSession(currentSession)
          setLoading(false)
        }
      } catch (error) {
        console.error(
          'PharmDesk session initialization failed:',
          error,
        )

        if (mounted) {
          setSession(null)
          setPlatformAdmin(false)
          setAdminCheckComplete(true)
          setLoading(false)
        }
      }
    }

    init()

    const {
      data: { subscription },
    } = PharmDeskAPI.onAuthStateChange(
      (_event, nextSession) => {
        if (mounted) {
          setSession(nextSession || null)
        }
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  /*
    Authentication is followed by a platform-admin check.

    This is deliberately done before StoreApplicationGate so that
    a platform administrator never gets sent through the medical
    store application flow or into a pharmacy store dashboard.
  */
  useEffect(() => {
    let mounted = true

    const checkAdminAndClaimAccess = async () => {
      if (!session?.user?.id) {
        setPlatformAdmin(false)
        setAdminCheckComplete(true)
        return
      }

      setAdminCheckComplete(false)

      try {
        const admin =
          await PharmDeskAPI.isPlatformAdmin()

        if (!mounted) return

        setPlatformAdmin(Boolean(admin))

        /*
          Only normal store users need approved-store access to be
          claimed here. Platform administrators use their separate
          administration dashboard.
        */
        if (!admin) {
          try {
            await PharmDeskAPI.claimApprovedStoreAccess()
          } catch (claimError) {
            console.error(
              'Failed to claim approved store access:',
              claimError,
            )
          }
        }
      } catch (error) {
        /*
          If the admin-check RPC is unavailable or fails, do not
          lock an ordinary store user out of PharmDesk. Fall back
          to the normal store/application flow.
        */
        console.error(
          'Platform admin check failed:',
          error,
        )

        if (mounted) {
          setPlatformAdmin(false)
        }
      } finally {
        if (mounted) {
          setAdminCheckComplete(true)
        }
      }
    }

    checkAdminAndClaimAccess()

    return () => {
      mounted = false
    }
  }, [session?.user?.id])

  if (loading || !adminCheckComplete) {
    return <LoadingScreen />
  }

  if (!session) {
    return <LoginScreen />
  }

  if (platformAdmin) {
    return <PlatformAdminDashboard session={session} />
  }

  return <StoreApplicationGate session={session} />
}  
  
/* =========================================================  
   AUTH  
========================================================= */  
  
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="loading-logo"><img src="/icons/pharmdesk-logo.svg" alt="PharmDesk" /></div>
        <p>Loading…</p>
      </div>
    </div>
  )
}
  
function LoginScreen() {
  const [mode, setMode] = useState(() =>
    window.location.pathname.replace(/\/+$/, '') ===
    '/signup'
      ? 'signup'
      : 'login',
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] =
    useState('')

  const [ownerName, setOwnerName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [storeEmail, setStoreEmail] = useState('')
  const [gstin, setGstin] = useState('')
  const [drugLicenseNumber, setDrugLicenseNumber] =
    useState('')
  const [confirmPassword, setConfirmPassword] =
    useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const resetMessages = () => {
    setError('')
    setSuccess('')
  }

  const login = async (e) => {
    e.preventDefault()
    setBusy(true)
    resetMessages()

    try {
      await PharmDeskAPI.signIn(
        email.trim(),
        password,
      )
    } catch (authError) {
      setError(
        authError.message ||
          'Unable to sign in.',
      )
    } finally {
      setBusy(false)
    }
  }

  const signup = async (e) => {
  e.preventDefault()
  setBusy(true)
  resetMessages()

  if (password !== confirmPassword) {
    setError('Passwords do not match.')
    setBusy(false)
    return
  }

  if (password.length < 6) {
    setError(
      'Password must be at least 6 characters long.',
    )
    setBusy(false)
    return
  }

  if (!ownerName.trim()) {
    setError('Please enter the owner name.')
    setBusy(false)
    return
  }

  try {
    const signupResult =
  await PharmDeskAPI.signUp(
    email.trim(),
    password,
    ownerName.trim(),
  )

    const signupSession =
      signupResult?.session ??
      signupResult?.data?.session ??
      null

    if (signupSession) {
      setSuccess(
        'Account created successfully. Please continue by completing your medical store application.',
      )
    } else {
      setSuccess(
        'Account created successfully. Please check your email and verify your account. After verification, sign in to complete your medical store application.',
      )
    }

    setPassword('')
    setConfirmPassword('')
  } catch (signupError) {
    setError(
      signupError.message ||
        'Unable to create your account.',
    )
  } finally {
    setBusy(false)
  }
}

  const requestPasswordReset = async (e) => {
    e.preventDefault()
    setBusy(true)
    resetMessages()

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      setError('Please enter your registered email address.')
      setBusy(false)
      return
    }

    try {
      await PharmDeskAPI.sendPasswordResetOtp(
        normalizedEmail,
        window.location.origin,
      )

      setSuccess(
        'If an account exists for this email, a 6-digit OTP has been sent. Enter it below.',
      )
      setMode('reset')
    } catch (resetError) {
      setError(
        resetError.message ||
          'Unable to send the password reset OTP.',
      )
    } finally {
      setBusy(false)
    }
  }

  const verifyResetOtp = async (e) => {
    e.preventDefault()
    setBusy(true)
    resetMessages()

    const normalizedEmail = email.trim().toLowerCase()
    const token = resetOtp.trim()

    if (!normalizedEmail) {
      setError('Please enter your registered email address.')
      setBusy(false)
      return
    }

    if (!/^\d{6}$/.test(token)) {
      setError('Enter the 6-digit OTP sent to your email.')
      setBusy(false)
      return
    }

    try {
      await PharmDeskAPI.verifyPasswordResetOtp(
        normalizedEmail,
        token,
      )
      setSuccess('OTP verified. Create your new password.')
      setMode('reset-password')
    } catch (otpError) {
      setError(
        otpError.message ||
          'Invalid or expired OTP.',
      )
    } finally {
      setBusy(false)
    }
  }

  const completePasswordReset = async (e) => {
    e.preventDefault()
    setBusy(true)
    resetMessages()

    if (resetPassword.length < 6) {
      setError('Password must be at least 6 characters long.')
      setBusy(false)
      return
    }

    if (resetPassword !== resetConfirmPassword) {
      setError('Passwords do not match.')
      setBusy(false)
      return
    }

    try {
      await PharmDeskAPI.updatePassword(resetPassword)
      await PharmDeskAPI.signOut()
      setPassword('')
      setResetOtp('')
      setResetPassword('')
      setResetConfirmPassword('')
      setSuccess('Password reset successfully. You can now sign in with your new password.')
      setMode('login')
    } catch (passwordError) {
      setError(
        passwordError.message ||
          'Unable to update your password.',
      )
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (nextMode) => {
    setMode(nextMode)
    resetMessages()
    if (nextMode !== 'reset') setResetOtp('')
    if (nextMode !== 'reset-password') {
      setResetPassword('')
      setResetConfirmPassword('')
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={requestPasswordReset}>
          <div className="brand-mark"><img src="/icons/pharmdesk-logo.svg" alt="PharmDesk" /></div>
          <h1>Forgot your password?</h1>
          <p>Enter your registered email and we’ll send you a 6-digit reset OTP.</p>

          <div className="form-stack">
            <label>
              Email
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            {error && <div className="error-box">{error}</div>}
            {success && <div className="success-box">{success}</div>}

            <button type="submit" disabled={busy} className="primary-button">
              {busy ? 'Sending OTP…' : 'Send OTP'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => switchMode('login')}
              disabled={busy}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (mode === 'reset') {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={verifyResetOtp}>
          <div className="brand-mark"><img src="/icons/pharmdesk-logo.svg" alt="PharmDesk" /></div>
          <h1>Enter reset OTP</h1>
          <p>Enter the 6-digit code sent to your email address.</p>

          <div className="form-stack">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label>
              6-digit OTP
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </label>

            {error && <div className="error-box">{error}</div>}
            {success && <div className="success-box">{success}</div>}

            <button type="submit" disabled={busy} className="primary-button">
              {busy ? 'Verifying…' : 'Verify OTP'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => switchMode('forgot')}
              disabled={busy}
            >
              Send a new OTP
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (mode === 'reset-password') {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={completePasswordReset}>
          <div className="brand-mark"><img src="/icons/pharmdesk-logo.svg" alt="PharmDesk" /></div>
          <h1>Create a new password</h1>
          <p>Your email has been verified. Choose a new password for your PharmDesk account.</p>

          <div className="form-stack">
            <label>
              New password
              <input
                type="password"
                placeholder="New password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                placeholder="Re-enter new password"
                value={resetConfirmPassword}
                onChange={(e) => setResetConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            {error && <div className="error-box">{error}</div>}
            {success && <div className="success-box">{success}</div>}

            <button type="submit" disabled={busy} className="primary-button">
              {busy ? 'Updating password…' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    )
  }

 if (mode === 'signup') {
  return (
    <div className="auth-screen">
      <form
        className="auth-card"
        onSubmit={signup}
      >
        <div className="brand-mark"><img src="/icons/pharmdesk-logo.svg" alt="PharmDesk" /></div>

        <h1>Create your PharmDesk account</h1>

        <p>
          Create your account first. After
          verifying your email, you can sign in
          and complete your medical store
          application.
        </p>

        <div className="form-stack">
          <label>
            Owner name
            <input
              type="text"
              placeholder="Full name"
              value={ownerName}
              onChange={(e) =>
                setOwnerName(e.target.value)
              }
              required
            />
          </label>

          <label>
            Email
            <input
              type="email"
              placeholder="Owner email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              minLength={6}
              required
            />
          </label>

          <label>
            Confirm password
            <input
              type="password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(
                  e.target.value,
                )
              }
              minLength={6}
              required
            />
          </label>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          {success && (
            <div className="success-box">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="primary-button"
          >
            {busy
              ? 'Creating account…'
              : 'Create account'}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              switchMode('login')
            }
            disabled={busy}
          >
            Already have an account? Sign in
          </button>
        </div>
      </form>
    </div>
  )
}

  return (
    <div className="auth-screen">
      <form
        className="auth-card"
        onSubmit={login}
      >
        <div className="brand-mark"><img src="/icons/pharmdesk-logo.svg" alt="PharmDesk" /></div>

        <h1>Welcome to PharmDesk</h1>

        <p>
          Sign in to continue
        </p>

        <div className="form-stack">
          <label>
            Email
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
            />
          </label>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          {success && (
            <div className="success-box">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="primary-button"
          >
            {busy
              ? 'Signing in…'
              : 'Sign In'}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              switchMode('forgot')
            }
            disabled={busy}
          >
            Forgot password?
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              switchMode('signup')
            }
            disabled={busy}
          >
            New medical store? Sign up
          </button>
        </div>
      </form>
    </div>
  )
}
  
  
/* =========================================================
   PLATFORM ADMIN DASHBOARD
========================================================= */

function PlatformAdminDashboard({ session }) {
  const [activeTab, setActiveTab] = useState('Applications')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [adminStores, setAdminStores] = useState([])
  const [adminApplications, setAdminApplications] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [applicationLoading, setApplicationLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [applicationMessage, setApplicationMessage] = useState('')
  const [error, setError] = useState('')

  const [newStore, setNewStore] = useState({
    name: '',
    ownerEmail: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    drugLicenseNumber: '',
  })

  const loadAdminStores = async () => {
    try {
      setAdminLoading(true)
      setError('')

      const result =
        await PharmDeskAPI.adminListStores()

      setAdminStores(
        Array.isArray(result)
          ? result
          : [],
      )
    } catch (loadError) {
      console.error(
        'Failed to load admin stores:',
        loadError,
      )

      setError(
        loadError?.message ||
          'Failed to load medical stores.',
      )
    } finally {
      setAdminLoading(false)
    }
  }

  const loadAdminApplications = async () => {
    try {
      setApplicationLoading(true)
      setError('')

      const result =
        await PharmDeskAPI.adminListStoreApplications()

      setAdminApplications(
        Array.isArray(result)
          ? result
          : [],
      )
    } catch (loadError) {
      console.error(
        'Failed to load store applications:',
        loadError,
      )

      setError(
        loadError?.message ||
          'Failed to load store applications.',
      )
    } finally {
      setApplicationLoading(false)
    }
  }

  const refreshAdminData = async () => {
    setError('')
    await Promise.all([
      loadAdminStores(),
      loadAdminApplications(),
    ])
  }

  useEffect(() => {
    refreshAdminData()
  }, [])

  /*
    Match the normal pharmacy interface on phones/tablets:
    tapping the module header toggles the off-canvas sidebar.
  */
  useEffect(() => {
    const handleModuleHeaderClick = (event) => {
      if (window.innerWidth > 800) return

      const header = event.target.closest('.module-header')

      if (!header) return

      setSidebarOpen((current) => !current)
    }

    document.addEventListener(
      'click',
      handleModuleHeaderClick,
    )

    return () => {
      document.removeEventListener(
        'click',
        handleModuleHeaderClick,
      )
    }
  }, [])

  const createAdminStore = async (event) => {
    event.preventDefault()

    try {
      setAdminLoading(true)
      setAdminMessage('')
      setError('')

      if (!newStore.name.trim()) {
        throw new Error(
          'Medical store name is required.',
        )
      }

      if (!newStore.ownerEmail.trim()) {
        throw new Error(
          'Owner email is required.',
        )
      }

      await PharmDeskAPI.adminCreateStore({
        name: newStore.name.trim(),
        ownerEmail:
          newStore.ownerEmail.trim(),
        address:
          newStore.address.trim() || null,
        phone:
          newStore.phone.trim() || null,
        email:
          newStore.email.trim() || null,
        gstin:
          newStore.gstin.trim() || null,
        drugLicenseNumber:
          newStore.drugLicenseNumber.trim() ||
          null,
      })

      setNewStore({
        name: '',
        ownerEmail: '',
        address: '',
        phone: '',
        email: '',
        gstin: '',
        drugLicenseNumber: '',
      })

      setAdminMessage(
        'Medical store created successfully. It is now pending activation.',
      )

      await loadAdminStores()
    } catch (createError) {
      console.error(
        'Failed to create medical store:',
        createError,
      )

      setAdminMessage(
        createError?.message ||
          'Failed to create medical store.',
      )
    } finally {
      setAdminLoading(false)
    }
  }

  const activateAdminStore = async (storeId) => {
    try {
      setAdminLoading(true)
      setAdminMessage('')
      setError('')

      await PharmDeskAPI.adminActivateStore(
        storeId,
      )

      setAdminMessage(
        'Store approved and 1-year service activated.',
      )

      await loadAdminStores()
    } catch (activateError) {
      console.error(
        'Failed to activate store:',
        activateError,
      )

      setAdminMessage(
        activateError?.message ||
          'Failed to activate store.',
      )
    } finally {
      setAdminLoading(false)
    }
  }

  const suspendAdminStore = async (storeId) => {
    try {
      setAdminLoading(true)
      setAdminMessage('')
      setError('')

      await PharmDeskAPI.adminSuspendStore(
        storeId,
      )

      setAdminMessage(
        'Store service has been suspended.',
      )

      await loadAdminStores()
    } catch (suspendError) {
      console.error(
        'Failed to suspend store:',
        suspendError,
      )

      setAdminMessage(
        suspendError?.message ||
          'Failed to suspend store.',
      )
    } finally {
      setAdminLoading(false)
    }
  }

  const reactivateAdminStore = async (storeId) => {
    try {
      setAdminLoading(true)
      setAdminMessage('')
      setError('')

      await PharmDeskAPI.adminReactivateStore(
        storeId,
      )

      setAdminMessage(
        'Store service has been renewed for 1 year.',
      )

      await loadAdminStores()
    } catch (reactivateError) {
      console.error(
        'Failed to renew store service:',
        reactivateError,
      )

      setAdminMessage(
        reactivateError?.message ||
          'Failed to renew store service.',
      )
    } finally {
      setAdminLoading(false)
    }
  }

  const approveStoreApplication = async (
    applicationId,
  ) => {
    try {
      setApplicationLoading(true)
      setApplicationMessage('')
      setError('')

      await PharmDeskAPI.adminApproveStoreApplication(
        applicationId,
      )

      setApplicationMessage(
        'Application approved. The store has been activated for 1 year.',
      )

      await Promise.all([
        loadAdminApplications(),
        loadAdminStores(),
      ])
    } catch (approveError) {
      console.error(
        'Failed to approve store application:',
        approveError,
      )

      setApplicationMessage(
        approveError?.message ||
          'Failed to approve store application.',
      )
    } finally {
      setApplicationLoading(false)
    }
  }

  const rejectStoreApplication = async (
    applicationId,
  ) => {
    const reason = window.prompt(
      'Enter a rejection reason (optional):',
    )

    if (reason === null) {
      return
    }

    try {
      setApplicationLoading(true)
      setApplicationMessage('')
      setError('')

      await PharmDeskAPI.adminRejectStoreApplication(
        applicationId,
        reason.trim() || null,
      )

      setApplicationMessage(
        'Store application rejected.',
      )

      await loadAdminApplications()
    } catch (rejectError) {
      console.error(
        'Failed to reject store application:',
        rejectError,
      )

      setApplicationMessage(
        rejectError?.message ||
          'Failed to reject store application.',
      )
    } finally {
      setApplicationLoading(false)
    }
  }

  const today = todayISO()

  const getEffectiveStatus = (adminStore) => {
    if (
      adminStore.service_end_date &&
      adminStore.service_end_date < today &&
      adminStore.service_status === 'active'
    ) {
      return 'expired'
    }

    return adminStore.service_status || 'pending'
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><img src="/icons/pharmdesk-logo.svg" alt="PharmDesk" /></div>
          <div className="brand-caption">
            <strong>PharmDesk</strong>
            <span>Platform Administration</span>
          </div>
        </div>

        <nav>
          {[
            'Applications',
            'Medical Stores',
            'Add Store',
          ].map((item) => (
            <button
              key={item}
              className={
                activeTab === item
                  ? 'nav-item active'
                  : 'nav-item'
              }
              onClick={() => {
                setActiveTab(item)
                setSidebarOpen(false)
              }}
            >
              {item}
            </button>
          ))}
        </nav>

        <button
          className="logout-button"
          onClick={() => PharmDeskAPI.signOut()}
        >
          Sign out
        </button>
      </aside>

      <main className="main-content">
        <ModuleHeader
          title="PharmDesk Administration"
          subtitle="Manage medical store applications, service access and renewals"
        />

        <div className="stats-grid">
          <StatCard
            title="Store Applications"
            value={adminApplications.filter(
              (x) => x.status === 'pending',
            ).length}
          />

          <StatCard
            title="Registered Stores"
            value={adminStores.length}
          />

          <StatCard
            title="Active Stores"
            value={adminStores.filter(
              (x) =>
                getEffectiveStatus(x) ===
                'active',
            ).length}
          />

          <StatCard
            title="Expired / Suspended"
            value={adminStores.filter((x) => {
              const status =
                getEffectiveStatus(x)

              return (
                status === 'expired' ||
                status === 'suspended'
              )
            }).length}
          />
        </div>

        {(error ||
          adminMessage ||
          applicationMessage) && (
          <div
            className={
              error
                ? 'error-box'
                : 'message-box'
            }
            style={{ marginBottom: 16 }}
          >
            {error ||
              adminMessage ||
              applicationMessage}
          </div>
        )}

        {activeTab === 'Applications' && (
          <PanelList title="Pending Store Applications">
            <div
              className="history-header"
              style={{
                marginBottom: 12,
              }}
            >
              <div>
                <strong>
                  Medical store applications
                </strong>

                <span>
                  Review applications before
                  granting store access.
                </span>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={loadAdminApplications}
                disabled={applicationLoading}
              >
                {applicationLoading
                  ? 'Refreshing…'
                  : 'Refresh'}
              </button>
            </div>

            {applicationLoading &&
              adminApplications.length === 0 && (
                <div className="message-box">
                  Loading applications…
                </div>
              )}

            {!applicationLoading &&
              adminApplications.length === 0 && (
                <EmptyState text="No store applications found." />
              )}

            {adminApplications.map(
              (application) => (
                <div
                  key={application.id}
                  className="history-item"
                >
                  <div className="history-header">
                    <div>
                      <strong>
                        {application.store_name}
                      </strong>

                      <span>
                        Owner:{' '}
                        {application.owner_name ||
                          'Not provided'}
                      </span>
                    </div>

                    <strong>
                      {String(
                        application.status ||
                          'pending',
                      ).toUpperCase()}
                    </strong>
                  </div>

                  <div className="history-header">
                    <span>
                      Email:{' '}
                      {application.owner_email ||
                        'Not provided'}
                    </span>

                    <span>
                      Phone:{' '}
                      {application.phone ||
                        'Not provided'}
                    </span>
                  </div>

                  <div className="history-header">
                    <span>
                      GSTIN:{' '}
                      {application.gstin ||
                        'Not provided'}
                    </span>

                    <span>
                      Drug License:{' '}
                      {application.drug_license_number ||
                        'Not provided'}
                    </span>
                  </div>

                  <div>
                    <span>
                      Address:{' '}
                      {application.address ||
                        'Not provided'}
                    </span>
                  </div>

                  <div className="history-header">
                    <span>
                      Store email:{' '}
                      {application.store_email ||
                        'Not provided'}
                    </span>

                    <span>
                      Applied:{' '}
                      {application.created_at
                        ? new Date(
                            application.created_at,
                          ).toLocaleString()
                        : 'Unknown'}
                    </span>
                  </div>

                  {application.status ===
                    'rejected' &&
                    application.rejection_reason && (
                      <div className="error-box">
                        Rejection reason:{' '}
                        {
                          application.rejection_reason
                        }
                      </div>
                    )}

                  {application.status ===
                    'pending' && (
                    <div className="button-row">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          approveStoreApplication(
                            application.id,
                          )
                        }
                        disabled={
                          applicationLoading
                        }
                      >
                        Approve & Start
                        1-Year Service
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          rejectStoreApplication(
                            application.id,
                          )
                        }
                        disabled={
                          applicationLoading
                        }
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}

            {applicationMessage && (
              <div className="message-box">
                {applicationMessage}
              </div>
            )}
          </PanelList>
        )}

        {activeTab === 'Medical Stores' && (
          <PanelList title="Registered Medical Stores">
            <div
              className="history-header"
              style={{
                marginBottom: 12,
              }}
            >
              <div>
                <strong>
                  Store service management
                </strong>

                <span>
                  Activate, suspend and renew
                  PharmDesk store service.
                </span>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={loadAdminStores}
                disabled={adminLoading}
              >
                {adminLoading
                  ? 'Refreshing…'
                  : 'Refresh'}
              </button>
            </div>

            {adminLoading &&
              adminStores.length === 0 && (
                <div className="message-box">
                  Loading stores…
                </div>
              )}

            {!adminLoading &&
              adminStores.length === 0 && (
                <EmptyState text="No medical stores found." />
              )}

            {adminStores.map((adminStore) => {
              const status =
                getEffectiveStatus(
                  adminStore,
                )

              return (
                <div
                  key={adminStore.id}
                  className="history-item"
                >
                  <div className="history-header">
                    <div>
                      <strong>
                        {adminStore.name}
                      </strong>

                      <span>
                        {adminStore.email ||
                          adminStore.phone ||
                          'No contact details'}
                      </span>
                    </div>

                    <strong>
                      {status.toUpperCase()}
                    </strong>
                  </div>

                  <div className="history-header">
                    <span>
                      Store contact:{' '}
                      {adminStore.email ||
                        adminStore.phone ||
                        'Not provided'}
                    </span>

                    <span>
                      GSTIN:{' '}
                      {adminStore.gstin ||
                        'Not provided'}
                    </span>
                  </div>

                  <div className="history-header">
                    <span>
                      Service start:{' '}
                      {adminStore.service_start_date ||
                        'Not activated'}
                    </span>

                    <span>
                      Service end:{' '}
                      {adminStore.service_end_date ||
                        'Not activated'}
                    </span>
                  </div>

                  <div className="button-row">
                    {status === 'pending' && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          activateAdminStore(
                            adminStore.id,
                          )
                        }
                        disabled={adminLoading}
                      >
                        Approve & Start
                        1-Year Service
                      </button>
                    )}

                    {status === 'active' && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          suspendAdminStore(
                            adminStore.id,
                          )
                        }
                        disabled={adminLoading}
                      >
                        Suspend Service
                      </button>
                    )}

                    {(status === 'expired' ||
                      status === 'suspended') && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          reactivateAdminStore(
                            adminStore.id,
                          )
                        }
                        disabled={adminLoading}
                      >
                        Renew for 1 Year
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </PanelList>
        )}

        {activeTab === 'Add Store' && (
          <PanelList title="Add Medical Store">
            <form
              onSubmit={createAdminStore}
              className="form-stack"
            >
              <label>
                Medical store name
                <input
                  value={newStore.name}
                  onChange={(event) =>
                    setNewStore({
                      ...newStore,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. ABC Medical Store"
                  required
                />
              </label>

              <label>
                Owner email
                <input
                  type="email"
                  value={newStore.ownerEmail}
                  onChange={(event) =>
                    setNewStore({
                      ...newStore,
                      ownerEmail:
                        event.target.value,
                    })
                  }
                  placeholder="owner@example.com"
                  required
                />
              </label>

              <label>
                Store address
                <textarea
                  value={newStore.address}
                  onChange={(event) =>
                    setNewStore({
                      ...newStore,
                      address:
                        event.target.value,
                    })
                  }
                  rows={3}
                />
              </label>

              <div className="form-grid">
                <label>
                  Phone
                  <input
                    type="tel"
                    value={newStore.phone}
                    onChange={(event) =>
                      setNewStore({
                        ...newStore,
                        phone:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Store email
                  <input
                    type="email"
                    value={newStore.email}
                    onChange={(event) =>
                      setNewStore({
                        ...newStore,
                        email:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  GSTIN
                  <input
                    value={newStore.gstin}
                    onChange={(event) =>
                      setNewStore({
                        ...newStore,
                        gstin:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Drug licence number
                  <input
                    value={
                      newStore.drugLicenseNumber
                    }
                    onChange={(event) =>
                      setNewStore({
                        ...newStore,
                        drugLicenseNumber:
                          event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <button
                type="submit"
                className="primary-button"
                disabled={adminLoading}
              >
                {adminLoading
                  ? 'Creating…'
                  : 'Add Medical Store'}
              </button>
            </form>
          </PanelList>
        )}
      </main>
    </div>
  )
}

function StoreApplicationGate({ session }) {
  const [application, setApplication] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [ownerName, setOwnerName] = useState(
    session?.user?.user_metadata?.owner_name || '',
  )
  const [storeName, setStoreName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [storeEmail, setStoreEmail] = useState('')
  const [gstin, setGstin] = useState('')
  const [drugLicenseNumber, setDrugLicenseNumber] =
    useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadApplication = async () => {
    setLoading(true)
    setError('')

    try {
      const stores =
        await PharmDeskAPI.getStoresForUser(
          session.user.id,
        )

      if (stores?.length) {
        setApplication({
          approved_store: true,
        })
        return
      }

      const applications =
        await PharmDeskAPI.getMyStoreApplication(
          session.user.id,
        )

      setApplication(applications?.[0] || null)
    } catch (loadError) {
      console.error(
        'Failed to load store application:',
        loadError,
      )

      setError(
        loadError.message ||
          'Unable to load your store application.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadApplication()
  }, [session.user.id])

  const submitApplication = async (e) => {
    e.preventDefault()

    setBusy(true)
    setError('')
    setSuccess('')

    if (!ownerName.trim()) {
      setError('Please enter the owner name.')
      setBusy(false)
      return
    }

    if (!storeName.trim()) {
      setError('Please enter the medical store name.')
      setBusy(false)
      return
    }

    if (!drugLicenseNumber.trim()) {
      setError(
        'Please enter the drug license number.',
      )
      setBusy(false)
      return
    }

    try {
      await PharmDeskAPI.submitStoreApplication({
        ownerName: ownerName.trim(),
        storeName: storeName.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        storeEmail: storeEmail.trim() || null,
        gstin: gstin.trim() || null,
        drugLicenseNumber:
          drugLicenseNumber.trim(),
      })

      setSuccess(
        'Your application has been submitted successfully.',
      )

      await loadApplication()
    } catch (submitError) {
      console.error(
        'Failed to submit store application:',
        submitError,
      )

      setError(
        submitError.message ||
          'Unable to submit your application.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (application?.approved_store) {
    return <PharmacyApp session={session} />
  }

  if (application?.status === 'pending') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Application Pending</h1>

          <p>
            Thank you for applying to use PharmDesk.
          </p>

          <p>
            Your medical store application is currently
            being reviewed by our administration team.
          </p>

          <p>
            You will be contacted within 24 hours regarding
            the approval of your account.
          </p>

          <div className="success-box">
            Application submitted for:
            <br />
            <strong>
              {application.store_name}
            </strong>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => PharmDeskAPI.signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form
        className="auth-card"
        onSubmit={submitApplication}
      >
        <h1>Medical Store Application</h1>

        <p>
          Complete your store details to apply for access
          to PharmDesk.
        </p>

        <input
          type="text"
          placeholder="Owner name"
          value={ownerName}
          onChange={(e) =>
            setOwnerName(e.target.value)
          }
          required
        />

        <input
          type="text"
          placeholder="Medical store name"
          value={storeName}
          onChange={(e) =>
            setStoreName(e.target.value)
          }
          required
        />

        <textarea
          placeholder="Store address"
          value={address}
          onChange={(e) =>
            setAddress(e.target.value)
          }
          rows={3}
        />

        <input
          type="tel"
          placeholder="Phone number"
          value={phone}
          onChange={(e) =>
            setPhone(e.target.value)
          }
        />

        <input
          type="email"
          placeholder="Store email"
          value={storeEmail}
          onChange={(e) =>
            setStoreEmail(e.target.value)
          }
        />

        <input
          type="text"
          placeholder="GSTIN"
          value={gstin}
          onChange={(e) =>
            setGstin(e.target.value)
          }
        />

        <input
          type="text"
          placeholder="Drug license number"
          value={drugLicenseNumber}
          onChange={(e) =>
            setDrugLicenseNumber(e.target.value)
          }
          required
        />

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        {success && (
          <div className="success-box">
            {success}
          </div>
        )}

        {application?.status === 'rejected' && (
          <div className="error-box">
            <strong>
              Your previous application was rejected.
            </strong>

            {application.rejection_reason && (
              <>
                <br />
                Reason:{' '}
                {application.rejection_reason}
              </>
            )}

            <br />
            <br />
            You can correct your details and submit a new
            application.
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="primary-button"
        >
          {busy
            ? 'Submitting…'
            : 'Submit Application'}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => PharmDeskAPI.signOut()}
          disabled={busy}
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
  
/* =========================================================  
   MAIN SHELL  
========================================================= */  
  
function AppIcon({ name, size = 19 }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></>,
    sales: <><path d="M4 5h17l-2 9H7L5 3H2"/><circle cx="9" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></>,
    purchases: <><path d="M6 3h12l3 5v12H3V8l3-5Z"/><path d="M3 8h18M9 3v5m6-5v5"/></>,
    inventory: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
    customers: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.2 2.7-5 6-5s6 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.8.2 4.5 1.8 4.5 4"/></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    alerts: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    settings: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  }
  return (
    <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.dashboard}
    </svg>
  )
}

function PharmDeskLogo({ compact = false }) {
  return (
    <div className={compact ? 'pharmdesk-logo-code compact' : 'pharmdesk-logo-code'}>
      <svg className="pharmdesk-mark-code" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="pdMarkBlue" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8be7ff" />
            <stop offset=".48" stopColor="#3dbcf7" />
            <stop offset="1" stopColor="#1688df" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="58" height="58" rx="16" fill="#0b2f5f" stroke="rgba(126,216,255,.22)" />
        <path d="M18 48V16h16.5c9.2 0 15.5 5.1 15.5 13.1S43.7 42.2 34.5 42.2H26V48h-8Zm8-12.8h8c4.1 0 6.1-2.1 6.1-6.1 0-3.8-2-5.8-6.1-5.8h-8v11.9Z" fill="url(#pdMarkBlue)" />
        <path d="M27 24.1h7.1c4 0 6 1.7 6 5 0 3.5-2 5.3-6 5.3H27V24.1Z" fill="#f7fdff" />
        <path d="M46.5 17.5v8.2" stroke="#9cecff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="46.5" cy="31.5" r="1.25" fill="#9cecff" />
      </svg>
      <span className="pharmdesk-wordmark"><span>Pharm</span><b>Desk</b></span>
    </div>
  )
}

function AuthBrandPanel() {
  return (
    <section className="auth-brand-panel">
      <div className="auth-brand-glow" />
      <div className="auth-brand-content">
        <img className="auth-brand-icon" src="/icons/pharmdesk-icon.svg" alt="PharmDesk" />
        <h2>Pharm<span>Desk</span></h2>
        <strong>Smart Pharmacy Management</strong>
        <p>Billing&nbsp;&nbsp;•&nbsp;&nbsp;Inventory&nbsp;&nbsp;•&nbsp;&nbsp;Purchases&nbsp;&nbsp;•&nbsp;&nbsp;Reports</p>
      </div>
    </section>
  )
}

function AuthShell({ children }) {
  return (
    <div className="auth-screen">
      <AuthBrandPanel />
      <div className="auth-form-side">{children}</div>
    </div>
  )
}

function PharmacyApp({ session }) {  
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [globalSearchData, setGlobalSearchData] = useState([])
  const globalSearchRef = useRef(null)
  const [store, setStore] = useState(null)  
  const [profile, setProfile] = useState(null)  
  const [loading, setLoading] = useState(true)  
  
  useEffect(() => {
  const handleModuleHeaderClick = (event) => {
    if (window.innerWidth > 800) return

    const header = event.target.closest('.module-header')

    if (!header) return

    setSidebarOpen((current) => !current)
  }

  document.addEventListener(
    'click',
    handleModuleHeaderClick,
  )

  return () => {
    document.removeEventListener(
      'click',
      handleModuleHeaderClick,
    )
  }
}, [])
  
  useEffect(() => {  
    loadStore()  
  }, [session.user.id])  
  
  const loadStore = async () => {
  setLoading(true)

  try {
    const userProfile =
      await PharmDeskAPI.getUserProfile(
        session.user.id,
      )

    setProfile(
      userProfile || null,
    )

    const stores =
      await PharmDeskAPI.getStoresForUser(
        session.user.id,
      )

    setStore(
      stores?.[0] || null,
    )
  } finally {
    setLoading(false)
  }
}

  useEffect(() => {
    const handleOutsideSearchClick = (event) => {
      if (!globalSearchRef.current?.contains(event.target)) {
        setSearchOpen(false)
      }
    }

    const handleSearchEscape = (event) => {
      if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutsideSearchClick)
    document.addEventListener('keydown', handleSearchEscape)

    return () => {
      document.removeEventListener('pointerdown', handleOutsideSearchClick)
      document.removeEventListener('keydown', handleSearchEscape)
    }
  }, [])

  useEffect(() => {
    const query = globalSearch.trim()
    if (!query || !store?.id) {
      setGlobalSearchData([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const [products, customers] = await Promise.all([
          PharmDeskAPI.searchProducts(store.id, query, 6),
          PharmDeskAPI.customers(store.id, query),
        ])

        if (cancelled) return

        const productResults = (products || []).slice(0, 6).map((product) => ({
          type: 'product',
          label: product.product_name || product.name || 'Product',
          hint: [product.generic_display_name, product.manufacturer].filter(Boolean).join(' • ') || 'Open Inventory',
          action: () => {
            setActiveNav('Inventory')
            setSearchOpen(false)
            setGlobalSearch('')
            setSidebarOpen(false)
          },
        }))

        const customerResults = (customers || []).slice(0, 6).map((customer) => ({
          type: 'customer',
          label: customer.name || 'Customer',
          hint: customer.phone ? `Customer • ${customer.phone}` : 'Open Customers',
          action: () => {
            setActiveNav('Customers')
            setSearchOpen(false)
            setGlobalSearch('')
            setSidebarOpen(false)
          },
        }))

        setGlobalSearchData([...productResults, ...customerResults])
      } catch (error) {
        if (!cancelled) {
          console.error('Global search failed:', error)
          setGlobalSearchData([])
        }
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [globalSearch, store?.id])

  if (loading) return <LoadingScreen />  
  
  const renderPage = () => {  
    switch (activeNav) {  
      case 'Dashboard':  
        return <Dashboard store={store} profile={profile} onNavigate={setActiveNav} />  
  
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
        return (  
          <SettingsModule  
            store={store}  
            profile={profile}  
            onStoreUpdated={setStore}  
          />  
        )  
  
      default:  
        return null  
    }  
  }  
  
  const navSearchItems = NAV_ITEMS.map((item) => ({
    type: 'nav',
    label: item,
    hint: `Open ${item}`,
    action: () => {
      setActiveNav(item)
      setSearchOpen(false)
      setGlobalSearch('')
      setSidebarOpen(false)
    },
  }))

  const quickSearchItems = [
    { type: 'action', label: 'New Sale', hint: 'Open Sales → New Sale', target: 'Sales' },
    { type: 'action', label: 'New Purchase', hint: 'Open Purchases → New Purchase', target: 'Purchases' },
    { type: 'action', label: 'Inventory', hint: 'Open inventory and batches', target: 'Inventory' },
    { type: 'action', label: 'Customers', hint: 'Open customer records', target: 'Customers' },
  ].map((item) => ({
    ...item,
    action: () => {
      setActiveNav(item.target)
      setSearchOpen(false)
      setGlobalSearch('')
      setSidebarOpen(false)
    },
  }))

  const searchResults = [
    ...globalSearchData,
    ...navSearchItems,
    ...quickSearchItems,
  ].filter((item) =>
    !globalSearch.trim() ||
    matchesSearch(globalSearch, item.label, item.hint),
  )

  const submitGlobalSearch = (event) => {
    event.preventDefault()
    const first = searchResults[0]
    if (first) first.action()
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div className="nav-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <button
            className="brand-logo-button"
            type="button"
            onClick={() => {
              setActiveNav('Dashboard')
              setSidebarOpen(false)
              setSearchOpen(false)
              setGlobalSearch('')
            }}
            aria-label="Go to dashboard"
          >
            <PharmDeskLogo compact />
          </button>
        </div>

        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={activeNav === item ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setActiveNav(item)
                setSidebarOpen(false)
                setSearchOpen(false)
                setGlobalSearch('')
              }}
            >
              <AppIcon name={{
                Dashboard: 'dashboard',
                Sales: 'sales',
                Purchases: 'purchases',
                Inventory: 'inventory',
                Customers: 'customers',
                Reports: 'reports',
                Alerts: 'alerts',
                Settings: 'settings',
              }[item]} />
              <span>{item}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-store">
          <div className="sidebar-store-icon"><AppIcon name="inventory" size={18} /></div>
          <div>
            <strong>{store?.name || 'Medical Store'}</strong>
            <span>Main Store</span>
          </div>
          <AppIcon name="arrow" size={16} />
        </div>

        <button className="logout-button" onClick={() => PharmDeskAPI.signOut()}>
          Sign out
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="topbar-menu"
            type="button"
            onClick={() => {
              if (window.innerWidth <= 800) {
                setSidebarOpen((current) => !current)
              } else {
                setSidebarCollapsed((current) => !current)
              }
            }}
            aria-label="Toggle navigation menu"
            title="Toggle navigation menu"
          >
            <AppIcon name="menu" size={22} />
          </button>

          <form ref={globalSearchRef} className="global-search" onSubmit={submitGlobalSearch}>
            <AppIcon name="search" size={18} />
            <input
              aria-label="Search PharmDesk"
              value={globalSearch}
              onFocus={() => {
                if (globalSearch.trim()) setSearchOpen(true)
              }
              onChange={(event) => {
                setGlobalSearch(event.target.value)
                setSearchOpen(Boolean(event.target.value.trim()))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchOpen(false)
                  event.currentTarget.blur()
                }
              }}
              placeholder="Search products or customers..."
            />
            {searchOpen && (
              <div className="global-search-results">
                {searchResults.slice(0, 7).map((item) => (
                  <button key={`${item.type}-${item.label}`} type="button" onClick={item.action}>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </button>
                ))}
                {!searchResults.length && (
                  <div className="global-search-empty">No matching PharmDesk section or action.</div>
                )}
              </div>
            )}
          </form>

          <div className="topbar-actions">
            <button
              className="icon-button notification-button"
              type="button"
              aria-label="Open alerts"
              title="Open alerts"
              onClick={() => {
                setActiveNav('Alerts')
                setSidebarOpen(false)
              }}
            >
              <AppIcon name="bell" size={20} />
              <span className="notification-dot" />
            </button>
            <button
              className="profile-pill"
              type="button"
              onClick={() => setActiveNav('Settings')}
              aria-label="Open profile settings"
              title="Open profile settings"
            >
              <span className="profile-avatar">{(profile?.full_name || session.user.email || 'A').charAt(0).toUpperCase()}</span>
              <strong>{profile?.full_name || session.user.email?.split('@')[0] || 'User'}</strong>
              <span className="profile-chevron">⌄</span>
            </button>
          </div>
        </header>
        {renderPage()}
      </main>
    </div>
  )
}  
  
/* =========================================================  
   DASHBOARD  
========================================================= */  
  
function Dashboard({ store, profile, onNavigate }) {
  const [stats, setStats] = useState({
    sales: 0,
    purchases: 0,
    batches: 0,
    expiry: 0,
    sales7d: [],
  })

  useEffect(() => {
    if (!store?.id) return
    const load = async () => {
      try {
        const start = todayISO()
        const snapshot = await PharmDeskAPI.dashboardSnapshot(store.id, start, 90)
        setStats({
          sales: sum((snapshot.sales || []).map((x) => x.grand_total)),
          purchases: sum((snapshot.purchases || []).map((x) => x.total_amount)),
          batches: snapshot.batches?.length || 0,
          expiry: snapshot.expiry?.length || 0,
          sales7d: snapshot.sales7d || [],
        })
      } catch (error) {
        console.error('Dashboard load error:', error)
      }
    }
    load()
  }, [store?.id])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  return (
    <div>
      <ModuleHeader
        title={`${greeting}, ${profile?.full_name || 'there'} 👋`}
        subtitle="Here's what's happening at your pharmacy today."
        right={
          <div className="date-pill">
            <AppIcon name="calendar" size={15} />
            <span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        }
      />

      <div className="stats-grid dashboard-stats">
        <StatCard title="Today's Sales" value={money(stats.sales)} icon="sales" />
        <StatCard title="Today's Purchases" value={money(stats.purchases)} icon="purchases" />
        <StatCard title="Stock Batches" value={stats.batches} icon="customers" />
        <StatCard title="Near Expiry" value={stats.expiry} icon="inventory" />
      </div>

      <div className="dashboard-columns">
        <section className="panel sales-overview">
          <div className="panel-header">
            <div>
              <h2>Sales Overview</h2>
              <p className="muted">Today's completed sales</p>
            </div>
            <span className="range-pill">Today</span>
          </div>
          <div className="mini-chart">
            <div className="chart-y"><span>₹</span><span>0</span></div>
            <div className="chart-bars">
              {(() => {
                const days = Array.from({ length: 7 }, (_, index) => {
                  const day = new Date()
                  day.setDate(day.getDate() - (6 - index))
                  const key = localDateISO(day)
                  const total = sum(
                    (stats.sales7d || [])
                      .filter((sale) => localDateISO(sale.bill_datetime) === key)
                      .map((sale) => sale.grand_total),
                  )
                  return { key, label: day.toLocaleDateString('en-IN', { weekday: 'short' }), total }
                })
                const max = Math.max(...days.map((day) => day.total), 1)
                return days.map((day) => (
                  <div className="chart-column" key={day.key}>
                    <div className="chart-bar" style={{ height: `${Math.max(4, (day.total / max) * 100)}%` }} title={money(day.total)} />
                    <span>{day.label}</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        </section>

        <section className="panel recent-activity">
          <div className="panel-header">
            <div>
              <h2>Quick Actions</h2>
              <p className="muted">Common tasks</p>
            </div>
          </div>
          <div className="activity-list">
            <button type="button" className="activity-item" onClick={() => onNavigate?.('Sales')}>
              <span className="activity-icon"><AppIcon name="sales" size={17} /></span>
              <span><strong>New Sale</strong><small>Create a customer bill</small></span>
            </button>
            <button type="button" className="activity-item" onClick={() => onNavigate?.('Purchases')}>
              <span className="activity-icon"><AppIcon name="purchases" size={17} /></span>
              <span><strong>New Purchase</strong><small>Record incoming stock</small></span>
            </button>
            <button type="button" className="activity-item" onClick={() => onNavigate?.('Inventory')}>
              <span className="activity-icon"><AppIcon name="inventory" size={17} /></span>
              <span><strong>Inventory</strong><small>Check products and stock</small></span>
            </button>
          </div>
        </section>
      </div>

      <section className="dashboard-quick panel">
        <div className="panel-header">
          <div>
            <h2>Quick Actions</h2>
            <p className="muted">Jump directly into the tasks you use most.</p>
          </div>
        </div>
        <div className="quick-action-grid">
          <button type="button" className="quick-action" onClick={() => onNavigate?.('Sales')}>
            <span className="quick-action-icon"><AppIcon name="sales" size={18} /></span>
            <strong>New Sale</strong>
            <small>Create a bill</small>
          </button>
          <button type="button" className="quick-action" onClick={() => onNavigate?.('Purchases')}>
            <span className="quick-action-icon"><AppIcon name="purchases" size={18} /></span>
            <strong>New Purchase</strong>
            <small>Record stock</small>
          </button>
          <button type="button" className="quick-action" onClick={() => onNavigate?.('Inventory')}>
            <span className="quick-action-icon"><AppIcon name="inventory" size={18} /></span>
            <strong>Inventory</strong>
            <small>Manage products</small>
          </button>
          <button type="button" className="quick-action" onClick={() => onNavigate?.('Customers')}>
            <span className="quick-action-icon"><AppIcon name="customers" size={18} /></span>
            <strong>Customers</strong>
            <small>View customer records</small>
          </button>
          <button type="button" className="quick-action" onClick={() => onNavigate?.('Reports')}>
            <span className="quick-action-icon"><AppIcon name="reports" size={18} /></span>
            <strong>Reports</strong>
            <small>Review performance</small>
          </button>
        </div>
      </section>
    </div>
  )
}  
  
function StatCard({ title, value, icon }) {
  return (
    <div className="stat-card">
      <span className="stat-icon"><AppIcon name={icon || 'dashboard'} size={17} /></span>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  )
}  
  

function AIRecommendations({
  store,
}) {
  const [rows, setRows] = useState([])
  const [previewRows, setPreviewRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null)

  const loadSavedRecommendations = async () => {
    if (!store?.id) return

    const { data, error: loadError } = await pharmdeskDb
      .from('ai_purchase_recommendations')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (loadError) {
      console.error('AI recommendation history error:', loadError)
      return
    }

    setRows(data || [])
  }

  useEffect(() => {
    loadSavedRecommendations()
  }, [store?.id])

  const generateRecommendations = async () => {
    if (!store?.id || loading) return

    setLoading(true)
    setError('')
    setPreviewRows([])

    try {
      const data = await PharmDeskAPI.generatePurchaseRecommendations(store.id)

      if (!data) {
        throw new Error('The AI recommendation function returned no data.')
      }

      if (data.error) {
        throw new Error(String(data.error))
      }

      const recommendations = Array.isArray(data.recommendations)
        ? data.recommendations
        : []

      setPreviewRows(recommendations)
      setLastGeneratedAt(new Date())
      await loadSavedRecommendations()
    } catch (err) {
      console.error('AI recommendation request failed:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to generate AI purchase recommendations.',
      )
    } finally {
      setLoading(false)
    }
  }

  const displayedSavedRows = rows.slice(0, 100)

  return (
    <PanelList title="AI Purchase Recommendations">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          className="primary-button"
          onClick={generateRecommendations}
          disabled={loading || !store?.id}
        >
          {loading
            ? 'Generating recommendations…'
            : 'Generate AI Recommendations'}
        </button>

        {lastGeneratedAt && (
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            Generated {lastGeneratedAt.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      <p className="muted" style={{ marginBottom: 16 }}>
        AI analyses your store data and returns a purchase recommendation preview.
        Nothing is ordered or added to stock automatically.
      </p>

      {error && <div className="error-box">{error}</div>}

      {previewRows.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            Latest AI Preview
          </div>

          <div className="record-list">
            {previewRows.map((row, index) => (
              <div
                className="record-row static"
                key={row.product_id || row.store_product_id || index}
              >
                <div>
                  <strong>
                    {row.product_name || row.product_id || 'Product'}
                  </strong>
                  <span>
                    Suggested quantity:{' '}
                    {row.recommended_quantity ??
                      row.suggested_quantity ??
                      '—'}
                  </span>
                  {row.reason && <span>{row.reason}</span>}
                  {row.urgency && <span>Urgency: {row.urgency}</span>}
                </div>

                <span>
                  {row.confidence != null
                    ? `Confidence: ${Math.round(Number(row.confidence) * 100)}%`
                    : 'AI suggestion'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {displayedSavedRows.length === 0 && previewRows.length === 0 ? (
        <EmptyState text="No saved AI purchase recommendations yet. Generate a preview above." />
      ) : displayedSavedRows.length > 0 ? (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            Saved Recommendations
          </div>

          <div className="record-list">
            {displayedSavedRows.map((row) => (
              <div className="record-row static" key={row.id}>
                <div>
                  <strong>
                    {row.product_name || row.product_id || 'Product'}
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
        </div>
      ) : null}
    </PanelList>
  )
}



/* =========================================================
   SALES + PURCHASES RESTORED
========================================================= */

function SalesModule({ store, session }) {  
  const [tab, setTab] = useState('New Sale')  
  
  return (  
    <div>  
      <ModuleHeader  
        title="Sales"  
        subtitle="Billing, customers, returns and credit"  
      />  
  
      <TabBar  
        tabs={SALES_TABS}  
        active={tab}  
        onChange={setTab}  
      />  
  
      {tab === 'New Sale' && (  
        <NewSale store={store} session={session} />  
      )}  
  
      {tab === 'Draft Bills' && (  
        <DraftBills store={store} />  
      )}  
  
      {tab === 'Completed Bills' && (  
        <CompletedBills store={store} />  
      )}  
  
      {tab === 'Returns' && (  
        <SalesReturns store={store} />  
      )}  
  
      {tab === 'Customers' && (  
        <CustomerHistoryList store={store} />  
      )}  
  
      {tab === 'Credit' && (  
        <CustomerCredit store={store} />  
      )}  
    </div>  
  )  
}  
  
function NewSale({ store }) {  
  const [customers, setCustomers] = useState([])  
  const [products, setProducts] = useState([])  
  const [stockByProduct, setStockByProduct] = useState({})  
  const [customerQuery, setCustomerQuery] = useState('')  
  const [productQuery, setProductQuery] = useState('')  
  const [selectedCustomer, setSelectedCustomer] =  
    useState(null)  
  const [items, setItems] = useState([emptySaleItem()])  
  const [payments, setPayments] = useState([  
    { method: 'cash', amount: 0 },  
  ])  
  const [billDiscount, setBillDiscount] = useState(0)  
  const [billDate, setBillDate] = useState(todayISO())  
  const [customerModal, setCustomerModal] =  
    useState(false)  
  const [productModal, setProductModal] =  
    useState(false)  
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
  
    const nextProducts =  
      (data || [])  
        .filter((x) => x.products?.is_active !== false)  
        .map((x) => ({  
          ...x.products,  
          storeProductId: x.id,  
          default_selling_price:  
            x.default_selling_price,  
          default_discount_percent:  
            x.default_discount_percent,  
          minimum_stock: x.minimum_stock,  
          reorder_level: x.reorder_level,  
        }))  
  
    setProducts(nextProducts)  
  
    const { data: stockRows } = await supabase  
      .from('batches')  
      .select('product_id, current_stock_units')  
      .eq('store_id', store.id)  
      .eq('is_active', true)  
      .gt('current_stock_units', 0)  
  
    const stockTotals = {}  
    ;(stockRows || []).forEach((row) => {  
      stockTotals[row.product_id] =  
        (stockTotals[row.product_id] || 0) +  
        safeNumber(row.current_stock_units)  
    })  
  
    setStockByProduct(stockTotals)  
  }  
  
  const filteredCustomers = useMemo(  
    () =>  
      customers  
        .filter((c) =>  
          matchesSearch(  
            customerQuery,  
            c.name,  
            c.phone,  
            c.address,  
          ),  
        )  
        .slice(0, 10),  
    [customers, customerQuery],  
  )  
  
  const filteredProducts = useMemo(  
    () =>  
      products  
        .map((p) => ({  
          p,  
          score: fuzzyScore(  
            productQuery,  
            `${p.product_name} ${  
              p.generic_display_name || ''  
            } ${p.manufacturer || ''}`,  
          ),  
        }))  
        .filter(  
          (x) => !productQuery || x.score > 0,  
        )  
        .sort((a, b) => b.score - a.score)  
        .slice(0, 12)  
        .map((x) => x.p),  
    [products, productQuery],  
  )  
  
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
      sellingPricePerPack: Number(  
        product.default_selling_price ||  
          batch?.mrp_per_pack ||  
          0,  
      ),  
      mrpPerPack: Number(batch?.mrp_per_pack || 0),  
      discountPercent: Number(  
        product.default_discount_percent || 0,  
      ),  
      gstRate: Number(product.gst_rate || 0),  
    }  
  
    setItems((current) => {  
      if (  
        current.length === 1 &&  
        !current[0].product  
      ) {  
        return [newItem]  
      }  
  
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
              x?.composition_id ===  
                product.composition_id &&  
              x.id !== product.id,  
          ),  
      )  
    } else {  
      setAlternatives([])  
    }  
  }  
  
  const updateItem = (id, patch) => {  
    setItems((current) =>  
      current.map((item) =>  
        item.id === id  
          ? { ...item, ...patch }  
          : item,  
      ),  
    )  
  }  
  
  const removeItem = (id) => {  
    setItems((current) => {  
      const next = current.filter(  
        (x) => x.id !== id,  
      )  
  
      return next.length  
        ? next  
        : [emptySaleItem()]  
    })  
  }  
  
  const subtotal = sum(  
    items  
      .filter((x) => x.product)  
      .map(  
        (x) =>  
          safeNumber(x.quantity) *  
          safeNumber(x.sellingPricePerPack),  
      ),  
  )  
  
  const itemDiscount = sum(  
    items  
      .filter((x) => x.product)  
      .map(  
        (x) =>  
          safeNumber(x.quantity) *  
          safeNumber(x.sellingPricePerPack) *  
          (safeNumber(x.discountPercent) / 100),  
      ),  
  )  
  
  const taxableBeforeBillDiscount = Math.max(  
    0,  
    subtotal - itemDiscount,  
  )  
  
  const finalTaxable = Math.max(  
    0,  
    taxableBeforeBillDiscount -  
      safeNumber(billDiscount),  
  )  
  
  const gst = sum(  
    items  
      .filter((x) => x.product)  
      .map((x) => {  
        const line =  
          safeNumber(x.quantity) *  
          safeNumber(x.sellingPricePerPack) *  
          (1 -  
            safeNumber(x.discountPercent) / 100)  
  
        const share =  
          taxableBeforeBillDiscount > 0  
            ? line / taxableBeforeBillDiscount  
            : 0  
  
        return (  
          finalTaxable *  
          share *  
          (safeNumber(x.gstRate) / 100)  
        )  
      }),  
  )  
  
  const grandTotal = finalTaxable + gst  
  const paidAmount = sum(  
    payments.map((x) => x.amount),  
  )  
  const dueAmount = Math.max(  
    0,  
    grandTotal - paidAmount,  
  )  
  
  const saveSale = async (e) => {  
    e.preventDefault()  
    setBusy(true)  
    setMessage('')  
  
    try {  
      const validItems = items.filter(  
        (x) => x.product,  
      )  
  
      if (!validItems.length) {  
        throw new Error(  
          'Add at least one product.',  
        )  
      }  
  
      for (const item of validItems) {  
        if (!item.batch?.id) {  
          throw new Error(  
            `Select a batch for ${item.product.product_name}.`,  
          )  
        }  
  
        if (safeNumber(item.quantity) <= 0) {  
          throw new Error(  
            `Quantity must be greater than zero for ${item.product.product_name}.`,  
          )  
        }  
      }  
  
      const saleItems = validItems.map(  
        (item) => ({  
          product_id: item.product.id,  
          batch_id: item.batch.id,  
          sale_unit_type: item.unitType,  
          quantity_entered:  
            safeNumber(item.quantity),  
          units_per_pack:  
            safeNumber(item.unitsPerPack) || 1,  
          mrp_per_pack:  
            safeNumber(item.mrpPerPack),  
          selling_price_per_pack:  
            safeNumber(item.sellingPricePerPack),  
          discount_percent:  
            safeNumber(item.discountPercent),  
          gst_rate: safeNumber(item.gstRate),  
        }),  
      )  
  
      const paymentRows = payments  
        .filter(  
          (p) => safeNumber(p.amount) > 0,  
        )  
        .map((p) => ({  
          payment_method: p.method,  
          amount: safeNumber(p.amount),  
        }))  
  
      const { data, error } =  
        await supabase.rpc(  
          'pharmdesk_complete_sale',  
          {  
            p_store_id: store.id,  
            p_customer_id:  
              selectedCustomer?.id || null,  
            p_bill_datetime: localDateTimeForDb(billDate),  
            p_bill_discount_amount:  
              safeNumber(billDiscount),  
            p_notes: null,  
            p_items: saleItems,  
            p_payments: paymentRows,  
          },  
        )  
  
      if (error) throw error  
  
      setMessage(  
        `Sale completed successfully: ${data}`,  
      )  
  
      setSelectedCustomer(null)  
      setItems([emptySaleItem()])  
      setPayments([  
        { method: 'cash', amount: 0 },  
      ])  
      setBillDiscount(0)  
      setAlternatives([])  
    } catch (error) {  
      setMessage(  
        error.message ||  
          'Unable to complete sale.',  
      )  
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
                    ? `${selectedCustomer.name} • ${  
                        selectedCustomer.phone || ''  
                      }`  
                    : customerQuery  
                }  
                placeholder="Search customer by name or phone"  
                onChange={(e) => {  
                  setSelectedCustomer(null)  
                  setCustomerQuery(  
                    e.target.value,  
                  )  
                }}  
              />  
  
              <button  
                type="button"  
                className="secondary-button"  
                onClick={() =>  
                  setCustomerModal(true)  
                }  
              >  
                + Add Customer  
              </button>  
            </div>  
  
            {!selectedCustomer &&  
              customerQuery && (  
                <div className="suggestion-list">  
                  {filteredCustomers.map(  
                    (customer) => (  
                      <button  
                        type="button"  
                        className="suggestion"  
                        key={customer.id}  
                        onClick={() => {  
                          setSelectedCustomer(  
                            customer,  
                          )  
                          setCustomerQuery('')  
                        }}  
                      >  
                        <strong>  
                          {customer.name}  
                        </strong>  
                        <span>  
                          {customer.phone ||  
                            'No phone'}  
                        </span>  
                      </button>  
                    ),  
                  )}  
                </div>  
              )}  
  
            {selectedCustomer && (  
              <div className="selected-record">  
                <strong>  
                  {selectedCustomer.name}  
                </strong>  
                <span>  
                  {selectedCustomer.phone ||  
                    'No phone'}  
                </span>  
              </div>  
            )}  
  
            {!selectedCustomer &&  
              !customerQuery && (  
                <div className="muted">  
                  Walk-in customer. A named  
                  customer can be selected above.  
                </div>  
              )}  
          </PanelList>  
  
          <PanelList title="Products">  
            <div className="search-row">  
              <input  
                value={productQuery}  
                placeholder="Search medicine, composition, manufacturer…"  
                onChange={(e) =>  
                  setProductQuery(e.target.value)  
                }  
              />  
  
              <button  
                type="button"  
                className="secondary-button"  
                onClick={() =>  
                  setProductModal(true)  
                }  
              >  
                + Add New Product  
              </button>  
            </div>  
  
            {productQuery && (  
              <div className="suggestion-list">  
                {filteredProducts.map(  
                  (product) => (  
                    <button  
                      type="button"  
                      className="suggestion"  
                      key={product.id}  
                      onClick={() =>  
                        chooseProduct(product)  
                      }  
                    >  
                      <div  
                        style={{  
                          display: 'flex',  
                          alignItems: 'center',  
                          justifyContent: 'space-between',  
                          gap: '12px',  
                          width: '100%',  
                        }}  
                      >  
                        <div  
                          style={{  
                            minWidth: 0,  
                            display: 'flex',  
                            flexDirection: 'column',  
                            alignItems: 'flex-start',  
                          }}  
                        >  
                          <strong>  
                            {product.product_name}  
                          </strong>  
                          <span>  
                            {product.generic_display_name ||  
                              product.manufacturer ||  
                              product.dosage_form ||  
                              ''}  
                          </span>  
                        </div>  
                        <strong  
                          style={{  
                            flex: '0 0 auto',  
                            whiteSpace: 'nowrap',  
                          }}  
                        >  
                          Stock: {stockByProduct[product.id] ?? 0}  
                        </strong>  
                      </div>  
                    </button>  
                  ),  
                )}  
              </div>  
            )}  
  
            {alternatives.length > 0 && (  
              <div className="alternative-box">  
                <strong>  
                  Other brands with the same  
                  composition  
                </strong>  
  
                <div className="chip-row">  
                  {alternatives.map((p) => (  
                    <button  
                      type="button"  
                      className="chip"  
                      key={p.id}  
                      onClick={() =>  
                        chooseProduct(p)  
                      }  
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
                onChange={(patch) =>  
                  updateItem(item.id, patch)  
                }  
                onRemove={() =>  
                  removeItem(item.id)  
                }  
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
                onChange={(e) =>  
                  setBillDate(e.target.value)  
                }  
              />  
            </label>  
  
            <label>  
              Bill discount  
              <input  
                type="number"  
                min="0"  
                step="0.01"  
                value={billDiscount}  
                onChange={(e) =>  
                  setBillDiscount(  
                    e.target.value,  
                  )  
                }  
              />  
            </label>  
  
            <div className="totals">  
              <div>  
                <span>Subtotal</span>  
                <strong>  
                  {money(subtotal)}  
                </strong>  
              </div>  
  
              <div>  
                <span>Item discounts</span>  
                <strong>  
                  {money(itemDiscount)}  
                </strong>  
              </div>  
  
              <div>  
                <span>Bill discount</span>  
                <strong>  
                  {money(billDiscount)}  
                </strong>  
              </div>  
  
              <div>  
                <span>GST</span>  
                <strong>{money(gst)}</strong>  
              </div>  
  
              <div className="grand-total">  
                <span>Total</span>  
                <strong>  
                  {money(grandTotal)}  
                </strong>  
              </div>  
            </div>  
          </PanelList>  
  
          <PanelList title="Payments">  
            {payments.map(  
              (payment, index) => (  
                <div  
                  className="payment-row"  
                  key={index}  
                >  
                  <select  
                    value={payment.method}  
                    onChange={(e) => {  
                      const next = [  
                        ...payments,  
                      ]  
  
                      next[index] = {  
                        ...next[index],  
                        method: e.target.value,  
                      }  
  
                      setPayments(next)  
                    }}  
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
                    step="0.01"  
                    value={payment.amount}  
                    onChange={(e) => {  
                      const next = [  
                        ...payments,  
                      ]  
  
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
                          payments.filter(  
                            (_, i) =>  
                              i !== index,  
                          ),  
                        )  
                      }  
                    >  
                      ×  
                    </button>  
                  )}  
                </div>  
              ),  
            )}  
  
            <button  
              type="button"  
              className="secondary-button"  
              onClick={() =>  
                setPayments([  
                  ...payments,  
                  {  
                    method: 'upi',  
                    amount: 0,  
                  },  
                ])  
              }  
            >  
              + Split Payment  
            </button>  
  
            <div className="payment-summary">  
              <div>  
                <span>Paid</span>  
                <strong>  
                  {money(paidAmount)}  
                </strong>  
              </div>  
  
              <div>  
                <span>Due</span>  
                <strong>  
                  {money(dueAmount)}  
                </strong>  
              </div>  
            </div>  
          </PanelList>  
  
          {message && (  
            <div className="message-box">  
              {message}  
            </div>  
          )}  
  
          <button  
            className="primary-button large"  
            disabled={busy}  
            type="submit"  
          >  
            {busy  
              ? 'Completing sale…'  
              : `Complete Sale • ${money(  
                  grandTotal,  
                )}`}  
          </button>  
        </div>  
      </div>  
  
      {customerModal && (  
        <CustomerModal  
          store={store}  
          onClose={() =>  
            setCustomerModal(false)  
          }  
          onCreated={(customer) => {  
            setCustomers((x) => [  
              customer,  
              ...x,  
            ])  
            setSelectedCustomer(customer)  
            setCustomerModal(false)  
          }}  
        />  
      )}  
  
      {productModal && (  
        <ProductModal  
          store={store}  
          onClose={() =>  
            setProductModal(false)  
          }  
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
  
async function loadProductsAfterCreate(  
  product,  
  current,  
  setter,  
) {  
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
        default_selling_price:  
          data.default_selling_price,  
        default_discount_percent:  
          data.default_discount_percent,  
        minimum_stock: data.minimum_stock,  
        reorder_level: data.reorder_level,  
      },  
      ...current.filter(  
        (x) => x.id !== product.id,  
      ),  
    ])  
  }  
}  
  
function SaleItemRow({  
  item,  
  onChange,  
  onRemove,  
}) {  
  const lineTotal =  
    safeNumber(item.quantity) *  
    safeNumber(item.sellingPricePerPack) *  
    (1 -  
      safeNumber(item.discountPercent) / 100)  
  
  return (  
    <div className="transaction-item">  
      <div className="item-title">  
        <strong>  
          {item.product?.product_name ||  
            'Product not selected'}  
        </strong>  
  
        {item.product  
          ?.generic_display_name && (  
          <span>  
            {item.product.generic_display_name}  
          </span>  
        )}  
      </div>  
  
      {item.product && (  
        <div className="item-grid">  
          <label>  
            Batch number  
            <select  
              value={item.batch?.id || ''}  
              onChange={(e) => {  
                const batch =  
                  item.batches.find(  
                    (b) =>  
                      b.id ===  
                      e.target.value,  
                  )  
  
                onChange({  
                  batch,  
                  unitsPerPack:  
                    batch?.units_per_pack ||  
                    1,  
                  mrpPerPack:  
                    batch?.mrp_per_pack ||  
                    0,  
                })  
              }}  
            >  
              <option value="">  
                Select batch  
              </option>  
  
              {item.batches.map(  
                (batch) => (  
                  <option  
                    key={batch.id}  
                    value={batch.id}  
                  >  
                    {batch.batch_number}  
                  </option>  
                ),  
              )}  
            </select>  
          </label>  
  
          <label>  
            Expiry  
            <input  
              value={  
                item.batch?.expiry_date  
                  ? dateText(item.batch.expiry_date)  
                  : ''  
              }  
              readOnly  
            />  
          </label>  
  
          <label>  
            Current stock  
            <input  
              value={  
                item.batch?.current_stock_units ?? ''  
              }  
              readOnly  
            />  
          </label>  
  
          <label>  
            Sale type  
            <select  
              value={item.unitType}  
              onChange={(e) =>  
                onChange({  
                  unitType:  
                    e.target.value,  
                })  
              }  
            >  
              <option value="pack">  
                Strip / Pack  
              </option>  
              <option value="unit">  
                Tablet / Unit  
              </option>  
            </select>  
          </label>  
  
          <label>  
            Quantity  
            <input  
              type="number"  
              min="0.01"  
              step="any"  
              value={item.quantity}  
              onChange={(e) =>  
                onChange({  
                  quantity:  
                    e.target.value,  
                })  
              }  
            />  
          </label>  
  
          <label>  
            Selling price  
            <input  
              type="number"  
              min="0"  
              step="0.01"  
              value={  
                item.sellingPricePerPack  
              }  
              onChange={(e) =>  
                onChange({  
                  sellingPricePerPack:  
                    e.target.value,  
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
                  discountPercent:  
                    e.target.value,  
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
                onChange({  
                  gstRate:  
                    e.target.value,  
                })  
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
  const [editing, setEditing] = useState(null)
  const [creditByCustomer, setCreditByCustomer] = useState({})

  const load = async () => {
    if (!store?.id) return

    const [
      { data: customerRows },
      { data: salesRows },
      { data: creditRows },
    ] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('store_id', store.id)
        .order('name'),
      supabase
        .from('sales')
        .select('id, customer_id, grand_total, status')
        .eq('store_id', store.id)
        .not('customer_id', 'is', null),
      supabase
        .from('customer_credit_transactions')
        .select('customer_id, transaction_type, amount')
        .eq('store_id', store.id),
    ])

    const customersList = customerRows || []
    setCustomers(customersList)

    const salesById = {}
    const debitByCustomer = {}
    ;(salesRows || []).forEach((sale) => {
      if (!sale?.customer_id) return
      if (sale.status === 'cancelled') return

      const amount = safeNumber(sale.grand_total)
      debitByCustomer[sale.customer_id] =
        safeNumber(debitByCustomer[sale.customer_id]) + amount

      salesById[sale.id] = sale.customer_id
    })

    const creditByCustomerTotals = {}

    const saleIds = Object.keys(salesById)
    if (saleIds.length) {
      const { data: paymentRows } = await supabase
        .from('sale_payments')
        .select('sale_id, amount')
        .in('sale_id', saleIds)

      ;(paymentRows || []).forEach((payment) => {
        const customerId = salesById[payment.sale_id]
        if (!customerId) return

        creditByCustomerTotals[customerId] =
          safeNumber(creditByCustomerTotals[customerId]) +
          safeNumber(payment.amount)
      })
    }

    ;(creditRows || []).forEach((entry) => {
      const customerId = entry?.customer_id
      if (!customerId) return

      const amount = safeNumber(entry.amount)

      if (entry.transaction_type === 'credit_payment') {
        creditByCustomerTotals[customerId] =
          safeNumber(creditByCustomerTotals[customerId]) + amount
      } else if (entry.transaction_type === 'credit_refund') {
        creditByCustomerTotals[customerId] =
          safeNumber(creditByCustomerTotals[customerId]) + amount
      } else if (entry.transaction_type === 'credit_adjustment') {
        if (amount >= 0) {
          debitByCustomer[customerId] =
            safeNumber(debitByCustomer[customerId]) + amount
        } else {
          creditByCustomerTotals[customerId] =
            safeNumber(creditByCustomerTotals[customerId]) +
            Math.abs(amount)
        }
      }
    })

    const balanceMap = {}
    customersList.forEach((customer) => {
      const debit = safeNumber(debitByCustomer[customer.id])
      const credit = safeNumber(creditByCustomerTotals[customer.id])
      balanceMap[customer.id] = Math.max(0, debit - credit)
    })

    setCreditByCustomer(balanceMap)
  }

  useEffect(() => {
    if (store?.id) load()
  }, [store?.id])

  const filtered = customers.filter((customer) =>
    matchesSearch(query, customer.name, customer.phone),
  )

  return (
    <PanelList title="Customers">
      <input
        placeholder="Search customer"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="record-list">
        {filtered.map((customer) => {
          const outstanding = safeNumber(creditByCustomer[customer.id])

          return (
            <div
              className="record-row static"
              key={customer.id}
            >
              <div>
                <button
                  type="button"
                  onClick={() => setSelected(customer)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    font: 'inherit',
                    fontWeight: 700,
                    color: '#0a5bd3',
                    textAlign: 'left',
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                    cursor: 'pointer',
                  }}
                  title="Open customer account"
                >
                  {customer.name || 'Walk-in Customer'}
                </button>

                <span>{customer.phone || '—'}</span>

                {customer.referred_doctor_name && (
                  <span>
                    Dr. {customer.referred_doctor_name}
                  </span>
                )}

                {outstanding > 0.009 && (
                  <span>
                    Outstanding credit: {money(outstanding)}
                  </span>
                )}
              </div>

              <div className="record-right">
                {outstanding > 0.009 ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 10px',
                      borderRadius: 999,
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Outstanding {money(outstanding)}
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 10px',
                      borderRadius: 999,
                      background: '#dcfce7',
                      color: '#166534',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Paid / Cleared
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selected && (
        <CustomerHistoryModal
          store={store}
          customer={selected}
          onClose={() => setSelected(null)}
          onEdit={(customer) => {
            setSelected(null)
            setEditing(customer)
          }}
          onSettle={(customer) => {
            setSelected(null)
          }}
        />
      )}

      {editing && (
        <CustomerModal
          store={store}
          customer={editing}
          onClose={() => setEditing(null)}
          onCreated={(updated) => {
            setCustomers((current) =>
              current.map((customer) =>
                customer.id === updated.id
                  ? updated
                  : customer,
              ),
            )
            setEditing(null)
            load()
          }}
        />
      )}
    </PanelList>
  )
}


function CustomerLedgerReceiptModal({
  store,
  customer,
  entry,
  onClose,
}) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [receiptEditing, setReceiptEditing] = useState(false)

  useEffect(() => {
    if (entry.sourceType === 'sale_payment' && entry.payment) {
      const sale = entry.sale
      setDetails({
        receiptId: entry.reference,
        customerName: customer.name || 'Walk-in Customer',
        phone: customer.phone || '',
        invoiceNumber: sale?.invoice_number || '—',
        date: entry.payment.created_at || sale?.bill_datetime,
        amount: safeNumber(entry.payment.amount),
        paymentMethod: paymentLabel(entry.payment.payment_method),
        paymentReference: entry.payment.payment_reference || '',
        notes: entry.payment.notes || '',
      })
      setReceiptEditing(false)
      setLoading(false)
      return
    }

    const transaction = entry.creditTransaction
    const paymentModeMatch = String(transaction?.notes || '').match(/Payment mode:\s*([^\n]+)/i)
    const notes = String(transaction?.notes || '')
      .replace(/Payment mode:\s*[^\n]+\n?/i, '')
      .trim()

    setDetails({
      receiptId: entry.reference,
      customerName: customer.name || 'Walk-in Customer',
      phone: customer.phone || '',
      invoiceNumber: 'Customer credit settlement',
      date: transaction?.created_at || entry.date,
      amount: safeNumber(transaction?.amount),
      paymentMethod: paymentModeMatch ? paymentModeMatch[1].trim() : '—',
      paymentReference: '',
      notes,
    })
    setLoading(false)
  }, [entry, customer])

  const printReceipt = () => {
    if (!details) return
    const printWindow = window.open('', '_blank', 'width=480,height=720')
    if (!printWindow) return
    const safe = (value) =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
    printDocument.open()
  printDocument.write(`
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>${safe(details.receiptId)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; max-width: 420px; margin: auto; }
            h1 { font-size: 20px; margin-bottom: 18px; }
            .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; }
            .total { border-top: 1px solid #ccc; margin-top: 10px; padding-top: 12px; font-size: 18px; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>Payment Receipt</h1>
          <div class="row"><span>Receipt</span><strong>${safe(details.receiptId)}</strong></div>
          <div class="row"><span>Customer</span><strong>${safe(details.customerName)}</strong></div>
          <div class="row"><span>Date</span><span>${safe(dateTimeText(details.date))}</span></div>
          <div class="row"><span>Payment mode</span><strong>${safe(details.paymentMethod)}</strong></div>
          <div class="row"><span>Invoice / reference</span><span>${safe(details.invoiceNumber)}</span></div>
          ${details.paymentReference ? `<div class="row"><span>Payment reference</span><span>${safe(details.paymentReference)}</span></div>` : ''}
          <div class="row total"><span>Amount</span><span>${safe(money(details.amount))}</span></div>
          ${details.notes ? `<p><strong>Notes:</strong> ${safe(details.notes)}</p>` : ''}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 250)
  }

  return (
    <Modal title={`Receipt ${details?.receiptId || ''}`} onClose={onClose}>
      {loading ? (
        <LoadingInline />
      ) : !details ? (
        <EmptyState text="Unable to load this receipt." />
      ) : (
        <>
          <div className="history-header">
            <div>
              <strong>{details.receiptId}</strong>
              <span>{details.customerName}</span>
              <span>{dateTimeText(details.date)}</span>
            </div>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={printReceipt}>
                Print Receipt
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                Back to Account
              </button>
            </div>
          </div>

          <div className="button-row" style={{ marginBottom: '12px' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setReceiptEditing((current) => !current)}
            >
              {receiptEditing ? 'Done editing' : 'Edit for printing'}
            </button>
          </div>

          {receiptEditing && (
            <div className="info-box">
              Edit the print copy below before printing. These changes do not alter the stored sale/payment record.
            </div>
          )}

          <div className="item-grid">
            <label>
              Customer
              <input value={details.customerName} readOnly />
            </label>
            <label>
              Invoice / Reference
              <input
                value={details.invoiceNumber}
                readOnly={!receiptEditing}
                onChange={(e) => setDetails((current) => ({ ...current, invoiceNumber: e.target.value }))}
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={details.amount}
                readOnly={!receiptEditing}
                onChange={(e) => setDetails((current) => ({ ...current, amount: e.target.value }))}
              />
            </label>
            <label>
              Payment mode
              <select
                value={String(details.paymentMethod || '').toLowerCase().replace(/\s+/g, '_')}
                disabled={!receiptEditing}
                onChange={(e) => setDetails((current) => ({ ...current, paymentMethod: paymentLabel(e.target.value) }))}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Payment reference
              <input
                value={details.paymentReference || ''}
                readOnly={!receiptEditing}
                onChange={(e) => setDetails((current) => ({ ...current, paymentReference: e.target.value }))}
              />
            </label>
          </div>

          <label>
            Notes
            <textarea
              value={details.notes || ''}
              readOnly={!receiptEditing}
              onChange={(e) => setDetails((current) => ({ ...current, notes: e.target.value }))}
              rows={3}
            />
          </label>

          <div className="stats-grid">
            <StatCard title="Amount" value={money(details.amount)} />
            <StatCard title="Payment Mode" value={details.paymentMethod} />
            <StatCard title="Invoice / Reference" value={details.invoiceNumber} />
          </div>
        </>
      )}
    </Modal>
  )
}

function CustomerHistoryModal({
  store,
  customer,
  onClose,
  onEdit,
  onSettle,
}) {
  const [sales, setSales] = useState([])
  const [items, setItems] = useState([])
  const [salePayments, setSalePayments] = useState([])
  const [ledger, setLedger] = useState([])
  const [creditSummary, setCreditSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ledgerError, setLedgerError] = useState('')
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState(null)

  useEffect(() => {
    loadHistory()
  }, [customer.id])

  const loadHistory = async () => {
    setLoading(true)
    setLedgerError('')

    const { data: salesData } = await supabase
      .from('sales')
      .select(
        'id, invoice_number, bill_datetime, grand_total, amount_paid, amount_due, status',
      )
      .eq('customer_id', customer.id)
      .eq('store_id', customer.store_id)
      .order('bill_datetime', { ascending: false })

    const saleRows = salesData || []
    setSales(saleRows)

    if (saleRows.length) {
      const saleIds = saleRows.map((x) => x.id)

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
        .in('sale_id', saleIds)

      setItems(itemRows || [])

      const { data: paymentRows, error: paymentError } = await supabase
        .from('sale_payments')
        .select('id, sale_id, payment_method, amount, created_at, payment_reference')
        .in('sale_id', saleIds)
        .order('created_at', { ascending: true })

      if (paymentError) {
        setSalePayments([])
        setLedgerError(paymentError.message || 'Could not load customer payment records.')
      } else {
        setSalePayments(paymentRows || [])
      }
    } else {
      setItems([])
      setSalePayments([])
    }

    const { data: ledgerRows, error: ledgerLoadError } = await supabase
      .from('customer_credit_transactions')
      .select(
        'id, sale_id, transaction_type, amount, notes, created_at',
      )
      .eq('customer_id', customer.id)
      .eq('store_id', customer.store_id)
      .order('created_at', { ascending: true })

    if (ledgerLoadError) {
      setLedger([])
      setLedgerError(
        (current) => current || ledgerLoadError.message || 'Could not load the customer account ledger.',
      )
    } else {
      setLedger(ledgerRows || [])
    }

    const { data: creditRows } = await supabase.rpc(
      'pharmdesk_customer_credit_report',
      { p_store_id: customer.store_id },
    )

    const summary = (creditRows || []).find(
      (row) => row.customer_id === customer.id,
    )
    setCreditSummary(summary || null)

    setLoading(false)
  }

  const medicineHistory = useMemo(() => {
    const map = new Map()

    for (const item of items) {
      const product = item.products
      if (!product) continue

      if (!map.has(product.id)) {
        map.set(product.id, {
          product,
          quantity: 0,
          lastDate: null,
          lastPrice: 0,
          bills: 0,
        })
      }

      const entry = map.get(product.id)
      entry.quantity += safeNumber(item.quantity_entered)
      entry.lastPrice = safeNumber(item.selling_price_per_pack)

      const sale = sales.find((s) => s.id === item.sale_id)
      if (
        sale &&
        (!entry.lastDate ||
          new Date(sale.bill_datetime) > new Date(entry.lastDate))
      ) {
        entry.lastDate = sale.bill_datetime
      }

      entry.bills += 1
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.lastDate || 0) - new Date(a.lastDate || 0),
    )
  }, [items, sales])

  const activeSales = sales.filter((x) => x.status !== 'cancelled')
  const activeSaleIds = useMemo(
    () => new Set(activeSales.map((sale) => sale.id)),
    [activeSales],
  )

  const saleById = useMemo(
    () => new Map(activeSales.map((sale) => [sale.id, sale])),
    [activeSales],
  )

  const accountLedger = useMemo(() => {
    const entries = []

    activeSales.forEach((sale) => {
      const saleAmount = safeNumber(sale.grand_total)
      const salePaid = safeNumber(sale.amount_paid)
      const saleDue = safeNumber(sale.amount_due)
      const isCreditSale = saleDue > 0.009 && salePaid < saleAmount - 0.009

      entries.push({
        id: `invoice-${sale.id}`,
        reference: sale.invoice_number || `Invoice ${String(sale.id).slice(0, 8).toUpperCase()}`,
        date: sale.bill_datetime,
        debit: saleAmount,
        credit: 0,
        entryType: isCreditSale ? 'credit_sale' : 'paid_sale',
        sourceType: 'invoice',
        saleId: sale.id,
        sale,
        sortDate: new Date(sale.bill_datetime || 0).getTime(),
      })
    })

    salePayments
      .filter((payment) => activeSaleIds.has(payment.sale_id))
      .forEach((payment) => {
        const sale = saleById.get(payment.sale_id)
        entries.push({
          id: `payment-${payment.id}`,
          reference:
            payment.payment_reference ||
            `Receipt RCP-${String(payment.id || '').slice(0, 8).toUpperCase()}`,
          paymentMode: payment.payment_method ? paymentLabel(payment.payment_method) : '',
          date: payment.created_at || sale?.bill_datetime,
          debit: 0,
          credit: safeNumber(payment.amount),
          entryType: 'payment',
          sourceType: 'sale_payment',
          saleId: payment.sale_id,
          payment,
          sale,
          sortDate: new Date(payment.created_at || sale?.bill_datetime || 0).getTime(),
        })
      })

    ledger.forEach((entry) => {
      const sale = entry.sale_id ? saleById.get(entry.sale_id) : null
      if (entry.sale_id && !sale) return

      if (entry.transaction_type === 'credit_payment') {
        const paymentModeMatch = String(entry.notes || '').match(/Payment mode:\s*([^\n]+)/i)
        entries.push({
          id: `credit-payment-${entry.id}`,
          reference: `Receipt RCP-${String(entry.id || '').slice(0, 8).toUpperCase()}`,
          paymentMode: paymentModeMatch ? paymentModeMatch[1].trim() : '',
          date: entry.created_at,
          debit: 0,
          credit: safeNumber(entry.amount),
          entryType: 'payment',
          sourceType: 'credit_payment',
          creditTransaction: entry,
          sortDate: new Date(entry.created_at || 0).getTime(),
        })
      } else if (entry.transaction_type === 'credit_adjustment') {
        const amount = safeNumber(entry.amount)
        entries.push({
          id: `adjustment-${entry.id}`,
          reference: `Adjustment ${String(entry.id || '').slice(0, 8).toUpperCase()}`,
          date: entry.created_at,
          debit: amount > 0 ? amount : 0,
          credit: amount < 0 ? Math.abs(amount) : 0,
          entryType: 'adjustment',
          sortDate: new Date(entry.created_at || 0).getTime(),
        })
      } else if (entry.transaction_type === 'credit_refund') {
        entries.push({
          id: `refund-${entry.id}`,
          reference: sale?.invoice_number || `Refund RCP-${String(entry.id || '').slice(0, 8).toUpperCase()}`,
          date: entry.created_at,
          debit: 0,
          credit: safeNumber(entry.amount),
          entryType: 'refund',
          sortDate: new Date(entry.created_at || 0).getTime(),
        })
      }
    })

    return entries.sort((a, b) => {
      if (a.sortDate !== b.sortDate) return a.sortDate - b.sortDate
      return String(a.id).localeCompare(String(b.id))
    })
  }, [activeSales, activeSaleIds, ledger, saleById, salePayments])

  const totalBilled = sum(activeSales.map((x) => x.grand_total))
  const totalDebit = sum(accountLedger.map((entry) => entry.debit))
  const totalCredit = sum(accountLedger.map((entry) => entry.credit))
  const totalCollected = totalCredit
  const ledgerOutstanding = Math.max(0, totalDebit - totalCredit)
  // The rendered account ledger is the source of truth for this customer's
  // displayed outstanding balance. This includes invoices, sale payments,
  // customer-credit payments, refunds and adjustments exactly once.
  const outstanding = ledgerOutstanding

  return (
    <Modal
      title={`${customer.name || 'Customer'} • Account History`}
      onClose={onClose}
    >
      {loading ? (
        <LoadingInline />
      ) : (
        <>
          <div className="history-header">
            <div>
              <strong>{customer.name || 'Walk-in Customer'}</strong>
              <span>{customer.phone || 'No phone'}</span>
            </div>

            <div className="button-row">
              {onEdit && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onEdit(customer)}
                >
                  Edit Customer
                </button>
              )}
              {outstanding > 0.009 && onSettle && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onSettle({ ...customer, outstanding_credit: outstanding })}
                >
                  Settle Account
                </button>
              )}
            </div>
          </div>

          <div className="stats-grid">
            <StatCard title="Total Bills" value={activeSales.length} />
            <StatCard title="Total Billed" value={money(totalBilled)} />
            <StatCard title="Total Paid" value={money(totalCollected)} />
            <StatCard title="Outstanding" value={money(outstanding)} />
          </div>

          <h3>Bill History</h3>
          <div className="record-list">
            {activeSales.length === 0 ? (
              <EmptyState text="No bills have been made for this customer." />
            ) : (
              activeSales.map((sale) => {
                const due = safeNumber(sale.amount_due)
                const paid = safeNumber(sale.amount_paid)
                return (
                  <div className="record-row static" key={sale.id}>
                    <div>
                      <button
                        type="button"
                        onClick={() => setSelectedLedgerEntry({ kind: 'invoice', sale })}
                        style={{
                          border: 0,
                          background: 'transparent',
                          padding: 0,
                          margin: 0,
                          font: 'inherit',
                          fontWeight: 700,
                          color: '#0a5bd3',
                          textAlign: 'left',
                          textDecoration: 'underline',
                          textUnderlineOffset: '3px',
                          cursor: 'pointer',
                        }}
                        title="Open invoice"
                      >
                        {sale.invoice_number || 'Bill'}
                      </button>
                      <span>{dateTimeText(sale.bill_datetime)}</span>
                      <span>{due > 0.009 ? 'Outstanding' : 'Paid'}</span>
                    </div>
                    <div className="record-right">
                      <span>Invoice: {money(sale.grand_total)}</span>
                      <span>Paid: {money(paid)}</span>
                      <span>Outstanding: {money(due)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <h3>Account Ledger</h3>
          {ledgerError && <div className="error-box">{ledgerError}</div>}

          {!ledgerError && accountLedger.length === 0 && (
            <EmptyState text="No account transactions recorded for this customer." />
          )}

          {!ledgerError && accountLedger.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 12,
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 12,
                  background: '#f8fafc',
                }}
              >
                <strong style={{ marginRight: 4 }}>Ledger guide:</strong>
                {[
                  ['credit_sale', 'Credit sale'],
                  ['paid_sale', 'Paid on the spot'],
                  ['payment', 'Payment received'],
                ].map(([type, label]) => {
                  const visual = customerLedgerVisual(type)
                  return (
                    <span
                      key={type}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: 13,
                        fontWeight: 600,
                        color: visual.text,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: visual.border,
                          display: 'inline-block',
                        }}
                      />
                      {label}
                    </span>
                  )
                })}
              </div>

              <div
                style={{
                  overflowX: 'auto',
                  border: '1px solid #c7cbd1',
                  fontFamily: 'inherit',
                  borderRadius: 14,
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    minWidth: 720,
                    display: 'grid',
                    gridTemplateColumns: '1.35fr 1fr 1fr 1fr',
                    background: '#eef0f4',
                    borderBottom: '1px solid #c7cbd1',
                    fontWeight: 700,
                  }}
                >
                  <div style={{ padding: '16px 20px' }}>Reference</div>
                  <div style={{ padding: '16px 20px' }}>Date</div>
                  <div style={{ padding: '16px 20px', textAlign: 'right' }}>Debit</div>
                  <div style={{ padding: '16px 20px', textAlign: 'right' }}>Credit</div>
                </div>

                {accountLedger.map((entry) => {
                  const visual = customerLedgerVisual(entry.entryType)
                  return (
                    <div
                      className="customer-ledger-row"
                      key={entry.id}
                      style={{
                        minWidth: 720,
                        display: 'grid',
                        gridTemplateColumns: '1.35fr 1fr 1fr 1fr',
                        borderBottom: '1px solid #d9dce1',
                        borderLeft: `5px solid ${visual.border}`,
                        background: visual.background,
                      }}
                    >
                      <div style={{ padding: '16px 20px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.sourceType === 'invoice' && entry.sale) {
                              setSelectedLedgerEntry({ kind: 'invoice', sale: entry.sale })
                            } else if (entry.sourceType === 'sale_payment' || entry.sourceType === 'credit_payment') {
                              setSelectedLedgerEntry({ kind: 'receipt', entry })
                            }
                          }}
                          style={{
                            border: 0,
                            background: 'transparent',
                            padding: 0,
                            margin: 0,
                            font: 'inherit',
                            fontWeight: 700,
                            color: visual.text,
                            textAlign: 'left',
                            textDecoration: 'underline',
                            textUnderlineOffset: '3px',
                            cursor: 'pointer',
                          }}
                          title={entry.sourceType === 'invoice' ? 'Open invoice' : 'Open receipt'}
                        >
                          {entry.reference}
                        </button>
                        <span
                          style={{
                            display: 'block',
                            marginTop: 4,
                            color: visual.text,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {visual.label}
                        </span>
                        {entry.paymentMode && (
                          <span style={{ display: 'block', marginTop: 3, color: '#6b7280', fontSize: 13 }}>
                            Mode: {entry.paymentMode}
                          </span>
                        )}
                      </div>
                      <div style={{ padding: '16px 20px' }}>
                        {dateTimeText(entry.date)}
                      </div>
                      <div
                        style={{
                          padding: '16px 20px',
                          textAlign: 'right',
                          color: entry.debit > 0 ? visual.text : '#374151',
                          fontWeight: entry.debit > 0 ? 700 : 400,
                        }}
                      >
                        {entry.debit > 0 ? money(entry.debit) : '—'}
                      </div>
                      <div
                        style={{
                          padding: '16px 20px',
                          textAlign: 'right',
                          color: entry.credit > 0 ? '#15803d' : '#374151',
                          fontWeight: entry.credit > 0 ? 700 : 400,
                        }}
                      >
                        {entry.credit > 0 ? money(entry.credit) : '—'}
                      </div>
                    </div>
                  )
                })}

                <div
                  style={{
                    minWidth: 720,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1.2fr',
                    background: '#e6e9ef',
                    fontWeight: 700,
                  }}
                >
                  <div style={{ padding: '18px 20px' }}>
                    Total Debit: {money(totalDebit)}
                  </div>
                  <div style={{ padding: '18px 20px' }}>
                    Total Credit: {money(totalCredit)}
                  </div>
                  <div style={{ padding: '18px 20px', textAlign: 'right' }}>
                    Outstanding Balance: {money(ledgerOutstanding)}
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedLedgerEntry?.kind === 'invoice' && selectedLedgerEntry.sale && (
            <SaleBillModal
              store={store}
              sale={selectedLedgerEntry.sale}
              onClose={() => setSelectedLedgerEntry(null)}
              onUpdated={() => {
                setSelectedLedgerEntry(null)
                loadHistory()
              }}
            />
          )}

          {selectedLedgerEntry?.kind === 'receipt' && (
            <CustomerLedgerReceiptModal
              store={store}
              customer={customer}
              entry={selectedLedgerEntry.entry}
              onClose={() => setSelectedLedgerEntry(null)}
            />
          )}

          <h3>Products Previously Purchased</h3>
          <div className="record-list">
            {medicineHistory.length === 0 ? (
              <EmptyState text="No previous medicine purchases found." />
            ) : (
              medicineHistory.map((entry) => (
                <div className="record-row static" key={entry.product.id}>
                  <div>
                    <strong>{entry.product.product_name}</strong>
                    <span>{entry.product.generic_display_name || ''}</span>
                  </div>
                  <div className="record-right">
                    <span>Qty: {entry.quantity}</span>
                    <span>Bills: {entry.bills}</span>
                    <span>Last: {dateText(entry.lastDate)}</span>
                    <strong>{money(entry.lastPrice)}</strong>
                  </div>
                </div>
              ))
            )}
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
      .order('created_at', {  
        ascending: false,  
      })  
      .then(({ data }) =>  
        setRows(data || []),  
      )  
  }, [store?.id])  
  
  return (  
    <PanelList title="Draft Bills">  
      {rows.length === 0 ? (  
        <EmptyState text="No cloud-saved draft bills yet." />  
      ) : (  
        <div className="record-list">  
          {rows.map((row) => (  
            <div  
              className="record-row static"  
              key={row.id}  
            >  
              <div>  
                <strong>  
                  {row.invoice_number ||  
                    'Draft'}  
                </strong>  
  
                <span>  
                  {dateTimeText(  
                    row.created_at,  
                  )}  
                </span>  
              </div>  
  
              <strong>  
                {money(row.grand_total)}  
              </strong>  
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
  const [selected, setSelected] =  
    useState(null)  
  
  const load = async () => {  
    const { data } = await supabase  
      .from('sales')  
      .select('*')  
      .eq('store_id', store.id)  
      .in('status', [  
        'completed',  
        'returned',  
      ])  
      .order('bill_datetime', {  
        ascending: false,  
      })  
      .limit(300)  
  
    setRows(data || [])  
  }  
  
  useEffect(() => {  
    if (store?.id) load()  
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
    <>  
      <PanelList title="Completed Bills">  
        <input  
          placeholder="Search invoice"  
          value={query}  
          onChange={(e) =>  
            setQuery(e.target.value)  
          }  
        />  
  
        <div className="record-list">  
          {filtered.map((row) => (  
            <button  
              className="record-row"  
              key={row.id}  
              onClick={() =>  
                setSelected(row)  
              }  
            >  
              <div>  
                <strong>  
                  {row.invoice_number ||  
                    'Bill'}  
                </strong>  
  
                <span>  
                  {dateTimeText(  
                    row.bill_datetime,  
                  )}  
                </span>  
              </div>  
  
              <div className="record-right">  
                <span>  
                  {row.status}  
                </span>  
  
                <strong>  
                  {money(  
                    row.grand_total,  
                  )}  
                </strong>  
  
                <span>View →</span>  
              </div>  
            </button>  
          ))}  
        </div>  
      </PanelList>  
  
      {selected && (  
        <SaleBillModal  
          store={store}  
          sale={selected}  
          onClose={() =>  
            setSelected(null)  
          }  
          onUpdated={() => {  
            setSelected(null)  
            load()  
          }}  
        />  
      )}  
    </>  
  )  
}  
  
  function printSaleInvoice(details, store) {
  if (!details) return

  // Use an in-page hidden print frame instead of window.open().
  // This avoids popup blockers on iPad/iPhone while still opening the native
  // print sheet, where the user can choose Save as PDF.
  const printFrame = document.createElement('iframe')
  printFrame.style.position = 'fixed'
  printFrame.style.right = '0'
  printFrame.style.bottom = '0'
  printFrame.style.width = '1px'
  printFrame.style.height = '1px'
  printFrame.style.border = '0'
  printFrame.style.opacity = '0.01'
  document.body.appendChild(printFrame)

  const printDocument = printFrame.contentDocument || printFrame.contentWindow?.document
  if (!printDocument || !printFrame.contentWindow) {
    printFrame.remove()
    window.alert('Unable to prepare the invoice for printing.')
    return
  }

  const customer =
    details.customers?.name ||
    'Walk-in Customer'

  const customerPhone =
    details.customers?.phone || ''

  const items = details.sale_items || []
  const payments = details.sale_payments || []

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td>
            ${item.products?.product_name || 'Product'}
            ${
              item.products?.generic_display_name
                ? `<div class="muted">${item.products.generic_display_name}</div>`
                : ''
            }
          </td>
          <td>${item.batches?.batch_number || '—'}</td>
          <td>${item.quantity_entered || 0} ${item.unit_type || ''}</td>
          <td>${money(item.selling_price_per_pack)}</td>
          <td>${item.discount_percent || 0}%</td>
          <td class="right">${money(item.line_total)}</td>
        </tr>
      `,
    )
    .join('')

  const paymentRows = payments
    .map(
      (payment) => `
        <div class="payment-row">
          <span>${paymentLabel(payment.payment_method)}</span>
          <strong>${money(payment.amount)}</strong>
        </div>
      `,
    )
    .join('')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>
          ${details.invoice_number || 'Invoice'}
        </title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, Helvetica, sans-serif;
            color: #111;
            background: #fff;
            font-size: 13px;
          }

          .invoice {
            max-width: 800px;
            margin: 0 auto;
          }

          .header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #111;
            padding-bottom: 16px;
            margin-bottom: 16px;
          }

          .store-name {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 6px;
          }

          .invoice-title {
            text-align: right;
          }

          .invoice-title h1 {
            margin: 0 0 6px;
            font-size: 24px;
          }

          .muted {
            color: #666;
            font-size: 11px;
            margin-top: 3px;
          }

          .section {
            margin-bottom: 18px;
          }

          .section-title {
            font-weight: 700;
            margin-bottom: 7px;
            font-size: 13px;
            text-transform: uppercase;
          }

          .customer-box {
            border: 1px solid #ddd;
            padding: 10px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border-bottom: 1px solid #ddd;
            padding: 8px 6px;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #f5f5f5;
            font-size: 11px;
          }

          .right {
            text-align: right;
          }

          .totals {
            width: 320px;
            margin-left: auto;
            margin-top: 18px;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
          }

          .grand-total {
            border-top: 2px solid #111;
            margin-top: 5px;
            padding-top: 8px;
            font-size: 16px;
            font-weight: 700;
          }

          .payments {
            margin-top: 18px;
            border-top: 1px solid #ddd;
            padding-top: 12px;
          }

          .payment-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
          }

          .footer {
            margin-top: 35px;
            padding-top: 12px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #666;
            font-size: 11px;
          }

          @media print {
            body {
              padding: 0;
            }

            .invoice {
              max-width: none;
            }
          }
        </style>
      </head>

      <body>
        <div class="invoice">

          <div class="header">
            <div>
              <div class="store-name">
                ${store?.name || 'Medical Store'}
              </div>

              ${
                store?.address
                  ? `<div>${store.address}</div>`
                  : ''
              }

              ${
                store?.phone
                  ? `<div>Phone: ${store.phone}</div>`
                  : ''
              }

              ${
                store?.email
                  ? `<div>Email: ${store.email}</div>`
                  : ''
              }

              ${
                store?.gstin
                  ? `<div>GSTIN: ${store.gstin}</div>`
                  : ''
              }

              ${
                store?.drug_license_number
                  ? `<div>Drug License: ${store.drug_license_number}</div>`
                  : ''
              }
            </div>

            <div class="invoice-title">
              <h1>INVOICE</h1>

              <div>
                <strong>
                  ${
                    details.invoice_number ||
                    'Bill'
                  }
                </strong>
              </div>

              <div>
                ${dateTimeText(details.bill_datetime)}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">
              Customer
            </div>

            <div class="customer-box">
              <strong>${customer}</strong>

              ${
                customerPhone
                  ? `<div>Phone: ${customerPhone}</div>`
                  : ''
              }

              ${
                details.customers?.address
                  ? `<div>${details.customers.address}</div>`
                  : ''
              }
            </div>
          </div>

          <div class="section">
            <div class="section-title">
              Items
            </div>

            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Disc.</th>
                  <th class="right">Amount</th>
                </tr>
              </thead>

              <tbody>
                ${itemRows}
              </tbody>
            </table>
          </div>

          <div class="totals">
            <div class="total-row">
              <span>Subtotal</span>
              <strong>
                ${money(details.subtotal)}
              </strong>
            </div>

            <div class="total-row">
              <span>Item discounts</span>
              <strong>
                ${money(details.item_discount_total)}
              </strong>
            </div>

            <div class="total-row">
              <span>Bill discount</span>
              <strong>
                ${money(details.bill_discount_amount)}
              </strong>
            </div>

            <div class="total-row">
              <span>CGST</span>
              <strong>
                ${money(details.cgst_amount)}
              </strong>
            </div>

            <div class="total-row">
              <span>SGST</span>
              <strong>
                ${money(details.sgst_amount)}
              </strong>
            </div>

            <div class="total-row grand-total">
              <span>Total</span>
              <strong>
                ${money(details.grand_total)}
              </strong>
            </div>

            <div class="total-row">
              <span>Paid</span>
              <strong>
                ${money(details.amount_paid)}
              </strong>
            </div>

            <div class="total-row">
              <span>Due</span>
              <strong>
                ${money(details.amount_due)}
              </strong>
            </div>
          </div>

          ${
            paymentRows
              ? `
                <div class="payments">
                  <div class="section-title">
                    Payments
                  </div>

                  ${paymentRows}
                </div>
              `
              : ''
          }

          <div class="footer">
            Thank you for your business.
          </div>

        </div>
      </body>
    </html>
  `)

  printDocument.close()
  printFrame.contentWindow.focus()

  setTimeout(() => {
    printFrame.contentWindow.print()
    setTimeout(() => printFrame.remove(), 1500)
  }, 250)
}
 
  function exportSaleInvoicePdf(details, store) {
  printSaleInvoice(details, store)
}
   
function SaleBillModal({  
  store,  
  sale,  
  onClose,  
  onUpdated,  
}) {  
  const [details, setDetails] =  
    useState(null)  
  const [loading, setLoading] =  
    useState(true)  
  const [editing, setEditing] =  
    useState(false)  
  
  const load = async () => {  
    setLoading(true)  
  
    const { data, error } =  
      await supabase  
        .from('sales')  
        .select(`  
          *,  
          customers (  
            id,  
            name,  
            phone,  
            address  
          ),  
          sale_items (  
            *,  
            products (  
              id,  
              product_name,  
              generic_display_name,  
              manufacturer  
            ),  
            batches (  
              id,  
              batch_number,  
              expiry_date,  
              current_stock_units  
            )  
          ),  
          sale_payments (  
            id,  
            payment_method,  
            amount,  
            payment_reference,  
            notes  
          )  
        `)  
        .eq('id', sale.id)  
        .maybeSingle()  
  
    if (!error) setDetails(data)  
    setLoading(false)  
  }  
  
  useEffect(() => {  
    load()  
  }, [sale.id])  
  
  if (editing && details) {  
    return (  
      <SaleEditModal  
        store={store}  
        sale={details}  
        onClose={() =>  
          setEditing(false)  
        }  
        onSaved={() => {  
          setEditing(false)  
          onUpdated()  
        }}  
      />  
    )  
  }  
  
  return (  
    <Modal  
      title={`Bill ${  
        sale.invoice_number || ''  
      }`}  
      onClose={onClose}  
    >  
      {loading ? (  
        <LoadingInline />  
      ) : !details ? (  
        <EmptyState text="Unable to load this bill." />  
      ) : (  
        <>  
       <div className="history-header">
  <div>
    <strong>
      {details.invoice_number ||
        'Bill'}
    </strong>

    <span>
      {dateTimeText(
        details.bill_datetime,
      )}
    </span>

    <span>
      Customer:{' '}
      {details.customers
        ?.name ||
        'Walk-in Customer'}
    </span>
  </div>

 <div className="button-row">
  <button
    type="button"
    className="primary-button"
    onClick={() =>
      printSaleInvoice(
        details,
        store,
      )
    }
  >
    Print Invoice
  </button>

  <button
    type="button"
    className="secondary-button"
    onClick={() =>
      exportSaleInvoicePdf(
        details,
        store,
      )
    }
  >
    Export PDF
  </button>

  {details.status ===
    'completed' && (
    <button
      type="button"
      className="secondary-button"
      onClick={() =>
        setEditing(true)
      }
    >
      Edit Bill
    </button>
  )}
</div>
</div> 
  
          <h3>Products</h3>  
  
          <div className="record-list">  
            {(details.sale_items ||  
              []).map((item) => (  
                <div  
                  className="record-row static"  
                  key={item.id}  
                >  
                  <div>  
                    <strong>  
                      {item.products  
                        ?.product_name ||  
                        'Product'}  
                    </strong>  
  
                    <span>  
                      Batch:{' '}  
                      {item.batches  
                        ?.batch_number ||  
                        '—'}  
                    </span>  
                  </div>  
  
                  <div className="record-right">  
                    <span>  
                      {item.quantity_entered}{' '}  
                      {item.unit_type}  
                    </span>  
  
                    <span>  
                      Disc:{' '}  
                      {item.discount_percent ||  
                        0}  
                      %  
                    </span>  
  
                    <strong>  
                      {money(  
                        item.line_total,  
                      )}  
                    </strong>  
                  </div>  
                </div>  
              ))}  
          </div>  
  
          <h3>Payments</h3>  
  
          <div className="record-list">  
            {(details.sale_payments ||  
              []).map((payment) => (  
                <div  
                  className="record-row static"  
                  key={payment.id}  
                >  
                  <span>  
                    {paymentLabel(  
                      payment.payment_method,  
                    )}  
                  </span>  
  
                  <strong>  
                    {money(  
                      payment.amount,  
                    )}  
                  </strong>  
                </div>  
              ))}  
          </div>  
  
          <div className="totals">  
            <div>  
              <span>Subtotal</span>  
              <strong>  
                {money(  
                  details.subtotal,  
                )}  
              </strong>  
            </div>  
  
            <div>  
              <span>Item discounts</span>  
              <strong>  
                {money(  
                  details.item_discount_total,  
                )}  
              </strong>  
            </div>  
  
            <div>  
              <span>Bill discount</span>  
              <strong>  
                {money(  
                  details.bill_discount_amount,  
                )}  
              </strong>  
            </div>  
  
            <div>  
              <span>CGST</span>  
              <strong>  
                {money(  
                  details.cgst_amount,  
                )}  
              </strong>  
            </div>  
  
            <div>  
              <span>SGST</span>  
              <strong>  
                {money(  
                  details.sgst_amount,  
                )}  
              </strong>  
            </div>  
  
            <div className="grand-total">  
              <span>Total</span>  
              <strong>  
                {money(  
                  details.grand_total,  
                )}  
              </strong>  
            </div>  
  
            <div>  
              <span>Paid</span>  
              <strong>  
                {money(  
                  details.amount_paid,  
                )}  
              </strong>  
            </div>  
  
            <div>  
              <span>Due</span>  
              <strong>  
                {money(  
                  details.amount_due,  
                )}  
              </strong>  
            </div>  
          </div>  
        </>  
      )}  
    </Modal>  
  )  
}  
  
/*  
 * Full sale editing deliberately goes through the backend  
 * transaction RPC. It must not directly modify sales,  
 * sale_items, batches, stock_movements, payments or credit  
 * transactions from the browser.  
 *  
 * Expected backend RPC:  
 *  
 * pharmdesk_edit_sale(  
 *   p_store_id uuid,  
 *   p_sale_id uuid,  
 *   p_customer_id uuid,  
 *   p_bill_datetime timestamptz,  
 *   p_bill_discount_amount numeric,  
 *   p_notes text,  
 *   p_items jsonb,  
 *   p_payments jsonb  
 * )  
 */  
function SaleEditModal({  
  store,  
  sale,  
  onClose,  
  onSaved,  
}) {  
  const [customerId, setCustomerId] =  
    useState(  
      sale.customer_id || '',  
    )  
  
  const [billDate, setBillDate] =  
    useState(  
      sale.bill_datetime
        ? localDateFromStoredTimestamp(
            sale.bill_datetime,
          )
        : todayISO(),  
    )  
  
  const [billDiscount, setBillDiscount] =  
    useState(  
      sale.bill_discount_amount || 0,  
    )  
  
  const [notes, setNotes] =  
    useState(sale.notes || '')  
  
  const [items, setItems] =  
    useState([])  
  
  const [payments, setPayments] =  
    useState(  
      sale.sale_payments || [],  
    )  
  
  const [customers, setCustomers] =  
    useState([])  
  
  const [busy, setBusy] =  
    useState(false)  
  
  const [error, setError] =  
    useState('')  
  
  useEffect(() => {  
    loadCustomers()  
    loadItems()  
  }, [store?.id, sale.id])  
  
  const loadCustomers = async () => {  
    const { data } = await supabase  
      .from('customers')  
      .select('*')  
      .eq('store_id', store.id)  
      .eq('is_active', true)  
      .order('name')  
  
    setCustomers(data || [])  
  }  
  
  const loadItems = async () => {  
    const source =  
      sale.sale_items || []  
  
    const next =  
      await Promise.all(  
        source.map(async (item) => {  
          const { data: batches } =  
            await supabase  
              .from('batches')  
              .select('*')  
              .eq(  
                'store_id',  
                store.id,  
              )  
              .eq(  
                'product_id',  
                item.product_id,  
              )  
              .eq(  
                'is_active',  
                true,  
              )  
              .gt(  
                'current_stock_units',  
                0,  
              )  
              .order(  
                'expiry_date',  
                {  
                  ascending: true,  
                },  
              )  
  
          const existingBatch =  
            (batches || []).find(  
              (b) =>  
                b.id ===  
                item.batch_id,  
            )  
  
          return {  
            ...item,  
            batches: [  
              ...(existingBatch  
                ? [existingBatch]  
                : []),  
              ...(batches || []).filter(  
                (b) =>  
                  b.id !==  
                  item.batch_id,  
              ),  
            ],  
            batch:  
              existingBatch ||  
              item.batches ||  
              null,  
          }  
        }),  
      )  
  
    setItems(next)  
  }  
  
  const updateItem = (  
    id,  
    patch,  
  ) => {  
    setItems((current) =>  
      current.map((item) =>  
        item.id === id  
          ? {  
              ...item,  
              ...patch,  
            }  
          : item,  
      ),  
    )  
  }  
  
  const removeItem = (id) => {  
    setItems((current) =>  
      current.filter(  
        (x) => x.id !== id,  
      ),  
    )  
  }  
  
  const save = async (e) => {  
    e.preventDefault()  
    setBusy(true)  
    setError('')  
  
    try {  
      const payloadItems =  
        items.map((item) => ({  
          sale_item_id:  
            item.id,  
          product_id:  
            item.product_id,  
          batch_id:  
            item.batch?.id ||  
            item.batch_id ||  
            null,  
          sale_unit_type:  
            item.unit_type,  
          quantity_entered:  
            safeNumber(  
              item.quantity_entered,  
            ),  
          units_per_pack:  
            safeNumber(  
              item.units_per_pack,  
            ) || 1,  
          mrp_per_pack:  
            safeNumber(  
              item.mrp_per_pack,  
            ),  
          selling_price_per_pack:  
            safeNumber(  
              item.selling_price_per_pack,  
            ),  
          discount_percent:  
            safeNumber(  
              item.discount_percent,  
            ),  
          gst_rate:  
            safeNumber(  
              item.gst_rate,  
            ),  
        }))  
  
      const paymentRows =  
        payments  
          .filter(  
            (p) =>  
              safeNumber(  
                p.amount,  
              ) > 0,  
          )  
          .map((p) => ({  
            payment_method:  
              p.payment_method,  
            amount:  
              safeNumber(  
                p.amount,  
              ),  
            payment_reference:  
              p.payment_reference ||  
              null,  
            notes:  
              p.notes || null,  
          }))  
  
      const { error: rpcError } =  
        await supabase.rpc(  
          'pharmdesk_edit_sale',  
          {  
            p_store_id: store.id,  
            p_sale_id: sale.id,  
            p_customer_id:  
              customerId || null,  
            p_bill_datetime: localDateTimeForDb(billDate),  
            p_bill_discount_amount:  
              safeNumber(  
                billDiscount,  
              ),  
            p_notes:  
              notes.trim() || null,  
            p_items: payloadItems,  
            p_payments:  
              paymentRows,  
          },  
        )  
  
      if (rpcError) {  
        throw rpcError  
      }  
  
      onSaved()  
    } catch (err) {  
      setError(  
        err.message ||  
          'Unable to edit bill.',  
      )  
    } finally {  
      setBusy(false)  
    }  
  }  
  
  return (  
    <Modal  
      title={`Edit ${  
        sale.invoice_number ||  
        'Bill'  
      }`}  
      onClose={onClose}  
    >  
      <form onSubmit={save}>  
        <div className="form-grid">  
          <label>  
            Customer  
            <select  
              value={customerId}  
              onChange={(e) =>  
                setCustomerId(  
                  e.target.value,  
                )  
              }  
            >  
              <option value="">  
                Walk-in Customer  
              </option>  
  
              {customers.map(  
                (customer) => (  
                  <option  
                    key={customer.id}  
                    value={  
                      customer.id  
                    }  
                  >  
                    {customer.name} •{' '}  
                    {customer.phone ||  
                      'No phone'}  
                  </option>  
                ),  
              )}  
            </select>  
          </label>  
  
          <label>  
            Bill date  
            <input  
              type="date"  
              value={billDate}  
              onChange={(e) =>  
                setBillDate(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            Bill discount  
            <input  
              type="number"  
              min="0"  
              step="0.01"  
              value={  
                billDiscount  
              }  
              onChange={(e) =>  
                setBillDiscount(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
        </div>  
  
        <label>  
          Notes  
          <textarea  
            value={notes}  
            onChange={(e) =>  
              setNotes(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <h3>Items</h3>  
  
        {items.map((item) => (  
          <div  
            className="transaction-item"  
            key={item.id}  
          >  
            <div className="item-title">  
              <strong>  
                {item.products  
                  ?.product_name ||  
                  'Product'}  
              </strong>  
  
              <span>  
                Batch:{' '}  
                {item.batch  
                  ?.batch_number ||  
                  item.batches  
                    ?.batch_number ||  
                  '—'}  
              </span>  
            </div>  
  
            <div className="item-grid">  
              <label>  
                Batch  
                <select  
                  value={  
                    item.batch?.id ||  
                    item.batch_id ||  
                    ''  
                  }  
                  onChange={(e) => {  
                    const batch =  
                      item.batches?.find(  
                        (b) =>  
                          b.id ===  
                          e.target.value,  
                      )  
  
                    updateItem(  
                      item.id,  
                      {  
                        batch,  
                        batch_id:  
                          batch?.id ||  
                          null,  
                        units_per_pack:  
                          batch?.units_per_pack ||  
                          item.units_per_pack,  
                        mrp_per_pack:  
                          batch?.mrp_per_pack ||  
                          item.mrp_per_pack,  
                      },  
                    )  
                  }}  
                >  
                  <option value="">  
                    Select batch  
                  </option>  
  
                  {item.batches?.map(  
                    (batch) => (  
                      <option  
                        key={batch.id}  
                        value={batch.id}  
                      >  
                        {batch.batch_number} •  
                        Exp{' '}  
                        {dateText(  
                          batch.expiry_date,  
                        )}{' '}  
                        • Stock{' '}  
                        {  
                          batch.current_stock_units  
                        }  
                      </option>  
                    ),  
                  )}  
                </select>  
              </label>  
  
              <label>  
                Sale type  
                <select  
                  value={  
                    item.unit_type  
                  }  
                  onChange={(e) =>  
                    updateItem(  
                      item.id,  
                      {  
                        unit_type:  
                          e.target.value,  
                      },  
                    )  
                  }  
                >  
                  <option value="pack">  
                    Strip / Pack  
                  </option>  
                  <option value="unit">  
                    Tablet / Unit  
                  </option>  
                </select>  
              </label>  
  
              <label>  
                Quantity  
                <input  
                  type="number"  
                  min="0.01"  
                  step="any"  
                  value={  
                    item.quantity_entered  
                  }  
                  onChange={(e) =>  
                    updateItem(  
                      item.id,  
                      {  
                        quantity_entered:  
                          e.target.value,  
                      },  
                    )  
                  }  
                />  
              </label>  
  
              <label>  
                Selling price  
                <input  
                  type="number"  
                  min="0"  
                  step="0.01"  
                  value={  
                    item.selling_price_per_pack  
                  }  
                  onChange={(e) =>  
                    updateItem(  
                      item.id,  
                      {  
                        selling_price_per_pack:  
                          e.target.value,  
                      },  
                    )  
                  }  
                />  
              </label>  
  
              <label>  
                Discount %  
                <input  
                  type="number"  
                  min="0"  
                  max="100"  
                  value={  
                    item.discount_percent  
                  }  
                  onChange={(e) =>  
                    updateItem(  
                      item.id,  
                      {  
                        discount_percent:  
                          e.target.value,  
                      },  
                    )  
                  }  
                />  
              </label>  
  
              <label>  
                GST %  
                <input  
                  type="number"  
                  min="0"  
                  max="100"  
                  value={  
                    item.gst_rate  
                  }  
                  onChange={(e) =>  
                    updateItem(  
                      item.id,  
                      {  
                        gst_rate:  
                          e.target.value,  
                      },  
                    )  
                  }  
                />  
              </label>  
            </div>  
  
            <button  
              type="button"  
              className="danger-button"  
              onClick={() =>  
                removeItem(  
                  item.id,  
                )  
              }  
            >  
              Remove item  
            </button>  
          </div>  
        ))}  
  
        <h3>Payments</h3>  
  
        {payments.map(  
          (payment, index) => (  
            <div  
              className="payment-row"  
              key={  
                payment.id ||  
                index  
              }  
            >  
              <select  
                value={  
                  payment.payment_method  
                }  
                onChange={(e) => {  
                  const next = [  
                    ...payments,  
                  ]  
  
                  next[index] = {  
                    ...next[index],  
                    payment_method:  
                      e.target.value,  
                  }  
  
                  setPayments(next)  
                }}  
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
                step="0.01"  
                value={  
                  payment.amount  
                }  
                onChange={(e) => {  
                  const next = [  
                    ...payments,  
                  ]  
  
                  next[index] = {  
                    ...next[index],  
                    amount:  
                      e.target.value,  
                  }  
  
                  setPayments(next)  
                }}  
              />  
  
              <button  
                type="button"  
                className="danger-button"  
                onClick={() =>  
                  setPayments(  
                    payments.filter(  
                      (_, i) =>  
                        i !==  
                        index,  
                    ),  
                  )  
                }  
              >  
                ×  
              </button>  
            </div>  
          ),  
        )}  
  
        <button  
          type="button"  
          className="secondary-button"  
          onClick={() =>  
            setPayments([  
              ...payments,  
              {  
                payment_method:  
                  'cash',  
                amount: 0,  
              },  
            ])  
          }  
        >  
          + Payment  
        </button>  
  
        {error && (  
          <div className="error-box">  
            {error}  
          </div>  
        )}  
  
        <div className="info-box">  
          Bill editing is processed as one backend  
          transaction so stock, payments, credit,  
          GST and audit records stay synchronized.  
        </div>  
  
        <ModalActions  
          onClose={onClose}  
          busy={busy}  
          label="Save Bill Changes"  
        />  
      </form>  
    </Modal>  
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
      .order('created_at', {  
        ascending: false,  
      })  
      .limit(100)  
      .then(({ data }) =>  
        setRows(data || []),  
      )  
  }, [store?.id])  
  
  return (  
    <PanelList title="Sales Returns">  
      {rows.length === 0 ? (  
        <EmptyState text="No sales returns recorded." />  
      ) : (  
        <div className="record-list">  
          {rows.map((row) => (  
            <div  
              className="record-row static"  
              key={row.id}  
            >  
              <div>  
                <strong>  
                  {row.id.slice(0, 8)}  
                </strong>  
  
                <span>  
                  {dateTimeText(  
                    row.created_at,  
                  )}  
                </span>  
              </div>  
  
              <strong>  
                {money(  
                  row.refund_amount,  
                )}  
              </strong>  
            </div>  
          ))}  
        </div>  
      )}  
    </PanelList>  
  )  
}  
  
function CustomerCredit({ store }) {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settlementCustomer, setSettlementCustomer] = useState(null)

  const load = async () => {
    if (!store?.id) return
    setLoading(true)
    setError('')
    try {
      const { data, error: reportError } = await supabase.rpc(
        'pharmdesk_customer_credit_report',
        { p_store_id: store.id },
      )
      if (reportError) throw reportError
      setRows((data || []).filter((row) => safeNumber(row.outstanding_credit) > 0.009))
    } catch (err) {
      setError(err.message || 'Could not load customer credit.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [store?.id])

  const filtered = rows.filter((row) => matchesSearch(query, row.name, row.phone))

  return (
    <PanelList title="Customer Credit">
      <div className="search-row">
        <input
          placeholder="Search customer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <EmptyState text="Loading customer credit..." />
      ) : filtered.length === 0 ? (
        <EmptyState text="No customers with outstanding credit." />
      ) : (
        <div className="record-list">
          {filtered.map((row) => (
            <div
              className="record-row static"
              key={row.customer_id}
              style={{
                background: '#fff1f2',
                borderLeft: '5px solid #ef4444',
              }}
            >
              <div>
                <strong style={{ color: '#b91c1c', fontSize: 16 }}>
                  {row.name || 'Walk-in Customer'}
                </strong>
                <span>{row.phone || 'No phone'}</span>
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>Outstanding balance</span>
                {row.last_bill_at && <span>Last bill: {dateTimeText(row.last_bill_at)}</span>}
              </div>
              <div className="record-right">
                <strong style={{ color: '#b91c1c' }}>Outstanding: {money(row.outstanding_credit)}</strong>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    setSettlementCustomer({
                      id: row.customer_id,
                      name: row.name,
                      phone: row.phone,
                      outstanding_credit: safeNumber(row.outstanding_credit),
                    })
                  }
                >
                  Settle Credit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {settlementCustomer && (
        <CustomerSettlementModal
          store={store}
          customer={settlementCustomer}
          onClose={() => setSettlementCustomer(null)}
          onSettled={async () => {
            await load()
          }}
        />
      )}
    </PanelList>
  )
}

function CustomerSettlementModal({
  store,
  customer,
  onClose,
  onSettled,
}) {
  const outstanding = safeNumber(customer?.outstanding_credit)
  const [amount, setAmount] = useState(String(outstanding || ''))
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [receiptEditing, setReceiptEditing] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const paid = safeNumber(amount)
      if (paid <= 0) throw new Error('Enter a payment amount greater than zero.')
      if (paid > outstanding + 0.01) throw new Error('Payment cannot exceed the outstanding credit.')

      const { data: transactionId, error: rpcError } = await supabase.rpc(
        'pharmdesk_record_customer_credit_payment',
        {
          p_store_id: store.id,
          p_customer_id: customer.id,
          p_amount: paid,
          p_notes: `Payment mode: ${paymentLabel(paymentMethod)}${notes.trim() ? `\n${notes.trim()}` : ''}`,
        },
      )
      if (rpcError) throw rpcError

      const remaining = Math.max(0, outstanding - paid)
      setReceiptEditing(false)
      setReceipt({
        id: transactionId,
        customerName: customer.name || 'Walk-in Customer',
        phone: customer.phone || '',
        amount: paid,
        remaining,
        paymentMethod,
        date: new Date().toISOString(),
        notes: notes.trim(),
      })
      await onSettled()
    } catch (err) {
      setError(err.message || 'Could not record the payment.')
    } finally {
      setBusy(false)
    }
  }

  const printReceipt = () => {
    if (!receipt) return
    const printWindow = window.open('', '_blank', 'width=480,height=720')
    if (!printWindow) {
      setError('The receipt window was blocked. Please allow pop-ups and try again.')
      return
    }
    const safe = (value) =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Customer Credit Payment Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; max-width: 420px; margin: auto; }
            h1 { font-size: 20px; margin-bottom: 18px; }
            .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; }
            .total { border-top: 1px solid #ccc; margin-top: 10px; padding-top: 12px; font-size: 18px; font-weight: 700; }
            .muted { color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Customer Credit Payment Receipt</h1>
          <div class="row"><span>Receipt</span><strong>${safe(receipt.id)}</strong></div>
          <div class="row"><span>Customer</span><strong>${safe(receipt.customerName)}</strong></div>
          <div class="row"><span>Phone</span><span>${safe(receipt.phone || '—')}</span></div>
          <div class="row"><span>Date</span><span>${safe(dateTimeText(receipt.date))}</span></div>
          <div class="row"><span>Payment mode</span><strong>${safe(paymentLabel(receipt.paymentMethod))}</strong></div>
          <div class="row total"><span>Amount paid</span><span>${safe(money(receipt.amount))}</span></div>
          <div class="row"><span>Remaining credit</span><strong>${safe(money(receipt.remaining))}</strong></div>
          ${receipt.notes ? `<p><strong>Notes:</strong> ${safe(receipt.notes)}</p>` : ''}
          <p class="muted">This receipt corresponds to the stored customer credit payment transaction.</p>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 250)
  }

  if (receipt) {
    return (
      <Modal title="Payment Receipt" onClose={onClose}>
        <div className="info-box">Payment recorded successfully. The credit ledger has been updated.</div>
        <div className="button-row" style={{ marginBottom: '12px' }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReceiptEditing((current) => !current)}
          >
            {receiptEditing ? 'Done editing' : 'Edit for printing'}
          </button>
        </div>
        {receiptEditing && (
          <div className="info-box">
            These edits affect only the print copy. The stored payment transaction is unchanged.
          </div>
        )}
        <div className="item-grid">
          <label>
            Customer
            <input value={receipt.customerName} readOnly />
          </label>
          <label>
            Receipt
            <input value={receipt.id} readOnly />
          </label>
          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={receipt.amount}
              readOnly={!receiptEditing}
              onChange={(e) => {
                const amount = safeNumber(e.target.value)
                setReceipt((current) => ({ ...current, amount, remaining: Math.max(0, outstanding - amount) }))
              }}
            />
          </label>
          <label>
            Payment mode
            <select
              value={receipt.paymentMethod}
              disabled={!receiptEditing}
              onChange={(e) => setReceipt((current) => ({ ...current, paymentMethod: e.target.value }))}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea
            value={receipt.notes || ''}
            readOnly={!receiptEditing}
            onChange={(e) => setReceipt((current) => ({ ...current, notes: e.target.value }))}
            rows={3}
          />
        </label>
        <div className="info-box">Remaining credit for print copy: {money(receipt.remaining)}</div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={printReceipt}>Print Receipt</button>
          <button type="button" className="primary-button" onClick={onClose}>Close</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Settle Account — ${customer.name || 'Customer'}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="info-box">Outstanding credit: <strong>{money(outstanding)}</strong></div>
        <label>
          Amount paid
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          Mode of payment
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            required
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional payment note"
          />
        </label>
        {safeNumber(amount) >= outstanding - 0.01 && outstanding > 0 && (
          <div className="info-box">
            This payment will fully settle the account. The customer will disappear from Customer Credit after the list refreshes.
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        <ModalActions onClose={onClose} busy={busy} label="Record Payment" />
      </form>
    </Modal>
  )
}
/* =========================================================  
   PURCHASES  
========================================================= */  
  
function PurchasesModule({ store }) {  
  const [tab, setTab] =  
    useState('New Purchase')  
  
  return (  
    <div>  
      <ModuleHeader  
        title="Purchases"  
        subtitle="Supplier invoices, stock intake and purchase planning"  
      />  
  
      <TabBar  
        tabs={PURCHASE_TABS}  
        active={tab}  
        onChange={setTab}  
      />  
  
      {tab === 'New Purchase' && (  
        <NewPurchase store={store} />  
      )}  
  
      {tab === 'Supplier Invoices' && (  
        <SupplierInvoices  
          store={store}  
        />  
      )}  
  
      {tab === 'Purchase Parties' && (  
        <SupplierDirectory  
          store={store}  
        />  
      )}  
  
      {tab === 'Pending Payments' && (  
        <PendingSupplierPayments  
          store={store}  
        />  
      )}  
  
    {tab === 'Supplier Orders' && (
  <PurchaseOrders store={store} />
)}

{tab === 'Catalogue & Orders' && (
  <SupplierPurchaseCatalogue
    store={store}
  />
)}

{tab === 'AI Recommendations' && (
  <AIRecommendations
    store={store}
  />
)}  
    </div>  
  )  
}  
  
function NewPurchase({ store }) {  
  const [suppliers, setSuppliers] =  
    useState([])  
  const [products, setProducts] =  
    useState([])  
  const [supplierQuery, setSupplierQuery] =  
    useState('')  
  const [productQuery, setProductQuery] =  
    useState('')  
  const [selectedSupplier, setSelectedSupplier] =  
    useState(null)  
  const [invoiceNumber, setInvoiceNumber] =  
    useState('')  
  const [invoiceDate, setInvoiceDate] =  
    useState(todayISO())  
  const [items, setItems] =  
    useState([emptyPurchaseItem()])  
  const [supplierModal, setSupplierModal] =  
    useState(false)  
  const [productModal, setProductModal] =  
    useState(null)  
  const [message, setMessage] =  
    useState('')  
  const [busy, setBusy] =  
    useState(false)  
  const [invoiceImportOpen, setInvoiceImportOpen] =
    useState(false)
  const [invoiceCharges, setInvoiceCharges] =
    useState({
      discount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      otherCharges: 0,
      notes: '',
    })
  
  useEffect(() => {  
    if (!store?.id) return  
  
    loadSuppliers()  
    loadProducts()  
  }, [store?.id])  
  
  const loadSuppliers = async () => {  
    const { data } =  
      await supabase  
        .from('suppliers')  
        .select('*')  
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
  
    const nextSuppliers = data || []
    setSuppliers(nextSuppliers)
    return nextSuppliers
  }  
  
  const loadProducts = async () => {  
    const { data } =  
      await supabase  
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
        .eq(  
          'store_id',  
          store.id,  
        )  
        .eq(  
          'is_active',  
          true,  
        )  
  
    setProducts(  
      (data || [])  
        .filter(  
          (x) =>  
            x.products  
              ?.is_active !== false,  
        )  
        .map((x) => ({  
          ...x.products,  
          default_selling_price:  
            x.default_selling_price,  
          default_discount_percent:  
            x.default_discount_percent,  
        })),  
    )  
  }  
  
  const supplierResults =  
    suppliers  
      .filter((x) =>  
        matchesSearch(  
          supplierQuery,  
          x.supplier_name,  
          x.phone,  
          x.email,  
          x.gstin,  
          supplierLicense(x),  
        ),  
      )  
      .slice(0, 10)  
  
  const productResults =  
    products  
      .map((p) => ({  
        p,  
        score: fuzzyScore(  
          productQuery,  
          `${p.product_name} ${  
            p.generic_display_name ||  
            ''  
          } ${  
            p.manufacturer || ''  
          }`,  
        ),  
      }))  
      .filter(  
        (x) =>  
          !productQuery ||  
          x.score > 0,  
      )  
      .sort(  
        (a, b) =>  
          b.score - a.score,  
      )  
      .slice(0, 12)  
      .map((x) => x.p)  
  
  const chooseProduct = async (  
    product,  
  ) => {  
    setProductQuery('')  

    const { data: existingBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', product.id)
      .order('expiry_date', { ascending: true })
      .order('created_at', { ascending: false })

    const batches = existingBatches || []
    const defaultBatch = batches[0] || null

    setItems((current) => {  
      const item = {  
        ...emptyPurchaseItem(),  
        product,  
        batches,
        gstRate: safeNumber(product.gst_rate),
        unitsPerPack: safeNumber(defaultBatch?.units_per_pack) || safeNumber(product.pack_quantity) || 1,
      }  
  
      if (  
        current.length ===  
          1 &&  
        !current[0].product  
      ) {  
        return [item]  
      }  
  
      return [  
        ...current,  
        item,  
      ]  
    })  
  }  
  
  const updateItem = (  
    id,  
    patch,  
  ) => {  
    setItems((current) =>  
      current.map((x) =>  
        x.id === id  
          ? {  
              ...x,  
              ...patch,  
            }  
          : x,  
      ),  
    )  
  }  
  
  const removeItem = (  
    id,  
  ) => {  
    setItems((current) => {  
      const next =  
        current.filter(  
          (x) => x.id !== id,  
        )  
  
      return next.length  
        ? next  
        : [  
            emptyPurchaseItem(),  
          ]  
    })  
  }  
  
  const subtotal = sum(  
    items.map(  
      (item) =>  
        safeNumber(  
          item.paidPacks,  
        ) *  
        safeNumber(  
          item.purchaseRatePerPack,  
        ),  
    ),  
  )  
  
  const completePurchase =  
    async (e) => {  
      e.preventDefault()  
      setBusy(true)  
      setMessage('')  
  
      try {  
        if (!selectedSupplier) {  
          throw new Error(  
            'Select a supplier.',  
          )  
        }  
  
        if (!invoiceNumber.trim()) {  
          throw new Error(  
            'Invoice number is required.',  
          )  
        }  
  
        const validItems =  
          items.filter(  
            (x) => x.product,  
          )  
  
        if (!validItems.length) {  
          throw new Error(  
            'Add at least one product.',  
          )  
        }  
  
        const payload =  
          validItems.map(  
            (item) => ({  
              product_id:  
                item.product.id,  
              batch_number:  
                item.batchNumber,  
              expiry_date:  
                item.expiryDate,  
              paid_packs:  
                safeNumber(  
                  item.paidPacks,  
                ),  
              free_packs:  
                safeNumber(  
                  item.freePacks,  
                ),  
              loose_units:  
                safeNumber(  
                  item.looseUnits,  
                ),  
              purchase_rate_per_pack:  
                safeNumber(  
                  item.purchaseRatePerPack,  
                ),  
              mrp_per_pack:  
                safeNumber(  
                  item.mrpPerPack,  
                ),  
              supplier_discount_percent:  
                safeNumber(  
                  item.supplierDiscountPercent,  
                ),  
              gst_rate:  
                safeNumber(  
                  item.gstRate,  
                ),  
              units_per_pack:  
                safeNumber(  
                  item.unitsPerPack,  
                ) || 1,  
            }),  
          )  
  
        const { data, error } =  
          await supabase.rpc(  
            'pharmdesk_complete_purchase',  
            {  
              p_store_id:  
                store.id,  
              p_supplier_id:  
                selectedSupplier.id,  
              p_invoice_number:  
                invoiceNumber.trim(),  
              p_invoice_date:  
                invoiceDate,  
              p_items: payload,  
              p_discount_amount:
                safeNumber(invoiceCharges.discount),
              p_cgst_amount:
                safeNumber(invoiceCharges.cgst),
              p_sgst_amount:
                safeNumber(invoiceCharges.sgst),
              p_igst_amount:
                safeNumber(invoiceCharges.igst),
              p_other_charges:
                safeNumber(invoiceCharges.otherCharges),
              p_notes:
                invoiceCharges.notes || null,
            },  
          )  
  
        if (error) throw error  
  
        setMessage(  
          `Purchase completed successfully: ${data}`,  
        )  
  
        setInvoiceNumber('')  
        setInvoiceDate(todayISO())
        setItems([  
          emptyPurchaseItem(),  
        ])  
        setInvoiceCharges({
          discount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          otherCharges: 0,
          notes: '',
        })
      } catch (error) {  
        setMessage(  
          error.message ||  
            'Unable to complete purchase.',  
        )  
      } finally {  
        setBusy(false)  
      }  
    }  
  
  return (  
    <form  
      onSubmit={  
        completePurchase  
      }  
    >  
<div className="two-column">  
        <div>  
          <PanelList title="AI Invoice Import">  
            <p className="muted">  
              Upload a supplier invoice photo or PDF. PharmDesk will extract the invoice into this purchase draft for your review. Nothing is added to stock until you complete the purchase.  
            </p>  
            <button  
              type="button"  
              className="secondary-button"  
              onClick={() => setInvoiceImportOpen(true)}  
            >  
              Upload Invoice Photo / PDF  
            </button>  
          </PanelList>  
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
                  setSelectedSupplier(  
                    null,  
                  )  
                  setSupplierQuery(  
                    e.target.value,  
                  )  
                }}  
              />  
  
              <button  
                type="button"  
                className="secondary-button"  
                onClick={() =>  
                  setSupplierModal(  
                    true,  
                  )  
                }  
              >  
                + Add Purchase Party  
              </button>  
            </div>  
  
            {!selectedSupplier &&  
              supplierQuery && (  
                <div className="suggestion-list">  
                  {supplierResults.map(  
                    (supplier) => (  
                      <button  
                        type="button"  
                        className="suggestion"  
                        key={  
                          supplier.id  
                        }  
                        onClick={() => {  
                          setSelectedSupplier(  
                            supplier,  
                          )  
                          setSupplierQuery(  
                            '',  
                          )  
                        }}  
                      >  
                        <strong>  
                          {  
                            supplier.supplier_name  
                          }  
                        </strong>  
  
                        <span>  
                          {supplier.phone ||  
                            ''}  
                        </span>  
                      </button>  
                    ),  
                  )}  
                </div>  
              )}  
  
            {selectedSupplier && (  
              <div className="selected-record">  
                <strong>  
                  {  
                    selectedSupplier.supplier_name  
                  }  
                </strong>  
  
                <span>  
                  {selectedSupplier.phone ||  
                    'No phone'}  
                </span>  
              </div>  
            )}  
          </PanelList>  
  
          <PanelList title="Products">  
            <div className="search-row">  
              <input  
                value={productQuery}  
                placeholder="Search product"  
                onChange={(e) =>  
                  setProductQuery(  
                    e.target.value,  
                  )  
                }  
              />  
  
              <button  
                type="button"  
                className="secondary-button"  
                onClick={() =>  
                  setProductModal({})  
                }  
              >  
                + Add New Product  
              </button>  
            </div>  
  
            {productQuery && (  
              <div className="suggestion-list">  
                {productResults.map(  
                  (product) => (  
                    <button  
                      type="button"  
                      className="suggestion"  
                      key={  
                        product.id  
                      }  
                      onClick={() =>  
                        chooseProduct(  
                          product,  
                        )  
                      }  
                    >  
                      <strong>  
                        {  
                          product.product_name  
                        }  
                      </strong>  
  
                      <span>  
                        {product.generic_display_name ||  
                          product.manufacturer ||  
                          ''}  
                      </span>  
                    </button>  
                  ),  
                )}  
              </div>  
            )}  
          </PanelList>  
  
          <PanelList title="Purchase Items">  
            {items.map(  
              (item) => (  
                <PurchaseItemRow  
                  key={item.id}  
                  item={item}  
                  onChange={(  
                    patch,  
                  ) =>  
                    updateItem(  
                      item.id,  
                      patch,  
                    )  
                  }  
                  onRemove={() =>  
                    removeItem(  
                      item.id,  
                    )  
                  }  
                />  
              ),  
            )}  
          </PanelList>  
        </div>  
  
        <div>  
          <PanelList title="Invoice">  
            <label>  
              Invoice number  
              <input  
                value={  
                  invoiceNumber  
                }  
                onChange={(e) =>  
                  setInvoiceNumber(  
                    e.target.value,  
                  )  
                }  
                required  
              />  
            </label>  
  
            <label>  
              Invoice date  
              <input  
                type="date"  
                value={  
                  invoiceDate  
                }  
                onChange={(e) =>  
                  setInvoiceDate(  
                    e.target.value,  
                  )  
                }  
              />  
            </label>  
  
            <div className="totals">  
              <div>  
                <span>Subtotal</span>  
                <strong>{money(subtotal)}</strong>  
              </div>  
              {safeNumber(invoiceCharges.discount) > 0 && (  
                <div>  
                  <span>Invoice discount</span>  
                  <strong>−{money(invoiceCharges.discount)}</strong>  
                </div>  
              )}  
              {(safeNumber(invoiceCharges.cgst) + safeNumber(invoiceCharges.sgst) + safeNumber(invoiceCharges.igst)) > 0 && (  
                <div>  
                  <span>GST</span>  
                  <strong>{money(  
                    safeNumber(invoiceCharges.cgst) + safeNumber(invoiceCharges.sgst) + safeNumber(invoiceCharges.igst),  
                  )}</strong>  
                </div>  
              )}  
              {safeNumber(invoiceCharges.otherCharges) > 0 && (  
                <div>  
                  <span>Other charges</span>  
                  <strong>{money(invoiceCharges.otherCharges)}</strong>  
                </div>  
              )}  
              <div className="grand-total">  
                <span>Invoice total</span>  
                <strong>{money(  
                  subtotal - safeNumber(invoiceCharges.discount) + safeNumber(invoiceCharges.cgst) + safeNumber(invoiceCharges.sgst) + safeNumber(invoiceCharges.igst) + safeNumber(invoiceCharges.otherCharges),  
                )}</strong>  
              </div>  
            </div>  
            {invoiceCharges.notes && (  
              <div className="muted">  
                AI invoice notes: {invoiceCharges.notes}  
              </div>  
            )}  
          </PanelList>  
  
          {message && (  
            <div className="message-box">  
              {message}  
            </div>  
          )}  
  
          <button  
            className="primary-button large"  
            type="submit"  
            disabled={busy}  
          >  
            {busy  
              ? 'Completing purchase…'  
              : `Complete Purchase • ${money(  
                  subtotal,  
                )}`}  
          </button>  
        </div>  
      </div>  
  
      {invoiceImportOpen && (  
        <InvoiceImportModal  
          store={store}  
          suppliers={suppliers}  
          products={products}  
          onClose={() => setInvoiceImportOpen(false)}  
          onApply={(result) => {  
            if (result.supplier) {  
              setSelectedSupplier(result.supplier)  
              setSupplierQuery('')  
            }  
            if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber)  
            if (result.invoiceDate) setInvoiceDate(result.invoiceDate)  
            setItems(result.items.length ? result.items : [emptyPurchaseItem()])  
            setInvoiceCharges({  
              discount: safeNumber(result.discount),  
              cgst: safeNumber(result.cgst),  
              sgst: safeNumber(result.sgst),  
              igst: safeNumber(result.igst),  
              otherCharges: safeNumber(result.otherCharges),  
              notes: result.notes || '',  
            })  
            setInvoiceImportOpen(false)  
            setMessage('Invoice imported into the purchase draft. Review every field before completing the purchase.')  
          }}  
        />  
      )}  
  
      {supplierModal && (  
        <SupplierModal  
          store={store}  
          onClose={() =>  
            setSupplierModal(  
              false,  
            )  
          }  
          onCreated={async (supplier) => {
            const refreshed = await loadSuppliers()
            const freshSupplier = refreshed.find((x) =>
              x.supplier_name === supplier.supplier_name &&
              (!supplier.phone || x.phone === supplier.phone) &&
              (!supplier.drug_license_number || x.drug_license_number === supplier.drug_license_number)
            ) || refreshed.find((x) => x.supplier_name === supplier.supplier_name) || supplier

            setSuppliers(refreshed)
            setSelectedSupplier(freshSupplier)
            setSupplierModal(false)
          }}  
        />  
      )}  
  
      {productModal && (  
        <ProductModal  
          store={store}  
          product={productModal}  
          onClose={() =>  
            setProductModal(null)  
          }  
          onCreated={(  
            product,  
          ) => {  
            setProductModal(null)  
  
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
  
function InvoiceImportModal({
  store,
  suppliers,
  products,
  onClose,
  onApply,
}) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [productDraft, setProductDraft] = useState(null)

  const chooseFile = (event) => {
    const selected = event.target.files?.[0] || null
    setFile(selected)
    setPreview(null)
    setError('')
  }

  const extractInvoice = async () => {
    if (!file) {
      setError('Choose a PDF or invoice image first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('store_id', store.id)
      body.append('file', file)
      const { data, error: invokeError } = await supabase.functions.invoke(
        'ai-invoice-extract',
        { body },
      )
      if (invokeError) throw invokeError
      if (!data?.success) throw new Error(data?.error || 'Unable to read this invoice.')
      setPreview(data)
    } catch (err) {
      setError(err?.message || 'Unable to extract the invoice.')
    } finally {
      setBusy(false)
    }
  }

  const extracted = preview?.extracted || {}
  const extractedItems = Array.isArray(extracted.items) ? extracted.items : []
  const supplierMatch = preview?.supplier_matches?.[0]
  const strongSupplierMatch = supplierMatch && safeNumber(supplierMatch.match_confidence) >= 0.85
    ? suppliers.find((x) => x.id === supplierMatch.id) || null
    : null

  const buildItems = () => extractedItems.map((item) => {
    const product = products.find((x) => x.id === item.matched_product_id) || findLocalProductMatch(item)?.product || (item.matched_product_id ? {
      id: item.matched_product_id,
      product_name: item.product_name || '',
      generic_display_name: item.generic_name || '',
      manufacturer: item.manufacturer || null,
      gst_rate: item.gst_rate ?? 0,
      pack_quantity: safeNumber(item.units_per_pack) || 1,
      pack_unit: item.pack_unit || 'pack',
    } : null)
    return {
      ...emptyPurchaseItem(),
      product,
      batchNumber: item.batch_number || '',
      expiryDate: item.expiry_date || '',
      paidPacks: safeNumber(item.paid_packs),
      freePacks: safeNumber(item.free_packs),
      looseUnits: safeNumber(item.loose_units),
      purchaseRatePerPack: safeNumber(item.purchase_rate_per_pack),
      mrpPerPack: safeNumber(item.mrp_per_pack),
      supplierDiscountPercent: safeNumber(item.supplier_discount_percent),
      gstRate: safeNumber(item.gst_rate ?? product?.gst_rate),
      unitsPerPack: safeNumber(item.units_per_pack) || safeNumber(product?.pack_quantity) || 1,
    }
  })

  const findLocalProductMatch = (item) => {
    const query = normalize(`${item.product_name || ''} ${item.generic_name || ''}`)
    if (!query) return null
    let best = null
    let bestScore = 0
    for (const product of products) {
      const haystack = normalize([product.product_name, product.generic_display_name, product.manufacturer].filter(Boolean).join(' '))
      if (!haystack) continue
      const score = fuzzyScore(query, haystack)
      if (score > bestScore) { bestScore = score; best = product }
    }
    return best && bestScore >= 0.45 ? { product: best, confidence: bestScore } : null
  }

  const prepareProductDraft = async (item) => {
    let compositionId = item.composition_id || null
    const ingredients = Array.isArray(item.composition_ingredients) ? item.composition_ingredients.filter((x) => String(x?.ingredient_name || '').trim()) : []
    if (!compositionId && ingredients.length) {
      const { data, error } = await supabase.rpc('pharmdesk_save_composition', {
        p_composition_id: null,
        p_dosage_form: item.dosage_form || null,
        p_source: 'ai_invoice_import',
        p_source_reference: item.product_name || 'Supplier invoice',
        p_ingredients: ingredients.map((x, index) => ({ ingredient_name: String(x.ingredient_name || '').trim(), strength_value: safeNumber(x.strength_value), strength_unit: String(x.strength_unit || 'mg').trim(), sequence_number: index + 1 })),
      })
      if (error) throw error
      compositionId = data
    }
    const units = safeNumber(item.units_per_pack) || 1
    const unitName = String(item.pack_unit || '').trim() || 'pack'
    const stockUnit = String(item.stock_unit || '').trim() || 'unit'
    const packagingLevels = units > 1 ? [
      { level_number: 1, unit_name: unitName, units_per_parent: units, is_purchase_unit: true, is_sale_unit: true, is_preferred_sale_unit: true, is_stock_unit: false },
      { level_number: 2, unit_name: stockUnit, units_per_parent: 1, is_purchase_unit: false, is_sale_unit: true, is_preferred_sale_unit: false, is_stock_unit: true },
    ] : [{ level_number: 1, unit_name: stockUnit, units_per_parent: 1, is_purchase_unit: true, is_sale_unit: true, is_preferred_sale_unit: true, is_stock_unit: true }]
    return { product_name: item.product_name || '', generic_display_name: item.generic_name || '', composition_id: compositionId, manufacturer: item.manufacturer || '', dosage_form: item.dosage_form || '', strength_display: item.strength_display || '', pack_quantity: units, pack_unit: unitName, gst_rate: safeNumber(item.gst_rate), default_selling_price: 0, default_discount_percent: 0, minimum_stock: 0, reorder_level: 0, packagingLevels }
  }

  const addDetectedProduct = async (item, index) => {
    setError('')
    try {
      const draft = await prepareProductDraft(item)
      setProductDraft({ draft, index })
    } catch (err) {
      setError(err?.message || 'Could not prepare this product. You can add its composition manually.')
      setProductDraft({ draft: { ...(await prepareProductDraft({ ...item, composition_ingredients: [] })), composition_id: null }, index })
    }
  }

  const apply = () => {
    if (!extractedItems.length) {
      setError('No purchase line items were detected. Try a clearer invoice image or PDF.')
      return
    }
    const missingProducts = extractedItems.filter((x) => !x.matched_product_id && !findLocalProductMatch(x)).length
    if (missingProducts > 0) {
      setError(`${missingProducts} item(s) could not be matched. They will remain unselected so you can choose/add the correct product before completing the purchase.`)
    }
    const normalisedItems = extractedItems.map((item) => {
      if (item.matched_product_id) return item
      const local = findLocalProductMatch(item)
      return local ? { ...item, matched_product_id: local.product.id, matched_product_name: local.product.product_name } : item
    })
    setPreview((current) => current ? { ...current, extracted: { ...current.extracted, items: normalisedItems } } : current)
    onApply({
      supplier: strongSupplierMatch,
      invoiceNumber: extracted.invoice_number || '',
      invoiceDate: /^\d{4}-\d{2}-\d{2}$/.test(extracted.invoice_date || '') ? extracted.invoice_date : '',
      discount: extracted.discount_amount,
      cgst: extracted.cgst_amount,
      sgst: extracted.sgst_amount,
      igst: extracted.igst_amount,
      otherCharges: extracted.other_charges,
      notes: extracted.notes || '',
      items: buildItems(),
    })
  }

  return (
    <Modal title="Import Supplier Invoice" onClose={onClose}>
      {!preview && (
        <>
          <p className="muted">
            Upload a clear supplier invoice photo or PDF. PharmDesk will extract the purchase details and match products already in PharmDesk. Nothing is saved or added to stock during extraction.
          </p>
          <label>
            Invoice photo / PDF
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
              onChange={chooseFile}
            />
          </label>
          {file && (
            <div className="selected-record">
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          <button
            type="button"
            className="primary-button"
            disabled={busy || !file}
            onClick={extractInvoice}
          >
            {busy ? 'Reading invoice…' : 'Extract Invoice'}
          </button>
        </>
      )}

      {preview && (
        <>
          <div className="history-header">
            <strong>{preview.source_filename || 'Invoice'}</strong>
            <span>Review before applying</span>
          </div>
          <PanelList title="Detected Invoice Details">
            <div className="item-grid">
              <label>Supplier<input value={extracted.supplier_name || 'Not detected'} readOnly /></label>
              <label>Invoice number<input value={extracted.invoice_number || 'Not detected'} readOnly /></label>
              <label>Invoice date<input value={extracted.invoice_date || 'Not detected'} readOnly /></label>
              <label>Invoice total<input value={money(extracted.total_amount)} readOnly /></label>
            </div>
          </PanelList>
          {supplierMatch && (
            <div className="selected-record">
              <strong>Suggested supplier: {supplierMatch.supplier_name}</strong>
              <span>
                Match confidence: {Math.round(safeNumber(supplierMatch.match_confidence) * 100)}%
                {strongSupplierMatch ? ' • will be selected automatically' : ' • review/select manually'}
              </span>
            </div>
          )}
          <PanelList title={`Detected Items (${extractedItems.length})`}>
            <div className="record-list">
              {extractedItems.map((item, index) => (
                <div className="record-row" key={`${item.product_name}-${index}`}>
                  <div>
                    <strong>{item.product_name}</strong>
                    <span>{item.batch_number || 'Batch not detected'} • {item.expiry_date || 'Expiry not detected'}</span>
                  </div>
                  <div className="record-right">
                    <span>{item.matched_product_name || findLocalProductMatch(item)?.product?.product_name || 'Product not matched'}</span>
                    <strong>{safeNumber(item.paid_packs)} packs</strong>
                    {!item.matched_product_id && !findLocalProductMatch(item) && (
                      <button type="button" className="secondary-button" onClick={() => addDetectedProduct(item, index)}>
                        + Add Product
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PanelList>
          {error && <div className="error-box">{error}</div>}
          {extracted.notes && <div className="message-box">AI notes: {extracted.notes}</div>}
          <div className="search-row">
            <button type="button" className="secondary-button" onClick={() => { setPreview(null); setError('') }}>
              Choose Another File
            </button>
            <button type="button" className="primary-button" onClick={apply}>
              Use Invoice in Purchase Draft
            </button>
          </div>
        </>
      )}
      {productDraft && (
        <ProductModal
          store={store}
          product={productDraft.draft}
          onClose={() => setProductDraft(null)}
          onCreated={(created) => {
            const index = productDraft.index
            setPreview((current) => {
              if (!current) return current
              const nextItems = (current.extracted?.items || []).map((x, i) => i === index ? { ...x, matched_product_id: created.id, matched_product_name: x.product_name } : x)
              return { ...current, extracted: { ...current.extracted, items: nextItems } }
            })
            setProductDraft(null)
          }}
        />
      )}
    </Modal>
  )
}

function PurchaseItemRow({  
  item,  
  onChange,  
  onRemove,  
}) {  
  const paid =  
    safeNumber(item.paidPacks) *  
    safeNumber(item.purchaseRatePerPack)  

  const totalPacks =
    safeNumber(item.paidPacks) + safeNumber(item.freePacks)

  const batchSuggestions = useMemo(() => {
    const q = String(item.batchNumber || '').trim()
    const source = Array.isArray(item.batches) ? item.batches : []

    return source
      .map((batch) => ({
        batch,
        score: q
          ? fuzzyScore(
              q,
              [
                batch.batch_number,
                dateText(batch.expiry_date),
                batch.current_stock_units,
              ].filter((value) => value !== null && value !== undefined).join(' '),
            )
          : 1,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.batch)
  }, [item.batchNumber, item.batches])

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
            <div style={{ position: 'relative' }}>
              <input  
                value={item.batchNumber}  
                onChange={(e) =>
                  onChange({
                    batchNumber: e.target.value,
                    selectedBatchId: '',
                  })
                }
                placeholder="Select previous batch or enter a new batch"  
              />
              {batchSuggestions.length > 0 && !item.selectedBatchId && (
                <div className="suggestion-list" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 25 }}>
                  {batchSuggestions.map((batch) => (
                    <button
                      type="button"
                      className="suggestion"
                      key={batch.id}
                      onClick={() =>
                        onChange({
                          batchNumber: batch.batch_number || '',
                          expiryDate: batch.expiry_date || '',
                          unitsPerPack: safeNumber(batch.units_per_pack) || safeNumber(item.unitsPerPack) || 1,
                          purchaseRatePerPack: safeNumber(batch.purchase_rate_per_pack),
                          mrpPerPack: safeNumber(batch.mrp_per_pack),
                          selectedBatchId: batch.id,
                        })
                      }
                    >
                      <strong>{batch.batch_number || 'Batch'}</strong>
                      <span>
                        Exp {dateText(batch.expiry_date)} • Stock {safeNumber(batch.current_stock_units)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>  
  
          <label>  
            Expiry  
            <input  
              type="date"  
              min={todayISO()}
              value={item.expiryDate}  
              onChange={(e) =>
                onChange({
                  expiryDate: e.target.value,
                  selectedBatchId: '',
                })
              }
            />  
          </label>  
  
          <label>  
            Total packs  
            <input  
              type="number"
              value={totalPacks}
              readOnly
              aria-label="Total packs"
              title="Paid packs + Free packs"
            />  
          </label>  
  
          <label>  
            Paid packs  
            <input  
              type="number"  
              min="0"  
              step="any"
              value={item.paidPacks}  
              onChange={(e) => onChange({ paidPacks: e.target.value })}  
            />  
          </label>  
  
          <label>  
            Free packs  
            <input  
              type="number"  
              min="0"  
              step="any"
              value={item.freePacks}  
              onChange={(e) => onChange({ freePacks: e.target.value })}  
            />  
          </label>  
  
          <label>  
            Loose units  
            <input  
              type="number"  
              min="0"  
              step="any"
              value={item.looseUnits}  
              onChange={(e) => onChange({ looseUnits: e.target.value })}  
            />  
          </label>  
  
          <label>  
            Purchase rate  
            <input  
              type="number"  
              min="0"  
              step="0.01"  
              value={item.purchaseRatePerPack}  
              onChange={(e) => onChange({ purchaseRatePerPack: e.target.value })}  
            />  
          </label>  
  
          <label>  
            MRP / pack  
            <input  
              type="number"  
              min="0"  
              step="0.01"  
              value={item.mrpPerPack}  
              onChange={(e) => onChange({ mrpPerPack: e.target.value })}  
            />  
          </label>  
  
          <label>  
            GST %  
            <input  
              type="number"  
              min="0"  
              max="100"  
              step="0.01"
              value={item.gstRate}  
              onChange={(e) => onChange({ gstRate: e.target.value })}  
            />  
          </label>  

          <label>
            Supplier discount %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={item.supplierDiscountPercent}
              onChange={(e) => onChange({ supplierDiscountPercent: e.target.value })}
            />
          </label>
        </div>  
      )}  
  
      <div className="item-footer">  
        <span>Paid value: {money(paid)}</span>  
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
  
function SupplierInvoices({  
  store,  
}) {  
  const [rows, setRows] =  
    useState([])  
  const [selected, setSelected] =  
    useState(null)  
  const [searchQuery, setSearchQuery] =  
    useState('')  

  const filteredRows = useMemo(() => {  
    const q = String(searchQuery || '').trim()  

    if (!q) return rows  

    return rows  
      .map((row) => ({  
        row,  
        score: fuzzyScore(  
          q,  
          [  
            row.invoice_number,  
            row.suppliers?.supplier_name,  
            row.invoice_date,  
            row.total_amount,  
          ]  
            .filter((value) => value !== null && value !== undefined)  
            .join(' '),  
        ),  
      }))  
      .filter((entry) => entry.score > 0)  
      .sort((a, b) => b.score - a.score)  
      .map((entry) => entry.row)  
  }, [rows, searchQuery])  
  
  const load = async () => {  
    const { data } =  
      await supabase  
        .from('purchase_invoices')  
        .select(`  
          *,  
          suppliers (  
            *  
          )  
        `)  
        .eq(  
          'store_id',  
          store.id,  
        )  
        .order(  
          'invoice_date',  
          {  
            ascending: false,  
          },  
        )  
        .limit(200)  
  
    setRows(data || [])  
  }  
  
  useEffect(() => {  
    if (store?.id) load()  
  }, [store?.id])  
  
  return (  
    <PanelList title="Supplier Invoices">  
      <div style={{ marginBottom: '12px' }}>  
        <input  
          type="search"  
          value={searchQuery}  
          onChange={(e) =>  
            setSearchQuery(e.target.value)  
          }  
          placeholder="Search invoice number or supplier…"  
          aria-label="Search supplier invoices"  
        />  
      </div>  

      {!filteredRows.length ? (  
        <EmptyState  
          text={  
            searchQuery.trim()  
              ? 'No supplier invoices match your search.'  
              : 'No supplier invoices found.'  
          }  
        />  
      ) : (  
        <div className="record-list">  
          {filteredRows.map((row) => (  
          <button  
            className="record-row"  
            key={row.id}  
            onClick={() =>  
              setSelected(  
                row.suppliers,  
              )  
            }  
          >  
            <div>  
              <strong>  
                {  
                  row.invoice_number  
                }  
              </strong>  
  
              <span>  
                {row.suppliers  
                  ?.supplier_name ||  
                  'Supplier'}  
              </span>  
            </div>  
  
            <div className="record-right">  
              <span>  
                {dateText(  
                  row.invoice_date,  
                )}  
              </span>  
  
              <strong>  
                {money(  
                  row.total_amount,  
                )}  
              </strong>  
            </div>  
          </button>  
          ))}  
        </div>  
      )}  
  
      {selected && (  
        <SupplierHistoryModal  
          supplier={selected}  
          store={store}  
          onClose={() =>  
            setSelected(null)  
          }  
        />  
      )}  
    </PanelList>  
  )  
}  
  
function SupplierHistoryModal({  
  supplier,  
  store,  
  onClose,  
  onEdit,  
}) {  
  const [invoices, setInvoices] =  
    useState([])  
  const [items, setItems] =  
    useState([])  
  const [payments, setPayments] =  
    useState([])  
  const [loading, setLoading] =  
    useState(true)  
  
  useEffect(() => {  
    loadHistory()  
  }, [supplier?.id])  
  
  const loadHistory =  
    async () => {  
      if (!supplier?.id) {  
        setLoading(false)  
        return  
      }  
  
      setLoading(true)  
  
      const {  
        data: invoiceRows,  
      } = await supabase  
        .from(  
          'purchase_invoices',  
        )  
        .select(  
          'id, invoice_number, invoice_date, total_amount, payment_status',  
        )  
        .eq(  
          'store_id',  
          store.id,  
        )  
        .eq(  
          'supplier_id',  
          supplier.id,  
        )  
        .order(  
          'invoice_date',  
          {  
            ascending: false,  
          },  
        )  
  
      setInvoices(  
        invoiceRows || [],  
      )  
  
      const {  
        data: paymentRows,  
      } = await supabase  
        .from('supplier_payment_transactions')  
        .select(`  
          id,  
          purchase_invoice_id,  
          amount,  
          payment_date,  
          payment_method,  
          reference_number,  
          notes  
        `)  
        .eq('store_id', store.id)  
        .eq('supplier_id', supplier.id)  
        .order('payment_date', {  
          ascending: false,  
        })  
  
      setPayments(paymentRows || [])  
  
      if (  
        invoiceRows?.length  
      ) {  
        const {  
          data: itemRows,  
        } = await supabase  
          .from(  
            'purchase_items',  
          )  
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
            invoiceRows.map(  
              (x) => x.id,  
            ),  
          )  
  
        setItems(  
          itemRows || [],  
        )  
      } else {  
        setItems([])  
      }  
  
      setLoading(false)  
    }  
  
  const productHistory =  
    useMemo(() => {  
      const map = new Map()  
  
      for (const item of items) {  
        if (!item.products)  
          continue  
  
        const key =  
          item.products.id  
  
        if (!map.has(key)) {  
          map.set(key, {  
            product:  
              item.products,  
            packs: 0,  
            looseUnits: 0,  
            lastRate: 0,  
            lastDate: null,  
            lastBatch: null,  
            invoices: 0,  
          })  
        }  
  
        const entry =  
          map.get(key)  
  
        entry.packs +=  
          safeNumber(  
            item.paid_packs,  
          ) +  
          safeNumber(  
            item.free_packs,  
          )  
  
        entry.looseUnits +=  
          safeNumber(  
            item.loose_units,  
          )  
  
        entry.lastRate =  
          safeNumber(  
            item.purchase_rate_per_pack,  
          )  
  
        entry.lastBatch =  
          item.batches  
            ?.batch_number ||  
          item.batch_number ||  
          null  
  
        const invoice =  
          invoices.find(  
            (x) =>  
              x.id ===  
              item.purchase_invoice_id,  
          )  
  
        if (  
          invoice &&  
          (!entry.lastDate ||  
            new Date(  
              invoice.invoice_date,  
            ) >  
              new Date(  
                entry.lastDate,  
              ))  
        ) {  
          entry.lastDate =  
            invoice.invoice_date  
        }  
  
        entry.invoices += 1  
      }  
  
      return Array.from(  
        map.values(),  
      ).sort(  
        (a, b) =>  
          new Date(  
            b.lastDate || 0,  
          ) -  
          new Date(  
            a.lastDate || 0,  
          ),  
      )  
    }, [  
      items,  
      invoices,  
    ])  
  
  return (  
    <Modal  
      title={`${supplier.supplier_name} • Purchase History`}  
      onClose={onClose}  
    >  
      {loading ? (  
        <LoadingInline />  
      ) : (  
        <>  
          <div className="history-header">  
            <div>  
              <strong>  
                {  
                  supplier.supplier_name  
                }  
              </strong>  
  
              <span>  
                {supplier.phone ||  
                  'No phone'}  
              </span>  
  
              <span>  
                Drug licence:{' '}  
                {supplierLicense(  
                  supplier,  
                ) || '—'}  
              </span>  
  
              <span>  
                GSTIN:{' '}  
                {supplier.gstin ||  
                  '—'}  
              </span>  
            </div>  
  
            {onEdit && (  
              <button  
                className="secondary-button"  
                onClick={() =>  
                  onEdit(  
                    supplier,  
                  )  
                }  
              >  
                Edit Company  
              </button>  
            )}  
          </div>  
  
          <h3>  
            Products purchased from this party  
          </h3>  
  
          <div className="record-list">  
            {productHistory.length ===  
              0 && (  
              <EmptyState text="No previous purchases found." />  
            )}  
  
            {productHistory.map(  
              (entry) => (  
                <div  
                  className="record-row static"  
                  key={  
                    entry.product  
                      .id  
                  }  
                >  
                  <div>  
                    <strong>  
                      {  
                        entry.product  
                          .product_name  
                      }  
                    </strong>  
  
                    <span>  
                      {entry.product  
                        .generic_display_name ||  
                        ''}  
                    </span>  
                  </div>  
  
                  <div className="record-right">  
                    <span>  
                      Packs:{' '}  
                      {  
                        entry.packs  
                      }  
                    </span>  
  
                    <span>  
                      Loose:{' '}  
                      {  
                        entry.looseUnits  
                      }  
                    </span>  
  
                    <span>  
                      Invoices:{' '}  
                      {  
                        entry.invoices  
                      }  
                    </span>  
  
                    <span>  
                      Last:{' '}  
                      {dateText(  
                        entry.lastDate,  
                      )}  
                    </span>  
  
                    <strong>  
                      {money(  
                        entry.lastRate,  
                      )}  
                    </strong>  
                  </div>  
                </div>  
              ),  
            )}  
          </div>  
  
          <h3>  
            Supplier payment history  
          </h3>  
  
          {payments.length === 0 ? (  
            <EmptyState text="No supplier payments recorded yet." />  
          ) : (  
            <div className="record-list">  
              {payments.map((payment) => {  
                const invoice = invoices.find(  
                  (row) =>  
                    row.id ===  
                    payment.purchase_invoice_id,  
                )  
  
                return (  
                  <div  
                    className="record-row static"  
                    key={payment.id}  
                  >  
                    <div>  
                      <strong>  
                        {invoice?.invoice_number ||  
                          'Supplier payment'}  
                      </strong>  
                      <span>  
                        Paid on {dateText(  
                          payment.payment_date,  
                        )}  
                      </span>  
                      {payment.payment_method && (  
                        <span>  
                          {payment.payment_method}  
                        </span>  
                      )}  
                    </div>  
                    <strong>  
                      {money(payment.amount)}  
                    </strong>  
                  </div>  
                )  
              })}  
            </div>  
          )}  
  
          <h3>  
            Previous invoices  
          </h3>  
  
          <div className="record-list">  
            {invoices.map(  
              (invoice) => (  
                <div  
                  className="record-row static"  
                  key={  
                    invoice.id  
                  }  
                >  
                  <div>  
                    <strong>  
                      {  
                        invoice.invoice_number  
                      }  
                    </strong>  
  
                    <span>  
                      {dateText(  
                        invoice.invoice_date,  
                      )}  
                    </span>  
                  </div>  
  
                  <div className="record-right">  
                    <span>  
                      {  
                        invoice.payment_status  
                      }  
                    </span>  
  
                    <strong>  
                      {money(  
                        invoice.total_amount,  
                      )}  
                    </strong>  
                  </div>  
                </div>  
              ),  
            )}  
          </div>  
        </>  
      )}  
    </Modal>  
  )  
}  
  
function PendingSupplierPayments({
  store,
}) {
  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [supplierFilter, setSupplierFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [paymentDate, setPaymentDate] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    if (!store?.id) return

    setLoading(true)
    setError('')

    const [{ data: invoiceRows, error: invoiceError }, { data: supplierRows, error: supplierError }] =
      await Promise.all([
        supabase
          .from('purchase_invoices')
          .select(`
            *,
            suppliers (
              id,
              supplier_name
            )
          `)
          .eq('store_id', store.id)
          .in('payment_status', [
            'unpaid',
            'pending',
            'partial',
            'due',
          ])
          .order('invoice_date', { ascending: true }),
        supabase
          .from('suppliers')
          .select('id, supplier_name')
          .eq('store_id', store.id)
          .eq('is_active', true)
          .order('supplier_name'),
      ])

    if (invoiceError || supplierError) {
      setError(
        invoiceError?.message ||
          supplierError?.message ||
          'Unable to load pending supplier payments.',
      )
      setRows([])
      setSuppliers([])
      setLoading(false)
      return
    }

    setRows(invoiceRows || [])
    setSuppliers(supplierRows || [])
    setSelectedIds([])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [store?.id])

  const filteredRows = useMemo(() => {
    if (!supplierFilter) return rows
    return rows.filter(
      (row) => row.supplier_id === supplierFilter,
    )
  }, [rows, supplierFilter])

  const selectedRows = useMemo(
    () =>
      rows.filter((row) =>
        selectedIds.includes(row.id),
      ),
    [rows, selectedIds],
  )

  const selectedTotal = selectedRows.reduce(
    (sum, row) => sum + safeNumber(row.total_amount),
    0,
  )

  const toggleRow = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    )
    setMessage('')
    setError('')
  }

  const toggleAllFiltered = () => {
    const filteredIds = filteredRows
      .filter((row) => row.payment_status !== 'partial')
      .map((row) => row.id)
    const allSelected = filteredIds.every((id) =>
      selectedIds.includes(id),
    )

    setSelectedIds((current) =>
      allSelected
        ? current.filter(
            (id) => !filteredIds.includes(id),
          )
        : Array.from(
            new Set([...current, ...filteredIds]),
          ),
    )
    setMessage('')
    setError('')
  }

  const markSelectedAsPaid = async () => {
    if (!selectedIds.length) {
      setError('Select at least one bill to pay.')
      return
    }

    if (!paymentDate) {
      setError('Select the date on which the payment was made.')
      return
    }

    const confirmed = window.confirm(
      `Mark ${selectedIds.length} selected bill${selectedIds.length === 1 ? '' : 's'} as paid for ${money(selectedTotal)}?`,
    )

    if (!confirmed) return

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const { error: paymentError } = await supabase.rpc(
        'pharmdesk_mark_supplier_invoices_paid',
        {
          p_store_id: store.id,
          p_invoice_ids: selectedIds,
          p_payment_date: paymentDate,
          p_payment_method: paymentMethod,
          p_notes: notes,
        },
      )

      if (paymentError) {
        throw paymentError
      }

      setSelectedIds([])
      setNotes('')
      setMessage(
        `${money(selectedTotal)} marked as paid on ${dateText(paymentDate)}.`,
      )
      await load()
    } catch (paymentError) {
      console.error(
        'Failed to record supplier payment:',
        paymentError,
      )
      setError(
        paymentError?.message ||
          'Unable to record supplier payment.',
      )
    } finally {
      setSaving(false)
    }
  }

  const supplierSelected = Boolean(supplierFilter)
  const billGridColumns = supplierSelected
    ? '46px minmax(190px, 1.25fr) minmax(150px, 1fr) minmax(140px, 0.8fr)'
    : '46px minmax(190px, 1.1fr) minmax(170px, 1fr) minmax(150px, 0.9fr) minmax(140px, 0.8fr)'

  return (
    <PanelList title="Pending Supplier Payments">
      <style>{`
        .supplier-bill-table-inner {
          width: 100%;
        }

        @media (max-width: 900px) and (orientation: landscape) {
          .supplier-bill-table-inner {
            min-width: 0 !important;
            width: 100% !important;
          }

          .supplier-bill-table-header,
          .supplier-bill-table-row {
            grid-template-columns: 32px minmax(0, 1.2fr) minmax(0, 1.25fr) 92px 96px !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
          }

          .supplier-bill-table-header {
            min-height: 48px !important;
            font-size: 12px !important;
          }

          .supplier-bill-table-row {
            min-height: 60px !important;
          }

          .supplier-bill-checkbox {
            width: 18px !important;
            height: 18px !important;
          }

          .supplier-bill-invoice {
            padding: 5px 8px !important;
            border-radius: 7px !important;
            font-size: 13px !important;
          }

          .supplier-bill-supplier,
          .supplier-bill-date,
          .supplier-bill-amount {
            font-size: 12.5px !important;
          }

          .supplier-bill-supplier {
            padding-right: 6px !important;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }

        @media (max-width: 900px) and (orientation: landscape) {
          .supplier-bill-table-header.supplier-selected,
          .supplier-bill-table-row.supplier-selected {
            grid-template-columns: 32px minmax(0, 1.55fr) 92px 96px !important;
          }
        }
      `}</style>
      <div
        style={{
          display: 'grid',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <label>
          Supplier / Party
          <select
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value)
              setSelectedIds([])
            }}
          >
            <option value="">All suppliers</option>
            {suppliers.map((supplier) => (
              <option
                key={supplier.id}
                value={supplier.id}
              >
                {supplier.supplier_name}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={toggleAllFiltered}
            disabled={!filteredRows.some((row) => row.payment_status !== 'partial')}
          >
            {filteredRows.length > 0 &&
            filteredRows.every((row) =>
              selectedIds.includes(row.id),
            )
              ? 'Unselect all'
              : 'Select all shown'}
          </button>

          <span>
            {selectedIds.length} bill
            {selectedIds.length === 1 ? '' : 's'} selected
          </span>
        </div>
      </div>

      {error && (
        <div className="error-text">
          {error}
        </div>
      )}

      {message && (
        <div className="success-text">
          {message}
        </div>
      )}

      {loading ? (
        <LoadingInline />
      ) : filteredRows.length === 0 ? (
        <EmptyState text="No pending supplier payments." />
      ) : (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid #dfe5ec',
            borderRadius: 16,
            background: '#fff',
          }}
        >
          <div
            className="supplier-bill-table-inner"
            style={{ minWidth: supplierSelected ? 640 : 820 }}
          >
            <div
              className={`supplier-bill-table-header${supplierSelected ? ' supplier-selected' : ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: billGridColumns,
                alignItems: 'center',
                minHeight: 64,
                padding: '0 16px',
                background: '#12345b',
                color: '#fff',
                borderRadius: '16px 16px 0 0',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="checkbox"
                  aria-label="Select all pending supplier bills"
                  checked={
                    filteredRows.filter((row) => row.payment_status !== 'partial').length > 0 &&
                    filteredRows
                      .filter((row) => row.payment_status !== 'partial')
                      .every((row) => selectedIds.includes(row.id))
                  }
                  onChange={toggleAllFiltered}
                  disabled={!filteredRows.some((row) => row.payment_status !== 'partial')}
                  style={{
                    width: 22,
                    height: 22,
                    margin: 0,
                  }}
                />
              </div>

              <div>Invoice No.</div>

              {!supplierSelected && <div>Supplier</div>}

              <div>Date</div>

              <div style={{ textAlign: 'right' }}>Amount</div>
            </div>

            {filteredRows.map((row, index) => {
              const selected = selectedIds.includes(row.id)
              const disabled = row.payment_status === 'partial'

              return (
                <label
                  key={row.id}
                  className={`supplier-bill-table-row${supplierSelected ? ' supplier-selected' : ''}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: billGridColumns,
                    alignItems: 'center',
                    minHeight: 82,
                    padding: '0 16px',
                    borderBottom:
                      index === filteredRows.length - 1
                        ? 'none'
                        : '1px solid #e3e8ee',
                    background: selected ? '#f4f8ff' : '#fff',
                    cursor: disabled ? 'default' : 'pointer',
                    opacity: disabled ? 0.72 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleRow(row.id)}
                      className="supplier-bill-checkbox"
                      style={{
                        width: 22,
                        height: 22,
                        margin: 0,
                      }}
                    />
                  </div>

                  <div>
                    <span
                      className="supplier-bill-invoice"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '8px 14px',
                        borderRadius: 10,
                        background: '#e6f0ff',
                        color: '#12345b',
                        fontWeight: 800,
                        fontSize: 17,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.invoice_number}
                    </span>
                  </div>

                  {!supplierSelected && (
                    <div
                      className="supplier-bill-supplier"
                      style={{
                        fontWeight: 600,
                        color: '#27364a',
                        paddingRight: 12,
                      }}
                    >
                      {row.suppliers?.supplier_name || 'Supplier'}
                    </div>
                  )}

                  <div
                    className="supplier-bill-date"
                    style={{
                      color: '#566173',
                      fontSize: 16,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dateText(row.invoice_date)}
                  </div>

                  <div
                    className="supplier-bill-amount"
                    style={{
                      textAlign: 'right',
                      fontWeight: 800,
                      color: '#10233d',
                      fontSize: 17,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {money(row.total_amount)}
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            border: '1px solid var(--border, #ddd)',
            borderRadius: 10,
            display: 'grid',
            gap: 12,
          }}
        >
          <strong>
            Total selected: {money(selectedTotal)}
          </strong>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            <label>
              Payment date
              <input
                type="date"
                value={paymentDate}
                onChange={(e) =>
                  setPaymentDate(e.target.value)
                }
              />
            </label>

            <label>
              Payment method
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value)
                }
              >
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
                <option>Bank transfer</option>
                <option>Cheque</option>
                <option>Other</option>
              </select>
            </label>
          </div>

          <label>
            Notes (optional)
            <input
              type="text"
              value={notes}
              onChange={(e) =>
                setNotes(e.target.value)
              }
              placeholder="Payment reference or note"
            />
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={markSelectedAsPaid}
            disabled={saving}
          >
            {saving
              ? 'Recording payment…'
              : `Mark selected as paid · ${money(selectedTotal)}`}
          </button>
        </div>
      )}
    </PanelList>
  )
}

function SupplierPurchaseCatalogue({ store }) {
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [rows, setRows] = useState([])
  const [quantities, setQuantities] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [notes, setNotes] = useState('')
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState('')
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false)
  const pdfFrameRef = useRef(null)

  useEffect(() => {
    if (!store?.id) return

    const loadSuppliers = async () => {
      const { data, error: loadError } =
        await supabase
          .from('suppliers')
          .select('id, supplier_name')
          .eq('store_id', store.id)
          .eq('is_active', true)
          .order('supplier_name')

      if (loadError) {
        setError(loadError.message)
        return
      }

      setSuppliers(data || [])
    }

    loadSuppliers()
  }, [store?.id])

  const loadCatalogue = async (nextSupplierId) => {
    setSupplierId(nextSupplierId)
    setRows([])
    setQuantities({})
    setError('')
    setMessage('')

    if (!nextSupplierId) return

    setLoading(true)

    try {
      const result =
        await PharmDeskAPI.getSupplierPurchaseCatalogue(
          store.id,
          nextSupplierId,
        )

      setRows(
        Array.isArray(result)
          ? result
          : [],
      )
    } catch (loadError) {
      console.error(
        'Failed to load supplier purchase catalogue:',
        loadError,
      )

      setError(
        loadError?.message ||
          'Unable to load purchase history for this supplier.',
      )
    } finally {
      setLoading(false)
    }
  }

  const updateQuantity = (
    productId,
    value,
  ) => {
    setQuantities((current) => ({
      ...current,
      [productId]: value,
    }))
  }

  const getSupplierCatalogueExportData = () => {
    const supplierName =
      suppliers.find((supplier) => supplier.id === supplierId)?.supplier_name ||
      'Supplier'

    const csvEscape = (value) => {
      const text = String(value ?? '')
      return `"${text.replace(/"/g, '""')}"`
    }

    const rowsForExport = [
      [
        'Product',
        'Composition',
        'Manufacturer',
        'Dosage Form',
        'Strength',
        'Pack',
        'Last Purchased',
        'Last Purchase Rate',
        'MRP',
        'GST',
        'Purchased Times',
        'Order Quantity',
      ],
      ...rows.map((row) => [
        row.product_name,
        row.composition || '',
        row.manufacturer || '',
        row.dosage_form || '',
        row.strength_display || '',
        `${row.pack_quantity || '—'} ${row.pack_unit || ''}`.trim(),
        dateText(row.last_purchase_date),
        money(row.last_purchase_rate),
        money(row.last_mrp),
        row.last_gst_rate == null ? '' : `${row.last_gst_rate}%`,
        row.times_purchased || 0,
        safeNumber(quantities[row.product_id]) || 0,
      ]),
    ]

    return {
      supplierName,
      rowsForExport,
      csvEscape,
    }
  }

  const shareOrDownloadFile = async (
    file,
    successMessage,
  ) => {
    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: file.name,
          text: successMessage,
        })
        setMessage(successMessage)
        return
      } catch (shareError) {
        if (shareError?.name === 'AbortError') return
      }
    }

    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage(successMessage)
  }

  const exportSupplierCatalogueCsv = async () => {
    if (!supplierId || !rows.length) {
      setError('Select a supplier with products before exporting.')
      return
    }

    setError('')
    setMessage('')

    const {
      supplierName,
      rowsForExport,
      csvEscape,
    } = getSupplierCatalogueExportData()

    const csv = '\ufeff' + rowsForExport
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n')

    const fileName =
      `${supplierName.replace(/[^a-z0-9]+/gi, '_')}_Supplier_Catalogue.csv`

    await shareOrDownloadFile(
      new File(
        [csv],
        fileName,
        { type: 'text/csv;charset=utf-8' },
      ),
      'Supplier catalogue exported as CSV.',
    )

    setExportChoiceOpen(false)
  }

  const exportSupplierCatalogueExcel = async () => {
    if (!supplierId || !rows.length) {
      setError('Select a supplier with products before exporting.')
      return
    }

    setError('')
    setMessage('')

    const {
      supplierName,
      rowsForExport,
    } = getSupplierCatalogueExportData()

    const htmlEscape = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const tableRows = rowsForExport
      .slice(1)
      .map(
        (row) => `
          <tr>
            ${row
              .map(
                (value) =>
                  `<td>${htmlEscape(value)}</td>`,
              )
              .join('')}
          </tr>
        `,
      )
      .join('')

    const excelHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            table { border-collapse: collapse; }
            th, td { border: 1px solid #999; padding: 6px; }
            th { font-weight: 700; background: #eeeeee; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                ${rowsForExport[0]
                  .map(
                    (header) =>
                      `<th>${htmlEscape(header)}</th>`,
                  )
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `

    const fileName =
      `${supplierName.replace(/[^a-z0-9]+/gi, '_')}_Supplier_Catalogue.xls`

    await shareOrDownloadFile(
      new File(
        [excelHtml],
        fileName,
        { type: 'application/vnd.ms-excel' },
      ),
      'Supplier catalogue exported as an Excel-compatible file.',
    )

    setExportChoiceOpen(false)
  }

  const openSupplierCatalogueExport = () => {
    if (!supplierId || !rows.length) {
      setError('Select a supplier with products before exporting.')
      return
    }

    setError('')
    setMessage('')
    setExportChoiceOpen(true)
  }

  const exportSupplierCataloguePdf = () => {
    if (!supplierId || !rows.length) {
      setError('Select a supplier with products before exporting.')
      return
    }

    const supplierName =
      suppliers.find((supplier) => supplier.id === supplierId)?.supplier_name ||
      'Supplier'

    const htmlEscape = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const tableRows = rows
      .map((row) => `
        <tr>
          <td>${htmlEscape(row.product_name)}</td>
          <td>${htmlEscape(row.composition || '—')}</td>
          <td>${htmlEscape(row.manufacturer || '—')}</td>
          <td>${htmlEscape(row.dosage_form || '—')}</td>
          <td>${htmlEscape(row.strength_display || '—')}</td>
          <td>${htmlEscape(`${row.pack_quantity || '—'} ${row.pack_unit || ''}`.trim())}</td>
          <td>${htmlEscape(money(row.last_mrp))}</td>
          <td>${htmlEscape(row.last_gst_rate == null ? '—' : `${row.last_gst_rate}%`)}</td>
          <td class="order-cell">${htmlEscape(safeNumber(quantities[row.product_id]) || 0)}</td>
        </tr>`).join('')

    setPdfPreviewHtml(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${htmlEscape(supplierName)} - Supplier Order</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; margin: 0; padding: 18px; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .meta { margin-bottom: 14px; font-size: 12px; color: #56657a; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #b8c2cf; padding: 6px; vertical-align: top; }
    th { background: #eef2f7; text-align: left; font-weight: 700; }
    .order-cell { min-width: 70px; height: 28px; }
    .footer { margin-top: 12px; font-size: 10px; color: #667085; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Supplier Order — ${htmlEscape(supplierName)}</h1>
  <div class="meta">Please enter the order quantity for each product.</div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Composition</th>
        <th>Manufacturer</th>
        <th>Dosage Form</th>
        <th>Strength</th>
        <th>Pack</th>
        <th>MRP</th>
        <th>GST</th>
        <th>Order Quantity</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">Generated from PharmDesk.</div>
</body>
</html>`)
  }

  const createOrder = async () => {
    setError('')
    setMessage('')

    const items = rows
      .map((row) => ({
        product_id: row.product_id,
        quantity: safeNumber(
          quantities[row.product_id],
        ),
      }))
      .filter(
        (item) =>
          item.quantity > 0,
      )

    if (!supplierId) {
      setError('Select a supplier first.')
      return
    }

    if (!items.length) {
      setError(
        'Enter a quantity for at least one product.',
      )
      return
    }

    setSaving(true)

    try {
      const orderId =
        await PharmDeskAPI.createPurchaseOrder({
          storeId: store.id,
          supplierId,
          items,
          notes: notes.trim() || null,
        })

      setMessage(
        `Purchase order created successfully: ${orderId}`,
      )

      setQuantities({})
      setNotes('')
    } catch (saveError) {
      console.error(
        'Failed to create purchase order:',
        saveError,
      )

      setError(
        saveError?.message ||
          'Unable to create purchase order.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Supplier Catalogue & Orders"
        subtitle="Choose a supplier, review products previously purchased from them, enter quantities manually and create an order."
      />

      <PanelList title="Supplier">
        <label>
          Select supplier
          <select
            value={supplierId}
            onChange={(e) =>
              loadCatalogue(
                e.target.value,
              )
            }
          >
            <option value="">
              Select supplier
            </option>

            {suppliers.map(
              (supplier) => (
                <option
                  key={supplier.id}
                  value={supplier.id}
                >
                  {supplier.supplier_name}
                </option>
              ),
            )}
          </select>
        </label>
      </PanelList>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {message && (
        <div className="success-box">
          {message}
        </div>
      )}

      {loading && (
        <PanelList title="Supplier Products">
          <div className="message-box">
            Loading products previously
            purchased from this supplier…
          </div>
        </PanelList>
      )}

      {!loading &&
        supplierId &&
        rows.length === 0 && (
          <PanelList title="Supplier Products">
            <EmptyState
              text="No previous purchase history was found for this supplier."
            />
          </PanelList>
        )}

      {!loading &&
        rows.length > 0 && (
          <PanelList title="Products Previously Purchased From This Supplier">
            <div className="record-list">
              {rows.map((row) => (
                <div
                  className="record-row static"
                  key={row.product_id}
                >
                  <div>
                    <strong>
                      {row.product_name}
                    </strong>

                    <span>
                      {row.composition ||
                        'Composition not recorded'}
                    </span>

                    <span>
                      {[
                        row.manufacturer,
                        row.dosage_form,
                        row.strength_display,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </span>

                    <span>
                      Pack:{' '}
                      {row.pack_quantity ||
                        '—'}{' '}
                      {row.pack_unit ||
                        ''}
                    </span>

                    <span>
                      Last purchased:{' '}
                      {dateText(
                        row.last_purchase_date,
                      )}
                    </span>

                    <span>
                      Last purchase rate:{' '}
                      {money(
                        row.last_purchase_rate,
                      )}
                    </span>

                    <span>
                      Last MRP:{' '}
                      {money(
                        row.last_mrp,
                      )}
                    </span>

                    <span>
                      GST:{' '}
                      {row.last_gst_rate ??
                        '—'}
                      %
                    </span>

                    <span>
                      Purchased{' '}
                      {row.times_purchased ||
                        0}{' '}
                      time(s)
                    </span>
                  </div>

                  <div
                    style={{
                      minWidth: 140,
                    }}
                  >
                    <label>
                      Order quantity
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={
                          quantities[
                            row.product_id
                          ] || ''
                        }
                        onChange={(e) =>
                          updateQuantity(
                            row.product_id,
                            e.target.value,
                          )
                        }
                        placeholder="0"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="button-row" style={{ flexWrap: 'wrap', marginBottom: '12px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={openSupplierCatalogueExport}
              >
                Export Excel / CSV
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={exportSupplierCataloguePdf}
              >
                Export PDF
              </button>
            </div>

            {exportChoiceOpen && (
              <Modal
                title="Choose Export Format"
                onClose={() => setExportChoiceOpen(false)}
              >
                <div className="button-row" style={{ flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={exportSupplierCatalogueExcel}
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={exportSupplierCatalogueCsv}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setExportChoiceOpen(false)}
                  >
                    Cancel
                  </button>
                </div>

                <div className="info-box" style={{ marginTop: '12px' }}>
                  Excel exports as an Excel-compatible .xls file. CSV exports as a UTF-8 .csv file.
                </div>
              </Modal>
            )}

            <label>
              Order notes
              <textarea
                value={notes}
                onChange={(e) =>
                  setNotes(
                    e.target.value,
                  )
                }
                rows={3}
                placeholder="Optional notes for this supplier order"
              />
            </label>

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={createOrder}
                disabled={saving}
              >
                {saving
                  ? 'Creating order…'
                  : 'Create Supplier Order'}
              </button>
            </div>
          </PanelList>
        )}

      {pdfPreviewHtml && (
        <Modal
          title="Supplier Order PDF Preview"
          onClose={() => setPdfPreviewHtml('')}
        >
          <div className="button-row" style={{ marginBottom: '12px' }}>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const frame = pdfFrameRef.current
                if (frame?.contentWindow) {
                  frame.contentWindow.focus()
                  frame.contentWindow.print()
                }
              }}
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPdfPreviewHtml('')}
            >
              Close
            </button>
          </div>
          <iframe
            ref={pdfFrameRef}
            title="Supplier order PDF preview"
            srcDoc={pdfPreviewHtml}
            style={{ width: '100%', minHeight: '70vh', border: '1px solid #d1d5db', borderRadius: '10px', background: '#fff' }}
          />
        </Modal>
      )}
    </div>
  )
}
  
function PurchaseOrders({
  store,
}) {
  const [rows, setRows] =
    useState([])

  const [selectedOrder, setSelectedOrder] =
    useState(null)

  const [orderLoading, setOrderLoading] =
    useState(false)

  const [orderError, setOrderError] =
    useState('')
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState('')
  const pdfFrameRef = useRef(null)

  useEffect(() => {
    if (!store?.id) return

    supabase
      .from('purchase_orders')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', {
        ascending: false,
      })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          console.error(
            'Failed to load purchase orders:',
            error,
          )
          return
        }

        setRows(data || [])
      })
  }, [store?.id])

  const openOrder = async (orderId) => {
    try {
      setOrderLoading(true)
      setOrderError('')

      const details =
        await PharmDeskAPI.getPurchaseOrderDetail(
          store.id,
          orderId,
        )

      setSelectedOrder(details)
    } catch (error) {
      console.error(
        'Failed to load purchase order:',
        error,
      )

      setOrderError(
        error?.message ||
          'Unable to load purchase order.',
      )
    } finally {
      setOrderLoading(false)
    }
  }

  const exportOrderPdf = () => {
    if (!selectedOrder) return

    const order =
      selectedOrder

    const items =
      order.items || []

    const supplier =
      order.supplier || {}

    const itemRows = items
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              ${item.product?.product_name || 'Product'}
              ${
                item.product
                  ?.generic_display_name
                  ? `<div class="muted">
                      ${item.product.generic_display_name}
                    </div>`
                  : ''
              }
            </td>
            <td>
              ${
                item.product
                  ?.dosage_form || '—'
              }
            </td>
            <td>
              ${
                item.product
                  ?.strength_display || '—'
              }
            </td>
            <td>
              ${
                item.product
                  ?.pack_quantity ??
                '—'
              }
              ${
                item.product
                  ?.pack_unit || ''
              }
            </td>
            <td class="right">
              ${item.quantity || 0}
            </td>
          </tr>
        `,
      )
      .join('')

    setPdfPreviewHtml(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>
            ${order.order_number || 'Purchase Order'}
          </title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              margin: 0;
              padding: 32px;
              color: #111827;
            }

            .header {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              margin-bottom: 28px;
              padding-bottom: 20px;
              border-bottom: 2px solid #111827;
            }

            .store-name {
              font-size: 24px;
              font-weight: 700;
              margin-bottom: 8px;
            }

            .muted {
              color: #6b7280;
              font-size: 12px;
              margin-top: 3px;
            }

            .order-title {
              text-align: right;
            }

            .order-title h1 {
              margin: 0 0 8px;
              font-size: 24px;
            }

            .order-meta {
              font-size: 13px;
              line-height: 1.6;
            }

            .section {
              margin-bottom: 24px;
            }

            .section-title {
              font-size: 13px;
              font-weight: 700;
              text-transform: uppercase;
              margin-bottom: 8px;
            }

            .supplier-box {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              padding: 14px;
              line-height: 1.6;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }

            th,
            td {
              border: 1px solid #d1d5db;
              padding: 9px;
              font-size: 12px;
              text-align: left;
              vertical-align: top;
            }

            th {
              font-weight: 700;
              background: #f3f4f6;
            }

            .right {
              text-align: right;
            }

            .notes {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              padding: 14px;
              white-space: pre-wrap;
              font-size: 13px;
            }

            .footer {
              margin-top: 40px;
              padding-top: 16px;
              border-top: 1px solid #d1d5db;
              font-size: 11px;
              color: #6b7280;
              text-align: center;
            }

            @media print {
              body {
                padding: 18px;
              }
            }
          </style>
        </head>

        <body>
          <div class="header">
            <div>
              <div class="store-name">
                ${
                  store?.name ||
                  'PharmDesk Store'
                }
              </div>

              ${
                store?.address
                  ? `<div>${store.address}</div>`
                  : ''
              }

              ${
                store?.phone
                  ? `<div>Phone: ${store.phone}</div>`
                  : ''
              }

              ${
                store?.email
                  ? `<div>Email: ${store.email}</div>`
                  : ''
              }

              ${
                store?.gstin
                  ? `<div>GSTIN: ${store.gstin}</div>`
                  : ''
              }

              ${
                store?.drug_license_number
                  ? `<div>
                      Drug License:
                      ${store.drug_license_number}
                    </div>`
                  : ''
              }
            </div>

            <div class="order-title">
              <h1>PURCHASE ORDER</h1>

              <div class="order-meta">
                <div>
                  <strong>Order No:</strong>
                  ${
                    order.order_number ||
                    '—'
                  }
                </div>

                <div>
                  <strong>Date:</strong>
                  ${
                    order.order_date ||
                    '—'
                  }
                </div>

                <div>
                  <strong>Status:</strong>
                  ${
                    order.status ||
                    '—'
                  }
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">
              Supplier
            </div>

            <div class="supplier-box">
              <strong>
                ${
                  supplier.supplier_name ||
                  'Supplier'
                }
              </strong>

              ${
                supplier.contact_person
                  ? `<div>
                      Contact:
                      ${supplier.contact_person}
                    </div>`
                  : ''
              }

              ${
                supplier.phone
                  ? `<div>
                      Phone:
                      ${supplier.phone}
                    </div>`
                  : ''
              }

              ${
                supplier.email
                  ? `<div>
                      Email:
                      ${supplier.email}
                    </div>`
                  : ''
              }

              ${
                supplier.address
                  ? `<div>
                      Address:
                      ${supplier.address}
                    </div>`
                  : ''
              }

              ${
                supplier.gstin
                  ? `<div>
                      GSTIN:
                      ${supplier.gstin}
                    </div>`
                  : ''
              }

              ${
                supplier.drug_license_number
                  ? `<div>
                      Drug License:
                      ${supplier.drug_license_number}
                    </div>`
                  : ''
              }
            </div>
          </div>

          <div class="section">
            <div class="section-title">
              Ordered Products
            </div>

            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Dosage Form</th>
                  <th>Strength</th>
                  <th>Pack</th>
                  <th class="right">
                    Quantity
                  </th>
                </tr>
              </thead>

              <tbody>
                ${itemRows}
              </tbody>
            </table>
          </div>

          ${
            order.notes
              ? `
                <div class="section">
                  <div class="section-title">
                    Notes
                  </div>

                  <div class="notes">
                    ${order.notes}
                  </div>
                </div>
              `
              : ''
          }

          <div class="footer">
            This purchase order represents the
            quantity requested from the supplier.
            Actual received quantities are recorded
            separately during purchase/stock intake.
          </div>
        </body>
      </html>
    `)
  }


  const deleteOrder = async () => {
    if (!selectedOrder?.id) return

    const confirmed = window.confirm(
      `Delete purchase order ${selectedOrder.order_number || selectedOrder.id.slice(0, 8)}? This cannot be undone.`,
    )
    if (!confirmed) return

    setOrderError('')

    try {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('store_id', store.id)
        .eq('id', selectedOrder.id)

      if (error) throw error

      setRows((current) => current.filter((row) => row.id !== selectedOrder.id))
      setSelectedOrder(null)
    } catch (error) {
      console.error('Failed to delete purchase order:', error)
      setOrderError(error?.message || 'Unable to delete purchase order.')
    }
  }

  return (
    <>
      <PanelList title="Purchase Orders">
        {rows.length === 0 ? (
          <EmptyState text="No purchase orders yet." />
        ) : (
          <div className="record-list">
            {rows.map((row) => (
              <button
                type="button"
                className="record-row"
                key={row.id}
                onClick={() =>
                  openOrder(row.id)
                }
              >
                <div>
                  <strong>
                    {row.order_number ||
                      row.id.slice(0, 8)}
                  </strong>

                  <span>
                    {row.status}
                  </span>
                </div>

                <strong>
                  {money(
                    row.total_amount,
                  )}
                </strong>
              </button>
            ))}
          </div>
        )}
      </PanelList>

      {selectedOrder && (
        <Modal
          title={
            selectedOrder.order_number ||
            'Purchase Order'
          }
          onClose={() =>
            setSelectedOrder(null)
          }
        >
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={
                exportOrderPdf
              }
            >
              Export PDF
            </button>

            <button
              type="button"
              className="danger-button"
              onClick={deleteOrder}
            >
              Delete Order
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedOrder(null)
              }
            >
              Close
            </button>
          </div>

          <div className="detail-stack">
            <div>
              <strong>
                Supplier
              </strong>

              <div>
                {
                  selectedOrder
                    .supplier
                    ?.supplier_name ||
                  '—'
                }
              </div>
            </div>

            <div>
              <strong>
                Order Date
              </strong>

              <div>
                {
                  selectedOrder.order_date ||
                  '—'
                }
              </div>
            </div>

            <div>
              <strong>
                Status
              </strong>

              <div>
                {
                  selectedOrder.status ||
                  '—'
                }
              </div>
            </div>

            <div>
              <strong>
                Products
              </strong>

              <div className="record-list">
                {(
                  selectedOrder.items ||
                  []
                ).map((item) => (
                  <div
                    className="record-row static"
                    key={item.id}
                  >
                    <div>
                      <strong>
                        {
                          item.product
                            ?.product_name ||
                          'Product'
                        }
                      </strong>

                      <span>
                        {
                          item.product
                            ?.generic_display_name ||
                          ''
                        }
                      </span>
                    </div>

                    <strong>
                      Qty:{' '}
                      {item.quantity ||
                        0}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {selectedOrder.notes && (
              <div>
                <strong>
                  Notes
                </strong>

                <div>
                  {selectedOrder.notes}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {pdfPreviewHtml && (
        <Modal
          title="Purchase Order PDF Preview"
          onClose={() => setPdfPreviewHtml('')}
        >
          <div className="button-row" style={{ marginBottom: '12px' }}>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const frame = pdfFrameRef.current
                if (frame?.contentWindow) {
                  frame.contentWindow.focus()
                  frame.contentWindow.print()
                }
              }}
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPdfPreviewHtml('')}
            >
              Close
            </button>
          </div>
          <iframe
            ref={pdfFrameRef}
            title="Purchase order PDF preview"
            srcDoc={pdfPreviewHtml}
            style={{ width: '100%', minHeight: '70vh', border: '1px solid #d1d5db', borderRadius: '10px', background: '#fff' }}
          />
        </Modal>
      )}

      {orderLoading && (
        <Modal
          title="Loading Purchase Order"
          onClose={() => {}}
        >
          <p>
            Loading purchase order
            details...
          </p>
        </Modal>
      )}

      {orderError && (
        <div className="error-message">
          {orderError}
        </div>
      )}
    </>
  )
}
  


function InventoryModule({  
  store,  
}) {  
  const [tab, setTab] =  
    useState('Products')  
  
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
        <ProductsInventory  
          store={store}  
        />  
      )}  
  
      {tab === 'Batches' && (  
        <BatchesInventory  
          store={store}  
        />  
      )}  
  
      {tab === 'Expiry' && (  
        <ExpiryInventory  
          store={store}  
        />  
      )}  
  
      {tab === 'Low Stock' && (  
        <LowStockInventory  
          store={store}  
        />  
      )}  
  
      {tab === 'Dead Stock' && (  
        <DeadStockInventory  
          store={store}  
        />  
      )}  
  
      {tab ===  
        'Stock Reconciliation' && (  
        <StockReconciliation  
          store={store}  
        />  
      )}  
    </div>  
  )  
}  
  
function ProductsInventory({  
  store,  
}) {  
  const [rows, setRows] =  
    useState([])  
  const [query, setQuery] =  
    useState('')  
  const [editing, setEditing] =  
    useState(null)  
  
  const load = async () => {  
    const { data } =  
      await pharmdeskDb  
        .from(  
          'store_products',  
        )  
        .select(`  
          *,  
          products (  
            *  
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
  
    setRows(data || [])  
  }  
  
  useEffect(() => {  
    if (store?.id) load()  
  }, [store?.id])  
  
  const filtered =  
    rows.filter((row) =>  
      matchesSearch(  
        query,  
        row.products  
          ?.product_name,  
        row.products  
          ?.generic_display_name,  
        row.products  
          ?.manufacturer,  
        row.products  
          ?.strength_display,  
      ),  
    )  
  
  return (  
    <PanelList title="Products">  
      <div className="search-row">  
        <input  
          placeholder="Search product"  
          value={query}  
          onChange={(e) =>  
            setQuery(  
              e.target.value,  
            )  
          }  
        />  
  
        <button  
          className="primary-button"  
          onClick={() =>  
            setEditing({})  
          }  
        >  
          + Product  
        </button>  
      </div>  
  
      <div className="record-list">  
        {filtered.map(  
          (row) => (  
            <div  
              className="record-row static"  
              key={row.id}  
            >  
              <div>  
                <strong>  
                  {  
                    row.products  
                      ?.product_name  
                  }  
                </strong>  
  
                <span>  
                  {row.products  
                    ?.generic_display_name ||  
                    row.products  
                      ?.manufacturer ||  
                    '—'}  
                </span>  
              </div>  
  
              <div className="record-right">  
                <span>  
                  Discount:{' '}  
                  {  
                    row.default_discount_percent ||  
                    0  
                  }  
                  %  
                </span>  
  
                <strong>  
                  {money(  
                    row.default_selling_price,  
                  )}  
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
                      minimum_stock:  
                        row.minimum_stock,  
                      reorder_level:  
                        row.reorder_level,  
                    })  
                  }  
                >  
                  Edit  
                </button>  
              </div>  
            </div>  
          ),  
        )}  
      </div>  
  
      {editing !== null && (  
        <ProductModal  
          store={store}  
          product={  
            editing.id  
              ? editing  
              : null  
          }  
          onClose={() =>  
            setEditing(null)  
          }  
          onCreated={() => {  
            setEditing(null)  
            load()  
          }}  
        />  
      )}  
    </PanelList>  
  )  
}  
  
function BatchesInventory({  
  store,  
}) {  
  const [rows, setRows] =  
    useState([])  
  const [query, setQuery] =  
    useState('')  
  
  useEffect(() => {  
    if (!store?.id) return  
  
    pharmdeskDb  
      .from('batches')  
      .select(`  
        *,  
        products (  
          product_name,  
          generic_display_name,  
          manufacturer,  
          strength_display  
        )  
      `)  
      .eq(  
        'store_id',  
        store.id,  
      )  
      .order(  
        'expiry_date',  
      )  
      .then(({ data }) =>  
        setRows(  
          data || [],  
        ),  
      )  
  }, [store?.id])  
  
  const filtered =  
    rows.filter((row) =>  
      matchesSearch(  
        query,  
        row.batch_number,  
        row.products?.product_name,  
        row.products?.generic_display_name,  
        row.products?.manufacturer,  
        row.products?.strength_display,  
        dateText(row.expiry_date),  
      ),  
    )  
  
  return (  
    <PanelList title="Batches">  
      <div className="search-row">  
        <input  
          placeholder="Search product, batch number, manufacturer or expiry"  
          value={query}  
          onChange={(e) =>  
            setQuery(e.target.value)  
          }  
        />  
      </div>  

      <div className="record-list">  
        {filtered.map(  
          (row) => (  
            <div  
              className="record-row static"  
              key={row.id}  
            >  
              <div>  
                <strong>  
                  {  
                    row.products  
                      ?.product_name ||  
                    'Product'  
                  }  
                </strong>  
  
                <span>  
                  Batch{' '}  
                  {  
                    row.batch_number  
                  }{' '}  
                  • Exp{' '}  
                  {dateText(  
                    row.expiry_date,  
                  )}  
                </span>  
              </div>  
  
              <div className="record-right">  
                <span>  
                  Stock  
                </span>  
  
                <strong>  
                  {  
                    row.current_stock_units  
                  }  
                </strong>  
              </div>  
            </div>  
          ),  
        )}  
      </div>  
    </PanelList>  
  )  
}  
  
function ExpiryInventory({  
  store,  
}) {  
  const [rows, setRows] =  
    useState([])  
  const [query, setQuery] =  
    useState('')  
  
  useEffect(() => {  
    if (!store?.id) return  
  
    const limit =  
      new Date()  
  
    limit.setDate(  
      limit.getDate() +  
        90,  
    )  
  
    pharmdeskDb  
      .from('batches')  
      .select(`  
        *,  
        products (  
          product_name,  
          generic_display_name,  
          manufacturer,  
          strength_display  
        )  
      `)  
      .eq(  
        'store_id',  
        store.id,  
      )  
      .gt(  
        'current_stock_units',  
        0,  
      )  
      .lte(  
        'expiry_date',  
        limit  
          .toISOString()  
          .slice(  
            0,  
            10,  
          ),  
      )  
      .order(  
        'expiry_date',  
      )  
      .then(({ data }) =>  
        setRows(  
          data || [],  
        ),  
      )  
  }, [store?.id])  
  
  const filtered =  
    rows.filter((row) =>  
      matchesSearch(  
        query,  
        row.batch_number,  
        row.products?.product_name,  
        row.products?.generic_display_name,  
        row.products?.manufacturer,  
        row.products?.strength_display,  
        dateText(row.expiry_date),  
      ),  
    )  
  
  return (  
    <PanelList title="Expiry">  
      <div className="search-row">  
        <input  
          placeholder="Search product, batch number, manufacturer or expiry"  
          value={query}  
          onChange={(e) =>  
            setQuery(e.target.value)  
          }  
        />  
      </div>  

      <div className="record-list">  
        {filtered.map(  
          (row) => (  
            <div  
              className="record-row static"  
              key={row.id}  
            >  
              <div>  
                <strong>  
                  {  
                    row.products  
                      ?.product_name  
                  }  
                </strong>  
  
                <span>  
                  Batch{' '}  
                  {  
                    row.batch_number  
                  }  
                </span>  
              </div>  
  
              <div className="record-right">  
                <span>  
                  {dateText(  
                    row.expiry_date,  
                  )}  
                </span>  
  
                <strong>  
                  {  
                    row.current_stock_units  
                  }  
                </strong>  
              </div>  
            </div>  
          ),  
        )}  
      </div>  
    </PanelList>  
  )  
}  
  
function LowStockInventory({  
  store,  
}) {  
  const [rows, setRows] =  
    useState([])  
  const [query, setQuery] =  
    useState('')  
  
  useEffect(() => {  
    if (!store?.id) return  
  
    const load =  
      async () => {  
        const { data } =  
          await pharmdeskDb  
            .from(  
              'store_products',  
            )  
            .select(`  
              *,  
              products (  
                product_name  
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
  
        const result =  
          []  
  
        for (const row of  
          data || []) {  
          const {  
            data: batches,  
          } =  
            await pharmdeskDb  
              .from(  
                'batches',  
              )  
              .select(  
                'current_stock_units',  
              )  
              .eq(  
                'store_id',  
                store.id,  
              )  
              .eq(  
                'product_id',  
                row.product_id,  
              )  
              .eq(  
                'is_active',  
                true,  
              )  
  
          const stock =  
            sum(  
              (  
                batches ||  
                []  
              ).map(  
                (x) =>  
                  x.current_stock_units,  
              ),  
            )  
  
          if (  
            stock <=  
            safeNumber(  
              row.minimum_stock,  
            )  
          ) {  
            result.push({  
              ...row,  
              stock,  
            })  
          }  
        }  
  
        setRows(  
          result,  
        )  
      }  
  
    load()  
  }, [store?.id])  
  
  const filtered =  
    rows.filter((row) =>  
      matchesSearch(  
        query,  
        row.products?.product_name,  
        row.products?.generic_display_name,  
        row.products?.manufacturer,  
        row.products?.strength_display,  
        row.minimum_stock,  
        row.stock,  
      ),  
    )  
  
  return (  
    <PanelList title="Low Stock">  
      <div className="search-row">  
        <input  
          placeholder="Search product, manufacturer or stock"  
          value={query}  
          onChange={(e) =>  
            setQuery(e.target.value)  
          }  
        />  
      </div>  

      {filtered.length ===  
      0 ? (  
        <EmptyState text="No products currently below minimum stock." />  
      ) : (  
        <div className="record-list">  
          {filtered.map(  
            (row) => (  
              <div  
                className="record-row static"  
                key={row.id}  
              >  
                <div>  
                  <strong>  
                    {  
                      row.products  
                        ?.product_name  
                    }  
                  </strong>  
  
                  <span>  
                    Minimum{' '}  
                    {  
                      row.minimum_stock  
                    }  
                  </span>  
                </div>  
  
                <strong>  
                  {row.stock}  
                </strong>  
              </div>  
            ),  
          )}  
        </div>  
      )}  
    </PanelList>  
  )  
}  
  
function DeadStockInventory({  
  store,  
}) {  
  const [rows, setRows] =  
    useState([])  
  const [query, setQuery] =  
    useState('')  
  
  useEffect(() => {  
    if (!store?.id) return  
  
    pharmdeskDb  
      .from(  
        'stock_risk_snapshots',  
      )  
      .select('*')  
      .eq(  
        'store_id',  
        store.id,  
      )  
      .eq(  
        'risk_type',  
        'dead_stock',  
      )  
      .order(  
        'created_at',  
        {  
          ascending: false,  
        },  
      )  
      .then(({ data }) =>  
        setRows(  
          data || [],  
        ),  
      )  
  }, [store?.id])  
  
  const filtered =  
    rows.filter((row) =>  
      matchesSearch(  
        query,  
        row.product_name,  
        row.product_id,  
        row.current_stock_units,  
        row.created_at,  
      ),  
    )  
  
  return (  
    <PanelList title="Dead Stock">  
      <div className="search-row">  
        <input  
          placeholder="Search dead stock"  
          value={query}  
          onChange={(e) =>  
            setQuery(e.target.value)  
          }  
        />  
      </div>  

      {filtered.length ===  
      0 ? (  
        <EmptyState text="No dead-stock snapshots available." />  
      ) : (  
        <div className="record-list">  
          {filtered.map(  
            (row) => (  
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
                    {dateText(  
                      row.created_at,  
                    )}  
                  </span>  
                </div>  
  
                <span>  
                  {  
                    row.current_stock_units  
                  }  
                </span>  
              </div>  
            ),  
          )}  
        </div>  
      )}  
    </PanelList>  
  )  
}  
  
function StockReconciliation({
  store,
}) {
  const [batches, setBatches] =
    useState([])
  const [selectedProductId, setSelectedProductId] =
    useState('')
  const [productQuery, setProductQuery] =
    useState('')
  const [selectedBatch, setSelectedBatch] =
    useState('')
  const [batchQuery, setBatchQuery] =
    useState('')
  const [physical, setPhysical] =
    useState('')
  const [adjustmentSign, setAdjustmentSign] =
    useState(1)
  const [message, setMessage] =
    useState('')

  useEffect(() => {
    if (!store?.id) return

    pharmdeskDb
      .from('batches')
      .select(`
        *,
        products (
          product_name
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
      .then(({ data }) =>
        setBatches(
          data || [],
        ),
      )
  }, [store?.id])

  const selected =
    batches.find(
      (x) =>
        x.id ===
        selectedBatch,
    )

  const productOptions = useMemo(() => {
    const byId = new Map()

    batches.forEach((batch) => {
      const productId = batch.product_id
      if (!productId) return

      if (!byId.has(productId)) {
        byId.set(productId, {
          id: productId,
          product_name:
            batch.products?.product_name || 'Product',
        })
      }
    })

    return Array.from(byId.values())
  }, [batches])

  const productSuggestions = useMemo(() => {
    const q = String(productQuery || '').trim()
    if (!q || selectedProductId) return []

    return productOptions
      .map((product) => ({
        product,
        score: fuzzyScore(
          q,
          product.product_name,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.product)
  }, [productQuery, productOptions, selectedProductId])

  const productBatches = useMemo(() => {
    if (!selectedProductId) return []

    return batches.filter(
      (batch) =>
        batch.product_id ===
        selectedProductId,
    )
  }, [batches, selectedProductId])

  const batchSuggestions = useMemo(() => {
    const q = String(batchQuery || '').trim()

    return productBatches
      .map((batch) => ({
        batch,
        score: q
          ? fuzzyScore(
              q,
              [
                batch.batch_number,
                dateText(batch.expiry_date),
                batch.current_stock_units,
              ]
                .filter(Boolean)
                .join(' '),
            )
          : 1,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.batch)
  }, [batchQuery, productBatches])

  const selectProduct = (product) => {
    setSelectedProductId(product.id)
    setProductQuery(product.product_name || '')
    setSelectedBatch('')
    setBatchQuery('')
    setPhysical('')
    setAdjustmentSign(1)
    setMessage('')
  }

  const selectBatch = (batch) => {
    setSelectedBatch(batch.id)
    setBatchQuery(batch.batch_number || '')
    setPhysical('')
    setAdjustmentSign(1)
    setMessage('')
  }

  const save = async () => {
    setMessage('')

    if (!selectedProductId) {
      setMessage(
        'Select a product.',
      )
      return
    }

    if (!selected) {
      setMessage(
        'Select a batch.',
      )
      return
    }

    const systemStock = safeNumber(
      selected.current_stock_units,
    )

    const adjustmentNumber =
      Number(physical)

    if (
      !Number.isFinite(
        adjustmentNumber,
      ) ||
      adjustmentNumber < 0
    ) {
      setMessage(
        'Enter a valid stock adjustment.',
      )
      return
    }

    const difference =
      adjustmentSign * adjustmentNumber

    const physicalNumber =
      systemStock + difference

    if (physicalNumber < 0) {
      setMessage(
        'Minus adjustment cannot reduce stock below 0.',
      )
      return
    }

    const { error } =
      await pharmdeskDb.rpc(
        'pharmdesk_reconcile_stock',
        {
          p_store_id: store.id,
          p_batch_id: selected.id,
          p_physical_stock_units: physicalNumber,
          p_reason:
            difference > 0
              ? 'Physical stock found above system stock'
              : difference < 0
                ? 'Physical stock below system stock'
                : 'No stock difference',
        },
      )

    if (error) {
      setMessage(
        error.message,
      )
      return
    }

    setMessage(
      `Reconciliation recorded. Difference: ${difference}`,
    )
  }

  return (
    <PanelList title="Stock Reconciliation">
      <label>
        Product
        <div style={{ position: 'relative' }}>
          <input
            placeholder="Type product name..."
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value)
              setSelectedProductId('')
              setSelectedBatch('')
              setBatchQuery('')
              setPhysical('')
              setMessage('')
            }}
          />

          {productQuery && !selectedProductId && productSuggestions.length > 0 && (
            <div
              className="suggestion-list"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '100%',
                zIndex: 20,
              }}
            >
              {productSuggestions.map((product) => (
                <button
                  type="button"
                  className="suggestion"
                  key={product.id}
                  onClick={() =>
                    selectProduct(product)
                  }
                >
                  <strong>
                    {product.product_name}
                  </strong>
                </button>
              ))}
            </div>
          )}
        </div>
      </label>

      {selectedProductId && (
        <label>
          Batch
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Select or type batch number..."
              value={batchQuery}
              onChange={(e) => {
                setBatchQuery(e.target.value)
                setSelectedBatch('')
                setPhysical('')
                setMessage('')
              }}
            />

            {!selectedBatch && batchSuggestions.length > 0 && (
              <div
                className="suggestion-list"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '100%',
                  zIndex: 20,
                }}
              >
                {batchSuggestions.map((batch) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={batch.id}
                    onClick={() =>
                      selectBatch(batch)
                    }
                  >
                    <strong>
                      {batch.batch_number || 'Batch'}
                    </strong>
                    <span>
                      Stock {batch.current_stock_units ?? 0}
                      {' • '}
                      Exp {dateText(batch.expiry_date)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>
      )}

      {selected && (
        <div className="info-box">
          System stock:{' '}
          {selected.current_stock_units ?? 0}
        </div>
      )}

      {selected && (
        <div>
          <label>Stock difference</label>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 6,
            }}
          >
            <button
              type="button"
              className={
                adjustmentSign === 1
                  ? 'primary-button'
                  : 'secondary-button'
              }
              onClick={() => setAdjustmentSign(1)}
              style={{
                minWidth: 46,
                padding: '8px 12px',
              }}
            >
              +
            </button>
            <button
              type="button"
              className={
                adjustmentSign === -1
                  ? 'primary-button'
                  : 'secondary-button'
              }
              onClick={() => setAdjustmentSign(-1)}
              style={{
                minWidth: 46,
                padding: '8px 12px',
              }}
            >
              −
            </button>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Enter difference"
              value={physical}
              onChange={(e) => setPhysical(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <div
            className="muted"
            style={{ marginTop: 6 }}
          >
            Adjustment: {adjustmentSign === 1 ? '+' : '−'}
            {safeNumber(physical) || 0}
            {' · '}
            Physical stock after reconciliation: {
              safeNumber(selected.current_stock_units) +
              adjustmentSign *
                (safeNumber(physical) || 0)
            }
          </div>
        </div>
      )}

      {message && (
        <div className="message-box">
          {message}
        </div>
      )}

      <button
        className="primary-button"
        onClick={save}
      >
        Record Reconciliation
      </button>

      <p className="muted">
        This records the reconciliation
        event. Actual stock adjustment
        should be performed through the
        dedicated backend stock-adjustment
        operation.
      </p>
    </PanelList>
  )
}

/* =========================================================  
   CUSTOMERS  
========================================================= */  
  
function CustomersModule({
  store,
}) {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [history, setHistory] = useState(null)
  const [editing, setEditing] = useState(null)
  const [settlementCustomer, setSettlementCustomer] = useState(null)
  const [creditByCustomer, setCreditByCustomer] = useState({})

  const load = async () => {
    const { data } = await pharmdeskDb
      .from('customers')
      .select('*')
      .eq('store_id', store.id)
      .order('name')

    const customers = data || []
    setRows(customers)

    // Customer credit is authoritative at the account level.
    // Do not derive this from sales.amount_due because account-settlement
    // payments are recorded in customer_credit_transactions.
    const { data: creditRows, error: creditError } = await pharmdeskDb.rpc(
      'pharmdesk_customer_credit_report',
      { p_store_id: store.id },
    )

    if (!creditError) {
      const creditMap = {}
      ;(creditRows || []).forEach((row) => {
        const due = safeNumber(row.outstanding_credit)
        if (due <= 0.009) return
        creditMap[row.customer_id] = due
      })
      setCreditByCustomer(creditMap)
    } else {
      setCreditByCustomer({})
    }
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
        subtitle="Customer records, purchase history and outstanding credit"
      />

      <PanelList title="Customers">
        <div className="search-row">
          <input
            placeholder="Search customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="primary-button"
            onClick={() => setModal(true)}
          >
            + Customer
          </button>
        </div>

        <div className="record-list">
          {filtered.map((customer) => {
            const outstanding = creditByCustomer[customer.id] || 0
            return (
              <div className="record-row static" key={customer.id}>
                <div>
                  <button
                    type="button"
                    onClick={() => setHistory(customer)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      margin: 0,
                      font: 'inherit',
                      fontWeight: 700,
                      color: '#0a5bd3',
                      textAlign: 'left',
                      textDecoration: 'underline',
                      textUnderlineOffset: '3px',
                      cursor: 'pointer',
                    }}
                    title="Open customer account"
                  >
                    {customer.name || 'Walk-in Customer'}
                  </button>
                  <span>{customer.phone || '—'}</span>
                  {customer.referred_doctor_name && (
                    <span>Dr. {customer.referred_doctor_name}</span>
                  )}
                  {outstanding > 0 && (
                    <span>Outstanding credit: {money(outstanding)}</span>
                  )}
                </div>
                <div className="record-right">
                  {outstanding > 0.009 ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 10px',
                        borderRadius: 999,
                        background: '#fee2e2',
                        color: '#b91c1c',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Outstanding {money(outstanding)}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 10px',
                        borderRadius: 999,
                        background: '#dcfce7',
                        color: '#166534',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Paid / Cleared
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </PanelList>

      {(modal || editing) && (
        <CustomerModal
          store={store}
          customer={editing}
          onClose={() => {
            setModal(false)
            setEditing(null)
          }}
          onCreated={(customer) => {
            setRows((current) =>
              editing
                ? current.map((x) => (x.id === customer.id ? customer : x))
                : [customer, ...current],
            )
            setModal(false)
            setEditing(null)
          }}
        />
      )}

      {history && (
        <CustomerHistoryModal
          store={store}
          customer={history}
          onClose={() => setHistory(null)}
          onEdit={(customer) => {
            setHistory(null)
            setEditing(customer)
          }}
          onSettle={(customer) => {
            setHistory(null)
            setSettlementCustomer(customer)
          }}
        />
      )}

      {settlementCustomer && (
        <CustomerSettlementModal
          store={store}
          customer={settlementCustomer}
          onClose={() => setSettlementCustomer(null)}
          onSettled={async () => {
            await load()
          }}
        />
      )}
    </div>
  )
}

/* =========================================================  
   REPORTS  
========================================================= */  
  
function Reports({  
  store,  
}) {  
  const [tab, setTab] =  
    useState('Overview')  
  
  const [from, setFrom] =  
    useState(todayISO())  
  const [to, setTo] =  
    useState(todayISO())  
  
  const [data, setData] =  
    useState({  
      sales: [],  
      saleItems: [],  
      payments: [],  
      purchases: [],  
      purchaseItems: [],  
      customers: [],  
      suppliers: [],  
      products: [],  
    })  
  
  const [loading, setLoading] =  
    useState(false)  
  const [error, setError] =  
    useState('')  
  
  const load = async () => {  
    if (!store?.id) return  
  
    setLoading(true)  
    setError('')  
  
    try {  
      const [  
        salesResult,  
        purchaseResult,  
        customerResult,  
        supplierResult,  
        productResult,  
      ] = await Promise.all([  
        pharmdeskDb  
          .from('sales')  
          .select(`  
            *,  
            customers (  
              id,  
              name,  
              phone  
            ),  
            sale_items (  
              *,  
              products (  
                id,  
                product_name,  
                generic_display_name,  
                manufacturer  
              )  
            ),  
            sale_payments (  
              id,  
              payment_method,  
              amount  
            )  
          `)  
          .eq(  
            'store_id',  
            store.id,  
          )  
          .in(  
            'status',  
            [  
              'completed',  
              'returned',  
            ],  
          )  
          .gte(  
            'bill_datetime',  
            `${from}T00:00:00`,  
          )  
          .lte(  
            'bill_datetime',  
            `${to}T23:59:59`,  
          )  
          .order(  
            'bill_datetime',  
            {  
              ascending: false,  
            },  
          )  
          .limit(5000),  
  
        pharmdeskDb  
          .from(  
            'purchase_invoices',  
          )  
          .select(`  
            *,  
            suppliers (  
              *  
            ),  
            purchase_items (  
              *,  
              products (  
                id,  
                product_name,  
                generic_display_name,  
                manufacturer  
              ),  
              batches (  
                batch_number,  
                expiry_date  
              )  
            )  
          `)  
          .eq(  
            'store_id',  
            store.id,  
          )  
          .gte(  
            'invoice_date',  
            from,  
          )  
          .lte(  
            'invoice_date',  
            to,  
          )  
          .order(  
            'invoice_date',  
            {  
              ascending: false,  
            },  
          )  
          .limit(5000),  
  
        pharmdeskDb  
          .from('customers')  
          .select('*')  
          .eq(  
            'store_id',  
            store.id,  
          )  
          .order('name'),  
  
        pharmdeskDb  
          .from('suppliers')  
          .select('*')  
          .eq(  
            'store_id',  
            store.id,  
          )  
          .order(  
            'supplier_name',  
          ),  
  
        pharmdeskDb  
          .from(  
            'store_products',  
          )  
          .select(`  
            *,  
            products (  
              *  
            )  
          `)  
          .eq(  
            'store_id',  
            store.id,  
          )  
          .eq(  
            'is_active',  
            true,  
          ),  
      ])  
  
      if (salesResult.error)  
        throw salesResult.error  
  
      if (  
        purchaseResult.error  
      )  
        throw purchaseResult.error  
  
      if (  
        customerResult.error  
      )  
        throw customerResult.error  
  
      if (  
        supplierResult.error  
      )  
        throw supplierResult.error  
  
      if (  
        productResult.error  
      )  
        throw productResult.error  
  
      const sales =  
        salesResult.data || []  
  
      const purchases =  
        purchaseResult.data || []  
  
      setData({  
        sales,  
        saleItems: sales.flatMap(  
          (x) =>  
            x.sale_items || [],  
        ),  
        payments: sales.flatMap(  
          (x) =>  
            x.sale_payments ||  
            [],  
        ),  
        purchases,  
        purchaseItems:  
          purchases.flatMap(  
            (x) =>  
              x.purchase_items ||  
              [],  
          ),  
        customers:  
          customerResult.data ||  
          [],  
        suppliers:  
          supplierResult.data ||  
          [],  
        products:  
          productResult.data ||  
          [],  
      })  
    } catch (err) {  
      setError(  
        err.message ||  
          'Unable to load reports.',  
      )  
    } finally {  
      setLoading(false)  
    }  
  }  
  
  useEffect(() => {  
    if (store?.id) load()  
  }, [store?.id])  
  
  const salesTotal = sum(  
    data.sales.map(  
      (x) => x.grand_total,  
    ),  
  )  
  
  const purchaseTotal = sum(  
    data.purchases.map(  
      (x) => x.total_amount,  
    ),  
  )  
  
  const salesGST = sum(  
    data.sales.map(  
      (x) =>  
        safeNumber(  
          x.cgst_amount,  
        ) +  
        safeNumber(  
          x.sgst_amount,  
        ) +  
        safeNumber(  
          x.igst_amount,  
        ),  
    ),  
  )  
  
  const purchaseGST = sum(  
    data.purchases.map(  
      (x) =>  
        safeNumber(  
          x.cgst_amount,  
        ) +  
        safeNumber(  
          x.sgst_amount,  
        ) +  
        safeNumber(  
          x.igst_amount,  
        ),  
    ),  
  )  
  
  return (  
    <div>  
      <ModuleHeader  
        title="Reports"  
        subtitle="Sales, purchases, customers, suppliers and product details"  
      />  
  
      <PanelList title="Report Period">  
        <div className="inline-fields">  
          <label>  
            From  
            <input  
              type="date"  
              value={from}  
              onChange={(e) =>  
                setFrom(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            To  
            <input  
              type="date"  
              value={to}  
              onChange={(e) =>  
                setTo(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <button  
            className="primary-button"  
            onClick={load}  
          >  
            {loading  
              ? 'Loading…'  
              : 'Refresh Reports'}  
          </button>  
        </div>  
  
        {error && (  
          <div className="error-box">  
            {error}  
          </div>  
        )}  
      </PanelList>  
  
      <TabBar  
        tabs={REPORT_TABS}  
        active={tab}  
        onChange={setTab}  
      />  
  
      {tab === 'Overview' && (  
        <ReportsOverview  
          data={data}  
          salesTotal={salesTotal}  
          purchaseTotal={  
            purchaseTotal  
          }  
          salesGST={salesGST}  
          purchaseGST={  
            purchaseGST  
          }  
        />  
      )}  
  
      {tab === 'Sales' && (  
        <SalesReport  
          sales={data.sales}  
        />  
      )}  
  
      {tab === 'Purchases' && (  
        <PurchaseReport  
          purchases={  
            data.purchases  
          }  
        />  
      )}  
  
      {tab === 'Customers' && (  
        <CustomerReport  
          sales={data.sales}  
          customers={  
            data.customers  
          }  
        />  
      )}  
  
      {tab === 'Suppliers' && (  
        <SupplierReport  
          purchases={  
            data.purchases  
          }  
          suppliers={  
            data.suppliers  
          }  
        />  
      )}  
  
      {tab === 'Products' && (  
        <ProductReport  
          saleItems={  
            data.saleItems  
          }  
          purchaseItems={  
            data.purchaseItems  
          }  
        />  
      )}  
    </div>  
  )  
}  
  
function ReportsOverview({  
  data,  
  salesTotal,  
  purchaseTotal,  
  salesGST,  
  purchaseGST,  
}) {  
  const paymentMap =  
    new Map()  
  
  for (const payment of data.payments) {  
    paymentMap.set(  
      payment.payment_method,  
      safeNumber(  
        paymentMap.get(  
          payment.payment_method,  
        ),  
      ) +  
        safeNumber(  
          payment.amount,  
        ),  
    )  
  }  
  
  const customerMap =  
    new Map()  
  
  for (const sale of data.sales) {  
    const key =  
      sale.customer_id ||  
      'walk_in'  
  
    customerMap.set(  
      key,  
      safeNumber(  
        customerMap.get(key),  
      ) +  
        safeNumber(  
          sale.grand_total,  
        ),  
    )  
  }  
  
  const supplierMap =  
    new Map()  
  
  for (const invoice of data.purchases) {  
    const key =  
      invoice.supplier_id ||  
      'unknown'  
  
    supplierMap.set(  
      key,  
      safeNumber(  
        supplierMap.get(key),  
      ) +  
        safeNumber(  
          invoice.total_amount,  
        ),  
    )  
  }  
  
  return (  
    <>  
      <div className="stats-grid">  
        <StatCard  
          title="Sales"  
          value={money(  
            salesTotal,  
          )}  
        />  
  
        <StatCard  
          title="Purchases"  
          value={money(  
            purchaseTotal,  
          )}  
        />  
  
        <StatCard  
          title="Sales GST"  
          value={money(  
            salesGST,  
          )}  
        />  
  
        <StatCard  
          title="Purchase GST"  
          value={money(  
            purchaseGST,  
          )}  
        />  
  
        <StatCard  
          title="Sales Bills"  
          value={  
            data.sales.length  
          }  
        />  
  
        <StatCard  
          title="Purchase Invoices"  
          value={  
            data.purchases.length  
          }  
        />  
      </div>  
  
      <PanelList title="Payment Summary">  
        <div className="record-list">  
          {Array.from(  
            paymentMap.entries(),  
          ).map(  
            ([method, amount]) => (  
              <div  
                className="record-row static"  
                key={method}  
              >  
                <span>  
                  {paymentLabel(  
                    method,  
                  )}  
                </span>  
  
                <strong>  
                  {money(amount)}  
                </strong>  
              </div>  
            ),  
          )}  
        </div>  
      </PanelList>  
  
      <PanelList title="Customer Sales Summary">  
        <div className="record-list">  
          {Array.from(  
            customerMap.entries(),  
          )  
            .sort(  
              (a, b) =>  
                b[1] - a[1],  
            )  
            .slice(0, 20)  
            .map(  
              ([customerId, amount]) => {  
                const customer =  
                  data.customers.find(  
                    (x) =>  
                      x.id ===  
                      customerId,  
                  )  
  
                return (  
                  <div  
                    className="record-row static"  
                    key={customerId}  
                  >  
                    <div>  
                      <strong>  
                        {customer  
                          ?.name ||  
                          'Walk-in Customers'}  
                      </strong>  
  
                      <span>  
                        {  
                          customer?.phone ||  
                          ''  
                        }  
                      </span>  
                    </div>  
  
                    <strong>  
                      {money(  
                        amount,  
                      )}  
                    </strong>  
                  </div>  
                )  
              },  
            )}  
        </div>  
      </PanelList>  
  
      <PanelList title="Supplier Purchase Summary">  
        <div className="record-list">  
          {Array.from(  
            supplierMap.entries(),  
          )  
            .sort(  
              (a, b) =>  
                b[1] - a[1],  
            )  
            .slice(0, 20)  
            .map(  
              ([supplierId, amount]) => {  
                const supplier =  
                  data.suppliers.find(  
                    (x) =>  
                      x.id ===  
                      supplierId,  
                  )  
  
                return (  
                  <div  
                    className="record-row static"  
                    key={supplierId}  
                  >  
                    <div>  
                      <strong>  
                        {supplier  
                          ?.supplier_name ||  
                          'Supplier'}  
                      </strong>  
  
                      <span>  
                        {supplier?.gstin ||  
                          ''}  
                      </span>  
                    </div>  
  
                    <strong>  
                      {money(  
                        amount,  
                      )}  
                    </strong>  
                  </div>  
                )  
              },  
            )}  
        </div>  
      </PanelList>  
    </>  
  )  
}  
  
function SalesReport({  
  sales,  
}) {  
  const [selected, setSelected] =  
    useState(null)  
  
  const itemCount = sum(  
    sales.flatMap(  
      (sale) =>  
        (sale.sale_items ||  
          []).map(  
            (item) =>  
              item.quantity_units ||  
              item.quantity_entered,  
          ),  
    ),  
  )  
  
  const totalDiscount = sum(  
    sales.map(  
      (sale) =>  
        safeNumber(  
          sale.item_discount_total,  
        ) +  
        safeNumber(  
          sale.bill_discount_amount,  
        ),  
    ),  
  )  
  
  return (  
    <>  
      <div className="stats-grid">  
        <StatCard  
          title="Bills"  
          value={sales.length}  
        />  
  
        <StatCard  
          title="Sales"  
          value={money(  
            sum(  
              sales.map(  
                (x) =>  
                  x.grand_total,  
              ),  
            ),  
          )}  
        />  
  
        <StatCard  
          title="Discounts"  
          value={money(  
            totalDiscount,  
          )}  
        />  
  
        <StatCard  
          title="Items Sold"  
          value={itemCount}  
        />  
      </div>  
  
      <PanelList title="Detailed Sales">  
        <div className="record-list">  
          {sales.map((sale) => (  
            <button  
              className="record-row"  
              key={sale.id}  
              onClick={() =>  
                setSelected(  
                  sale,  
                )  
              }  
            >  
              <div>  
                <strong>  
                  {  
                    sale.invoice_number ||  
                    'Bill'  
                  }  
                </strong>  
  
                <span>  
                  {dateTimeText(  
                    sale.bill_datetime,  
                  )}{' '}  
                  •{' '}  
                  {sale.customers  
                    ?.name ||  
                    'Walk-in Customer'}  
                </span>  
              </div>  
  
              <div className="record-right">  
                <span>  
                  {sale.status}  
                </span>  
  
                <strong>  
                  {money(  
                    sale.grand_total,  
                  )}  
                </strong>  
              </div>  
            </button>  
          ))}  
        </div>  
      </PanelList>  
  
      {selected && (  
        <ReportSaleDetail  
          sale={selected}  
          onClose={() =>  
            setSelected(null)  
          }  
        />  
      )}  
    </>  
  )  
}  
  
function ReportSaleDetail({  
  sale,  
  onClose,  
}) {  
  return (  
    <Modal  
      title={`Sale Detail • ${  
        sale.invoice_number ||  
        'Bill'  
      }`}  
      onClose={onClose}  
    >  
      <div className="history-header">  
        <div>  
          <strong>  
            {sale.invoice_number ||  
              'Bill'}  
          </strong>  
  
          <span>  
            {dateTimeText(  
              sale.bill_datetime,  
            )}  
          </span>  
  
          <span>  
            Customer:{' '}  
            {sale.customers  
              ?.name ||  
              'Walk-in Customer'}  
          </span>  
        </div>  
      </div>  
  
      <h3>Items</h3>  
  
      <div className="record-list">  
        {(sale.sale_items ||  
          []).map((item) => (  
          <div  
            className="record-row static"  
            key={item.id}  
          >  
            <div>  
              <strong>  
                {item.products  
                  ?.product_name ||  
                  'Product'}  
              </strong>  
  
              <span>  
                {item.quantity_entered}{' '}  
                {item.unit_type}  
              </span>  
            </div>  
  
            <div className="record-right">  
              <span>  
                GST {item.gst_rate ||  
                  0}  
                %  
              </span>  
  
              <span>  
                Disc{' '}  
                {item.discount_percent ||  
                  0}  
                %  
              </span>  
  
              <strong>  
                {money(  
                  item.line_total,  
                )}  
              </strong>  
            </div>  
          </div>  
        ))}  
      </div>  
  
      <div className="totals">  
        <div>  
          <span>Subtotal</span>  
          <strong>  
            {money(  
              sale.subtotal,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>Item discount</span>  
          <strong>  
            {money(  
              sale.item_discount_total,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>Bill discount</span>  
          <strong>  
            {money(  
              sale.bill_discount_amount,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>CGST</span>  
          <strong>  
            {money(  
              sale.cgst_amount,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>SGST</span>  
          <strong>  
            {money(  
              sale.sgst_amount,  
            )}  
          </strong>  
        </div>  
  
        <div className="grand-total">  
          <span>Total</span>  
          <strong>  
            {money(  
              sale.grand_total,  
            )}  
          </strong>  
        </div>  
      </div>  
    </Modal>  
  )  
}  
  
function PurchaseReport({  
  purchases,  
}) {  
  const [selected, setSelected] =  
    useState(null)  
  
  const totalDiscount = sum(  
    purchases.map(  
      (x) => x.discount_amount,  
    ),  
  )  
  
  const totalGST = sum(  
    purchases.map(  
      (x) =>  
        safeNumber(  
          x.cgst_amount,  
        ) +  
        safeNumber(  
          x.sgst_amount,  
        ) +  
        safeNumber(  
          x.igst_amount,  
        ),  
    ),  
  )  
  
  return (  
    <>  
      <div className="stats-grid">  
        <StatCard  
          title="Invoices"  
          value={  
            purchases.length  
          }  
        />  
  
        <StatCard  
          title="Purchase Value"  
          value={money(  
            sum(  
              purchases.map(  
                (x) =>  
                  x.total_amount,  
              ),  
            ),  
          )}  
        />  
  
        <StatCard  
          title="Discounts"  
          value={money(  
            totalDiscount,  
          )}  
        />  
  
        <StatCard  
          title="GST"  
          value={money(  
            totalGST,  
          )}  
        />  
      </div>  
  
      <PanelList title="Detailed Purchases">  
        <div className="record-list">  
          {purchases.map(  
            (invoice) => (  
              <button  
                className="record-row"  
                key={invoice.id}  
                onClick={() =>  
                  setSelected(  
                    invoice,  
                  )  
                }  
              >  
                <div>  
                  <strong>  
                    {  
                      invoice.invoice_number  
                    }  
                  </strong>  
  
                  <span>  
                    {dateText(  
                      invoice.invoice_date,  
                    )}{' '}  
                    •{' '}  
                    {invoice  
                      .suppliers  
                      ?.supplier_name ||  
                      'Supplier'}  
                  </span>  
                </div>  
  
                <div className="record-right">  
                  <span>  
                    {  
                      invoice.payment_status  
                    }  
                  </span>  
  
                  <strong>  
                    {money(  
                      invoice.total_amount,  
                    )}  
                  </strong>  
                </div>  
              </button>  
            ),  
          )}  
        </div>  
      </PanelList>  
  
      {selected && (  
        <ReportPurchaseDetail  
          invoice={selected}  
          onClose={() =>  
            setSelected(null)  
          }  
        />  
      )}  
    </>  
  )  
}  
  
function ReportPurchaseDetail({  
  invoice,  
  onClose,  
}) {  
  return (  
    <Modal  
      title={`Purchase Detail • ${  
        invoice.invoice_number  
      }`}  
      onClose={onClose}  
    >  
      <div className="history-header">  
        <div>  
          <strong>  
            {invoice.invoice_number}  
          </strong>  
  
          <span>  
            {dateText(  
              invoice.invoice_date,  
            )}  
          </span>  
  
          <span>  
            Supplier:{' '}  
            {invoice.suppliers  
              ?.supplier_name ||  
              '—'}  
          </span>  
  
          <span>  
            GSTIN:{' '}  
            {invoice.suppliers  
              ?.gstin ||  
              '—'}  
          </span>  
        </div>  
      </div>  
  
      <h3>Products purchased</h3>  
  
      <div className="record-list">  
        {(invoice.purchase_items ||  
          []).map((item) => (  
          <div  
            className="record-row static"  
            key={item.id}  
          >  
            <div>  
              <strong>  
                {item.products  
                  ?.product_name ||  
                  'Product'}  
              </strong>  
  
              <span>  
                Batch:{' '}  
                {item.batches  
                  ?.batch_number ||  
                  item.batch_number ||  
                  '—'}  
              </span>  
            </div>  
  
            <div className="record-right">  
              <span>  
                Paid:{' '}  
                {  
                  item.paid_packs  
                }  
              </span>  
  
              <span>  
                Free:{' '}  
                {  
                  item.free_packs  
                }  
              </span>  
  
              <span>  
                Loose:{' '}  
                {  
                  item.loose_units  
                }  
              </span>  
  
              <strong>  
                {money(  
                  item.purchase_rate_per_pack,  
                )}  
              </strong>  
            </div>  
          </div>  
        ))}  
      </div>  
  
      <div className="totals">  
        <div>  
          <span>Subtotal</span>  
          <strong>  
            {money(  
              invoice.subtotal,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>Discount</span>  
          <strong>  
            {money(  
              invoice.discount_amount,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>CGST</span>  
          <strong>  
            {money(  
              invoice.cgst_amount,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>SGST</span>  
          <strong>  
            {money(  
              invoice.sgst_amount,  
            )}  
          </strong>  
        </div>  
  
        <div>  
          <span>IGST</span>  
          <strong>  
            {money(  
              invoice.igst_amount,  
            )}  
          </strong>  
        </div>  
  
        <div className="grand-total">  
          <span>Total</span>  
          <strong>  
            {money(  
              invoice.total_amount,  
            )}  
          </strong>  
        </div>  
      </div>  
    </Modal>  
  )  
}  
  
function CustomerReport({  
  sales,  
  customers,  
}) {  
  const [selected, setSelected] =  
    useState(null)  
  
  const map = new Map()  
  
  for (const sale of sales) {  
    const key =  
      sale.customer_id ||  
      'walk_in'  
  
    if (!map.has(key)) {  
      map.set(key, {  
        customer:  
          sale.customers ||  
          null,  
        bills: 0,  
        total: 0,  
        due: 0,  
        products: new Map(),  
        lastPurchase: null,  
      })  
    }  
  
    const entry =  
      map.get(key)  
  
    entry.bills += 1  
    entry.total +=  
      safeNumber(  
        sale.grand_total,  
      )  
    entry.due +=  
      safeNumber(  
        sale.amount_due,  
      )  
  
    if (  
      !entry.lastPurchase ||  
      new Date(  
        sale.bill_datetime,  
      ) >  
        new Date(  
          entry.lastPurchase,  
        )  
    ) {  
      entry.lastPurchase =  
        sale.bill_datetime  
    }  
  
    for (const item of  
      sale.sale_items ||  
      []) {  
      const productId =  
        item.product_id  
  
      if (  
        !entry.products.has(  
          productId,  
        )  
      ) {  
        entry.products.set(  
          productId,  
          {  
            product:  
              item.products,  
            quantity: 0,  
            value: 0,  
          },  
        )  
      }  
  
      const p =  
        entry.products.get(  
          productId,  
        )  
  
      p.quantity +=  
        safeNumber(  
          item.quantity_entered,  
        )  
      p.value +=  
        safeNumber(  
          item.line_total,  
        )  
    }  
  }  
  
  const rows =  
    Array.from(  
      map.entries(),  
    ).sort(  
      (a, b) =>  
        b[1].total -  
        a[1].total,  
    )  
  
  return (  
    <>  
      <div className="stats-grid">  
        <StatCard  
          title="Customers with Sales"  
          value={  
            rows.filter(  
              ([id]) =>  
                id !==  
                'walk_in',  
            ).length  
          }  
        />  
  
        <StatCard  
          title="Customer Sales"  
          value={money(  
            sum(  
              rows.map(  
                ([, x]) =>  
                  x.total,  
              ),  
            ),  
          )}  
        />  
  
        <StatCard  
          title="Outstanding"  
          value={money(  
            sum(  
              rows.map(  
                ([, x]) =>  
                  x.due,  
              ),  
            ),  
          )}  
        />  
      </div>  
  
      <PanelList title="Customer Sales Summary & Details">  
        <div className="record-list">  
          {rows.map(  
            ([id, row]) => (  
              <button  
                className="record-row"  
                key={id}  
                onClick={() =>  
                  setSelected(  
                    row,  
                  )  
                }  
              >  
                <div>  
                  <strong>  
                    {row.customer  
                      ?.name ||  
                      'Walk-in Customers'}  
                  </strong>  
  
                  <span>  
                    {row.customer  
                      ?.phone ||  
                      ''}{' '}  
                    • Bills:{' '}  
                    {row.bills}{' '}  
                    • Last:{' '}  
                    {dateText(  
                      row.lastPurchase,  
                    )}  
                  </span>  
                </div>  
  
                <div className="record-right">  
                  <span>  
                    Due:{' '}  
                    {money(  
                      row.due,  
                    )}  
                  </span>  
  
                  <strong>  
                    {money(  
                      row.total,  
                    )}  
                  </strong>  
                </div>  
              </button>  
            ),  
          )}  
        </div>  
      </PanelList>  
  
      {selected && (  
        <CustomerReportDetail  
          row={selected}  
          onClose={() =>  
            setSelected(null)  
          }  
        />  
      )}  
    </>  
  )  
}  
  
function CustomerReportDetail({  
  row,  
  onClose,  
}) {  
  return (  
    <Modal  
      title={`Customer Detail • ${  
        row.customer  
          ?.name ||  
        'Walk-in Customers'  
      }`}  
      onClose={onClose}  
    >  
      <div className="stats-grid">  
        <StatCard  
          title="Bills"  
          value={row.bills}  
        />  
  
        <StatCard  
          title="Purchased"  
          value={money(  
            row.total,  
          )}  
        />  
  
        <StatCard  
          title="Outstanding"  
          value={money(  
            row.due,  
          )}  
        />  
      </div>  
  
      <h3>  
        Products purchased  
      </h3>  
  
      <div className="record-list">  
        {Array.from(  
          row.products.values(),  
        ).map(  
          (entry) => (  
            <div  
              className="record-row static"  
              key={  
                entry.product  
                  ?.id ||  
                crypto.randomUUID()  
              }  
            >  
              <div>  
                <strong>  
                  {entry.product  
                    ?.product_name ||  
                    'Product'}  
                </strong>  
  
                <span>  
                  {entry.product  
                    ?.generic_display_name ||  
                    ''}  
                </span>  
              </div>  
  
              <div className="record-right">  
                <span>  
                  Qty:{' '}  
                  {  
                    entry.quantity  
                  }  
                </span>  
  
                <strong>  
                  {money(  
                    entry.value,  
                  )}  
                </strong>  
              </div>  
            </div>  
          ),  
        )}  
      </div>  
    </Modal>  
  )  
}  
  
function SupplierReport({  
  purchases,  
  suppliers,  
}) {  
  const [selected, setSelected] =  
    useState(null)  
  
  const map = new Map()  
  
  for (const invoice of purchases) {  
    const key =  
      invoice.supplier_id ||  
      'unknown'  
  
    if (!map.has(key)) {  
      map.set(key, {  
        supplier:  
          invoice.suppliers ||  
          null,  
        invoices: 0,  
        total: 0,  
        products: new Map(),  
        lastPurchase: null,  
      })  
    }  
  
    const entry =  
      map.get(key)  
  
    entry.invoices += 1  
    entry.total +=  
      safeNumber(  
        invoice.total_amount,  
      )  
  
    if (  
      !entry.lastPurchase ||  
      new Date(  
        invoice.invoice_date,  
      ) >  
        new Date(  
          entry.lastPurchase,  
        )  
    ) {  
      entry.lastPurchase =  
        invoice.invoice_date  
    }  
  
    for (const item of  
      invoice.purchase_items ||  
      []) {  
      if (  
        !entry.products.has(  
          item.product_id,  
        )  
      ) {  
        entry.products.set(  
          item.product_id,  
          {  
            product:  
              item.products,  
            packs: 0,  
            loose: 0,  
            value: 0,  
          },  
        )  
      }  
  
      const p =  
        entry.products.get(  
          item.product_id,  
        )  
  
      p.packs +=  
        safeNumber(  
          item.paid_packs,  
        ) +  
        safeNumber(  
          item.free_packs,  
        )  
  
      p.loose +=  
        safeNumber(  
          item.loose_units,  
        )  
  
      p.value +=  
        safeNumber(  
          item.paid_packs,  
        ) *  
        safeNumber(  
          item.purchase_rate_per_pack,  
        )  
    }  
  }  
  
  const rows =  
    Array.from(  
      map.entries(),  
    ).sort(  
      (a, b) =>  
        b[1].total -  
        a[1].total,  
    )  
  
  return (  
    <>  
      <div className="stats-grid">  
        <StatCard  
          title="Suppliers Used"  
          value={rows.length}  
        />  
  
        <StatCard  
          title="Purchase Value"  
          value={money(  
            sum(  
              rows.map(  
                ([, x]) =>  
                  x.total,  
              ),  
            ),  
          )}  
        />  
  
        <StatCard  
          title="Invoices"  
          value={sum(  
            rows.map(  
              ([, x]) =>  
                x.invoices,  
            ),  
          )}  
        />  
      </div>  
  
      <PanelList title="Supplier / Purchase Party Summary & Details">  
        <div className="record-list">  
          {rows.map(  
            ([id, row]) => (  
              <button  
                className="record-row"  
                key={id}  
                onClick={() =>  
                  setSelected(  
                    row,  
                  )  
                }  
              >  
                <div>  
                  <strong>  
                    {row.supplier  
                      ?.supplier_name ||  
                      'Supplier'}  
                  </strong>  
  
                  <span>  
                    {row.supplier  
                      ?.gstin ||  
                      ''}{' '}  
                    • Invoices:{' '}  
                    {  
                      row.invoices  
                    }{' '}  
                    • Last:{' '}  
                    {dateText(  
                      row.lastPurchase,  
                    )}  
                  </span>  
                </div>  
  
                <strong>  
                  {money(  
                    row.total,  
                  )}  
                </strong>  
              </button>  
            ),  
          )}  
        </div>  
      </PanelList>  
  
      {selected && (  
        <SupplierReportDetail  
          row={selected}  
          onClose={() =>  
            setSelected(null)  
          }  
        />  
      )}  
    </>  
  )  
}  
  
function SupplierReportDetail({  
  row,  
  onClose,  
}) {  
  return (  
    <Modal  
      title={`Supplier Detail • ${  
        row.supplier  
          ?.supplier_name ||  
        'Supplier'  
      }`}  
      onClose={onClose}  
    >  
      <div className="history-header">  
        <div>  
          <strong>  
            {row.supplier  
              ?.supplier_name ||  
              'Supplier'}  
          </strong>  
  
          <span>  
            Phone:{' '}  
            {row.supplier  
              ?.phone ||  
              '—'}  
          </span>  
  
          <span>  
            GSTIN:{' '}  
            {row.supplier  
              ?.gstin ||  
              '—'}  
          </span>  
  
          <span>  
            Drug licence:{' '}  
            {supplierLicense(  
              row.supplier,  
            ) || '—'}  
          </span>  
        </div>  
      </div>  
  
      <div className="stats-grid">  
        <StatCard  
          title="Invoices"  
          value={  
            row.invoices  
          }  
        />  
  
        <StatCard  
          title="Purchased"  
          value={money(  
            row.total,  
          )}  
        />  
      </div>  
  
      <h3>  
        Products purchased  
      </h3>  
  
      <div className="record-list">  
        {Array.from(  
          row.products.values(),  
        ).map(  
          (entry) => (  
            <div  
              className="record-row static"  
              key={  
                entry.product  
                  ?.id ||  
                crypto.randomUUID()  
              }  
            >  
              <div>  
                <strong>  
                  {entry.product  
                    ?.product_name ||  
                    'Product'}  
                </strong>  
  
                <span>  
                  {entry.product  
                    ?.generic_display_name ||  
                    ''}  
                </span>  
              </div>  
  
              <div className="record-right">  
                <span>  
                  Packs:{' '}  
                  {  
                    entry.packs  
                  }  
                </span>  
  
                <span>  
                  Loose:{' '}  
                  {  
                    entry.loose  
                  }  
                </span>  
  
                <strong>  
                  {money(  
                    entry.value,  
                  )}  
                </strong>  
              </div>  
            </div>  
          ),  
        )}  
      </div>  
    </Modal>  
  )  
}  
  
function ProductReport({  
  saleItems,  
  purchaseItems,  
}) {  
  const map = new Map()  
  
  for (const item of saleItems) {  
    const id =  
      item.product_id  
  
    if (!map.has(id)) {  
      map.set(id, {  
        product:  
          item.products,  
        soldQty: 0,  
        salesValue: 0,  
        purchasedQty: 0,  
        purchaseValue: 0,  
      })  
    }  
  
    const row =  
      map.get(id)  
  
    row.soldQty +=  
      safeNumber(  
        item.quantity_entered,  
      )  
  
    row.salesValue +=  
      safeNumber(  
        item.line_total,  
      )  
  }  
  
  for (const item of purchaseItems) {  
    const id =  
      item.product_id  
  
    if (!map.has(id)) {  
      map.set(id, {  
        product:  
          item.products,  
        soldQty: 0,  
        salesValue: 0,  
        purchasedQty: 0,  
        purchaseValue: 0,  
      })  
    }  
  
    const row =  
      map.get(id)  
  
    row.purchasedQty +=  
      safeNumber(  
        item.paid_packs,  
      ) +  
      safeNumber(  
        item.free_packs,  
      )  
  
    row.purchaseValue +=  
      safeNumber(  
        item.paid_packs,  
      ) *  
      safeNumber(  
        item.purchase_rate_per_pack,  
      )  
  }  
  
  const rows =  
    Array.from(  
      map.values(),  
    ).sort(  
      (a, b) =>  
        b.salesValue -  
        a.salesValue,  
    )  
  
  return (  
    <>  
      <div className="stats-grid">  
        <StatCard  
          title="Products Involved"  
          value={rows.length}  
        />  
  
        <StatCard  
          title="Sales Value"  
          value={money(  
            sum(  
              rows.map(  
                (x) =>  
                  x.salesValue,  
              ),  
            ),  
          )}  
        />  
  
        <StatCard  
          title="Purchase Value"  
          value={money(  
            sum(  
              rows.map(  
                (x) =>  
                  x.purchaseValue,  
              ),  
            ),  
          )}  
        />  
      </div>  
  
      <PanelList title="Product Sales & Purchase Details">  
        <div className="record-list">  
          {rows.map(  
            (row) => (  
              <div  
                className="record-row static"  
                key={  
                  row.product?.id ||  
                  crypto.randomUUID()  
                }  
              >  
                <div>  
                  <strong>  
                    {row.product  
                      ?.product_name ||  
                      'Product'}  
                  </strong>  
  
                  <span>  
                    {row.product  
                      ?.generic_display_name ||  
                      row.product  
                        ?.manufacturer ||  
                      ''}  
                  </span>  
                </div>  
  
                <div className="record-right">  
                  <span>  
                    Sold:{' '}  
                    {  
                      row.soldQty  
                    }  
                  </span>  
  
                  <span>  
                    Purchased:{' '}  
                    {  
                      row.purchasedQty  
                    }  
                  </span>  
  
                  <span>  
                    Sales:{' '}  
                    {money(  
                      row.salesValue,  
                    )}  
                  </span>  
  
                  <strong>  
                    Purchases:{' '}  
                    {money(  
                      row.purchaseValue,  
                    )}  
                  </strong>  
                </div>  
              </div>  
            ),  
          )}  
        </div>  
      </PanelList>  
    </>  
  )  
}  
  
/* =========================================================  
   ALERTS  
========================================================= */  
  
function AlertsModule({  
  store,  
}) {  
  const [rows, setRows] =  
    useState([])  
  
  const load = async () => {  
    const { data } =  
      await pharmdeskDb  
        .from('alerts')  
        .select('*')  
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
  
    setRows(data || [])  
  }  
  
  useEffect(() => {  
    if (store?.id) load()  
  }, [store?.id])  
  
  const resolve = async (  
    id,  
  ) => {  
    await pharmdeskDb  
      .from('alerts')  
      .update({  
        is_resolved: true,  
        resolved_at:  
          new Date().toISOString(),  
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
        {rows.length ===  
        0 ? (  
          <EmptyState text="No unresolved alerts." />  
        ) : (  
          <div className="record-list">  
            {rows.map(  
              (row) => (  
                <div  
                  className="record-row static"  
                  key={row.id}  
                >  
                  <div>  
                    <strong>  
                      {  
                        row.alert_type  
                      }  
                    </strong>  
  
                    <span>  
                      {row.title ||  
                        row.message ||  
                        row.description ||  
                        'Alert'}  
                    </span>  
                  </div>  
  
                  <button  
                    className="secondary-button"  
                    onClick={() =>  
                      resolve(  
                        row.id,  
                      )  
                    }  
                  >  
                    Resolve  
                  </button>  
                </div>  
              ),  
            )}  
          </div>  
        )}  
      </PanelList>  
    </div>  
  )  
}  
  
/* =========================================================  
   SETTINGS  
========================================================= */  
  
function SettingsModule({
  store,
  profile,
  onStoreUpdated,
}) {
  const [storeName, setStoreName] =
    useState(store?.name || '')
  const [address, setAddress] =
    useState(store?.address || '')
  const [phone, setPhone] =
    useState(store?.phone || '')
  const [email, setEmail] =
    useState(store?.email || '')
  const [gstin, setGstin] =
    useState(store?.gstin || '')
  const [drugLicense, setDrugLicense] =
    useState(
      store?.drug_license_number ||
        '',
    )

  const [currency, setCurrency] =
    useState('INR')
  const [expiryDays, setExpiryDays] =
    useState(90)
  const [deadStockDays, setDeadStockDays] =
    useState(60)
  const [allowPastDated, setAllowPastDated] =
    useState(true)
  const [allowWalkIn, setAllowWalkIn] =
    useState(true)
  const [
    salespersonRequired,
    setSalespersonRequired,
  ] = useState(false)

  const [message, setMessage] =
    useState('')

  // ---------------------------------------------------------------------------
  // Archive / Storage
  // ---------------------------------------------------------------------------

  const [archiveSettings, setArchiveSettings] =
    useState({
      retention_months: 12,
      emergency_threshold_percent: 90,
      emergency_enabled: true,
      auto_archive_enabled: false,
    })

  const [archivePreviewData, setArchivePreviewData] =
    useState(null)

  const [archiveLoading, setArchiveLoading] =
    useState(false)

  const [archiveSaving, setArchiveSaving] =
    useState(false)

  const [archiveMessage, setArchiveMessage] =
    useState('')

  const [currentPassword, setCurrentPassword] =
    useState('')
  const [newPassword, setNewPassword] =
    useState('')
  const [confirmNewPassword, setConfirmNewPassword] =
    useState('')
  const [passwordMessage, setPasswordMessage] =
    useState('')
  const [passwordBusy, setPasswordBusy] =
    useState(false)

  const [accessEmail, setAccessEmail] =
    useState('')

  const [
    accessRequests,
    setAccessRequests,
  ] = useState([])

  const [
    accessLoading,
    setAccessLoading,
  ] = useState(false)

  const [
    accessMessage,
    setAccessMessage,
  ] = useState('')
  
  const [isPlatformAdmin, setIsPlatformAdmin] =
  useState(false)

const [adminStores, setAdminStores] =
  useState([])

const [adminLoading, setAdminLoading] =
  useState(false)

const [adminMessage, setAdminMessage] =
  useState('')
  
  const [adminApplications, setAdminApplications] =
  useState([])

const [applicationLoading, setApplicationLoading] =
  useState(false)

const [applicationMessage, setApplicationMessage] =
  useState('')

const [newStore, setNewStore] =
  useState({
    name: '',
    ownerEmail: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    drugLicenseNumber: '',
  })

const loadAdminStores = async () => {
  try {
    setAdminLoading(true)

    const result =
      await PharmDeskAPI.adminListStores()

    setAdminStores(
      Array.isArray(result)
        ? result
        : [],
    )
  } catch (error) {
    console.error(
      'Failed to load admin stores:',
      error,
    )

    setAdminMessage(
      error?.message ||
        'Failed to load stores.',
    )
  } finally {
    setAdminLoading(false)
  }
}

const loadAdminApplications = async () => {
  try {
    setApplicationLoading(true)

    const result =
      await PharmDeskAPI.adminListStoreApplications()

    setAdminApplications(
      Array.isArray(result)
        ? result
        : [],
    )
  } catch (error) {
    console.error(
      'Failed to load store applications:',
      error,
    )

    setApplicationMessage(
      error?.message ||
        'Failed to load store applications.',
    )
  } finally {
    setApplicationLoading(false)
  }
}

useEffect(() => {
  let mounted = true

  const checkPlatformAdmin =
    async () => {
      try {
        const admin =
          await PharmDeskAPI.isPlatformAdmin()

        if (!mounted || !admin) {
          return
        }

        setIsPlatformAdmin(true)

await Promise.all([
  loadAdminStores(),
  loadAdminApplications(),
])
      } catch (error) {
        console.error(
          'Platform admin check failed:',
          error,
        )
      }
    }

  checkPlatformAdmin()

  return () => {
    mounted = false
  }
}, [])

const createAdminStore = async () => {
  try {
    setAdminLoading(true)
    setAdminMessage('')

    if (!newStore.name.trim()) {
      throw new Error(
        'Medical store name is required.',
      )
    }

    if (!newStore.ownerEmail.trim()) {
      throw new Error(
        'Owner email is required.',
      )
    }

    await PharmDeskAPI.adminCreateStore({
      name: newStore.name.trim(),
      ownerEmail:
        newStore.ownerEmail.trim(),
      address:
        newStore.address.trim() || null,
      phone:
        newStore.phone.trim() || null,
      email:
        newStore.email.trim() || null,
      gstin:
        newStore.gstin.trim() || null,
      drugLicenseNumber:
        newStore.drugLicenseNumber.trim() ||
        null,
    })

    setNewStore({
      name: '',
      ownerEmail: '',
      address: '',
      phone: '',
      email: '',
      gstin: '',
      drugLicenseNumber: '',
    })

    setAdminMessage(
      'Medical store created successfully. It is now pending activation.',
    )

    await loadAdminStores()
  } catch (error) {
    console.error(
      'Failed to create medical store:',
      error,
    )

    setAdminMessage(
      error?.message ||
        'Failed to create medical store.',
    )
  } finally {
    setAdminLoading(false)
  }
}

const activateAdminStore = async (
  storeId,
) => {
  try {
    setAdminLoading(true)
    setAdminMessage('')

    await PharmDeskAPI.adminActivateStore(
      storeId,
    )

    setAdminMessage(
      'Store approved and 1-year service activated.',
    )

    await loadAdminStores()
  } catch (error) {
    console.error(
      'Failed to activate store:',
      error,
    )

    setAdminMessage(
      error?.message ||
        'Failed to activate store.',
    )
  } finally {
    setAdminLoading(false)
  }
}

const suspendAdminStore = async (
  storeId,
) => {
  try {
    setAdminLoading(true)
    setAdminMessage('')

    await PharmDeskAPI.adminSuspendStore(
      storeId,
    )

    setAdminMessage(
      'Store service has been suspended.',
    )

    await loadAdminStores()
  } catch (error) {
    console.error(
      'Failed to suspend store:',
      error,
    )

    setAdminMessage(
      error?.message ||
        'Failed to suspend store.',
    )
  } finally {
    setAdminLoading(false)
  }
}

const reactivateAdminStore = async (
  storeId,
) => {
  try {
    setAdminLoading(true)
    setAdminMessage('')

    await PharmDeskAPI.adminReactivateStore(
      storeId,
    )

    setAdminMessage(
      'Store service has been renewed for 1 year.',
    )

    await loadAdminStores()
  } catch (error) {
    console.error(
      'Failed to reactivate store:',
      error,
    )

    setAdminMessage(
      error?.message ||
        'Failed to renew store service.',
    )
  } finally {
    setAdminLoading(false)
  }
}

const approveStoreApplication = async (
  applicationId,
) => {
  try {
    setApplicationLoading(true)
    setApplicationMessage('')

    await PharmDeskAPI.adminApproveStoreApplication(
      applicationId,
    )

    setApplicationMessage(
      'Application approved. The store has been activated for 1 year.',
    )

    await Promise.all([
      loadAdminApplications(),
      loadAdminStores(),
    ])
  } catch (error) {
    console.error(
      'Failed to approve store application:',
      error,
    )

    setApplicationMessage(
      error?.message ||
        'Failed to approve store application.',
    )
  } finally {
    setApplicationLoading(false)
  }
}

const rejectStoreApplication = async (
  applicationId,
) => {
  const reason = window.prompt(
    'Enter a rejection reason (optional):',
  )

  if (reason === null) {
    return
  }

  try {
    setApplicationLoading(true)
    setApplicationMessage('')

    await PharmDeskAPI.adminRejectStoreApplication(
      applicationId,
      reason.trim() || null,
    )

    setApplicationMessage(
      'Store application rejected.',
    )

    await loadAdminApplications()
  } catch (error) {
    console.error(
      'Failed to reject store application:',
      error,
    )

    setApplicationMessage(
      error?.message ||
        'Failed to reject store application.',
    )
  } finally {
    setApplicationLoading(false)
  }
}

  useEffect(() => {
    setStoreName(
      store?.name || '',
    )
    setAddress(
      store?.address || '',
    )
    setPhone(
      store?.phone || '',
    )
    setEmail(
      store?.email || '',
    )
    setGstin(
      store?.gstin || '',
    )
    setDrugLicense(
      store?.drug_license_number ||
        '',
    )
  }, [store])

  useEffect(() => {
    if (!store?.id) return

    pharmdeskDb
      .from('store_settings')
      .select('*')
      .eq(
        'store_id',
        store.id,
      )
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return

        setCurrency(
          data.currency ||
            'INR',
        )

        setExpiryDays(
          data.expiry_alert_days ??
            90,
        )

        setDeadStockDays(
          data.dead_stock_days ??
            60,
        )

        setAllowPastDated(
          data.allow_past_dated_bills ??
            true,
        )

        setAllowWalkIn(
          data.allow_walk_in_customers ??
            true,
        )

        setSalespersonRequired(
          data.salesperson_required ??
            false,
        )
      })
  }, [store?.id])

  useEffect(() => {
    if (!store?.id) return

    let mounted = true

    const loadAccessRequests =
      async () => {
        setAccessLoading(true)
        setAccessMessage('')

        try {
          const result =
            await PharmDeskAPI.getStoreAccessRequests(
              store.id,
            )

          if (!mounted) return

          if (result?.error) {
            setAccessMessage(
              result.error.message ||
                'Unable to load access requests.',
            )
            setAccessRequests([])
            return
          }

          const rows =
            result?.data ??
            result ??
            []

          setAccessRequests(
            Array.isArray(rows)
              ? rows
              : [],
          )
        } catch (error) {
          if (!mounted) return

          console.error(
            'Failed to load store access requests:',
            error,
          )

          setAccessMessage(
            error?.message ||
              'Unable to load access requests.',
          )
        } finally {
          if (mounted) {
            setAccessLoading(false)
          }
        }
      }

    loadAccessRequests()

    return () => {
      mounted = false
    }
  }, [store?.id])

  useEffect(() => {
    if (!store?.id) return

    let mounted = true

    const loadArchiveData = async () => {
      setArchiveLoading(true)
      setArchiveMessage('')

      try {
        const [settings, preview] =
          await Promise.all([
            PharmDeskAPI.getArchiveSettings(
              store.id,
            ),
            PharmDeskAPI.archivePreview(
              store.id,
            ),
          ])

        if (!mounted) return

        setArchiveSettings({
          retention_months:
            settings?.retention_months ??
            12,

          emergency_threshold_percent:
            settings?.emergency_threshold_percent ??
            90,

          emergency_enabled:
            settings?.emergency_enabled ??
            true,

          auto_archive_enabled:
            settings?.auto_archive_enabled ??
            false,
        })

        setArchivePreviewData(
          preview || null,
        )
      } catch (error) {
        if (!mounted) return

        console.error(
          'Failed to load archive settings:',
          error,
        )

        setArchiveMessage(
          error?.message ||
            'Unable to load archive information.',
        )
      } finally {
        if (mounted) {
          setArchiveLoading(false)
        }
      }
    }

    loadArchiveData()

    return () => {
      mounted = false
    }
  }, [store?.id])

  const refreshAccessRequests =
    async () => {
      if (!store?.id) return

      setAccessLoading(true)
      setAccessMessage('')

      try {
        const result =
          await PharmDeskAPI.getStoreAccessRequests(
            store.id,
          )

        if (result?.error) {
          setAccessMessage(
            result.error.message ||
              'Unable to load access requests.',
          )
          return
        }

        const rows =
          result?.data ??
          result ??
          []

        setAccessRequests(
          Array.isArray(rows)
            ? rows
            : [],
        )
      } catch (error) {
        console.error(
          'Failed to refresh access requests:',
          error,
        )

        setAccessMessage(
          error?.message ||
            'Unable to load access requests.',
        )
      } finally {
        setAccessLoading(false)
      }
    }

  const changePassword = async () => {
    setPasswordMessage('')

    if (!currentPassword) {
      setPasswordMessage('Enter your current password.')
      return
    }

    if (newPassword.length < 6) {
      setPasswordMessage('New password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordMessage('New passwords do not match.')
      return
    }

    try {
      setPasswordBusy(true)
      await PharmDeskAPI.updatePassword(
        newPassword,
        currentPassword,
      )
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setPasswordMessage('Password changed successfully.')
    } catch (error) {
      console.error('Failed to change password:', error)
      setPasswordMessage(
        error?.message ||
          'Unable to change password.',
      )
    } finally {
      setPasswordBusy(false)
    }
  }

  const requestStaffAccess =
    async () => {
      setAccessMessage('')

      const normalizedEmail =
        accessEmail
          .trim()
          .toLowerCase()

      if (!normalizedEmail) {
        setAccessMessage(
          'Enter the staff member email address.',
        )
        return
      }

      if (
        !normalizedEmail.includes('@')
      ) {
        setAccessMessage(
          'Enter a valid email address.',
        )
        return
      }

      if (!store?.id) {
        setAccessMessage(
          'No store is currently selected.',
        )
        return
      }

      setAccessLoading(true)

      try {
        const result =
          await PharmDeskAPI.createStoreAccessRequest(
            store.id,
            normalizedEmail,
            'salesperson',
          )

        if (result?.error) {
          setAccessMessage(
            result.error.message ||
              'Unable to create access request.',
          )
          return
        }

        setAccessEmail('')

        setAccessMessage(
          'Access request created successfully.',
        )

        await refreshAccessRequests()
      } catch (error) {
        console.error(
          'Failed to create store access request:',
          error,
        )

        setAccessMessage(
          error?.message ||
            'Unable to create access request.',
        )
      } finally {
        setAccessLoading(false)
      }
    }

  const approveAccessRequest =
    async (requestId) => {
      setAccessMessage('')
      setAccessLoading(true)

      try {
        const result =
          await PharmDeskAPI.approveStoreAccessRequest(
            requestId,
          )

        if (result?.error) {
          setAccessMessage(
            result.error.message ||
              'Unable to approve access request.',
          )
          return
        }

        setAccessMessage(
          'Access request approved.',
        )

        await refreshAccessRequests()
      } catch (error) {
        console.error(
          'Failed to approve store access request:',
          error,
        )

        setAccessMessage(
          error?.message ||
            'Unable to approve access request.',
        )
      } finally {
        setAccessLoading(false)
      }
    }

  const rejectAccessRequest =
    async (requestId) => {
      setAccessMessage('')
      setAccessLoading(true)

      try {
        const result =
          await PharmDeskAPI.rejectStoreAccessRequest(
            requestId,
          )

        if (result?.error) {
          setAccessMessage(
            result.error.message ||
              'Unable to reject access request.',
          )
          return
        }

        setAccessMessage(
          'Access request rejected.',
        )

        await refreshAccessRequests()
      } catch (error) {
        console.error(
          'Failed to reject store access request:',
          error,
        )

        setAccessMessage(
          error?.message ||
            'Unable to reject access request.',
        )
      } finally {
        setAccessLoading(false)
      }
    }

  const saveArchiveSettings = async () => {
    if (!store?.id) {
      setArchiveMessage(
        'No store is currently selected.',
      )
      return
    }

    setArchiveSaving(true)
    setArchiveMessage('')

    try {
      await PharmDeskAPI.updateArchiveSettings(
        store.id,
        {
          retention_months:
            Math.max(
              12,
              Number(
                archiveSettings.retention_months,
              ) || 12,
            ),

          emergency_threshold_percent:
            Number(
              archiveSettings.emergency_threshold_percent,
            ) || 90,

          emergency_enabled:
            Boolean(
              archiveSettings.emergency_enabled,
            ),

          auto_archive_enabled:
            Boolean(
              archiveSettings.auto_archive_enabled,
            ),
        },
      )

      const preview =
        await PharmDeskAPI.archivePreview(
          store.id,
        )

      setArchivePreviewData(
        preview || null,
      )

      setArchiveMessage(
        'Archive settings saved successfully.',
      )
    } catch (error) {
      console.error(
        'Failed to save archive settings:',
        error,
      )

      setArchiveMessage(
        error?.message ||
          'Unable to save archive settings.',
      )
    } finally {
      setArchiveSaving(false)
    }
  }

  const refreshArchivePreview = async () => {
    if (!store?.id) return

    setArchiveLoading(true)
    setArchiveMessage('')

    try {
      const preview =
        await PharmDeskAPI.archivePreview(
          store.id,
        )

      setArchivePreviewData(
        preview || null,
      )

      setArchiveMessage(
        'Archive information refreshed.',
      )
    } catch (error) {
      console.error(
        'Failed to refresh archive preview:',
        error,
      )

      setArchiveMessage(
        error?.message ||
          'Unable to refresh archive information.',
      )
    } finally {
      setArchiveLoading(false)
    }
  }

  const save = async () => {
    setMessage('')

    const { data, error } =
      await pharmdeskDb
        .from('stores')
        .update({
          name:
            storeName.trim(),
          address:
            address.trim() ||
            null,
          phone:
            phone.trim() ||
            null,
          email:
            email.trim() ||
            null,
          gstin:
            gstin.trim() ||
            null,
          drug_license_number:
            drugLicense.trim() ||
            null,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          store.id,
        )
        .select()
        .maybeSingle()

    if (error) {
      setMessage(
        error.message,
      )
      return
    }

    const {
      error: settingsError,
    } = await pharmdeskDb
      .from(
        'store_settings',
      )
      .upsert({
        store_id:
          store.id,
        currency,
        expiry_alert_days:
          safeNumber(
            expiryDays,
          ),
        dead_stock_days:
          safeNumber(
            deadStockDays,
          ),
        allow_past_dated_bills:
          allowPastDated,
        allow_walk_in_customers:
          allowWalkIn,
        salesperson_required:
          salespersonRequired,
        updated_at:
          new Date().toISOString(),
      })

    if (settingsError) {
      setMessage(
        settingsError.message,
      )
      return
    }

    if (data) {
      onStoreUpdated?.(
        data,
      )
    }

    setMessage(
      'Store and settings saved successfully.',
    )
  }

  return (
    <div>
      <ModuleHeader
        title="Settings"
        subtitle={
          store?.name ||
          'Store settings'
        }
      />

      <PanelList title="Store / Company Details">
        <div className="form-grid">
          <label>
            Store / company name
            <input
              value={
                storeName
              }
              onChange={(e) =>
                setStoreName(
                  e.target.value,
                )
              }
            />
          </label>

          <label>
            Phone
            <input
              value={phone}
              onChange={(e) =>
                setPhone(
                  e.target.value,
                )
              }
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value,
                )
              }
            />
          </label>

          <label>
            GSTIN
            <input
              value={gstin}
              onChange={(e) =>
                setGstin(
                  e.target.value,
                )
              }
            />
          </label>

          <label>
            Drug licence number
            <input
              value={
                drugLicense
              }
              onChange={(e) =>
                setDrugLicense(
                  e.target.value,
                )
              }
            />
          </label>

          <label>
            Currency
            <input
              value={
                currency
              }
              onChange={(e) =>
                setCurrency(
                  e.target.value,
                )
              }
            />
          </label>
        </div>

        <label>
          Address
          <textarea
            value={address}
            onChange={(e) =>
              setAddress(
                e.target.value,
              )
            }
          />
        </label>
      </PanelList>

      <PanelList title="Inventory & Billing Settings">
        <div className="form-grid">
          <label>
            Expiry alert days
            <input
              type="number"
              min="1"
              value={
                expiryDays
              }
              onChange={(e) =>
                setExpiryDays(
                  e.target.value,
                )
              }
            />
          </label>

          <label>
            Dead stock days
            <input
              type="number"
              min="1"
              value={
                deadStockDays
              }
              onChange={(e) =>
                setDeadStockDays(
                  e.target.value,
                )
              }
            />
          </label>
        </div>

        <ToggleRow
          label="Allow walk-in customers"
          checked={
            allowWalkIn
          }
          onChange={
            setAllowWalkIn
          }
        />

        <ToggleRow
          label="Allow past-dated bills"
          checked={
            allowPastDated
          }
          onChange={
            setAllowPastDated
          }
        />

        <ToggleRow
          label="Require salesperson"
          checked={
            salespersonRequired
          }
          onChange={
            setSalespersonRequired
          }
        />

        {message && (
          <div className="message-box">
            {message}
          </div>
        )}

        <button
          className="primary-button"
          onClick={save}
        >
          Save Settings
        </button>
      </PanelList>

      <PanelList title="Archive & Storage">
        <div className="form-grid">
          <label>
            Normal retention period (months)
            <input
              type="number"
              min="12"
              max="120"
              value={
                archiveSettings.retention_months
              }
              onChange={(e) =>
                setArchiveSettings(
                  (current) => ({
                    ...current,
                    retention_months:
                      e.target.value,
                  }),
                )
              }
            />
          </label>

          <label>
            Emergency database threshold (%)
            <input
              type="number"
              min="70"
              max="99"
              value={
                archiveSettings.emergency_threshold_percent
              }
              onChange={(e) =>
                setArchiveSettings(
                  (current) => ({
                    ...current,
                    emergency_threshold_percent:
                      e.target.value,
                  }),
                )
              }
            />
          </label>
        </div>

        <ToggleRow
          label="Enable emergency archive protection"
          checked={
            Boolean(
              archiveSettings.emergency_enabled,
            )
          }
          onChange={(checked) =>
            setArchiveSettings(
              (current) => ({
                ...current,
                emergency_enabled:
                  checked,
              }),
            )
          }
        />

        <ToggleRow
          label="Enable automatic archiving"
          checked={
            Boolean(
              archiveSettings.auto_archive_enabled,
            )
          }
          onChange={(checked) =>
            setArchiveSettings(
              (current) => ({
                ...current,
                auto_archive_enabled:
                  checked,
              }),
            )
          }
        />

        {archiveLoading ? (
          <div className="message-box">
            Loading archive information...
          </div>
        ) : archivePreviewData ? (
          <div
            style={{
              marginTop: '16px',
            }}
          >
            <div className="history-header">
              <strong>
                Database Storage
              </strong>

              <span>
                {archivePreviewData.database?.size_mb ??
  '—'} MB
              </span>
            </div>

            <div className="record-list">
              <div className="record-row static">
                <div>
                  <strong>
                    Capacity reference
                  </strong>
                  <span>
                    Current database capacity reference
                  </span>
                </div>

                <span>
                 {archivePreviewData.database?.capacity_mb_reference ??
  '—'} MB
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Database usage
                  </strong>
                  <span>
                    Current percentage of capacity
                  </span>
                </div>

                <span>
                 {archivePreviewData.database?.usage_percent ??
  '—'}%
                </span>
              </div>

                          <div className="record-row static">
                <div>
                  <strong>
                    Archive system started
                  </strong>
                  <span>
                    Date from which PharmDesk begins
                    tracking archive eligibility
                  </span>
                </div>

                <span>
                  {archivePreviewData.settings?.archive_start_date
                    ? dateText(
                        archivePreviewData.settings.archive_start_date,
                      )
                    : '—'}
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Normal retention
                  </strong>
                  <span>
                    Transactions remain active for
                    the configured retention period
                  </span>
                </div>

                <span>
                  {archivePreviewData.settings?.retention_months ??
                    '—'}{' '}
                  months
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    First normal archive eligibility
                  </strong>
                  <span>
                    First date on which normal archival
                    can begin for this store
                  </span>
                </div>

                <span>
                  {archivePreviewData.settings?.first_normal_archive_date
                    ? dateText(
                        archivePreviewData.settings
                          .first_normal_archive_date,
                      )
                    : '—'}
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Emergency archive cutoff
                  </strong>
                  <span>
                    Used only when emergency
                    protection is triggered
                  </span>
                </div>

                <span>
                 {archivePreviewData.settings?.emergency_cutoff_date ??
  '—'}
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Emergency status
                  </strong>
                  <span>
                    Whether the database is currently
                    above the emergency threshold
                  </span>
                </div>

               <span>
  {archivePreviewData.database?.emergency_active
    ? 'Active'
    : 'Normal'}
</span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Eligible sales
                  </strong>
                  <span>
                    Closed sales eligible for archival
                  </span>
                </div>

                <span>
                {archivePreviewData.normal_eligible?.sales ??
  0}
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Eligible purchases
                  </strong>
                  <span>
                    Closed purchases eligible for archival
                  </span>
                </div>

                <span>
                {archivePreviewData.normal_eligible?.purchases ??
  0}
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Blocked unpaid purchases
                  </strong>
                  <span>
                    Purchases that must remain active
                    because payment is pending
                  </span>
                </div>

                <span>
               {archivePreviewData.blocked?.unpaid_or_partially_paid_purchases ??
  0}
                </span>
              </div>

              <div className="record-row static">
                <div>
                  <strong>
                    Sales with outstanding amount
                  </strong>
                  <span>
                    Sales that cannot yet be archived
                  </span>
                </div>

                <span>
                {archivePreviewData.blocked?.sales_with_outstanding_due ??
  0}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="message-box">
            Archive information is not available yet.
          </div>
        )}

        {archiveMessage && (
          <div
            className="message-box"
            style={{
              marginTop: '12px',
            }}
          >
            {archiveMessage}
          </div>
        )}

        <div className="search-row">
          <button
            type="button"
            className="secondary-button"
            onClick={refreshArchivePreview}
            disabled={archiveLoading}
          >
            {archiveLoading
              ? 'Refreshing...'
              : 'Refresh Archive Information'}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={saveArchiveSettings}
            disabled={archiveSaving}
          >
            {archiveSaving
              ? 'Saving...'
              : 'Save Archive Settings'}
          </button>
        </div>
      </PanelList>

      <PanelList title="Security">
        <div className="form-grid">
          <label>
            Current password
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) =>
                setCurrentPassword(e.target.value)
              }
            />
          </label>

          <label>
            New password
            <input
              type="password"
              placeholder="New password"
              minLength={6}
              value={newPassword}
              onChange={(e) =>
                setNewPassword(e.target.value)
              }
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              placeholder="Confirm new password"
              minLength={6}
              value={confirmNewPassword}
              onChange={(e) =>
                setConfirmNewPassword(e.target.value)
              }
            />
          </label>
        </div>

        {passwordMessage && (
          <div className="message-box">
            {passwordMessage}
          </div>
        )}

        <button
          className="secondary-button"
          onClick={changePassword}
          disabled={passwordBusy}
        >
          {passwordBusy
            ? 'Changing password…'
            : 'Change Password'}
        </button>
      </PanelList>

      <PanelList title="Staff Access Requests">
        <div className="form-grid">
          <label>
            Staff email address
            <input
              type="email"
              placeholder="staff@example.com"
              value={accessEmail}
              onChange={(e) =>
                setAccessEmail(
                  e.target.value,
                )
              }
            />
          </label>
        </div>

        <button
          className="primary-button"
          onClick={requestStaffAccess}
          disabled={accessLoading}
        >
          {accessLoading
            ? 'Processing...'
            : 'Request Staff Access'}
        </button>

        {accessMessage && (
          <div className="message-box">
            {accessMessage}
          </div>
        )}

        <div
          style={{
            marginTop: '16px',
          }}
        >
          <div
            className="history-header"
            style={{
              marginBottom: '10px',
            }}
          >
            <strong>
              Pending and Previous Requests
            </strong>

            <button
              className="secondary-button"
              onClick={
                refreshAccessRequests
              }
              disabled={accessLoading}
            >
              Refresh
            </button>
          </div>

          {accessLoading &&
          accessRequests.length === 0 ? (
            <div>
              Loading access requests...
            </div>
          ) : accessRequests.length ===
            0 ? (
            <div>
              No access requests found.
            </div>
          ) : (
            <div>
              {accessRequests.map(
                (request) => (
                  <div
                    key={request.id}
                    style={{
                      padding:
                        '12px 0',
                      borderBottom:
                        '1px solid #e5e7eb',
                    }}
                  >
                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'center',
                        gap: '12px',
                        flexWrap:
                          'wrap',
                      }}
                    >
                      <div>
                        <strong>
                          {request.email}
                        </strong>

                        <div
                          style={{
                            marginTop:
                              '4px',
                            fontSize:
                              '13px',
                            opacity:
                              0.7,
                          }}
                        >
                          Role:{' '}
                          {request.role ||
                            'salesperson'}
                          {' · '}
                          Status:{' '}
                          {request.status}
                        </div>
                      </div>

                      {request.status ===
                        'pending' && (
                        <div
                          style={{
                            display:
                              'flex',
                            gap:
                              '8px',
                          }}
                        >
                          <button
                            className="primary-button"
                            onClick={() =>
                              approveAccessRequest(
                                request.id,
                              )
                            }
                            disabled={
                              accessLoading
                            }
                          >
                            Approve
                          </button>

                          <button
                            className="secondary-button"
                            onClick={() =>
                              rejectAccessRequest(
                                request.id,
                              )
                            }
                            disabled={
                              accessLoading
                            }
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </PanelList>
      
      {isPlatformAdmin && (
  <PanelList title="PharmDesk Administration">
    <div className="history-header">
      <div>
        <strong>
          Medical Store Management
        </strong>

        <span>
          Create stores, activate service,
          suspend access and manage yearly
          renewals.
        </span>
      </div>

      <button
        className="secondary-button"
        onClick={loadAdminStores}
        disabled={adminLoading}
      >
        Refresh
      </button>
    </div>

    {adminMessage && (
      <div className="message-box">
        {adminMessage}
      </div>
    )}

    <div className="settings-section">
      <h3>
        Add Medical Store
      </h3>

      <label>
        Medical store name
        <input
          value={newStore.name}
          onChange={(e) =>
            setNewStore({
              ...newStore,
              name: e.target.value,
            })
          }
          placeholder="e.g. ABC Medical Store"
        />
      </label>

      <label>
        Owner email
        <input
          type="email"
          value={newStore.ownerEmail}
          onChange={(e) =>
            setNewStore({
              ...newStore,
              ownerEmail:
                e.target.value,
            })
          }
          placeholder="owner@example.com"
        />
      </label>

      <label>
        Store address
        <input
          value={newStore.address}
          onChange={(e) =>
            setNewStore({
              ...newStore,
              address:
                e.target.value,
            })
          }
        />
      </label>

      <label>
        Phone
        <input
          type="tel"
          value={newStore.phone}
          onChange={(e) =>
            setNewStore({
              ...newStore,
              phone:
                e.target.value,
            })
          }
        />
      </label>

      <label>
        Store email
        <input
          type="email"
          value={newStore.email}
          onChange={(e) =>
            setNewStore({
              ...newStore,
              email:
                e.target.value,
            })
          }
        />
      </label>

      <label>
        GSTIN
        <input
          value={newStore.gstin}
          onChange={(e) =>
            setNewStore({
              ...newStore,
              gstin:
                e.target.value,
            })
          }
        />
      </label>

      <label>
        Drug licence number
        <input
          value={
            newStore.drugLicenseNumber
          }
          onChange={(e) =>
            setNewStore({
              ...newStore,
              drugLicenseNumber:
                e.target.value,
            })
          }
        />
      </label>

      <button
        className="primary-button"
        onClick={createAdminStore}
        disabled={adminLoading}
      >
        {adminLoading
          ? 'Creating...'
          : 'Add Medical Store'}
      </button>
    </div>

<PanelList title="Pending Store Applications">
  {applicationLoading &&
    adminApplications.length === 0 && (
      <div className="message-box">
        Loading applications...
      </div>
    )}

  {!applicationLoading &&
    adminApplications.length === 0 && (
      <div className="message-box">
        No store applications found.
      </div>
    )}

  {adminApplications.map(
    (application) => (
      <div
        key={application.id}
        className="history-item"
      >
        <div className="history-header">
          <div>
            <strong>
              {application.store_name}
            </strong>

            <span>
              Owner:{' '}
              {application.owner_name}
            </span>
          </div>

          <strong>
            {application.status.toUpperCase()}
          </strong>
        </div>

        <div className="history-header">
          <span>
            Email:{' '}
            {application.owner_email}
          </span>

          <span>
            Phone:{' '}
            {application.phone ||
              'Not provided'}
          </span>
        </div>

        <div className="history-header">
          <span>
            GSTIN:{' '}
            {application.gstin ||
              'Not provided'}
          </span>

          <span>
            Drug License:{' '}
            {application.drug_license_number ||
              'Not provided'}
          </span>
        </div>

        <div>
          <span>
            Address:{' '}
            {application.address ||
              'Not provided'}
          </span>
        </div>

        <div className="history-header">
          <span>
            Store email:{' '}
            {application.store_email ||
              'Not provided'}
          </span>

          <span>
            Applied:{' '}
            {application.created_at
              ? new Date(
                  application.created_at,
                ).toLocaleString()
              : 'Unknown'}
          </span>
        </div>

        {application.status ===
          'rejected' &&
          application.rejection_reason && (
            <div className="error-box">
              Rejection reason:{' '}
              {application.rejection_reason}
            </div>
          )}

        {application.status ===
          'pending' && (
          <div className="button-row">
            <button
              className="primary-button"
              onClick={() =>
                approveStoreApplication(
                  application.id,
                )
              }
              disabled={
                applicationLoading
              }
            >
              Approve & Start 1-Year Service
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                rejectStoreApplication(
                  application.id,
                )
              }
              disabled={
                applicationLoading
              }
            >
              Reject
            </button>
          </div>
        )}
      </div>
    ),
  )}

  {applicationMessage && (
    <div className="message-box">
      {applicationMessage}
    </div>
  )}
</PanelList>

    <div className="settings-section">
      <h3>
        Registered Medical Stores
      </h3>

      {adminLoading &&
        adminStores.length === 0 && (
          <div className="message-box">
            Loading stores...
          </div>
        )}

      {!adminLoading &&
        adminStores.length === 0 && (
          <div className="message-box">
            No medical stores found.
          </div>
        )}

      {adminStores.map((adminStore) => {
        const today =
          new Date()
            .toISOString()
            .slice(0, 10)

        const isExpired =
          adminStore.service_end_date &&
          adminStore.service_end_date <
            today

        const effectiveStatus =
          isExpired &&
          adminStore.service_status ===
            'active'
            ? 'expired'
            : adminStore.service_status

        return (
          <div
            key={adminStore.id}
            className="history-item"
          >
            <div className="history-header">
              <div>
                <strong>
                  {adminStore.name}
                </strong>

                <span>
                  {adminStore.email ||
                    adminStore.phone ||
                    'No contact details'}
                </span>
              </div>

              <strong>
                {effectiveStatus
                  .toUpperCase()}
              </strong>
            </div>

            <div className="history-header">
            <span>
  Store contact:
  {' '}
  {adminStore.email ||
    adminStore.phone ||
    'Not provided'}
</span>

              <span>
                GSTIN:
                {' '}
                {adminStore.gstin ||
                  'Not provided'}
              </span>
            </div>

            <div className="history-header">
              <span>
                Service start:
                {' '}
                {adminStore
                  .service_start_date ||
                  'Not activated'}
              </span>

              <span>
                Service end:
                {' '}
                {adminStore
                  .service_end_date ||
                  'Not activated'}
              </span>
            </div>

            <div
              className="button-row"
            >
              {effectiveStatus ===
                'pending' && (
                <button
                  className="primary-button"
                  onClick={() =>
                    activateAdminStore(
                      adminStore.id,
                    )
                  }
                  disabled={adminLoading}
                >
                  Approve & Start
                  1-Year Service
                </button>
              )}

              {effectiveStatus ===
                'active' && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    suspendAdminStore(
                      adminStore.id,
                    )
                  }
                  disabled={adminLoading}
                >
                  Suspend Service
                </button>
              )}

              {effectiveStatus ===
                'expired' && (
                <button
                  className="primary-button"
                  onClick={() =>
                    reactivateAdminStore(
                      adminStore.id,
                    )
                  }
                  disabled={adminLoading}
                >
                  Renew for 1 Year
                </button>
              )}

              {effectiveStatus ===
                'suspended' && (
                <button
                  className="primary-button"
                  onClick={() =>
                    reactivateAdminStore(
                      adminStore.id,
                    )
                  }
                  disabled={adminLoading}
                >
                  Reactivate for 1 Year
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  </PanelList>
)}

      <PanelList title="Signed-in User">
        <div className="history-header">
          <strong>
            {profile?.full_name ||
              'User'}
          </strong>

          <span>
            {profile?.phone ||
              ''}
          </span>
        </div>
      </PanelList>
    </div>
  )
}
  
/* =========================================================  
   CUSTOMER MODAL  
========================================================= */  
  
function CustomerModal({  
  store,  
  customer = null,  
  onClose,  
  onCreated,  
}) {  
  const editing =  
    Boolean(customer?.id)  
  
  const [name, setName] =  
    useState(  
      customer?.name || '',  
    )  
  const [phone, setPhone] =  
    useState(  
      customer?.phone || '',  
    )  
  const [address, setAddress] =  
    useState(  
      customer?.address || '',  
    )  

  const [doctorName, setDoctorName] =  
    useState(  
      customer?.referred_doctor_name || '',  
    )  
  const [doctorAddress, setDoctorAddress] =  
    useState(  
      customer?.referred_doctor_address || '',  
    )  
  
  const [busy, setBusy] =  
    useState(false)  
  const [error, setError] =  
    useState('')  
  
  const save = async (e) => {  
    e.preventDefault()  
    setBusy(true)  
    setError('')  
  
    try {  
      if (!name.trim()) {  
        throw new Error(  
          'Customer name is required.',  
        )  
      }  
  
      if (!phone.trim()) {  
        throw new Error(  
          'Customer phone number is required.',  
        )  
      }  
  
      const payload = {  
        customer_type:  
          'named',  
        name:  
          name.trim(),  
        phone:  
          phone.trim(),  
        address:  
          address.trim() ||  
          null,  
        referred_doctor_name:  
          doctorName.trim() ||  
          null,  
        referred_doctor_address:  
          doctorAddress.trim() ||  
          null,  
        is_active: true,  
      }  
  
      const generatedCustomerId = editing  
        ? customer.id  
        : (globalThis.crypto?.randomUUID  
            ? globalThis.crypto.randomUUID()  
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`)  
  
      let result  
  
      if (editing) {  
        result =  
          await pharmdeskDb  
            .from(  
              'customers',  
            )  
            .update(  
              payload,  
            )  
            .eq(  
              'id',  
              customer.id,  
            )  
            .eq(  
              'store_id',  
              store.id,  
            )  
      } else {  
        result =  
          await pharmdeskDb  
            .from(  
              'customers',  
            )  
            .insert({  
              id: generatedCustomerId,  
              ...payload,  
              store_id:  
                store.id,  
            })  
      }  
  
      if (result.error)  
        throw result.error  
  
      // The write can succeed even when RLS prevents Supabase from returning  
      // the inserted/updated row through SELECT. Build the saved object locally  
      // so the UI can continue immediately without showing a false error.  
      const savedCustomer = {  
        ...(customer || {}),  
        ...payload,  
        id: generatedCustomerId,  
        store_id: store.id,  
      }  
  
      onCreated(  
        savedCustomer,  
      )  
    } catch (error) {  
      setError(  
        error.message,  
      )  
    } finally {  
      setBusy(false)  
    }  
  }  
  
  return (  
    <Modal  
      title={  
        editing  
          ? 'Edit Customer'  
          : 'Add Customer'  
      }  
      onClose={onClose}  
    >  
      <form onSubmit={save}>  
        <label>  
          Customer name  
          <input  
            value={name}  
            onChange={(e) =>  
              setName(  
                e.target.value,  
              )  
            }  
            required  
          />  
        </label>  
  
        <label>  
          Phone  
          <input  
            type="tel"  
            value={phone}  
            onChange={(e) =>  
              setPhone(  
                e.target.value,  
              )  
            }  
            required  
          />  
        </label>  
  
        <label>  
          Address  
          <textarea  
            value={address}  
            onChange={(e) =>  
              setAddress(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <label>  
          Doctor / Referring Doctor  
          <input  
            value={doctorName}  
            onChange={(e) =>  
              setDoctorName(  
                e.target.value,  
              )  
            }  
            placeholder="Doctor name"  
          />  
        </label>  
  
        <label>  
          Doctor's Address  
          <textarea  
            value={doctorAddress}  
            onChange={(e) =>  
              setDoctorAddress(  
                e.target.value,  
              )  
            }  
            placeholder="Clinic / hospital address"  
          />  
        </label>  
  
        {error && (  
          <div className="error-box">  
            {error}  
          </div>  
        )}  
  
        <ModalActions  
          onClose={onClose}  
          busy={busy}  
          label={  
            editing  
              ? 'Save Customer'  
              : 'Save Customer'  
          }  
        />  
      </form>  
    </Modal>  
  )  
}  
  
/* =========================================================  
   SUPPLIER MODAL  
========================================================= */  
  
/* =========================================================
   SUPPLIER DIRECTORY / PURCHASE PARTIES
========================================================= */

function SupplierDirectory({ store }) {
  const [suppliers, setSuppliers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalSupplier, setModalSupplier] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const loadSuppliers = async () => {
    if (!store?.id) return
    setLoading(true)
    setError('')
    try {
      const { data, error: loadError } = await pharmdeskDb
        .from('suppliers')
        .select('*')
        .eq('store_id', store.id)
        .eq('is_active', true)
        .order('supplier_name', { ascending: true })
      if (loadError) throw loadError
      setSuppliers(data || [])
    } catch (loadError) {
      console.error('Failed to load purchase parties:', loadError)
      setError(loadError?.message || 'Unable to load purchase parties.')
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [store?.id])

  const filteredSuppliers = suppliers.filter((supplier) => {
    const haystack = [
      supplier?.supplier_name,
      supplier?.drug_license_number,
      supplier?.contact_person,
      supplier?.phone,
      supplier?.email,
      supplier?.gstin,
      supplier?.address,
    ].filter(Boolean).join(' ').toLowerCase()
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return words.every((word) => haystack.includes(word))
  })

  const openAdd = () => {
    setModalSupplier(null)
    setShowModal(true)
  }

  const openEdit = (supplier) => {
    setModalSupplier(supplier)
    setShowModal(true)
  }

  const handleSaved = async (savedSupplier) => {
    setShowModal(false)
    setModalSupplier(null)
    if (savedSupplier?.id) {
      setSuppliers((current) => {
        const exists = current.some((item) => item.id === savedSupplier.id)
        if (exists) {
          return current.map((item) =>
            item.id === savedSupplier.id ? { ...item, ...savedSupplier } : item,
          )
        }
        return [savedSupplier, ...current]
      })
    }
    await loadSuppliers()
  }

  return (
    <>
      <PanelList title="Purchase Parties">
        <div className="search-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search purchase party by name, phone, GSTIN or licence"
          />
          <button type="button" className="primary-button" onClick={openAdd}>
            + Add Purchase Party
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <div className="muted">Loading purchase parties…</div>
        ) : filteredSuppliers.length === 0 ? (
          <EmptyState
            text={query ? 'No purchase parties match your search.' : 'No purchase parties added yet.'}
          />
        ) : (
          <div className="record-list">
            {filteredSuppliers.map((supplier) => (
              <div className="record-row" key={supplier.id}>
                <div>
                  <strong>{supplier.supplier_name || 'Unnamed purchase party'}</strong>
                  <span>
                    {supplier.phone || supplier.gstin || supplier.drug_license_number || 'No contact details'}
                  </span>
                </div>
                <button type="button" className="secondary-button" onClick={() => openEdit(supplier)}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}
      </PanelList>

      {showModal && (
        <SupplierModal
          store={store}
          supplier={modalSupplier}
          onClose={() => {
            setShowModal(false)
            setModalSupplier(null)
          }}
          onCreated={handleSaved}
        />
      )}
    </>
  )
}

function SupplierModal({  
  store,  
  supplier = null,  
  onClose,  
  onCreated,  
}) {  
  const editing =  
    Boolean(supplier?.id)  
  
  const [name, setName] =  
    useState(  
      supplier?.supplier_name ||  
        '',  
    )  
  
  const [license, setLicense] =  
    useState(  
      supplierLicense(  
        supplier,  
      ),  
    )  
  
  const [phone, setPhone] =  
    useState(  
      supplier?.phone || '',  
    )  
  
  const [email, setEmail] =  
    useState(  
      supplier?.email || '',  
    )  
  
  const [address, setAddress] =  
    useState(  
      supplier?.address || '',  
    )  
  
  const [gstin, setGstin] =  
    useState(  
      supplier?.gstin || '',  
    )  
  
  const [busy, setBusy] =  
    useState(false)  
  
  const [error, setError] =  
    useState('')  
  
  const save = async (e) => {  
    e.preventDefault()  
    setBusy(true)  
    setError('')  
  
    try {  
      if (!name.trim()) {  
        throw new Error(  
          'Supplier name is required.',  
        )  
      }  
  
      const modernPayload = {  
        supplier_name:  
          name.trim(),  
        drug_license_number:  
          license.trim() ||  
          null,  
        phone:  
          phone.trim() ||  
          null,  
        email:  
          email.trim() ||  
          null,  
        address:  
          address.trim() ||  
          null,  
        gstin:  
          gstin.trim() ||  
          null,  
        is_active: true,  
      }  
  
      let result
      let savedPayload = modernPayload

      if (editing) {
        // Avoid .select().single(): PGRST116 can occur when the write succeeds
        // but RLS does not return exactly one representation row.
        result = await pharmdeskDb
          .from('suppliers')
          .update(modernPayload)
          .eq('id', supplier.id)
          .eq('store_id', store.id)
      } else {
        // Write only; the purchase screen refreshes its supplier list afterward.
        result = await pharmdeskDb
          .from('suppliers')
          .insert({
            ...modernPayload,
            store_id: store.id,
          })
      }

      if (  
        result.error &&  
        /drug_license_number|column/i.test(  
          result.error.message ||  
            '',  
        )  
      ) {  
        const legacyPayload = {  
          supplier_name:  
            name.trim(),  
          contact_person:  
            license.trim() ||  
            null,  
          phone:  
            phone.trim() ||  
            null,  
          email:  
            email.trim() ||  
            null,  
          address:  
            address.trim() ||  
            null,  
          gstin:  
            gstin.trim() ||  
            null,  
          is_active: true,  
        }  
  
        savedPayload = legacyPayload

        if (editing) {  
          result =  
            await pharmdeskDb  
              .from(  
                'suppliers',  
              )  
              .update(  
                legacyPayload,  
              )  
              .eq(  
                'id',  
                supplier.id,  
              )  
              .eq(  
                'store_id',  
                store.id,  
              )    
        } else {  
          result =  
            await pharmdeskDb  
              .from(  
                'suppliers',  
              )  
              .insert({  
                ...legacyPayload,  
                store_id:  
                  store.id,  
              })    
        }  
      }  
  
      if (result.error)  
        throw result.error  
      const savedSupplier = {
        ...(editing ? supplier : {}),
        ...savedPayload,
        store_id: store.id,
      }

      onCreated(savedSupplier)  
    } catch (error) {  
      setError(  
        error.message,  
      )  
    } finally {  
      setBusy(false)  
    }  
  }  
  
  return (  
    <Modal  
      title={  
        editing  
          ? 'Edit Purchase Party'  
          : 'Add Purchase Party'  
      }  
      onClose={onClose}  
    >  
      <form onSubmit={save}>  
        <label>  
          Supplier / purchase party  
          <input  
            value={name}  
            onChange={(e) =>  
              setName(  
                e.target.value,  
              )  
            }  
            required  
          />  
        </label>  
  
        <label>  
          Drug licence number  
          <input  
            value={license}  
            onChange={(e) =>  
              setLicense(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <label>  
          Phone  
          <input  
            value={phone}  
            onChange={(e) =>  
              setPhone(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <label>  
          Email  
          <input  
            type="email"  
            value={email}  
            onChange={(e) =>  
              setEmail(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <label>  
          GSTIN  
          <input  
            value={gstin}  
            onChange={(e) =>  
              setGstin(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <label>  
          Address  
          <textarea  
            value={address}  
            onChange={(e) =>  
              setAddress(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        {error && (  
          <div className="error-box">  
            {error}  
          </div>  
        )}  
  
        <ModalActions  
          onClose={onClose}  
          busy={busy}  
          label={  
            editing  
              ? 'Save Company'  
              : 'Save Purchase Party'  
          }  
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
  const [dosageForm, setDosageForm] =  
    useState(  
      initialComposition?.dosage_form ||  
        '',  
    )  
  
  const [source, setSource] =  
    useState(  
      initialComposition?.source ||  
        'manual',  
    )  
  
  const [  
    sourceReference,  
    setSourceReference,  
  ] = useState(  
    initialComposition?.source_reference ||  
      '',  
  )  
  
  const [  
    ingredients,  
    setIngredients,  
  ] = useState(  
    initialComposition  
      ?.composition_ingredients  
      ?.length  
      ? initialComposition.composition_ingredients  
      : [  
          {  
            ingredient_name:  
              '',  
            strength_value:  
              '',  
            strength_unit:  
              'mg',  
            sequence_number:  
              1,  
          },  
        ],  
  )  
  
  const [busy, setBusy] =
    useState(false)
  const [error, setError] =
    useState('')
  const [existingCompositions, setExistingCompositions] = useState([])

  useEffect(() => {
    let cancelled = false

    const loadExistingCompositions = async () => {
      const { data } = await pharmdeskDb
        .from('compositions')
        .select(`
          id,
          name,
          dosage_form,
          composition_ingredients (
            ingredient_name,
            strength_value,
            strength_unit,
            sequence_number
          )
        `)
        .eq('is_active', true)
        .order('name')
        .limit(500)

      if (!cancelled) setExistingCompositions(data || [])
    }

    loadExistingCompositions()
    return () => { cancelled = true }
  }, [])

  const compositionSuggestionsFor = (query, currentCompositionId = null) => {
    const q = String(query || '').trim()
    if (!q) return []

    return existingCompositions
      .filter((composition) => composition.id !== currentCompositionId)
      .map((composition) => ({
        composition,
        score: fuzzyScore(
          q,
          [
            composition.name,
            ...(composition.composition_ingredients || []).map((x) => x.ingredient_name),
          ].filter(Boolean).join(' '),
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.composition)
  }

  const updateIngredient = (  
    index,  
    patch,  
  ) => {  
    setIngredients(  
      (current) =>  
        current.map(  
          (x, i) =>  
            i === index  
              ? {  
                  ...x,  
                  ...patch,  
                }  
              : x,  
        ),  
    )  
  }  
  
  const addIngredient = () => {  
    setIngredients(  
      (current) => [  
        ...current,  
        {  
          ingredient_name:  
            '',  
          strength_value:  
            '',  
          strength_unit:  
            'mg',  
          sequence_number:  
            current.length + 1,  
        },  
      ],  
    )  
  }  
  
  const removeIngredient = (  
    index,  
  ) => {  
    setIngredients(  
      (current) =>  
        current  
          .filter(  
            (_, i) =>  
              i !== index,  
          )  
          .map(  
            (x, i) => ({  
              ...x,  
              sequence_number:  
                i + 1,  
            }),  
          ),  
    )  
  }  
  
  const save = async (e) => {  
    e.preventDefault()  
    setBusy(true)  
    setError('')  
  
    try {  
      const clean =  
        ingredients  
          .filter((x) =>  
            x.ingredient_name.trim(),  
          )  
          .map((x, i) => ({  
            ingredient_name:  
              x.ingredient_name.trim(),  
            strength_value:  
              safeNumber(  
                x.strength_value,  
              ),  
            strength_unit:  
              x.strength_unit,  
            sequence_number:  
              i + 1,  
          }))  
  
      if (!clean.length) {  
        throw new Error(  
          'Add at least one ingredient.',  
        )  
      }
      const data = await PharmDeskAPI.saveComposition({
        compositionId: initialComposition?.id || null,
        dosageForm: dosageForm.trim() || null,
        source,
        sourceReference: sourceReference.trim() || null,
        ingredients: clean,
      })  
  
      onCreated(data)  
    } catch (error) {  
      setError(  
        error.message,  
      )  
    } finally {  
      setBusy(false)  
    }  
  }  
  
  return (  
    <Modal  
      title="Composition"  
      onClose={onClose}  
    >  
      <form onSubmit={save}>  
        <label>  
          Dosage form  
          <input  
            value={  
              dosageForm  
            }  
            onChange={(e) =>  
              setDosageForm(  
                e.target.value,  
              )  
            }  
            placeholder="Tablet / Capsule / Syrup"  
          />  
        </label>  
  
        <label>  
          Source  
          <input  
            value={source}  
            onChange={(e) =>  
              setSource(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <label>  
          Source reference  
          <input  
            value={  
              sourceReference  
            }  
            onChange={(e) =>  
              setSourceReference(  
                e.target.value,  
              )  
            }  
          />  
        </label>  
  
        <h3>  
          Ingredients  
        </h3>  
  
        {ingredients.map(  
          (  
            ingredient,  
            index,  
          ) => (  
            <div  
              className="ingredient-row"  
              key={index}  
            >  
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <input
                  placeholder="Ingredient"
                  value={ingredient.ingredient_name}
                  onChange={(e) =>
                    updateIngredient(index, {
                      ingredient_name: e.target.value,
                      selectedSuggestion: false,
                    })
                  }
                />

                {ingredient.ingredient_name && !ingredient.selectedSuggestion && compositionSuggestionsFor(ingredient.ingredient_name).length > 0 && (
                  <div className="suggestion-list" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20 }}>
                    {compositionSuggestionsFor(ingredient.ingredient_name).map((composition) => (
                      <button
                        type="button"
                        className="suggestion"
                        key={`${index}-${composition.id}`}
                        onClick={() => {
                          const firstIngredient = composition.composition_ingredients?.[0]?.ingredient_name || composition.name
                          updateIngredient(index, { ingredient_name: firstIngredient, selectedSuggestion: true })
                        }}
                      >
                        <strong>{composition.name}</strong>
                        <span>{(composition.composition_ingredients || []).map((x) => x.ingredient_name).filter(Boolean).join(' + ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input  
                type="number"  
                min="0"  
                step="any"  
                placeholder="Strength"  
                value={  
                  ingredient.strength_value  
                }  
                onChange={(e) =>  
                  updateIngredient(  
                    index,  
                    {  
                      strength_value:  
                        e.target.value,  
                    },  
                  )  
                }  
              />  
  
              <input  
                placeholder="Unit"  
                value={  
                  ingredient.strength_unit  
                }  
                onChange={(e) =>  
                  updateIngredient(  
                    index,  
                    {  
                      strength_unit:  
                        e.target.value,  
                    },  
                  )  
                }  
              />  
  
              {ingredients.length >  
                1 && (  
                <button  
                  type="button"  
                  className="danger-button"  
                  onClick={() =>  
                    removeIngredient(  
                      index,  
                    )  
                  }  
                >  
                  ×  
                </button>  
              )}  
            </div>  
          ),  
        )}  
  
        <button  
          type="button"  
          className="secondary-button"  
          onClick={  
            addIngredient  
          }  
        >  
          + Ingredient  
        </button>  
  
        {error && (  
          <div className="error-box">  
            {error}  
          </div>  
        )}  
  
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
  const editing =  
    Boolean(product?.id)  
  
  const [categories, setCategories] =  
    useState([])  
  const [compositions, setCompositions] =  
    useState([])  
  
  
  const [manufacturers, setManufacturers] = useState([])
const [  
    compositionQuery,  
    setCompositionQuery,  
  ] = useState('')  
  
  const [  
    selectedComposition,  
    setSelectedComposition,  
  ] = useState(null)  
  
  const [  
    compositionModal,  
    setCompositionModal,  
  ] = useState(false)  
  
  const [name, setName] =  
    useState(  
      product?.product_name ||  
        '',  
    )  
  
  const [  
    genericDisplayName,  
    setGenericDisplayName,  
  ] = useState(  
    product?.generic_display_name ||  
      '',  
  )  
  
  const [  
    manufacturer,  
    setManufacturer,  
  ] = useState(  
    product?.manufacturer ||  
      '',  
  )

  const [selectedManufacturer, setSelectedManufacturer] = useState(product?.manufacturer || '')  
  
  const [  
    dosageForm,  
    setDosageForm,  
  ] = useState(  
    product?.dosage_form ||  
      '',  
  )  
  
  const [  
    strengthDisplay,  
    setStrengthDisplay,  
  ] = useState(  
    product?.strength_display ||  
      '',  
  )  
  
  const [categoryId, setCategoryId] =  
    useState(  
      product?.category_id ||  
        '',  
    )  
  
  const [hsn, setHsn] =  
    useState(  
      product?.hsn_code || '',  
    )  
  
  const [gst, setGst] =  
    useState(  
      product?.gst_rate ?? 0,  
    )  
  
  const [  
    sellingPrice,  
    setSellingPrice,  
  ] = useState(  
    product?.default_selling_price ??  
      0,  
  )  
  
  const [  
    discount,  
    setDiscount,  
  ] = useState(  
    product?.default_discount_percent ??  
      0,  
  )  
  
  const [  
    minimumStock,  
    setMinimumStock,  
  ] = useState(  
    product?.minimum_stock ??  
      0,  
  )  
  
  const [  
    reorderLevel,  
    setReorderLevel,  
  ] = useState(  
    product?.reorder_level ??  
      0,  
  )  
  
  const [  
    packQuantity,  
    setPackQuantity,  
  ] = useState(  
    product?.pack_quantity ??  
      1,  
  )  
  
  const [  
    packUnit,  
    setPackUnit,  
  ] = useState(  
    product?.pack_unit ||  
      'pack',  
  )  
  
  const [  
    aliasText,  
    setAliasText,  
  ] = useState('')  
  
  const [  
    packagingName,  
    setPackagingName,  
  ] = useState('Standard')  
  
  const [  
    packagingLevels,  
    setPackagingLevels,  
  ] = useState([  
    {  
      level_number: 1,  
      unit_name:  
        'Tablet',  
      units_per_parent: 1,  
      is_purchase_unit:  
        true,  
      is_sale_unit:  
        true,  
      is_preferred_sale_unit:  
        true,  
      is_stock_unit:  
        true,  
    },  
  ])  
  
  const [  
    packagingDirty,  
    setPackagingDirty,  
  ] = useState(  
    !editing,  
  )  
  
  const [busy, setBusy] =  
    useState(false)  
  
  const [error, setError] =  
    useState('')  
  
  useEffect(() => {  
    loadMasterData()  
  }, [store?.id, product?.id])  
  
  const loadMasterData =  
    async () => {  
      const [  
        categoryResult,  
        manufacturerResult,
        compositionResult,  
      ] = await Promise.all([  
        pharmdeskDb  
          .from(  
            'product_categories',  
          )  
          .select('*')  
          .eq(  
            'is_active',  
            true,  
          ),  

        pharmdeskDb
          .from('products')
          .select('manufacturer')
          .eq('is_active', true)
          .not('manufacturer', 'is', null)
          .order('manufacturer')
          .limit(500),

  
        pharmdeskDb  
          .from(  
            'compositions',  
          )  
          .select(`  
            *,  
            composition_ingredients (  
              ingredient_name,  
              strength_value,  
              strength_unit,  
              sequence_number  
            )  
          `)  
          .eq(  
            'is_active',  
            true,  
          )  
          .order('name'),  
      ])  
  
      const categoryRows =  
        categoryResult.data ||  
        []  
  
      const compositionRows =  
        compositionResult.data ||  
        []  
  
      setCategories(  
        categoryRows,  
      )  
  
      setCompositions(  
        compositionRows,  
      )  
  
      setManufacturers(
        Array.from(
          new Set(
            (manufacturerResult?.data || [])
              .map((x) => String(x.manufacturer || '').trim())
              .filter(Boolean),
          ),
        ),
      )

      if (  
        product?.composition_id  
      ) {  
        const found =  
          compositionRows.find(  
            (x) =>  
              x.id ===  
              product.composition_id,  
          )  
  
        if (found) {  
          setSelectedComposition(  
            found,  
          )  
          setGenericDisplayName(  
            product.generic_display_name ||  
              found.name,  
          )  
        }  
      }  
  
      if (product?.id) {  
        const {  
          data: aliases,  
        } = await pharmdeskDb  
          .from(  
            'product_aliases',  
          )  
          .select(  
            'alias',  
          )  
          .eq(  
            'product_id',  
            product.id,  
          )  
  
        setAliasText(  
          (aliases || [])  
            .map(  
              (x) =>  
                x.alias,  
            )  
            .join(', '),  
        )  
  
        const {  
          data: configs,  
        } =  
          await pharmdeskDb  
            .from(  
              'product_packaging_configs',  
            )  
            .select(`  
              *,  
              product_packaging_levels (*)  
            `)  
            .eq(  
              'product_id',  
              product.id,  
            )  
            .eq(  
              'is_active',  
              true,  
            )  
            .order(  
              'is_default',  
              {  
                ascending:  
                  false,  
              },  
            )  
            .limit(1)  
  
        const config =  
          configs?.[0]  
  
        if (config) {  
          setPackagingName(  
            config.name ||  
              'Standard',  
          )  
  
          const levels =  
            config.product_packaging_levels  
              ?.slice()  
              .sort(  
                (a, b) =>  
                  a.level_number -  
                  b.level_number,  
              )  
  
          if (  
            levels?.length  
          ) {  
            setPackagingLevels(  
              levels,  
            )  
          }  
        }  
  
        setPackagingDirty(  
          false,  
        )  
      }  
    }  
  
  const filteredCompositions =  
    compositions  
      .map(  
        (composition) => ({  
          composition,  
          score: fuzzyScore(  
            compositionQuery,  
            [  
              composition.name,  
              ...(  
                composition.composition_ingredients ||  
                []  
              ).map(  
                (x) =>  
                  x.ingredient_name,  
              ),  
            ].join(' '),  
          ),  
        }),  
      )  
      .filter(  
        (x) =>  
          !compositionQuery ||  
          x.score > 0,  
      )  
      .sort(  
        (a, b) =>  
          b.score -  
          a.score,  
      )  
      .slice(0, 10)  
      .map(  
        (x) =>  
          x.composition,  
      )  
  
  const updatePackagingLevel =  
    (  
      index,  
      patch,  
    ) => {  
      setPackagingDirty(  
        true,  
      )  
  
      setPackagingLevels(  
        (current) =>  
          current.map(  
            (x, i) =>  
              i === index  
                ? {  
                    ...x,  
                    ...patch,  
                  }  
                : x,  
          ),  
      )  
    }  
  
  const addPackagingLevel =  
    () => {  
      setPackagingDirty(  
        true,  
      )  
  
      setPackagingLevels(  
        (current) => {  
          const nextLevel =  
            current.length +  
            1  
  
          return [  
            ...current.map(  
              (x) => ({  
                ...x,  
                is_stock_unit:  
                  false,  
              }),  
            ),  
  
            {  
              level_number:  
                nextLevel,  
              unit_name:  
                '',  
              units_per_parent:  
                1,  
              is_purchase_unit:  
                false,  
              is_sale_unit:  
                true,  
              is_preferred_sale_unit:  
                false,  
              is_stock_unit:  
                true,  
            },  
          ]  
        },  
      )  
    }  
  
  const removePackagingLevel =  
    (index) => {  
      if (  
        packagingLevels.length ===  
        1  
      )  
        return  
  
      setPackagingDirty(  
        true,  
      )  
  
      setPackagingLevels(  
        (current) =>  
          current  
            .filter(  
              (_, i) =>  
                i !== index,  
            )  
            .map(  
              (x, i) => ({  
                ...x,  
                level_number:  
                  i + 1,  
                is_stock_unit:  
                  i ===  
                  current.length -  
                    2,  
              }),  
            ),  
      )  
    }  
  
  const validatePackaging =  
    () => {  
      if (  
        !packagingLevels.length  
      ) {  
        throw new Error(  
          'Add at least one packaging level.',  
        )  
      }  
  
      const names = new Set()  
  
      for (const level of  
        packagingLevels) {  
        if (  
          !String(  
            level.unit_name ||  
              '',  
          ).trim()  
        ) {  
          throw new Error(  
            'Every packaging level needs a unit name.',  
          )  
        }  
  
        const normalized =  
          normalize(  
            level.unit_name,  
          )  
  
        if (  
          names.has(  
            normalized,  
          )  
        ) {  
          throw new Error(  
            'Packaging unit names must be unique.',  
          )  
        }  
  
        names.add(  
          normalized,  
        )  
  
        if (  
          safeNumber(  
            level.units_per_parent,  
          ) <= 0  
        ) {  
          throw new Error(  
            'Units per parent must be greater than zero.',  
          )  
        }  
      }  
  
      const purchaseUnits =  
        packagingLevels.filter(  
          (x) =>  
            x.is_purchase_unit,  
        )  
  
      const stockUnits =  
        packagingLevels.filter(  
          (x) =>  
            x.is_stock_unit,  
        )  
  
      const preferredUnits =  
        packagingLevels.filter(  
          (x) =>  
            x.is_preferred_sale_unit,  
        )  
  
      if (  
        purchaseUnits.length !==  
        1  
      ) {  
        throw new Error(  
          'Select exactly one purchase unit.',  
        )  
      }  
  
      if (  
        stockUnits.length !==  
        1  
      ) {  
        throw new Error(  
          'Select exactly one stock unit.',  
        )  
      }  
  
      if (  
        preferredUnits.length >  
        1  
      ) {  
        throw new Error(  
          'Select at most one preferred sale unit.',  
        )  
      }  
  
      const stockIndex =  
        packagingLevels.findIndex(  
          (x) =>  
            x.is_stock_unit,  
        )  
  
      if (  
        stockIndex !==  
        packagingLevels.length -  
          1  
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
        throw new Error(  
          'Product name is required.',  
        )  
      }  
  
      if (  
        safeNumber(gst) <  
          0 ||  
        safeNumber(gst) >  
          100  
      ) {  
        throw new Error(  
          'GST must be between 0 and 100.',  
        )  
      }  
  
      if (  
        safeNumber(  
          discount,  
        ) < 0 ||  
        safeNumber(  
          discount,  
        ) > 100  
      ) {  
        throw new Error(  
          'Discount must be between 0 and 100.',  
        )  
      }  
  
      if (  
        compositionQuery.trim() &&  
        !selectedComposition  
      ) {  
        throw new Error(  
          'Select the composition from the suggestions or create a new one.',  
        )  
      }  
  
      if (  
        !editing &&  
        !selectedComposition &&  
        !product?.composition_id  
      ) {  
        throw new Error(  
          'Select a composition or create one.',  
        )  
      }  
  
      const compositionId =  
        selectedComposition?.id ||  
        product?.composition_id ||  
        null  
  
      const genericName =  
        selectedComposition?.name ||  
        genericDisplayName.trim() ||  
        product?.generic_display_name ||  
        null  
  
      if (!editing ||  
        packagingDirty) {  
        validatePackaging()  
      }
      const productId = await PharmDeskAPI.saveProduct({
        storeId: store.id,
        productId: product?.id || null,
        productName: name.trim(),
        genericDisplayName: genericName,
        categoryId: categoryId || null,
        compositionId,
        manufacturer: manufacturer.trim() || null,
        dosageForm: dosageForm.trim() || null,
        strengthDisplay: strengthDisplay.trim() || null,
        packQuantity: safeNumber(packQuantity) || 1,
        packUnit: packUnit.trim() || 'pack',
        hsnCode: hsn.trim() || null,
        gstRate: safeNumber(gst),
        defaultSellingPrice: safeNumber(sellingPrice),
        defaultDiscountPercent: safeNumber(discount),
        minimumStock: safeNumber(minimumStock),
        reorderLevel: safeNumber(reorderLevel),
        isActive: true,
      })  
  
      if (  
        !editing ||  
        packagingDirty  
      ) {
        await PharmDeskAPI.savePackagingConfig(
          productId,
          null,
          packagingName.trim() || 'Standard',
          packagingLevels.map((x, index) => ({
            ...x,
            level_number: index + 1,
            units_per_parent: safeNumber(x.units_per_parent) || 1,
          })),
        )  
      }  
  
      const aliases =  
        aliasText  
          .split(',')  
          .map((x) =>  
            x.trim(),  
          )  
          .filter(Boolean)  
  
      if (productId) {  
        const {  
          error:  
            aliasDeleteError,  
        } =  
          await pharmdeskDb  
            .from(  
              'product_aliases',  
            )  
            .delete()  
            .eq(  
              'product_id',  
              productId,  
            )  
  
        if (  
          aliasDeleteError  
        ) {  
          throw aliasDeleteError  
        }  
  
        if (aliases.length) {  
          const {  
            error:  
              aliasInsertError,  
          } =  
            await pharmdeskDb  
              .from(  
                'product_aliases',  
              )  
              .insert(  
                aliases.map(  
                  (alias) => ({  
                    product_id:  
                      productId,  
                    alias,  
                  }),  
                ),  
              )  
  
          if (  
            aliasInsertError  
          ) {  
            throw aliasInsertError  
          }  
        }  
      }  
  
      onCreated({  
        id: productId,  
      })  
    } catch (error) {  
      setError(  
        error.message,  
      )  
    } finally {  
      setBusy(false)  
    }  
  }  
  
  const deleteProduct = async () => {
    if (!editing || !product?.id) return

    const confirmed = window.confirm(
      `Delete ${product.product_name || 'this product'}?\n\nThis will deactivate the product so it no longer appears in active product searches. Historical sales and purchases are preserved.`,
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      const { error: storeProductError } = await pharmdeskDb
        .from('store_products')
        .update({ is_active: false })
        .eq('store_id', store.id)
        .eq('product_id', product.id)

      if (storeProductError) throw storeProductError
      onCreated({ id: product.id, deleted: true })
    } catch (error) {
      setError(error.message || 'Unable to delete product.')
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
              setName(  
                e.target.value,  
              )  
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
                : compositionQuery ||  
                  genericDisplayName  
            }  
            onChange={(e) => {  
              setSelectedComposition(  
                null,  
              )  
              setCompositionQuery(  
                e.target.value,  
              )  
              setGenericDisplayName(  
                e.target.value,  
              )  
            }}  
            placeholder="Search composition / ingredient"  
          />  
  
          {compositionQuery &&  
            !selectedComposition && (  
              <div className="suggestion-list">  
                {filteredCompositions.map(  
                  (  
                    composition,  
                  ) => (  
                    <button  
                      type="button"  
                      className="suggestion"  
                      key={  
                        composition.id  
                      }  
                      onClick={() => {  
                        setSelectedComposition(  
                          composition,  
                        )  
  
                        setGenericDisplayName(  
                          composition.name,  
                        )  
  
                        setCompositionQuery(  
                          '',  
                        )  
                      }}  
                    >  
                      <strong>  
                        {  
                          composition.name  
                        }  
                      </strong>  
  
                      <span>  
                        {  
                          composition.dosage_form ||  
                          ''  
                        }  
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
              setCompositionModal(  
                true,  
              )  
            }  
          >  
            + Add Composition  
          </button>  
        </label>  
  
        <div className="form-grid">  
          <label>  
            Manufacturer  
            <input  
              value={  
                manufacturer  
              }  
              onChange={(e) => {
                setManufacturer(e.target.value)
                setSelectedManufacturer('')
              }}
            placeholder="Search manufacturer / company"
            />

            {manufacturer && !selectedManufacturer && manufacturers.length > 0 && (
              <div className="suggestion-list">
                {manufacturers
                  .map((value) => ({ value, score: fuzzyScore(manufacturer, value) }))
                  .filter((x) => x.score > 0)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 8)
                  .map((x) => (
                    <button
                      type="button"
                      className="suggestion"
                      key={x.value}
                      onClick={() => { setManufacturer(x.value); setSelectedManufacturer(x.value) }}
                    >
                      <strong>{x.value}</strong>
                    </button>
                  ))}
              </div>
            )}
          </label>  
  
          <label>  
            Dosage form  
            <input  
              value={  
                dosageForm  
              }  
              onChange={(e) =>  
                setDosageForm(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            Strength  
            <input  
              value={  
                strengthDisplay  
              }  
              onChange={(e) =>  
                setStrengthDisplay(  
                  e.target.value,  
                )  
              }  
              placeholder="650 mg"  
            />  
          </label>  
  
          <label>  
            Category  
            <select  
              value={  
                categoryId  
              }  
              onChange={(e) =>  
                setCategoryId(  
                  e.target.value,  
                )  
              }  
            >  
              <option value="">  
                Select category  
              </option>  
  
              {categories.map(  
                (category) => (  
                  <option  
                    key={  
                      category.id  
                    }  
                    value={  
                      category.id  
                    }  
                  >  
                    {category.name}  
                  </option>  
                ),  
              )}  
            </select>  
          </label>  
  
          <label>  
            HSN  
            <input  
              value={hsn}  
              onChange={(e) =>  
                setHsn(  
                  e.target.value,  
                )  
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
                setGst(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            Default selling price  
            <input  
              type="number"  
              min="0"  
              step="0.01"  
              value={  
                sellingPrice  
              }  
              onChange={(e) =>  
                setSellingPrice(  
                  e.target.value,  
                )  
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
              value={  
                discount  
              }  
              onChange={(e) =>  
                setDiscount(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            Minimum stock  
            <input  
              type="number"  
              min="0"  
              value={  
                minimumStock  
              }  
              onChange={(e) =>  
                setMinimumStock(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            Reorder level  
            <input  
              type="number"  
              min="0"  
              value={  
                reorderLevel  
              }  
              onChange={(e) =>  
                setReorderLevel(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            Legacy pack quantity  
            <input  
              type="number"  
              min="0.01"  
              step="any"  
              value={  
                packQuantity  
              }  
              onChange={(e) =>  
                setPackQuantity(  
                  e.target.value,  
                )  
              }  
            />  
          </label>  
  
          <label>  
            Pack unit  
            <input  
              value={  
                packUnit  
              }  
              onChange={(e) =>  
                setPackUnit(  
                  e.target.value,  
                )  
              }  
              placeholder="strip / bottle / box"  
            />  
          </label>  
        </div>  
  
        <label>  
          Product aliases  
          <input  
            value={aliasText}  
            onChange={(e) =>  
              setAliasText(  
                e.target.value,  
              )  
            }  
            placeholder="Comma separated: brand name, alternate spelling, old name"  
          />  
        </label>  
  
        <div className="packaging-section">  
          <div className="section-heading">  
            <div>  
              <h3>  
                Packaging  
              </h3>  
  
              <p className="muted">  
                Define how the product is  
                purchased, sold and  
                physically stocked.  
              </p>  
            </div>  
          </div>  
  
          <label>  
            Configuration name  
            <input  
              value={  
                packagingName  
              }  
              onChange={(e) => {  
                setPackagingDirty(  
                  true,  
                )  
                setPackagingName(  
                  e.target.value,  
                )  
              }}  
            />  
          </label>  
  
          {packagingLevels.map(  
            (  
              level,  
              index,  
            ) => (  
              <div  
                className="packaging-card"  
                key={index}  
              >  
                <div className="packaging-title">  
                  <strong>  
                    Level{' '}  
                    {index + 1}  
                  </strong>  
  
                  {packagingLevels.length >  
                    1 && (  
                    <button  
                      type="button"  
                      className="danger-button"  
                      onClick={() =>  
                        removePackagingLevel(  
                          index,  
                        )  
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
                      value={  
                        level.unit_name  
                      }  
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
                      disabled={  
                        index === 0  
                      }  
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
                    onChange={() => {  
                      setPackagingDirty(  
                        true,  
                      )  
  
                      setPackagingLevels(  
                        packagingLevels.map(  
                          (  
                            x,  
                            i,  
                          ) => ({  
                            ...x,  
                            is_purchase_unit:  
                              i ===  
                              index,  
                          }),  
                        ),  
                      )  
                    }}  
                  />  
  
                  <ToggleRow  
                    label="Sale unit"  
                    checked={  
                      level.is_sale_unit  
                    }  
                    onChange={(  
                      checked,  
                    ) =>  
                      updatePackagingLevel(  
                        index,  
                        {  
                          is_sale_unit:  
                            checked,  
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
                    onChange={() => {  
                      setPackagingDirty(  
                        true,  
                      )  
  
                      setPackagingLevels(  
                        packagingLevels.map(  
                          (  
                            x,  
                            i,  
                          ) => ({  
                            ...x,  
                            is_preferred_sale_unit:  
                              i ===  
                              index,  
                            is_sale_unit:  
                              i ===  
                              index  
                                ? true  
                                : x.is_sale_unit,  
                          }),  
                        ),  
                      )  
                    }}  
                  />  
  
                  <ToggleRow  
                    label="Stock unit"  
                    checked={  
                      level.is_stock_unit  
                    }  
                    onChange={() => {  
                      setPackagingDirty(  
                        true,  
                      )  
  
                      setPackagingLevels(  
                        packagingLevels.map(  
                          (  
                            x,  
                            i,  
                          ) => ({  
                            ...x,  
                            is_stock_unit:  
                              i ===  
                              index,  
                          }),  
                        ),  
                      )  
                    }}  
                  />  
                </div>  
              </div>  
            ),  
          )}  
  
          <button  
            type="button"  
            className="secondary-button"  
            onClick={  
              addPackagingLevel  
            }  
          >  
            + Add Packaging Level  
          </button>  
  
          <div className="info-box">  
            Example: 1 Box → 10 Strips →  
            100 Tablets. The lowest level is  
            the stock unit.  
          </div>  
        </div>  
  
        {error && (  
          <div className="error-box">  
            {error}  
          </div>  
        )}  
  
        <div className="modal-actions">
          {editing && (
            <button
              type="button"
              className="danger-button"
              onClick={deleteProduct}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete Product'}
            </button>
          )}
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
            {busy ? 'Saving…' : editing ? 'Save Product' : 'Create Product'}
          </button>
        </div>  
      </form>  
  
      {compositionModal && (  
        <CompositionModal  
          onClose={() =>  
            setCompositionModal(  
              false,  
            )  
          }  
          onCreated={async (  
            compositionId,  
          ) => {  
            setCompositionModal(  
              false,  
            )  
  
            const { data } =  
              await pharmdeskDb  
                .from(  
                  'compositions',  
                )  
                .select(`  
                  *,  
                  composition_ingredients (  
                    ingredient_name,  
                    strength_value,  
                    strength_unit,  
                    sequence_number  
                  )  
                `)  
                .eq(  
                  'id',  
                  compositionId,  
                )  
                .maybeSingle()  
  
            if (data) {  
              setCompositions(  
                (current) => [  
                  data,  
                  ...current.filter(  
                    (x) =>  
                      x.id !==  
                      data.id,  
                  ),  
                ],  
              )  
  
              setSelectedComposition(  
                data,  
              )  
  
              setGenericDisplayName(  
                data.name,  
              )  
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
  
function ModuleHeader({
  title,
  subtitle,
  right,
}) {
  return (
    <div className="module-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {right}
    </div>
  )
}  
  
function TabBar({  
  tabs,  
  active,  
  onChange,  
}) {  
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
          onClick={() =>  
            onChange(tab)  
          }  
        >  
          {tab}  
        </button>  
      ))}  
    </div>  
  )  
}  
  
function PanelList({  
  title,  
  children,  
}) {  
  return (  
    <section className="panel">  
      {title && (  
        <div className="panel-header">  
          <h2>{title}</h2>  
        </div>  
      )}  
  
      <div className="panel-body">  
        {children}  
      </div>  
    </section>  
  )  
}  
  
function EmptyState({  
  text,  
}) {  
  return (  
    <div className="empty-state">  
      {text}  
    </div>  
  )  
}  
  
function LoadingInline() {  
  return (  
    <div className="loading-inline">  
      Loading…  
    </div>  
  )  
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
        checked={Boolean(  
          checked,  
        )}  
        onChange={(e) =>  
          onChange(  
            e.target.checked,  
          )  
        }  
      />  
    </label>  
  )  
}  
  
/* =========================================================  
   MODAL  
   iOS/iPad-safe scrolling  
========================================================= */  
  
function Modal({
  title,
  onClose,
  children,
}) {
  const modalContent = (
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

  return createPortal(
    modalContent,
    document.body,
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
        onClick={  
          onClose  
        }  
        disabled={busy}  
      >  
        Cancel  
      </button>  
  
      <button  
        type="submit"  
        className="primary-button"  
        disabled={busy}  
      >  
        {busy  
          ? 'Saving…'  
          : label}  
      </button>  
    </div>  
  )  
}  
