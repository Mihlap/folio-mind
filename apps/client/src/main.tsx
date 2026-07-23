import { installPromiseWithResolversPolyfill } from './lib/polyfills/promise-with-resolvers.js';

installPromiseWithResolversPolyfill();

import './lib/setupPdfWorker.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { createAppStore } from '@folio-mind/store';
import { App } from './app/App.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import { initNativeShell } from './lib/capacitor/init-native-shell.js';
import './index.css';

void initNativeShell();

const store = createAppStore();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </AppErrorBoundary>
  </StrictMode>,
);
