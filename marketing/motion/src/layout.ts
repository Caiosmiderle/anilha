import { createContext, useContext } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { Formato } from './config';
import { framesPerBeat, type Span } from './timeline';

/**
 * Composição por formato. O 9:16 não é um recorte do 16:9: o texto sobe para o topo, a tela
 * do app cresce e sangra pela borda de baixo, e a câmera 3D (director.ts) olha a barra mais
 * de ponta para caber na vertical.
 */
export interface Layout {
  W: number;
  H: number;
  /** Tela do app: zoom do CSS (texto nítido, sem escalar bitmap), posição e altura em px de CSS. */
  phone: { zoom: number; x: number; y: number; h: number };
  /** Coluna do texto cinético. */
  text: { x: number; y: number; width: number; align: 'left' | 'center' };
  /** Escala aplicada às medidas de tipografia de marketing do Harbor. */
  type: number;
}

export function layoutFor(f: Formato): Layout {
  if (f === '9:16') {
    return {
      W: 1080,
      H: 1920,
      phone: { zoom: 2.2, x: (1080 - 390 * 2.2) / 2, y: 600, h: 590 },
      text: { x: 84, y: 150, width: 912, align: 'left' },
      type: 1.45,
    };
  }
  return {
    W: 1920,
    H: 1080,
    phone: { zoom: 1.1, x: 1200, y: (1080 - 844 * 1.1) / 2, h: 844 },
    text: { x: 150, y: 540, width: 900, align: 'left' },
    type: 1.5,
  };
}

/**
 * Estilos de marketing do Harbor (tokens.css, comentário "Estilos de texto"):
 * display 64 / 1.1 / 600 / -0.6, headline-1 56 / 1.0 / 600 / -0.28, lead 20 / 1.6 / 500.
 */
export const TYPE = {
  display: { size: 64, line: 1.1, weight: 600, track: -0.6 },
  headline: { size: 56, line: 1.04, weight: 600, track: -0.28 },
  lead: { size: 20, line: 1.6, weight: 500, track: 0 },
} as const;
export type TypeName = keyof typeof TYPE;

export interface VideoInfo {
  formato: Formato;
  bpm: number;
  spans: Span[];
  layout: Layout;
}

export const VideoCtx = createContext<VideoInfo | null>(null);

export function useVideo(): VideoInfo {
  const v = useContext(VideoCtx);
  if (!v) throw new Error('VideoCtx ausente');
  return v;
}

/** Quadro local da cena e o conversor de tempos (beats) locais para quadros. */
export function useBeat() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { bpm } = useVideo();
  const fpb = framesPerBeat(bpm, fps);
  return { f: frame, fps, fpb, b: frame / fpb, at: (beat: number) => Math.round(beat * fpb) };
}
