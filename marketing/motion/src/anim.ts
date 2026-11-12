import { Easing, interpolate } from 'remotion';
import { HARBOR } from './harborMotion';

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const msFrames = (ms: number, fps: number) => (ms / 1000) * fps;

/** Saída rápida e frenagem longa: a câmera chega com força e trava. */
export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const expoIn = Easing.bezier(0.7, 0, 0.84, 0);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 a 1 na mola do Harbor (passa um pouco e trava exato no fim), a partir de `at`. */
export function harborSpring(frame: number, at: number, fps: number, ms: number = HARBOR.springMs) {
  return interpolate(frame, [at, at + msFrames(ms, fps)], [0, 1], {
    ...CLAMP,
    easing: HARBOR.springEase,
  });
}

/** hb-rise: sobe 6 px e aparece em 0,4 s. */
export function rise(frame: number, at: number, fps: number) {
  const t = interpolate(frame, [at, at + msFrames(HARBOR.riseMs, fps)], [0, 1], {
    ...CLAMP,
    easing: HARBOR.easeOut,
  });
  return { opacity: t, transform: `translateY(${(1 - t) * HARBOR.risePx}px)` };
}

/** hb-sheet-in: sobe 24 px e aparece em 0,2 s. */
export function sheetIn(frame: number, at: number, fps: number) {
  const t = interpolate(frame, [at, at + msFrames(HARBOR.sheetMs, fps)], [0, 1], {
    ...CLAMP,
    easing: HARBOR.easeOut,
  });
  return { opacity: t, transform: `translateY(${(1 - t) * HARBOR.sheetPx}px)` };
}

/**
 * Um toque num botão em `at`: 0 solto, 1 apertado. Desce em 2 quadros, segura 5 e solta em
 * 7, como o :active do Harbor visto a 60 fps.
 */
export function press(frame: number, at: number) {
  return interpolate(frame, [at - 2, at, at + 5, at + 12], [0, 1, 1, 0], CLAMP);
}

/** Seno amortecido: tremor e chicote da barra depois de um impacto. */
export function damped(t: number, amp: number, hz: number, tau: number) {
  if (t < 0) return 0;
  return amp * Math.exp(-t / tau) * Math.cos(2 * Math.PI * hz * t);
}

/** Ruído determinístico em [-1, 1] (mesmo valor no mesmo quadro, em qualquer render). */
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
