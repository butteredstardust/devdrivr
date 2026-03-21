import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { applyTheme } from '@/lib/theme'

applyTheme('system')

function App() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="font-pixel text-2xl text-[var(--color-accent)]">devdrivr</h1>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
