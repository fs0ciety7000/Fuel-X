import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@tokens/generated/tokens.css';
import '@ui/global/fonts';
import '@ui/global/base.css';
import '@ui/global/noise.css';
import { Vitrine } from '@app/Vitrine';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <Vitrine />
  </StrictMode>,
);
