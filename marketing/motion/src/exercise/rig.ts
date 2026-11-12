/**
 * Esqueleto do manequim: medidas de uma pessoa de 1,75 m e cinemática inversa de dois ossos
 * (braço e perna) para mãos e pés pararem exatamente nas pegas, no chão ou na plataforma.
 * Eixos: x para a frente da pessoa, y para cima, z para a esquerda dela.
 */

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Direção no plano sagital (x, y) a partir de um ângulo em graus, 0 = para a frente. */
export const dir2 = (deg: number): V3 => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];

export const BODY = {
  upperArm: 0.29,
  forearm: 0.26,
  thigh: 0.44,
  shin: 0.43,
  torso: 0.5,
  shoulderHalf: 0.19,
  hipHalf: 0.095,
  neck: 0.07,
  head: 0.105,
  /** Do tornozelo à ponta do pé e ao calcanhar, e a altura do tornozelo sobre a sola. */
  toe: 0.19,
  heel: 0.06,
  ankleHeight: 0.075,
};

/**
 * Dois ossos de `root` até `target`; a junta do meio (cotovelo, joelho) vai para o lado de
 * `pole`. Se o alvo estiver longe demais, o membro estica até onde alcança.
 */
export function ik(root: V3, target: V3, l1: number, l2: number, pole: V3): { mid: V3; end: V3 } {
  const toT = sub(target, root);
  const d = Math.min(len(toT), l1 + l2 - 1e-4);
  const dir = norm(toT);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = norm(sub(pole, mul(dir, dot(pole, dir))));
  return { mid: add(add(root, mul(dir, a)), mul(p, h)), end: add(root, mul(dir, d)) };
}

/** As juntas de um corpo inteiro, em coordenadas do mundo. */
export interface Pose {
  pelvis: V3;
  chest: V3;
  neck: V3;
  head: V3;
  shoulder: [V3, V3];
  elbow: [V3, V3];
  hand: [V3, V3];
  hip: [V3, V3];
  knee: [V3, V3];
  ankle: [V3, V3];
  /** Ponta do pé e calcanhar. */
  toe: [V3, V3];
  heel: [V3, V3];
}

export interface PoseInput {
  /** Centro da bacia e a direção da coluna (bacia para os ombros). */
  pelvis: V3;
  spine: V3;
  /** Onde ficam as mãos e os tornozelos, por lado (0 direito, z negativo; 1 esquerdo). */
  hands: [V3, V3];
  ankles: [V3, V3];
  /** Para onde apontam cotovelos e joelhos. */
  elbowPole: (side: 0 | 1) => V3;
  kneePole: V3;
  /** Direção do pé, do calcanhar para a ponta. */
  foot: (side: 0 | 1) => V3;
}

export function buildPose(i: PoseInput): Pose {
  const spine = norm(i.spine);
  const chest = add(i.pelvis, mul(spine, BODY.torso));
  const neck = add(chest, mul(spine, BODY.neck));
  const head = add(neck, mul(spine, BODY.head + 0.02));
  const side = (s: 0 | 1) => (s === 0 ? -1 : 1);
  const shoulder = ([0, 1] as const).map((s) => add(add(chest, mul(spine, -0.03)), [0, 0, side(s) * BODY.shoulderHalf])) as [V3, V3];
  const hip = ([0, 1] as const).map((s) => add(i.pelvis, [0, -0.02, side(s) * BODY.hipHalf])) as [V3, V3];
  const arms = ([0, 1] as const).map((s) => ik(shoulder[s], i.hands[s], BODY.upperArm, BODY.forearm, i.elbowPole(s)));
  const legs = ([0, 1] as const).map((s) => ik(hip[s], i.ankles[s], BODY.thigh, BODY.shin, i.kneePole));
  const foot = ([0, 1] as const).map((s) => norm(i.foot(s)));
  return {
    pelvis: i.pelvis,
    chest,
    neck,
    head,
    shoulder,
    elbow: [arms[0]!.mid, arms[1]!.mid],
    hand: [arms[0]!.end, arms[1]!.end],
    hip,
    knee: [legs[0]!.mid, legs[1]!.mid],
    ankle: [legs[0]!.end, legs[1]!.end],
    toe: [add(legs[0]!.end, mul(foot[0]!, BODY.toe)), add(legs[1]!.end, mul(foot[1]!, BODY.toe))],
    heel: [add(legs[0]!.end, mul(foot[0]!, -BODY.heel)), add(legs[1]!.end, mul(foot[1]!, -BODY.heel))],
  };
}
