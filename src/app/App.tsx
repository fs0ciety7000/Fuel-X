import { Scene } from '@render/index';
import { useEffect, useRef } from 'react';
import styles from './App.module.css';
import type { Game } from './game';
import { ProjectionReadout } from './ProjectionReadout';

// Composition root view: full-screen scene + temporary readouts (the HUD frame arrives in 6.3). The debug readout
// is written imperatively by the game loop at 4 Hz; the projection readout is a throttled store subscriber.
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
      <div className={styles.readouts}>
        <p ref={readout} className={styles.readout} data-testid="debug-readout">
          LOADING
        </p>
        <ProjectionReadout className={styles.readout} />
      </div>
    </main>
  );
}
