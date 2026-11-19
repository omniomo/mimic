// Base styles first: the editor, then the phone. Each skin's own CSS comes after and overrides the phone's.
import './ui/ui.css'
import './scene/phone.css'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(<App />)
