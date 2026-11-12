/** Medidas físicas compartilhadas pelo 3D e pela trilha (sem React nem navegador). */
export const PLATE_R = 0.225;
export const REST_Y = PLATE_R;
export const LOCK_Y = 0.785;
export const G = 9.81;
/** Tempo de queda livre do quadril ao chão: a trilha solta o assobio da queda nesse ponto. */
export const FALL_S = Math.sqrt((2 * (LOCK_Y - REST_Y)) / G);

/**
 * Tempos (beats locais) da puxada: a anilha sai do chão em `start` e trava em `lock`, fora
 * do quadro. A trilha põe o ferro saindo do chão e travando nesses mesmos tempos.
 */
export function liftMarks(n: number): { start: number; lock: number } {
  // No corte curto não há a cena do ferro parado: a anilha fica no chão durante a primeira
  // frase e só então sai.
  const start = n >= 8 ? 0.5 : 1.75;
  return { start, lock: start + 1.25 };
}
