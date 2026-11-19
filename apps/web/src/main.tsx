import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { FeatureProvider } from '@repo/core';

import { App } from './App';
import { eventBus, featureRegistry } from './features';

import '@repo/ui/styles.css';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('未找到 #root 挂载节点');
}

createRoot(container).render(
  <StrictMode>
    <FeatureProvider registry={featureRegistry} eventBus={eventBus}>
      <App />
    </FeatureProvider>
  </StrictMode>,
);
