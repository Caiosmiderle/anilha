import { Easing } from 'remotion';

/**
 * Os movimentos do próprio Harbor e do app, em quadros:
 * - a pílula das abas anda em 420 ms com cubic-bezier(0.34, 1.4, 0.64, 1): passa um pouco e
 *   trava exatamente no lugar. É a mola da interface no vídeo inteiro;
 * - hb-rise: sobe 6 px e aparece em 0,4 s (reconhecimentos);
 * - hb-sheet-in: sobe 24 px e aparece em 0,2 s (folhas);
 * - .hb-btn:active desce 1 px; o stepper encolhe para 0,96.
 */
export const HARBOR = {
  springEase: Easing.bezier(0.34, 1.4, 0.64, 1),
  springMs: 420,
  easeOut: Easing.bezier(0, 0, 0.58, 1),
  riseMs: 400,
  risePx: 6,
  sheetMs: 200,
  sheetPx: 24,
  pressPx: 1,
  stepperPress: 0.96,
} as const;
