import { Scene } from '@render/index';
import { HudRoot } from '@ui/hud/HudRoot';
import { useEffect, useRef } from 'react';
import styles from './App.module.css';
import type { Game } from './game';

// Composition root view: full-screen scene + the HUD frame (6.3) over it. The HUD reads the throttled projection
// through its own store selectors; the debug readout is written imperatively by the game loop at 4 Hz.
export function App({ game }: { game: Game }) {
  const readout = useRef<HTMLParagraphElement>(null);
  useEffect(() => game.bindReadout(readout.current), [game]);
  useEffect(() => {
    game.loop.start();
    return () => game.loop.stop();
  }, [game]);
  return (
    <main className={styles.shell}>
      <Scene
        className={styles.scene}
        snapshot={game.host.snapshot}
        controls={game.controls}
        input={game.input}
        onApi={game.attachScene}
      />
      <HudRoot
        debug={
          <p ref={readout} className={styles.readout} data-testid="debug-readout">
            LOADING
          </p>
        }
      />
    </main>
  );
}
