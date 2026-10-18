import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@tokens/generated/tokens.css';
import '@ui/global/fonts';
import '@ui/global/base.css';
import '@ui/global/noise.css';
import { DesignGallery } from '@ui/design/DesignGallery';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <DesignGallery />
  </StrictMode>,
);
