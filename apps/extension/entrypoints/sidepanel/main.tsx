import '@fontsource-variable/inter';
import './style.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { applyTheme, loadSettings } from '../../lib/settings';

loadSettings().then((settings) => applyTheme(settings.theme));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
