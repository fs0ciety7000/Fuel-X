// Must run before react-dom evaluates: counts React commits for __fuelx.stats() (debug builds only).
import '@app/debug/react-commits';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@tokens/generated/tokens.css';
import '@ui/global/fonts';
import '@ui/global/base.css';
import '@ui/global/noise.css';
import { App } from '@app/App';
import { installDebug } from '@app/debug';
import { debugEnabled } from '@app/debug/enabled';
import { Game } from '@app/game';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

const game = new Game();
const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : crypto.getRandomValues(new Uint32Array(1))[0];
void game.host.newGame({ seed: seed ?? 1 });
if (debugEnabled()) installDebug(game);

createRoot(root).render(
  <StrictMode>
    <App game={game} />
  </StrictMode>,
);
