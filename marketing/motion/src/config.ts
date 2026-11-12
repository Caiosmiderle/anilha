/**
 * Parâmetros do vídeo. Mudou aqui, o Studio e o render recalculam cenas, câmera, layout e
 * trilha. As composições do Root registram as combinações que vão para o ar; estes são os
 * valores da composição "Anilha" que abre no Studio.
 */
export type Formato = '16:9' | '9:16';
export type Duracao = 15 | 30 | 45;

export const FORMATO: Formato = '16:9';
export const DURACAO: Duracao = 45;
/** 128 é o único BPM em que 15, 30 e 45 s fecham em compassos inteiros (32, 64 e 96 tempos). */
export const BPM = 128;

export const FPS = 60;

export const TAMANHO: Record<Formato, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

export interface VideoProps extends Record<string, unknown> {
  formato: Formato;
  duracao: Duracao;
  bpm: number;
}
