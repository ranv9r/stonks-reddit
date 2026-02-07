import '../index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TourProvider } from './contexts/TourProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TourProvider>
      <App />
    </TourProvider>
  </StrictMode>
);
