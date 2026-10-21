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
import { autopilotFromSearch, drawSeed, seedFromSearch } from '@app/session/session';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

const game = new Game();
// `/play?seed=N` replays a shared run; otherwise a fresh seed, written back into the URL (GDD §13.2.3).
// The player runs the count (7.1, AC 27); `?autopilot=1` lets the scripted director play it.
// The fresh run is held paused while persistence looks for an unfinished autosave (CONTINUE vs NEW RUN, 8.3).
const urlSeed = seedFromSearch(location.search);
const autopilot = autopilotFromSearch(location.search);
const seed = urlSeed ?? drawSeed(() => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1);
void game.persistence.boot({ urlSeed, autopilot, start: () => game.newRun(seed, { autopilot }) });
if (debugEnabled()) installDebug(game);

createRoot(root).render(
  <StrictMode>
    <App game={game} />
  </StrictMode>,
);
