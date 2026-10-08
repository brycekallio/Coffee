import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'

// Publishable by design: it identifies the Clerk instance and is already visible
// in the JavaScript every visitor downloads. Nothing is protected by hiding it --
// RLS is what guards the data.
//
// Committed rather than left to the build environment because a missing env var
// renders a blank page with no error, and that failure has already happened
// twice. An env var still wins when set, which is how the production instance
// gets its pk_live_ key later.
const CLERK_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  "pk_test_bW9kZWwtYW50ZWxvcGUtMzkzNS5jbGVyay5hY2NvdW50cy5kZXYk"

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
