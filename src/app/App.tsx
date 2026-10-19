import { Scene } from '@render/index';
import { useEffect, useRef } from 'react';
import styles from './App.module.css';
import type { Game } from './game';

// Composition root view: full-screen scene + a temporary debug readout (the HUD arrives in Phase 6).
// The readout is written imperatively by the game loop at 4 Hz; React renders this tree once.
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
      <p ref={readout} className={styles.readout} data-testid="debug-readout">
        LOADING
      </p>
    </main>
  );
}
