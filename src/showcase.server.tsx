// Build-time render of the showcase (ADR 0009). Bundled by `vite build --ssr` into build/ssr and called by
// scripts/showcase/prerender.ts; never shipped to the browser.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { Showcase } from '@app/showcase/Showcase';

export function render(): string {
  return renderToString(
    <StrictMode>
      <Showcase />
    </StrictMode>,
  );
}
