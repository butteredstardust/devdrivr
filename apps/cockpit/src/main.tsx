import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { App } from '@/app/App'
import { Providers } from '@/app/providers'
import { NotePopout } from '@/components/shell/NotePopout'
import { QuickCapture } from '@/components/shell/QuickCapture'
import { applyTheme } from '@/lib/theme'

applyTheme('system')

const _params = new URLSearchParams(window.location.search)
const _noteId = _params.get('note')
const _isQuickCapture = _params.has('quick-capture')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {_noteId ? (
      <NotePopout noteId={_noteId} />
    ) : _isQuickCapture ? (
      <QuickCapture />
    ) : (
      <Providers>
        <App />
      </Providers>
    )}
  </React.StrictMode>
)
