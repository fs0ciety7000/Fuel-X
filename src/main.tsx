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
import { drawSeed, seedFromSearch } from '@app/session/session';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

const game = new Game();
// `/play?seed=N` replays a shared run; otherwise a fresh seed, written back into the URL (GDD §13.2.3).
const seed = seedFromSearch(location.search) ?? drawSeed(() => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1);
void game.newRun(seed);
if (debugEnabled()) installDebug(game);

createRoot(root).render(
  <StrictMode>
    <App game={game} />
  </StrictMode>,
);
