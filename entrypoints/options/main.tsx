import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const root = document.querySelector('#root');
if (!root) {
  throw new Error('Options root element (#root) is missing');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
