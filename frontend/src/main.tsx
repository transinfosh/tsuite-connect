import { createRoot } from 'react-dom/client'
import { setNonce } from 'get-nonce'
import App from './App'
import './style.css'

const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content
if (nonce) setNonce(nonce)

createRoot(document.getElementById('app')!).render(<App />)
