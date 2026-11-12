import type { Duracao } from './config';

/**
 * A grade do vídeo: cada cena dura um número inteiro de tempos. Este arquivo não depende de
 * React nem de navegador: o script de áudio importa o mesmo corte e põe cada som no tempo
 * exato de cada imagem.
 */
export type SceneId =
  | 'escuro'
  | 'carga'
  | 'puxada'
  | 'numero'
  | 'hoje'
  | 'serie'
  | 'recorde'
  | 'constancia'
  | 'amigos'
  | 'marca'
  | 'instalar'
  | 'fim';

/** Cena e quantos tempos ela dura, na ordem. */
export const CORTES: Record<Duracao, [SceneId, number][]> = {
  45: [
    ['escuro', 8],
    ['carga', 8],
    ['puxada', 8],
    ['numero', 8],
    ['hoje', 8],
    ['serie', 8],
    ['constancia', 8],
    ['recorde', 8],
    ['amigos', 8],
    ['marca', 8],
    ['instalar', 12],
    ['fim', 4],
  ],
  30: [
    ['escuro', 4],
    ['puxada', 8],
    ['numero', 8],
    ['hoje', 6],
    ['serie', 8],
    ['recorde', 6],
    ['amigos', 6],
    ['marca', 6],
    ['instalar', 8],
    ['fim', 4],
  ],
  15: [
    ['puxada', 6],
    ['numero', 6],
    ['serie', 6],
    ['recorde', 4],
    ['marca', 4],
    ['instalar', 4],
    ['fim', 2],
  ],
};

export interface Span {
  id: SceneId;
  index: number;
  /** Tempo (beat) em que a cena começa, contado do início do vídeo. */
  startBeat: number;
  beats: number;
  /** Quadro de início e duração em quadros, arredondados na grade. */
  from: number;
  duration: number;
}

export const framesPerBeat = (bpm: number, fps: number) => (60 * fps) / bpm;

/** Quadro mais próximo de um tempo: a grade de 128 BPM cai a cada 28,125 quadros. */
export const beatFrame = (beat: number, bpm: number, fps: number) =>
  Math.round(beat * framesPerBeat(bpm, fps));

export function totalBeats(duracao: Duracao): number {
  return CORTES[duracao].reduce((n, [, b]) => n + b, 0);
}

export function totalFrames(duracao: Duracao, bpm: number, fps: number): number {
  return beatFrame(totalBeats(duracao), bpm, fps);
}

export function spans(duracao: Duracao, bpm: number, fps: number): Span[] {
  let beat = 0;
  return CORTES[duracao].map(([id, beats], index) => {
    const from = beatFrame(beat, bpm, fps);
    const to = beatFrame(beat + beats, bpm, fps);
    const span = { id, index, startBeat: beat, beats, from, duration: to - from };
    beat += beats;
    return span;
  });
}

/** A cena em que cai um tempo global, e o tempo local dentro dela. */
export function sceneAt(all: Span[], beat: number): { span: Span; local: number } {
  let found = all[0] as Span;
  for (const s of all) if (beat >= s.startBeat) found = s;
  return { span: found, local: beat - found.startBeat };
}

/** O tempo do impacto: o começo da cena "numero". */
export function impactBeat(all: Span[]): number {
  return all.find((s) => s.id === 'numero')?.startBeat ?? 0;
}
