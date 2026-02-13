// Extension panel has no Node.js; React and deps reference process.env
if (typeof (globalThis as unknown as { process?: unknown }).process === 'undefined') {
  (globalThis as unknown as { process: { env: Record<string, string> } }).process = {
    env: { NODE_ENV: 'production' },
  };
}

import { createRoot } from 'react-dom/client';
import { PanelApp } from './PanelApp';

const root = document.getElementById('root');
if (root && !root.firstChild) {
  createRoot(root).render(<PanelApp />);
}
