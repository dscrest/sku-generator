import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import App from './App.jsx';
import './index.css';

// All API calls target the Catalyst Advanced I/O function mount.
axios.defaults.baseURL = '/server/skuapi';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster position="top-right" />
  </StrictMode>
);
