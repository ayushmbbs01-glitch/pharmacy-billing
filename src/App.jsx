import { useState } from 'react'

function App() {
  const [message, setMessage] = useState('')

  return (
    <main style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Pharmacy Billing</h1>
      <p>Cloud-based pharmacy billing and inventory management</p>

      <button onClick={() => setMessage('App is working!')}>
        Test App
      </button>

      {message && <p>{message}</p>}
    </main>
  )
}

export default App