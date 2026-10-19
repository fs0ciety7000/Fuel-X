// Showcase entry (index.html, ADR 0009): hydrates the HTML prerendered by scripts/showcase/prerender.ts. In dev the
// root is empty, so it renders from scratch.
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@tokens/generated/tokens.css';
import '@ui/global/fonts';
import '@ui/global/base.css';
import '@ui/global/noise.css';
import '@ui/showcase/showcase.css';
import { Showcase } from '@app/showcase/Showcase';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
const app = (
  <StrictMode>
    <Showcase />
  </StrictMode>
);
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
