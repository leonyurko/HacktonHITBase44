import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

// Reveal Material Symbols icons only once the icon font has actually loaded.
// Without this, the literal text ("home", "mic", "calendar_today") flashes
// in every icon slot for the first ~200ms after a cold load.
const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
if (fonts?.ready) {
  fonts.ready.then(() => {
    document.documentElement.classList.add('icons-loaded');
  });
} else {
  // Older browsers: just show them; flash is acceptable.
  document.documentElement.classList.add('icons-loaded');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
