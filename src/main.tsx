import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';
import { captureAuthLink } from './lib/authLink';
import { installErrorReporting } from './lib/errors';
import { captureInstallPrompt } from './lib/install';
import { initTheme } from './lib/prefs';
import './styles/app.css';

// Service worker: the app shell is cached, so it opens without signal at the gym.
installErrorReporting();
registerSW({ immediate: true });
captureInstallPrompt();
captureAuthLink();
initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root ausente');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
