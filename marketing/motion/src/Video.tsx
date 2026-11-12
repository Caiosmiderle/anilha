import './harbor';
import { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoProps } from './config';
import { layoutFor, VideoCtx } from './layout';
import { Fim, Instalar, IronText, Marca, NumberFly, PhoneTrack, SceneText, Shockwave } from './scenes/Overlays';
import { framesPerBeat, spans, type Span } from './timeline';
import { worldAt } from './three/director';
import { World } from './three/World';

/**
 * Anilha: do ferro bruto à precisão digital. Um mundo 3D contínuo (o ferro) e, por cima, as
 * camadas de cada cena: texto cinético, a onda de choque, a tela do app e o CTA. Tudo sai do
 * quadro atual; nada usa relógio.
 */
export function Video({ formato, duracao, bpm }: VideoProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const all = useMemo(() => spans(duracao, bpm, fps), [duracao, bpm, fps]);
  const layout = useMemo(() => layoutFor(formato), [formato]);
  const ctx = useMemo(() => ({ formato, bpm, spans: all, layout }), [formato, bpm, all, layout]);
  const beat = frame / framesPerBeat(bpm, fps);
  const s = worldAt(beat, all, formato, bpm);
  const hasEscuro = all.some((x) => x.id === 'escuro');

  const layer = (sp: Span) => {
    switch (sp.id) {
      case 'escuro':
      case 'carga':
      case 'puxada':
        return <IronText span={sp} hasEscuro={hasEscuro} />;
      case 'marca':
        return <Marca span={sp} />;
      case 'instalar':
        return <Instalar span={sp} />;
      case 'fim':
        return <Fim span={sp} />;
      default:
        return <SceneText span={sp} />;
    }
  };

  return (
    <VideoCtx.Provider value={ctx}>
      <AbsoluteFill style={{ background: 'var(--ink-strong)', fontFamily: 'var(--font-sans)' }}>
        <World s={s} t={frame / fps} width={width} height={height} />
        {all.map((sp) =>
          sp.id === 'numero' ? (
            <Sequence key={sp.id} from={sp.from} durationInFrames={sp.duration} layout="none">
              <AbsoluteFill>
                <Shockwave />
              </AbsoluteFill>
            </Sequence>
          ) : null,
        )}
        <PhoneTrack />
        {all.map((sp) => (
          <Sequence key={`${sp.id}-${sp.index}`} from={sp.from} durationInFrames={sp.duration} name={sp.id}>
            {sp.id === 'numero' ? (
              <>
                <NumberFly span={sp} />
                <SceneText span={sp} />
              </>
            ) : (
              layer(sp)
            )}
          </Sequence>
        ))}
        <Audio src={staticFile(`audio/anilha-${duracao}.wav`)} />
      </AbsoluteFill>
    </VideoCtx.Provider>
  );
}
