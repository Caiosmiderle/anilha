import '../harbor';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ThreeCanvas } from '@remotion/three';
import { ToneMappingMode, type EffectComposer as EffectComposerImpl } from 'postprocessing';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { token } from '../harbor';
import { RenderWhenComposerReady } from '../three/World';
import type { V3 } from './rig';
import { ExerciseRig, type ExerciseId } from './scenes';

/**
 * As imagens de "Como fazer" dos exercícios que faltavam: a mesma cena de estúdio do motion,
 * fundo `--pastel-sky` como as outras imagens do app, quadro 0 no início do movimento e
 * quadro 1 no fim. Renderizado em 1024 e reduzido para 512 no script.
 */
export interface ExerciseProps extends Record<string, unknown> {
  id: ExerciseId;
}

const CAMERA: Record<ExerciseId, { pos: V3; target: V3; fov: number }> = {
  'supino-inclinado-maquina': { pos: [1.55, 1.45, 3.6], target: [0.0, 0.92, 0], fov: 32 },
  'triceps-corda': { pos: [1.6, 1.45, 4.0], target: [0.42, 1.08, 0], fov: 33 },
  'panturrilha-leg-press': { pos: [0.85, 1.4, 3.2], target: [0.3, 0.74, 0], fov: 33 },
};

function Rig({ id }: { id: ExerciseId }) {
  const { camera, scene } = useThree();
  const bg = useMemo(() => new THREE.Color(token('--pastel-sky')), []);
  useLayoutEffect(() => {
    const c = CAMERA[id];
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(...c.pos);
    cam.fov = c.fov;
    cam.near = 0.05;
    cam.far = 30;
    cam.updateProjectionMatrix();
    cam.lookAt(...c.target);
    scene.background = bg;
  });
  return null;
}

function Scene({ id, phase }: { id: ExerciseId; phase: 0 | 1 }) {
  const composer = useRef<EffectComposerImpl | null>(null);
  const c = (n: `--${string}`) => new THREE.Color(token(n));
  const warm = c('--bg-warm');
  return (
    <>
      <Rig id={id} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2} color={warm} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={3} color={warm} position={[2, 2.5, 5]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} color={warm} position={[-5, 2, -2]} rotation={[0, Math.PI / 2, 0]} scale={[5, 3, 1]} />
      </Environment>
      <directionalLight position={[2.5, 5, 3]} intensity={1.4} color={warm} castShadow shadow-mapSize={[2048, 2048]} shadow-radius={10} shadow-blurSamples={16} shadow-bias={-0.0004} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} />
      <ambientLight intensity={0.25} />
      {/* Chão só de sombra: o fundo fica liso como nas outras imagens do app. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial opacity={0.12} />
      </mesh>
      <ContactShadows position={[0, 0.002, 0]} scale={6} resolution={1024} blur={2} far={1.5} opacity={0.4} color={c('--ink-strong')} />
      <ExerciseRig id={id} phase={phase} />
      <EffectComposer ref={composer} multisampling={4}>
        <N8AO aoRadius={0.3} distanceFalloff={0.5} intensity={1.6} quality="high" halfRes={false} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
      <RenderWhenComposerReady composer={composer} passes={3} />
    </>
  );
}

export function ExerciseStill({ id }: ExerciseProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: 'var(--pastel-sky)' }}>
      <ThreeCanvas width={width} height={height} dpr={1} shadows="variance" gl={{ antialias: false, preserveDrawingBuffer: true }}>
        <Scene id={id} phase={frame === 0 ? 0 : 1} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
}
