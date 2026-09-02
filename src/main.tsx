import ReactDOM from 'react-dom/client'
import './index.css'
import { App } from '@/app/App'
import { Providers } from '@/app/providers'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById('root')!).render(
  // safe: root element is always present in index.html
  <Providers>
    <App />
  </Providers>
)
