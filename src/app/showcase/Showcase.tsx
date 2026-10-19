import { Component, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ShowcasePage } from '@ui/showcase/ShowcasePage';
import { useHydrated, useReducedMotion } from '@ui/showcase/env';
import { StageFallback } from '@ui/showcase/StageFallback';
import { createStory } from './story';

// The 3D stage is the only heavy part of the page: one lazily imported chunk (three + R3F + GLBs), requested once the
// hydrated page is idle (≤ 1.5 s), never during the prerendered first paint (ADR 0009).
const ShowcaseStage = lazy(() => import('@render/systems/showcase/ShowcaseStage'));

function hasWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/** Catches a failed chunk/GLB load or a WebGL error in the stage: the Blender still stays, the page survives. */
class StageBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onFail();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** 'wait' until the page is idle after hydration, then 'go'; 'none' without WebGL (the still stays). */
function useStageState(hydrated: boolean): ['wait' | 'go' | 'none', () => void] {
  const [state, setState] = useState<'wait' | 'go' | 'none'>('wait');
  useEffect(() => {
    if (!hydrated || state !== 'wait') return;
    const go = (): void => setState(hasWebGL() ? 'go' : 'none');
    // The stage is in the first viewport on desktop: start right after the load settles.
    const idle = 'requestIdleCallback' in window ? window.requestIdleCallback(go, { timeout: 1500 }) : 0;
    const timer = idle === 0 ? window.setTimeout(go, 600) : 0;
    return () => {
      if (idle !== 0) window.cancelIdleCallback(idle);
      if (timer !== 0) window.clearTimeout(timer);
    };
  }, [hydrated, state]);
  const fail = useMemo(() => () => setState('none'), []);
  return [state, fail];
}

export function Showcase() {
  const story = useMemo(() => createStory(), []);
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const [state, fail] = useStageState(hydrated);
  const stage = (
    <>
      <StageFallback loading={state === 'go'} />
      {state === 'go' ? (
        <StageBoundary onFail={fail}>
          <Suspense fallback={null}>
            <ShowcaseStage story={story} reduced={reduced} />
          </Suspense>
        </StageBoundary>
      ) : null}
    </>
  );
  return <ShowcasePage story={story} onDossier={story.attach} reduced={reduced} stage={stage} />;
}
