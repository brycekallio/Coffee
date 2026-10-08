import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'

// Publishable by design -- it identifies the Clerk instance and ships in every
// client. The secret key is Clerk's side only and never appears in this app.
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Register service worker for offline PWA support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((error) => {
    console.log('Service Worker registration failed:', error)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={CLERK_KEY}
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorBackground: '#0b1420',
          colorPrimary: '#00e5ff',
          colorText: '#ffffff',
          colorInputBackground: 'rgba(255,255,255,0.04)',
          borderRadius: '0.75rem',
        },
      }}
    >
    <Toaster
      theme="dark"
      position="top-right"
      toastOptions={{
        style: {
          background: 'rgba(11, 20, 32, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: 'white',
          backdropFilter: 'blur(16px)',
        },
      }}
    />
    <App />
    </ClerkProvider>
  </StrictMode>,
)
