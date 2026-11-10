import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers';
import { installChunkRecovery } from './app/chunkRecovery';
import { AppRoutes } from './app/routes/AppRoutes';
import './styles/index.css';

installChunkRecovery();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </StrictMode>,
);
