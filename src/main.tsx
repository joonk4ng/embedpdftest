import { createRoot } from 'react-dom/client'
import * as pdfjsLib from 'pdfjs-dist'
import './index.css'
import App from './App.tsx'

// Configure PDF.js worker globally
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
  
  // Configure PDF.js for better font handling
  pdfjsLib.GlobalWorkerOptions.workerPort = null
}

// Temporarily disable StrictMode to avoid double renders during debugging
createRoot(document.getElementById('root')!).render(
  <App />
  // <StrictMode>
  //   <App />
  // </StrictMode>,
)
