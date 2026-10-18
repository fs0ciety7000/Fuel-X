import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Color, BufferAttribute, BufferGeometry, Vector3, NoToneMapping, type Points } from 'three';
import { lc1Layout } from '@data/site-lc1';
import { BOOSTER, PAD, TOWER } from '@render/assets/generated';
import { tokens } from '@tokens/tokens';

// Showcase orbit. The game scene stays frameloop="never"; this page is not the sim.
const REST_ANGLE = 0.2;
const ORBIT = 340;
const LOOK = new Vector3(10, 62, -12);

const placement = (callSign: string): [number, number, number] => {
  const found = lc1Layout.placements.find((item) => item.callSign === callSign);
  if (!found) throw new Error(`LC-1 placement missing: ${callSign}`);
  return [found.pos.x, found.pos.y, found.pos.z];
};

const TOWER_POS = placement('TOWER-1');
const MOUNT_POS = placement('OLM-1');

function useAsset(url: string) {
  return useGLTF(url, false, true);
}

useGLTF.preload(TOWER.url, false, true);
useGLTF.preload(PAD.url, false, true);
useGLTF.preload(BOOSTER.url, false, true);

function Glb({ url, position }: { url: string; position: readonly [number, number, number] }) {
  const { scene } = useAsset(url);
  const object = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={object} position={position} />;
}

function seaGeometry(): BufferGeometry {
  const columns = 56;
  const rows = 36;
  const positions = new Float32Array(columns * rows * 3);
  let index = 0;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      positions[index] = 130 + column * 14;
      positions[index + 1] = ((column * 17 + row * 13) % 7) * 0.12;
      positions[index + 2] = -250 + row * 14;
      index += 3;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

function Sea({ reduced }: { reduced: boolean }) {
  const points = useRef<Points>(null);
  const geometry = useMemo(() => seaGeometry(), []);
  useFrame((_, dt) => {
    if (reduced) return;
    const cloud = points.current;
    if (!cloud) return;
    const attr = cloud.geometry.getAttribute('position');
    const array = attr.array;
    if (!(array instanceof Float32Array)) return;
    for (let index = 2; index < array.length; index += 3) {
      const z = array[index] ?? 0;
      let next = z + dt * 2.2;
      if (next > 270) next = -270;
      array[index] = next;
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color={tokens.world.seaPoints} size={2.4} sizeAttenuation />
    </points>
  );
}

function Rig({ reduced }: { reduced: boolean }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const angle = useRef(REST_ANGLE);
  useEffect(() => {
    invalidate();
  }, [invalidate, reduced]);
  useFrame((_, dt) => {
    if (!reduced) angle.current += dt * 0.07;
    const turn = angle.current;
    camera.position.set(Math.sin(turn) * ORBIT, 78 + Math.sin(turn * 0.45) * 8, Math.cos(turn) * ORBIT);
    camera.lookAt(LOOK);
  });
  return null;
}

function Stage({ reduced }: { reduced: boolean }) {
  return (
    <>
      <color attach="background" args={[tokens.world.background]} />
      <fog attach="fog" args={[tokens.world.haze, 220, 920]} />
      <hemisphereLight args={[tokens.world.sun, tokens.world.groundBase, 1.15]} />
      <directionalLight position={[120, 180, 60]} intensity={1.55} color={tokens.world.sun} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-160, -0.06, 0]}>
        <planeGeometry args={[1800, 1600]} />
        <meshLambertMaterial color={tokens.world.groundBase} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[760, -0.1, 0]}>
        <planeGeometry args={[1500, 1600]} />
        <meshBasicMaterial color={tokens.world.seaBase} />
      </mesh>
      <mesh position={[96, 0.2, 0]}>
        <boxGeometry args={[1.4, 0.35, 700]} />
        <meshBasicMaterial color={tokens.color.ink} />
      </mesh>
      <Sea reduced={reduced} />
      <Glb url={PAD.url} position={MOUNT_POS} />
      <Glb url={TOWER.url} position={TOWER_POS} />
      {/* B-09 lives in the yard. The showcase stands a booster on the mount so the catch reads. */}
      <Glb url={BOOSTER.url} position={MOUNT_POS} />
      <mesh position={[0, 0.35, 68]}>
        <boxGeometry args={[28, 0.45, 2.2]} />
        <meshBasicMaterial color={tokens.world.exhaustGlow} />
      </mesh>
      <Rig reduced={reduced} />
    </>
  );
}

interface BoundaryState {
  failed: boolean;
}

class StageBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function reducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function VitrineStage() {
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const clear = useMemo(() => new Color(tokens.world.background), []);
  return (
    <StageBoundary>
      <Canvas
        frameloop={reduced ? 'demand' : 'always'}
        dpr={[1, 1.5]}
        camera={{
          position: [Math.sin(REST_ANGLE) * ORBIT, 78, Math.cos(REST_ANGLE) * ORBIT],
          fov: 30,
          near: 0.5,
          far: 2500,
        }}
        gl={{ antialias: true, toneMapping: NoToneMapping }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(clear);
          camera.lookAt(LOOK);
        }}
      >
        <Stage reduced={reduced} />
      </Canvas>
    </StageBoundary>
  );
}
