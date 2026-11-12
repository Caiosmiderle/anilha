import { Composition } from 'remotion';
import { BPM, DURACAO, FORMATO, FPS, TAMANHO, type Duracao, type Formato, type VideoProps } from './config';
import { totalFrames } from './timeline';
import { ExerciseStill } from './exercise/ExerciseStill';
import { EXERCISES } from './exercise/scenes';
import { Video } from './Video';

/** A composição dos parâmetros do topo (config.ts) e as três que vão para o ar. */
const VARIANTES: { id: string; formato: Formato; duracao: Duracao }[] = [
  { id: 'Anilha', formato: FORMATO, duracao: DURACAO },
  { id: 'Anilha-16x9-45s', formato: '16:9', duracao: 45 },
  { id: 'Anilha-9x16-45s', formato: '9:16', duracao: 45 },
  { id: 'Anilha-9x16-15s', formato: '9:16', duracao: 15 },
  { id: 'Anilha-16x9-30s', formato: '16:9', duracao: 30 },
];

export function Root() {
  return (
    <>
      {VARIANTES.map((v) => (
        <Composition
          key={v.id}
          id={v.id}
          component={Video}
          fps={FPS}
          width={TAMANHO[v.formato].width}
          height={TAMANHO[v.formato].height}
          durationInFrames={totalFrames(v.duracao, BPM, FPS)}
          defaultProps={{ formato: v.formato, duracao: v.duracao, bpm: BPM }}
        />
      ))}
      {/* Imagens de "Como fazer": quadro 0 início, quadro 1 fim. */}
      {EXERCISES.map((id) => (
        <Composition
          key={id}
          id={`Exercicio-${id}`}
          component={ExerciseStill}
          fps={30}
          width={1024}
          height={1024}
          durationInFrames={2}
          defaultProps={{ id }}
        />
      ))}
    </>
  );
}
