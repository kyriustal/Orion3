import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ─── Interceptor global de 401 ────────────────────────────────────────────────
// Apanha qualquer resposta 401 em toda a app e redireciona para o login.
const _originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await _originalFetch(...args);
  if (response.status === 401) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    // Apenas interceptar chamadas à nossa API (ignorar webhooks externos, etc.)
    if (url.includes('/api/') && !url.includes('/api/auth/')) {
      const alreadyOnLogin = window.location.pathname === '/login';
      if (!alreadyOnLogin) {
        localStorage.removeItem('token');
        // Pequeno delay para deixar o toast da página aparecer primeiro
        setTimeout(() => { window.location.href = '/login'; }, 1800);
      }
    }
  }
  return response;
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
