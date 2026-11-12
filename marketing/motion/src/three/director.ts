import { interpolate } from 'remotion';
import { CLAMP, damped, expoOut, hash, inOut } from '../anim';
import { HARBOR } from '../harborMotion';
import type { Formato } from '../config';
import { marksFor } from '../scenes/marks';
import { sceneAt, type Span } from '../timeline';
import { FALL_S, G, liftMarks, LOCK_Y, PLATE_R, REST_Y } from '../physics';

/**
 * O mundo físico em função do tempo. Nada guarda estado entre quadros: o mesmo tempo dá a
 * mesma câmera, a mesma barra e a mesma poeira, em qualquer ordem de render.
 */

export type Vec3 = [number, number, number];

export interface Cam {
  pos: Vec3;
  target: Vec3;
  fov: number;
  /**
   * Deslocamento da lente (fração da largura e da altura): o alvo sai do centro da tela
   * sem girar a câmera. Põe o ferro atrás da tela do app, longe da coluna do texto.
   */
  shift?: [number, number];
}

export interface WorldState {
  /** 1 estúdio quente (`--bg-warm`) antes do impacto; 0 o fundo do Harbor (`--bg-page`). */
  warm: number;
  cam: Cam;
  /** Foco da lente: ponto no mundo, faixa nítida em metros e tamanho do bokeh (0, sem). */
  focus: Vec3;
  focusRange: number;
  bokeh: number;
  /** Altura do centro da barra e quanto as pontas descem (chicote), em metros. */
  barY: number;
  bend: number;
  /** Segundos desde o impacto (negativo antes). */
  sinceImpact: number;
  /** Anilha solta, a que vira a marca. */
  solo: { visible: boolean; pos: Vec3; rot: Vec3 };
  /** Desfoque do 3D atrás da interface (profundidade de campo), em px. */
  blur: number;
  /** Magnésio no ar, de 0 a 1. */
  dust: number;
}

export { FALL_S, LOCK_Y, PLATE_R, REST_Y } from '../physics';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

function orbit(angle: number, radius: number, height: number, target: Vec3): Vec3 {
  return [target[0] + Math.sin(angle) * radius, height, target[2] + Math.cos(angle) * radius];
}

/** Altura da barra na puxada (levantamento terra): sai devagar do chão, trava no quadril. */
function liftY(b: number, n: number, sec: number): { y: number; bend: number } {
  // Puxada rápida: a anilha deixa o chão e sai do quadro em pouco mais de um tempo; quem
  // levanta fica fora da imagem.
  const { start, lock } = liftMarks(n);
  const release = n - FALL_S / sec;
  const ease = (x: number) =>
    interpolate(x, [start, lock], [0, 1], { ...CLAMP, easing: (t) => t * t * (3 - 2 * t) });
  if (b < release) {
    const y = lerp(REST_Y, LOCK_Y, ease(b));
    // Aceleração por diferença finita: a barra enverga quando acelera e quando freia.
    const h = 0.02;
    const acc =
      ((lerp(REST_Y, LOCK_Y, ease(b + h)) - 2 * y + lerp(REST_Y, LOCK_Y, ease(b - h))) /
        (h * h)) /
      (sec * sec);
    return { y, bend: Math.max(-0.035, Math.min(0.035, acc * 0.0045)) };
  }
  const t = (b - release) * sec;
  return { y: Math.max(REST_Y, LOCK_Y - 0.5 * G * t * t), bend: 0 };
}

/** Depois do impacto: quique curto e o chicote da barra. */
function afterImpact(t: number): { y: number; bend: number } {
  const bounce = t < 0.45 ? 0.03 * Math.abs(Math.sin((Math.PI * t) / 0.15)) * Math.exp(-t / 0.11) : 0;
  return { y: REST_Y + bounce, bend: damped(t, 0.04, 5.5, 0.2) };
}

/** Uma repetição ao fundo da cena Série: desce devagar, sobe e termina no toque. */
function repY(b: number, tap: number): number {
  const down = interpolate(b, [tap - 4, tap - 2], [0, 1], { ...CLAMP, easing: inOut });
  const up = interpolate(b, [tap - 2, tap], [0, 1], { ...CLAMP, easing: (t) => 1 - (1 - t) ** 2.2 });
  return lerp(lerp(0.88, 0.42, down), 0.88, up);
}

export function serieTapBeat(n: number) {
  return n - 3;
}

/** Câmera da puxada no último quadro, para o impacto continuar dela. */
/**
 * Close na anilha da ponta, rente ao chão: ela sai do piso, sobe e deixa o quadro por cima
 * (só a sombra fica), e volta caindo no impacto. Ninguém precisa aparecer levantando.
 */
function pullCam(b: number, n: number, f: Formato, y: number): Cam {
  const p = interpolate(b, [0, n], [0, 1], CLAMP);
  const push = interpolate(b, [n - 1.2, n], [0, 1], { ...CLAMP, easing: inOut });
  // Rente ao chão e quase no eixo da barra: a anilha da ponta esconde as outras.
  void y;
  // Olhar baixo: o topo do quadro fica abaixo de onde a anilha da outra ponta aparece
  // quando a barra está no alto; só o chão e a sombra ficam na espera.
  if (f === '9:16') {
    return {
      pos: lerp3([1.95 - 0.08 * p, 0.1, 0.3], [1.72, 0.08, 0.27], push),
      target: [0.8, 0.05, 0],
      fov: 26,
      shift: [0, 0],
    };
  }
  return {
    pos: lerp3([1.9 - 0.08 * p, 0.09, 0.29], [1.68, 0.07, 0.26], push),
    target: [0.8, 0.1, 0],
    fov: 20,
    shift: [0.24, 0],
  };
}

/** Distância para a anilha solta ocupar o tamanho da marca na tela. */
export function soloScreenRadius(cam: Cam, height: number): number {
  const d = Math.hypot(cam.pos[0] - SOLO_POS[0], cam.pos[1] - SOLO_POS[1], cam.pos[2] - SOLO_POS[2]);
  return (PLATE_R / (d * Math.tan(((cam.fov / 2) * Math.PI) / 180))) * (height / 2);
}

export const SOLO_POS: Vec3 = [0, 1.05, 0];

export function worldAt(beat: number, all: Span[], f: Formato, bpm: number): WorldState {
  const sec = 60 / bpm;
  const { span, local: b } = sceneAt(all, beat);
  const n = span.beats;
  const impact = all.find((s) => s.id === 'numero')?.startBeat ?? 0;
  const sinceImpact = (beat - impact) * sec;
  const portrait = f === '9:16';

  const base: WorldState = {
    warm: 0,
    cam: { pos: [2, 1, 2.5], target: [0, 0.2, 0], fov: 34 },
    focus: [0, 0.2, 0],
    focusRange: 2,
    bokeh: 0,
    barY: REST_Y,
    bend: 0,
    sinceImpact,
    solo: { visible: false, pos: SOLO_POS, rot: [0, 0, 0] },
    blur: 16,
    dust: 0,
  };
  const p = interpolate(b, [0, n], [0, 1], CLAMP);

  switch (span.id) {
    case 'escuro': {
      // Abre desfocado e a lente puxa o foco até o "20 KG" fundido; a câmera chega devagar.
      const q = inOut(p);
      const rack = interpolate(b, [0.2, Math.min(2.6, n * 0.45)], [0, 1], { ...CLAMP, easing: expoOut });
      const letters: Vec3 = [0.8, 0.355, 0.02];
      return {
        ...base,
        warm: 1,
        blur: 0,
        dust: 0,
        focus: lerp3([-1.4, 0.3, -1.6], letters, rack),
        focusRange: 0.09,
        bokeh: 7,
        // Quase no eixo da barra: a anilha da ponta esconde as outras e mostra a face inteira.
        cam: portrait
          ? { pos: [2.45 - 0.25 * q, 0.32, 0.36 - 0.06 * q], target: [0.8, 0.255, 0], fov: 30, shift: [0, -0.12] }
          : { pos: [2.4 - 0.18 * q, 0.3, 0.34 - 0.05 * q], target: [0.8, 0.255, 0], fov: 22, shift: [0.27, 0] },
      };
    }
    case 'carga': {
      // Câmera rente ao chão correndo ao longo da barra; o foco passa da anilha perto à longe.
      const q = inOut(p);
      const rack = interpolate(b, [1.5, n - 1.5], [0, 1], { ...CLAMP, easing: inOut });
      return {
        ...base,
        warm: 1,
        blur: 0,
        dust: 0,
        focus: lerp3([0.77, 0.24, 0], [-0.77, 0.24, 0], rack),
        focusRange: 0.3,
        bokeh: 5,
        cam: portrait
          ? { pos: [1.55 - 0.45 * q, 0.15, 1.0], target: [-0.1, 0.22, 0], fov: 46, shift: [0, -0.12] }
          : { pos: [1.6 - 0.5 * q, 0.15, 0.9 + 0.08 * q], target: [-0.2, 0.22, 0], fov: 28, shift: [0.27, 0.03] },
      };
    }
    case 'puxada': {
      const { y, bend } = liftY(b, n, sec);
      return {
        ...base,
        warm: 1,
        blur: 0,
        dust: 0,
        barY: y,
        bend,
        focus: [0, y, 0],
        focusRange: 0.9,
        bokeh: 3,
        cam: pullCam(b, n, f, y),
      };
    }
    case 'numero': {
      const t = sinceImpact;
      const after = afterImpact(t);
      const cover = 0.4;
      if (t < cover) {
        // Dolly zoom: a lente abre enquanto a câmera chega perto; a anilha fica do mesmo
        // tamanho e o chão foge. Mais o tremor do impacto.
        const pn = all.find((s) => s.id === 'puxada')?.beats ?? 8;
        const end = pullCam(pn, pn, f, REST_Y);
        const z = expoOut(Math.min(1, t / 0.34));
        const fov0 = end.fov;
        const fov1 = fov0 + 26;
        const fov = lerp(fov0, fov1, z);
        const k = Math.tan(((fov0 / 2) * Math.PI) / 180) / Math.tan(((fov / 2) * Math.PI) / 180);
        const dir: Vec3 = [end.pos[0] - end.target[0], end.pos[1] - end.target[1], end.pos[2] - end.target[2]];
        const shake = 0.035 * Math.exp(-t / 0.09);
        const fr = Math.round(t * 60);
        return {
          ...base,
          warm: 1,
          blur: 0,
          dust: 0,
          barY: after.y,
          bend: after.bend,
          focus: [0, REST_Y, 0],
          focusRange: 0.9,
          bokeh: 2,
          cam: {
            pos: [
              end.target[0] + dir[0] * k + hash(fr) * shake,
              end.target[1] + dir[1] * k + hash(fr + 99) * shake,
              end.target[2] + dir[2] * k,
            ],
            target: end.target,
            fov,
          },
        };
      }
      const q = interpolate(b, [0, n], [0, 1], CLAMP);
      return {
        ...base,
        barY: after.y,
        bend: after.bend,
        blur: interpolate(b, [0.9, 2.2], [3, 15], CLAMP),
        cam: portrait
          ? { pos: orbit(lerp(0.9, 1.1, q), 3.0, 1.1, [0, 0, 0]), target: [0, 0.15, 0], fov: 50, shift: [0, 0.24] }
          : { pos: orbit(lerp(0.75, 0.95, q), 3.6, 1.1, [0, 0, 0]), target: [0, 0.15, 0], fov: 34, shift: [0.21, 0.12] },
      };
    }
    case 'hoje':
      return {
        ...base,
        cam: { pos: orbit(lerp(2.3, 2.6, p), portrait ? 3.0 : 3.6, 1.2, [0, 0, 0]), target: [0, 0.18, 0], fov: portrait ? 50 : 32, shift: portrait ? [0, 0.24] : [0.21, 0.12] },
      };
    case 'serie': {
      const tap = serieTapBeat(n);
      return {
        ...base,
        // De ponta: a barra vira uma pilha de anilhas que sobe e desce no vão entre o texto e
        // a tela do app.
        blur: 4,
        barY: repY(b, tap),
        bend: damped((b - tap) * sec, 0.012, 4, 0.25),
        cam: portrait
          ? { pos: [5, 0.8, 0.8 - 0.1 * p], target: [0, 0.62, 0], fov: 34, shift: [0.3, -0.23] }
          : { pos: [3.3, 0.7, 0.6 - 0.1 * p], target: [0, 0.62, 0], fov: 30, shift: [0.01, 0] },
      };
    }
    case 'recorde':
      return {
        ...base,
        cam: { pos: [0.25 - 0.3 * p, 2.0, 3.2], target: [0, 0.1, 0], fov: portrait ? 48 : 30, shift: portrait ? [0, 0.24] : [0.21, 0.12] },
      };
    case 'constancia':
      return {
        ...base,
        cam: { pos: orbit(lerp(-2.3, -2.0, p), portrait ? 3.0 : 3.6, 0.9, [0, 0, 0]), target: [0, 0.2, 0], fov: portrait ? 50 : 32, shift: portrait ? [0, 0.24] : [0.21, 0.12] },
      };
    case 'amigos':
      return {
        ...base,
        cam: { pos: orbit(lerp(1.9, 1.6, p), portrait ? 3.0 : 3.6, 0.7, [0, 0, 0]), target: [0, 0.22, 0], fov: portrait ? 50 : 32, shift: portrait ? [0, 0.24] : [0.21, 0.12] },
      };
    case 'marca': {
      // A anilha sobe deitada, gira e encara a câmera, travando na mola do Harbor; a câmera
      // chega perto e, na revelação, o furo do centro abre o bloco da marca.
      const reveal = marksFor('marca', n).reveal ?? 4.5;
      const locked = reveal - 1.5;
      const settle = interpolate(b, [0, locked], [0, 1], { ...CLAMP, easing: HARBOR.springEase });
      const dolly = interpolate(b, [locked, reveal], [0, 1], { ...CLAMP, easing: expoOut });
      const dist = lerp(1.3, 1.0, dolly);
      return {
        ...base,
        blur: 0,
        focus: SOLO_POS,
        focusRange: 0.35,
        bokeh: 2,
        solo: {
          visible: b < reveal + 0.8,
          pos: [SOLO_POS[0], lerp(SOLO_POS[1] - 0.5, SOLO_POS[1], settle), SOLO_POS[2]],
          rot: [lerp(-1.25, 0, settle), lerp(-0.6, 0, settle), lerp(0.9, 0, settle)],
        },
        cam: { pos: [SOLO_POS[0], SOLO_POS[1], SOLO_POS[2] + dist], target: SOLO_POS, fov: portrait ? 44 : 30 },
      };
    }
    case 'instalar':
    case 'fim':
      return {
        ...base,
        blur: 22,
        cam: { pos: [0, 2.3, 2.7], target: [0, 0, 0], fov: portrait ? 50 : 34 },
      };
  }
}
