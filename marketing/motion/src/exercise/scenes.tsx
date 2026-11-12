import { RoundedBox } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { token } from '../harbor';
import { paintedPlate } from '../three/textures';
import { plateGeometry, plateMaterial } from '../three/World';
import { Figure, Limb, useLook } from './Figure';
import { add, buildPose, dir2, mul, norm, sub, type Pose, type V3 } from './rig';

/**
 * Os três exercícios que o RepDB não tem, cada um com a máquina e as duas posições que o app
 * mostra em sequência (início e fim). Biomecânica:
 * - supino inclinado na máquina: costas no encosto a 25 graus, pegas na linha do peito,
 *   cotovelos abaixo e para fora no início; empurra até quase estender, na linha do encosto;
 * - tríceps na polia com corda: em pé, tronco um pouco à frente, cotovelos colados ao corpo
 *   e parados; só o antebraço desce, e as pontas da corda abrem no fim;
 * - panturrilha no leg press: pernas quase estendidas e paradas, a ponta dos pés na borda da
 *   plataforma; o tornozelo desce o calcanhar no início e empurra a plataforma no fim.
 */

export type ExerciseId = 'supino-inclinado-maquina' | 'triceps-corda' | 'panturrilha-leg-press';
export const EXERCISES: ExerciseId[] = ['supino-inclinado-maquina', 'triceps-corda', 'panturrilha-leg-press'];

interface Mats {
  frame: THREE.Material;
  pad: THREE.Material;
  chrome: THREE.Material;
  grip: THREE.Material;
  plate: THREE.Material;
  plateGeo: THREE.BufferGeometry;
  cable: THREE.Material;
}

function useMats(): Mats {
  return useMemo(() => {
    const c = (n: `--${string}`) => new THREE.Color(token(n));
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans');
    const tex = paintedPlate(`#${c('--ink').getHexString()}`, `#${c('--ink-muted').getHexString()}`, font);
    return {
      frame: new THREE.MeshPhysicalMaterial({ color: c('--ink'), roughness: 0.42, metalness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
      pad: new THREE.MeshPhysicalMaterial({ color: c('--ink-strong'), roughness: 0.85 }),
      chrome: new THREE.MeshPhysicalMaterial({ color: c('--line-strong'), roughness: 0.15, metalness: 1 }),
      grip: new THREE.MeshPhysicalMaterial({ color: c('--ink-strong'), roughness: 0.9 }),
      plate: plateMaterial(tex),
      plateGeo: plateGeometry(),
      cable: new THREE.MeshPhysicalMaterial({ color: c('--ink-muted'), roughness: 0.5, metalness: 0.6 }),
    };
  }, []);
}

/** Barra reta (cápsula fina) entre dois pontos. */
function Bar({ a, b, r, mat }: { a: V3; b: V3; r: number; mat: THREE.Material }) {
  return <Limb a={a} b={b} r={r} mat={mat} />;
}

function Pad({ at, size, rotZ, mat }: { at: V3; size: V3; rotZ: number; mat: THREE.Material }) {
  return (
    <RoundedBox args={size} radius={Math.min(0.03, size[1] / 2.2)} smoothness={4} position={at} rotation={[0, 0, rotZ]} material={mat} castShadow receiveShadow />
  );
}

/* ------------------------------------------------------------------ poses */

export function poseFor(id: ExerciseId, phase: 0 | 1): { pose: Pose; extra: Record<string, V3 | number> } {
  if (id === 'supino-inclinado-maquina') {
    const pelvis: V3 = [0.02, 0.56, 0];
    const spine = dir2(115);
    const n = dir2(25); // para a frente, perpendicular ao encosto
    const chest = add(pelvis, mul(spine, 0.5));
    const shoulder = (s: 0 | 1): V3 => add(add(chest, mul(spine, -0.03)), [0, 0, s ? 0.19 : -0.19]);
    // Início: pegas ao lado do meio do peito, abertas; fim: braços quase estendidos.
    const reach = phase === 0 ? 0.12 : 0.52;
    const width = phase === 0 ? 0.31 : 0.2;
    const hand = (s: 0 | 1): V3 => {
      const p = add(add(shoulder(s), mul(n, reach)), mul(spine, phase === 0 ? -0.15 : -0.04));
      return [p[0], p[1], s ? width : -width];
    };
    const pose = buildPose({
      pelvis,
      spine,
      hands: [hand(0), hand(1)],
      ankles: [
        [0.45, 0.075, -0.13],
        [0.45, 0.075, 0.13],
      ],
      elbowPole: (s) => [phase === 0 ? -0.6 : -0.1, -0.45, s ? 0.75 : -0.75],
      kneePole: [0.3, 1, 0],
      foot: () => [1, 0, 0],
    });
    return { pose, extra: { pivotX: -0.27, pivotY: 1.62 } };
  }
  if (id === 'triceps-corda') {
    const pelvis: V3 = [0, 0.95, 0];
    const spine = dir2(78);
    const chest = add(pelvis, mul(spine, 0.5));
    const shoulder = (s: 0 | 1): V3 => add(add(chest, mul(spine, -0.03)), [0, 0, s ? 0.19 : -0.19]);
    // O cotovelo fica parado junto ao corpo; só o antebraço gira.
    const elbow = (s: 0 | 1): V3 => {
      const e = add(shoulder(s), mul(dir2(-85), 0.29));
      return [e[0], e[1], s ? 0.2 : -0.2];
    };
    const fore = phase === 0 ? dir2(28) : dir2(-82);
    const spread = phase === 0 ? 0.07 : 0.15;
    const hand = (s: 0 | 1): V3 => {
      const h = add(elbow(s), mul(fore, 0.26));
      return [h[0], h[1], s ? spread : -spread];
    };
    const pose = buildPose({
      pelvis,
      spine,
      hands: [hand(0), hand(1)],
      ankles: [
        [0.03, 0.075, -0.13],
        [0.03, 0.075, 0.13],
      ],
      elbowPole: (s) => [-1, -0.25, s ? 0.15 : -0.15],
      kneePole: [1, 0.1, 0],
      foot: () => [1, 0, 0],
    });
    return { pose, extra: { pulleyX: 0.52, pulleyY: 2.05 } };
  }
  // Panturrilha no leg press.
  const pelvis: V3 = [0, 0.48, 0];
  const spine = dir2(140);
  const t = dir2(45); // trilho do carrinho
  const p = dir2(135); // plano da plataforma, para cima
  const ankle = (s: 0 | 1): V3 => {
    const a = add([pelvis[0], pelvis[1] - 0.02, 0], mul(t, 0.855));
    return [a[0], a[1], s ? 0.13 : -0.13];
  };
  const alpha = ((phase === 0 ? -14 : 30) * Math.PI) / 180;
  const foot = norm(add(mul(p, Math.cos(alpha)), mul(t, Math.sin(alpha))));
  const pose = buildPose({
    pelvis,
    spine,
    hands: [
      [0.1, 0.5, -0.31],
      [0.1, 0.5, 0.31],
    ],
    ankles: [ankle(0), ankle(1)],
    elbowPole: (s) => [-0.2, -0.6, s ? 0.8 : -0.8],
    kneePole: [-0.707, 0.707, 0],
    foot: () => foot,
  });
  // A plataforma encosta na sola, na altura da base dos dedos.
  const ball = add(pose.ankle[1], mul(foot, 0.14));
  const surface = add(ball, mul(t, 0.05));
  const neutral = add(add(pose.ankle[1], mul(p, 0.14)), mul(t, 0.05));
  return { pose, extra: { sx: surface[0], sy: surface[1], nx: neutral[0], ny: neutral[1] } };
}

/* ------------------------------------------------------------------ máquinas */

function InclinePress({ pose, m, pivot }: { pose: Pose; m: Mats; pivot: V3 }) {
  const spine = norm(sub(pose.chest, pose.pelvis));
  const back = add(add(pose.pelvis, mul(spine, 0.34)), mul(dir2(25), -0.16));
  return (
    <group>
      {/* Base, coluna do banco, assento e encosto. */}
      <Bar a={[-0.6, 0.04, 0]} b={[0.62, 0.04, 0]} r={0.04} mat={m.frame} />
      <Bar a={[-0.6, 0.04, -0.3]} b={[-0.6, 0.04, 0.3]} r={0.04} mat={m.frame} />
      <Bar a={[0.6, 0.04, -0.25]} b={[0.6, 0.04, 0.25]} r={0.04} mat={m.frame} />
      <Bar a={[0.12, 0.04, 0]} b={[0.12, 0.4, 0]} r={0.035} mat={m.frame} />
      <Pad at={[0.13, 0.44, 0]} size={[0.44, 0.08, 0.4]} rotZ={0} mat={m.pad} />
      <Pad at={back} size={[0.08, 0.72, 0.36]} rotZ={(25 * Math.PI) / 180} mat={m.pad} />
      <Bar a={[-0.18, 0.4, 0]} b={add(back, [-0.04, 0, 0])} r={0.03} mat={m.frame} />
      {/* Coluna de trás até o eixo das alavancas. */}
      <Bar a={[-0.58, 0.04, 0]} b={[pivot[0] - 0.12, pivot[1] + 0.05, 0]} r={0.045} mat={m.frame} />
      <Bar a={[pivot[0] - 0.12, pivot[1] + 0.05, 0]} b={[pivot[0], pivot[1], 0]} r={0.04} mat={m.frame} />
      <Bar a={[pivot[0], pivot[1], -0.3]} b={[pivot[0], pivot[1], 0.3]} r={0.03} mat={m.chrome} />
      {([0, 1] as const).map((s) => {
        const z = s ? 0.27 : -0.27;
        const hub: V3 = [pivot[0], pivot[1], z];
        const handTop: V3 = add(pose.hand[s], [0, 0.07, 0]);
        // A alavanca passa pelo eixo; atrás dele, o pino com a anilha.
        const horn = add(hub, mul(norm(sub(hub, handTop)), 0.32));
        return (
          <group key={s}>
            <Bar a={hub} b={handTop} r={0.024} mat={m.frame} />
            <Bar a={hub} b={horn} r={0.026} mat={m.frame} />
            <Bar a={add(pose.hand[s], [0, 0.08, 0])} b={add(pose.hand[s], [0, -0.08, 0])} r={0.019} mat={m.grip} />
            <Bar a={horn} b={add(horn, [0, 0, s ? 0.16 : -0.16])} r={0.025} mat={m.chrome} />
            <mesh geometry={m.plateGeo} material={m.plate} position={add(horn, [0, 0, s ? 0.08 : -0.08])} rotation={[0, Math.PI / 2, 0]} scale={0.8} castShadow receiveShadow />
          </group>
        );
      })}
    </group>
  );
}

function CableStation({ pose, m, pulley }: { pose: Pose; m: Mats; pulley: V3 }) {
  const mid = mul(add(pose.hand[0], pose.hand[1]), 0.5);
  // O nó da corda fica um pouco acima das mãos, na linha do cabo.
  const knot = add(mid, mul(norm(sub(pulley, mid)), 0.11));
  return (
    <group>
      <Pad at={[0.8, 0.03, 0]} size={[0.5, 0.06, 0.62]} rotZ={0} mat={m.frame} />
      <Pad at={[0.8, 1.12, 0]} size={[0.16, 2.2, 0.16]} rotZ={0} mat={m.frame} />
      {/* Pilha de placas atrás da coluna, com as hastes. */}
      {Array.from({ length: 9 }, (_, i) => (
        <Pad key={i} at={[0.97, 0.12 + i * 0.055, 0]} size={[0.14, 0.045, 0.3]} rotZ={0} mat={m.pad} />
      ))}
      <Bar a={[0.97, 0.06, 0.1]} b={[0.97, 2.1, 0.1]} r={0.012} mat={m.chrome} />
      <Bar a={[0.97, 0.06, -0.1]} b={[0.97, 2.1, -0.1]} r={0.012} mat={m.chrome} />
      <Bar a={[0.8, 2.18, 0]} b={[pulley[0], pulley[1] + 0.08, 0]} r={0.035} mat={m.frame} />
      <mesh position={pulley} rotation={[Math.PI / 2, 0, 0]} material={m.chrome} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.035, 32]} />
      </mesh>
      <Bar a={[pulley[0] - 0.04, pulley[1] - 0.04, 0]} b={knot} r={0.005} mat={m.cable} />
      {([0, 1] as const).map((s) => (
        <group key={s}>
          <Bar a={knot} b={add(pose.hand[s], [0, -0.05, 0])} r={0.013} mat={m.grip} />
          <mesh position={add(pose.hand[s], [0, -0.075, 0])} material={m.grip} castShadow>
            <sphereGeometry args={[0.024, 20, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CalfLegPress({ m, surface, neutral }: { m: Mats; surface: V3; neutral: V3 }) {
  const t = dir2(45);
  const p = dir2(135);
  // A plataforma e o carrinho andam com a ponta dos pés; os trilhos ficam parados, embaixo do
  // carrinho, na linha da plataforma na posição neutra do tornozelo.
  const center = add(add(surface, mul(t, 0.022)), mul(p, 0.12));
  // O carrinho desce da plataforma até os trilhos, onde corre.
  const carriage = add(add(center, mul(t, 0.08)), mul(p, -0.2));
  const railMid = add(add(neutral, mul(t, 0.2)), mul(p, -0.33));
  const k0 = (0.12 - railMid[1]) / t[1];
  const railLow = add(railMid, mul(t, k0));
  const railHigh = add(railMid, mul(t, 0.6));
  return (
    <group>
      {/* Base, assento, encosto e pegas laterais. */}
      <Bar a={[-0.75, 0.04, 0]} b={[railHigh[0] + 0.1, 0.04, 0]} r={0.045} mat={m.frame} />
      <Bar a={[-0.75, 0.04, -0.35]} b={[-0.75, 0.04, 0.35]} r={0.04} mat={m.frame} />
      <Bar a={[railHigh[0] + 0.1, 0.04, -0.35]} b={[railHigh[0] + 0.1, 0.04, 0.35]} r={0.04} mat={m.frame} />
      <Bar a={[0, 0.04, 0]} b={[0, 0.34, 0]} r={0.035} mat={m.frame} />
      <Pad at={[0.02, 0.38, 0]} size={[0.42, 0.08, 0.42]} rotZ={(10 * Math.PI) / 180} mat={m.pad} />
      <Pad at={add(add([0, 0.48, 0], mul(dir2(140), 0.34)), mul(dir2(50), -0.16))} size={[0.08, 0.74, 0.42]} rotZ={(50 * Math.PI) / 180} mat={m.pad} />
      <Bar a={[-0.62, 0.04, 0]} b={[-0.34, 0.66, 0]} r={0.035} mat={m.frame} />
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <Bar a={[0.0, 0.42, s * 0.3]} b={[0.18, 0.52, s * 0.3]} r={0.02} mat={m.grip} />
          <Bar a={[0.0, 0.3, s * 0.3]} b={[0.0, 0.42, s * 0.3]} r={0.02} mat={m.frame} />
          {/* Trilhos a 45 graus, apoiados no chão nas duas pontas. */}
          <Bar a={[railLow[0], railLow[1], s * 0.24]} b={[railHigh[0], railHigh[1], s * 0.24]} r={0.024} mat={m.chrome} />
          <Bar a={[railLow[0], 0.04, s * 0.24]} b={[railLow[0], railLow[1], s * 0.24]} r={0.03} mat={m.frame} />
          <Bar a={[railHigh[0], 0.04, s * 0.24]} b={[railHigh[0], railHigh[1], s * 0.24]} r={0.035} mat={m.frame} />
          {/* Pino atrás do carrinho com uma anilha de cada lado. */}
          <Bar a={add(add(carriage, mul(t, 0.07)), [0, 0, s * 0.26])} b={add(add(carriage, mul(t, 0.07)), [0, 0, s * 0.44])} r={0.02} mat={m.chrome} />
          <mesh geometry={m.plateGeo} material={m.plate} position={add(add(carriage, mul(t, 0.07)), [0, 0, s * 0.36])} rotation={[0, Math.PI / 2, 0]} scale={0.5} castShadow receiveShadow />
        </group>
      ))}
      <Pad at={center} size={[0.045, 0.46, 0.6]} rotZ={(45 * Math.PI) / 180} mat={m.pad} />
      <Pad at={carriage} size={[0.1, 0.5, 0.5]} rotZ={(45 * Math.PI) / 180} mat={m.frame} />
    </group>
  );
}

export function ExerciseRig({ id, phase }: { id: ExerciseId; phase: 0 | 1 }) {
  const look = useLook();
  const m = useMats();
  const { pose, extra } = poseFor(id, phase);
  return (
    <group>
      <Figure pose={pose} look={look} />
      {id === 'supino-inclinado-maquina' ? (
        <InclinePress pose={pose} m={m} pivot={[extra.pivotX as number, extra.pivotY as number, 0]} />
      ) : id === 'triceps-corda' ? (
        <CableStation pose={pose} m={m} pulley={[extra.pulleyX as number, extra.pulleyY as number, 0]} />
      ) : (
        <CalfLegPress m={m} surface={[extra.sx as number, extra.sy as number, 0]} neutral={[extra.nx as number, extra.ny as number, 0]} />
      )}
    </group>
  );
}

