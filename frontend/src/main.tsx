import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSentry } from './utils/sentry.ts';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Sentryの初期化（最初に実行）
initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={({ error, resetError }) => (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>エラーが発生しました</h1>
          <p>{error.message}</p>
          <button onClick={resetError}>再試行</button>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
