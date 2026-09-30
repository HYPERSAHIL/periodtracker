import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import App from './App';
import { track } from './lib/beacon';
import './styles.css';

registerSW({
  immediate: true,
  onRegisterError: () => track('update_sw_error'),
  onOfflineReady: () => track('update_sw_ready'),
});

// PWA share_target (?share=1&text=..) and file_handlers (?open=backup):
// stash the payload, strip the query, let App consume it after mount.
try {
  const q = new URLSearchParams(location.search);
  if (q.get('share') === '1') {
    const text = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n');
    if (text) {
      sessionStorage.setItem('pt.shared.v1', text);
      // App may already be mounted (repeat share while open)
      window.dispatchEvent(new Event('pt:shared'));
    }
    history.replaceState(null, '', location.pathname);
  }
  const LQ = (window as unknown as { launchQueue?: { setConsumer: (fn: (p: unknown) => void) => void } }).launchQueue;
  LQ?.setConsumer((params) => {
    const files = (params as { files?: File[] })?.files ?? [];
    if (!files.length) return;
    void files[0]
      .text()
      .then((text) => {
        sessionStorage.setItem('pt.openfile.v1', JSON.stringify({ name: files[0].name, text }));
        window.dispatchEvent(new Event('pt:openfile'));
      })
      .catch(() => track('import_failed', { via: 'pwa', reason: 'intake' }));
  });
} catch {
  track('import_failed', { via: 'pwa', reason: 'intake_error' });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
