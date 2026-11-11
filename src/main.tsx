import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary, ToastProvider, ConfirmProvider } from './components';
import { startFileLinkTracking } from './store/fileLink';
import { startCroppedTextMarquee } from './lib/croppedTextMarquee';

// Restore which .swproj file the open factory is linked to, and watch for edits.
startFileLinkTracking();

// Any cropped single-line text slides on hover so it can be read in full.
startCroppedTextMarquee();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ErrorBoundary scope="app">
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
);
