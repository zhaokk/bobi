import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';

// Initialize core on startup
import { orchestrator } from './core';

orchestrator.initialize().catch(console.error);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
