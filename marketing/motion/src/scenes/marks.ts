import type { SceneId } from '../timeline';

/**
 * Os tempos (beats locais) de cada ação dentro das cenas, em função de quantos tempos a cena
 * tem. A trilha (audio/synth.ts) lê esta mesma tabela: o som do toque cai no quadro do
 * toque, o impacto no quadro do impacto.
 */
export interface Marks {
  /** Pedaços de texto e o tempo de cada um. */
  words?: number[];
  /** Tela do app entra. */
  phoneIn?: number;
  /** Números caem nos campos. */
  land?: number;
  /** Toque na interface (botão, "Série feita", "Boa"). */
  tap?: number;
  /** Cartão sobe, foguinho acende, ícone cai na tela de início. */
  reveal?: number;
  /** Passos da instalação. */
  steps?: number[];
}

export function marksFor(id: SceneId, n: number): Marks {
  const long = n >= 8;
  switch (id) {
    case 'escuro':
      return { words: long ? [2, 3] : [1, 2] };
    case 'carga':
      return { words: [1, 2, 3] };
    case 'puxada':
      return { words: long ? [1, 1.5, 2, 2.5, 3] : [0.5, 1, 1.5, 2, 2.5] };
    case 'numero':
      return long
        ? { words: [1, 1.5, 2], phoneIn: 3, land: 4, tap: 6 }
        : { words: [1, 1.25, 1.5], phoneIn: 2, land: 3, tap: 5 };
    case 'hoje':
      return { tap: n - 2 };
    case 'serie':
      return { tap: n - 3 };
    case 'constancia':
      return { reveal: 1 };
    case 'recorde':
      return { reveal: 1 };
    case 'amigos':
      return { tap: long ? 3 : 2.5 };
    case 'marca':
      return long ? { reveal: 4.5, words: [6] } : n >= 6 ? { reveal: 3.5, words: [4.5] } : { reveal: 2.5, words: [3] };
    case 'instalar':
      return long ? { steps: [1, 2, 3], reveal: 4, words: [0.5] } : n >= 8 ? { steps: [1, 2, 3], reveal: 4, words: [0.5] } : { steps: [0.5, 1, 1.5], reveal: 2.5, words: [0.25] };
    case 'fim':
      return { words: [0, 0.5] };
  }
}

/** Cenas em que a tela do app está no quadro. */
export const UI_SCENES: SceneId[] = ['numero', 'hoje', 'serie', 'constancia', 'recorde', 'amigos'];
