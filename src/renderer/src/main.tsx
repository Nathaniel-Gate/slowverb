import { createRoot } from 'react-dom/client'
import './theme/index.css'
import { App } from './App'
import { wire } from './wire'
wire().finally(() => createRoot(document.getElementById('root')!).render(<App />))
