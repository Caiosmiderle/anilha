import { useMemo } from 'react';
import * as THREE from 'three';
import { token } from '../harbor';
import { add, len, mul, norm, sub, type Pose, type V3 } from './rig';

/**
 * O manequim, no mesmo espírito das outras imagens do app: regata na cor de ação do Harbor,
 * short escuro, tênis branco e sem rosto. Cada osso é uma cápsula entre duas juntas.
 */

export interface Look {
  skin: THREE.Material;
  shirt: THREE.Material;
  shorts: THREE.Material;
  shoe: THREE.Material;
  hair: THREE.Material;
}

export function useLook(): Look {
  return useMemo(() => {
    const c = (n: `--${string}`) => new THREE.Color(token(n));
    return {
      skin: new THREE.MeshPhysicalMaterial({ color: c('--pastel-peach'), roughness: 0.55, sheen: 0.3 }),
      shirt: new THREE.MeshPhysicalMaterial({ color: c('--brand-500'), roughness: 0.8 }),
      shorts: new THREE.MeshPhysicalMaterial({ color: c('--ink'), roughness: 0.85 }),
      shoe: new THREE.MeshPhysicalMaterial({ color: c('--bg-surface'), roughness: 0.6 }),
      hair: new THREE.MeshPhysicalMaterial({ color: c('--ink'), roughness: 0.7 }),
    };
  }, []);
}

const UP = new THREE.Vector3(0, 1, 0);

/** Cápsula de `a` até `b`. `scale` achata a seção (x profundidade, z largura). */
export function Limb({ a, b, r, mat, scale }: { a: V3; b: V3; r: number; mat: THREE.Material; scale?: [number, number] }) {
  const length = len(sub(b, a));
  const geo = useMemo(() => new THREE.CapsuleGeometry(r, Math.max(0.001, length), 8, 24), [r, length]);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...norm(sub(b, a)))), [a, b]);
  return (
    <mesh geometry={geo} material={mat} position={mul(add(a, b), 0.5)} quaternion={q} scale={scale ? [scale[0], 1, scale[1]] : 1} castShadow receiveShadow />
  );
}

function Ball({ at, r, mat }: { at: V3; r: number; mat: THREE.Material }) {
  return (
    <mesh position={at} material={mat} castShadow receiveShadow>
      <sphereGeometry args={[r, 32, 24]} />
    </mesh>
  );
}

export function Figure({ pose, look }: { pose: Pose; look: Look }) {
  const spine = norm(sub(pose.chest, pose.pelvis));
  const headQ = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...spine)), [spine]);
  const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
  return (
    <group>
      {/* Tronco (regata), bacia (short), pescoço e cabeça com o cabelo. */}
      <Limb a={lerp(pose.pelvis, pose.chest, 0.15)} b={lerp(pose.pelvis, pose.chest, 0.82)} r={0.13} mat={look.shirt} scale={[0.78, 1.42]} />
      <Limb a={pose.hip[0]} b={pose.hip[1]} r={0.105} mat={look.shorts} scale={[1, 1]} />
      <Limb a={pose.chest} b={pose.neck} r={0.05} mat={look.skin} />
      <group position={pose.head} quaternion={headQ}>
        <mesh material={look.skin} castShadow>
          <sphereGeometry args={[0.1, 40, 32]} />
        </mesh>
        <mesh material={look.hair} position={[-0.004, 0.012, 0]} castShadow>
          <sphereGeometry args={[0.104, 40, 32, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
        </mesh>
      </group>
      {([0, 1] as const).map((s) => (
        <group key={s}>
          {/* Braço: ombro, braço, antebraço, mão. */}
          <Ball at={pose.shoulder[s]} r={0.06} mat={look.skin} />
          <Limb a={pose.shoulder[s]} b={pose.elbow[s]} r={0.047} mat={look.skin} />
          <Limb a={pose.elbow[s]} b={pose.hand[s]} r={0.038} mat={look.skin} />
          <Ball at={pose.hand[s]} r={0.045} mat={look.skin} />
          {/* Perna: o short cobre a coxa até a metade. */}
          <Limb a={pose.hip[s]} b={lerp(pose.hip[s], pose.knee[s], 0.55)} r={0.085} mat={look.shorts} />
          <Limb a={lerp(pose.hip[s], pose.knee[s], 0.5)} b={pose.knee[s]} r={0.068} mat={look.skin} />
          <Limb a={pose.knee[s]} b={pose.ankle[s]} r={0.055} mat={look.skin} />
          {/* Tênis do calcanhar à ponta. */}
          <Limb a={pose.heel[s]} b={pose.toe[s]} r={0.046} mat={look.shoe} scale={[1, 1.15]} />
        </group>
      ))}
    </group>
  );
}
