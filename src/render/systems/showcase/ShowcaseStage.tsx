// Showcase stage (ADR 0009, docs/SHOWCASE.md §3): the game's GLBs on a small LC-1 set, posed every frame from the
// story progress (pose.ts via StageDirector). Lazy chunk: three + R3F + this file. The game scene stays on /play;
// nothing here touches the sim. Story progress is read from a feed in useFrame; React renders this tree once.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry, Color, PointsMaterial, Vector3 } from 'three';
import type { Points, Object3D } from 'three';
import { CHAPTER_STILLS, chapterAt } from '@data/showcase';
import type { StoryFeed } from '@data/showcase';
import { tokens } from '@tokens/tokens';
import { useAsset } from '../../assets/useAsset';
import type { AssetName } from '../../assets/generated';
import { FILL_INTENSITY, SUN_DIR, SUN_INTENSITY } from '../../world/sun';
import { hash, StageDirector } from './director';

const w = tokens.world;
const TOWER_POS = new Vector3(0, 0, -26);
const TANKS: readonly [AssetName, number, number][] = [
  ['tank_v', -300, 200],
  ['tank_v', -300, 230],
  ['tank_v', -300, 260],
  ['tank_v', -380, 200],
  ['tank_v', -380, 230],
  ['tank_sphere', -460, 220],
];
const COAST_X = 175;
/** 2048² on desktop, 1024² on phones (the stage strip is small and GPUs are weaker). */
const SHADOW_MAP: [number, number] =
  typeof window !== 'undefined' && window.innerWidth < 900 ? [1024, 1024] : [2048, 2048];
const SUN_POS = new Vector3(...SUN_DIR).multiplyScalar(600);

/** A fresh clone of an asset's LOD0 scene (shared geometry + token materials). */
function useClone(name: AssetName): Object3D {
  const { gltf } = useAsset(name);
  return useMemo(() => gltf.scene.clone(true), [gltf]);
}

function dotField(count: number, x0: number, x1: number, z0: number, z1: number, seed: number): BufferGeometry {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = x0 + hash(i + seed) * (x1 - x0);
    pos[i * 3 + 1] = 0.15;
    pos[i * 3 + 2] = z0 + hash(i * 7 + seed + 1) * (z1 - z0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  return g;
}

function Ground() {
  const sea = useMemo(() => dotField(16_000, COAST_X + 4, 3_200, -2_400, 2_400, 11), []);
  const land = useMemo(() => dotField(12_000, -2_400, COAST_X - 4, -2_400, 2_400, 23), []);
  const seaMat = useMemo(() => new PointsMaterial({ color: w.seaPoints, size: 2, sizeAttenuation: false }), []);
  const landMat = useMemo(() => new PointsMaterial({ color: w.groundPoints, size: 1.5, sizeAttenuation: false }), []);
  const seaRef = useRef<Points>(null);
  useFrame(({ clock }) => {
    // Crests drift shoreward: a slow, wrapped slide of the whole field (one uniform-free transform).
    if (seaRef.current) seaRef.current.position.x = -((clock.elapsedTime * 3) % 40);
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[-1_100, -0.05, 0]} receiveShadow>
        <planeGeometry args={[2_600 + COAST_X * 2, 5_000]} />
        <meshLambertMaterial color={w.groundBase} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[COAST_X + 1_600, -0.1, 0]}>
        <planeGeometry args={[3_200, 5_000]} />
        <meshBasicMaterial color={w.seaBase} />
      </mesh>
      <mesh position={[COAST_X, 0.1, 0]}>
        <boxGeometry args={[1.2, 0.3, 4_800]} />
        <meshBasicMaterial color={tokens.color.ink} />
      </mesh>
      {/* Road from the pad inland and the branch to the tank farm (pad concrete). */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 480]} receiveShadow>
        <planeGeometry args={[16, 840]} />
        <meshLambertMaterial color={w.padConcrete} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-260, 0.03, 150]} receiveShadow>
        <planeGeometry args={[520, 10]} />
        <meshLambertMaterial color={w.padConcrete} />
      </mesh>
      <points ref={seaRef} geometry={sea} material={seaMat} />
      <points geometry={land} material={landMat} />
    </group>
  );
}

function Set({ story, reduced, onReady }: { story: StoryFeed; reduced: boolean; onReady: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const tower = useClone('tower');
  const pad = useClone('pad');
  const booster = useClone('booster');
  const ship = useClone('ship');
  const transporter = useClone('transporter');
  const tanker = useClone('tanker');
  const boat = useClone('boat_range');
  const tankV = useClone('tank_v');
  const tankS = useClone('tank_sphere');
  const tanks = useMemo(
    () => TANKS.map(([name], i) => (name === 'tank_sphere' ? tankS : i === 0 ? tankV : tankV.clone(true))),
    [tankV, tankS],
  );
  const [director] = useState(() => new StageDirector({ tower, booster, ship, transporter, tanker, boat }));

  useEffect(() => story.subscribe(() => invalidate()), [story, invalidate]);
  useEffect(onReady, [onReady]);
  useEffect(() => {
    director.reset();
    invalidate();
  }, [director, reduced, invalidate]);

  useFrame(({ clock, camera }, dt) => {
    // Reduced motion: one still per chapter (hard cut), no drift, no damping.
    const p = reduced ? (CHAPTER_STILLS[chapterAt(story.p)] ?? 0) : story.p;
    director.frame(p, clock.elapsedTime, dt, camera, reduced);
  });

  return (
    <>
      <color attach="background" args={[w.background]} />
      <fog attach="fog" args={[w.haze, 500, 3_400]} />
      <hemisphereLight args={[new Color(w.haze), new Color(w.shadowTint), FILL_INTENSITY]} />
      <directionalLight
        position={SUN_POS}
        intensity={SUN_INTENSITY}
        color={w.sun}
        castShadow
        shadow-mapSize={SHADOW_MAP}
        shadow-bias={-0.0004}
        shadow-normalBias={0.4}
        shadow-camera-left={-180}
        shadow-camera-right={180}
        shadow-camera-top={180}
        shadow-camera-bottom={-180}
        shadow-camera-near={10}
        shadow-camera-far={1_600}
      />
      <Ground />
      <primitive object={pad} />
      <primitive object={tower} position={TOWER_POS} />
      <primitive object={transporter} />
      <primitive object={booster} />
      <primitive object={ship} />
      <primitive object={tanker} />
      <primitive object={boat} />
      {tanks.map((obj, i) => {
        const spec = TANKS[i] as [AssetName, number, number];
        return <primitive key={i} object={obj} position={[spec[1], 0, spec[2]]} />;
      })}
      <primitive object={director.plume} />
      <primitive object={director.steam} />
    </>
  );
}

export default function ShowcaseStage({ story, reduced }: { story: StoryFeed; reduced: boolean }) {
  const clear = useMemo(() => new Color(w.background), []);
  // The prerendered still stays visible underneath until every GLB of the set has loaded (no blank paper flash).
  const [ready, setReady] = useState(false);
  const onReady = useMemo(() => () => setReady(true), []);
  // Stop drawing while the stage is scrolled out of view (the sections below the story).
  const frame = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Errors (WebGL context, GLB fetch) propagate to the boundary in src/app/showcase: the still stays.
  return (
    <div
      ref={frame}
      style={{ position: 'absolute', inset: 0, visibility: ready ? 'visible' : 'hidden' }}
      data-stage-ready={ready}
    >
      <Canvas
        flat
        shadows="percentage"
        frameloop={!onScreen ? 'never' : reduced ? 'demand' : 'always'}
        dpr={[1, 1.5]}
        camera={{ fov: 30, near: 2, far: 7_000, position: [-300, 175, 430] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor(clear)}
        aria-hidden="true"
      >
        <Suspense fallback={null}>
          <Set story={story} reduced={reduced} onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
