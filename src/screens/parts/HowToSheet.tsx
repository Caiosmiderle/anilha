import { CirclePlay, ExternalLink, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  howToFor,
  youtubeEmbedUrl,
  youtubeSearchUrl,
  type ExerciseMedia,
} from '../../content/howto';
import type { ExerciseDef } from '../../engine/types';
import { useOnline } from '../../lib/online';
import { Sheet } from '../../ui/overlays';
import { Button, Icon } from '../../ui/primitives';

/**
 * Como fazer: the loop on top, 3 to 4 tips, up to 2 common errors. The YouTube player only
 * when there is a curated, healthy video, and only after the tap (youtube-nocookie). Without
 * an image, a search on YouTube while online; offline, the tips alone. Closing leaves the workout
 * exactly where it was: the rest timer lives outside the sheet.
 */
export function HowToSheet({
  exercise,
  onClose,
}: {
  exercise: Pick<ExerciseDef, 'id' | 'name'>;
  onClose: () => void;
}) {
  const h = howToFor(exercise.id);
  const online = useOnline();
  const [playing, setPlaying] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  if (!h) return null;
  const media = h.media && !mediaFailed ? h.media : null;
  const name = exercise.name;

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Como fazer: ${name.toLowerCase()}`}
      actions={
        <Button variant="tint" block onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="stack howto" data-testid="howto">
        {media ? <MediaLoop media={media} name={name} onFail={() => setMediaFailed(true)} /> : null}

        <section className="stack-sm" aria-label="Dicas">
          <h3 className="hb-label howto-head">Dicas</h3>
          <ul className="howto-list">
            {h.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        {h.errors.length ? (
          <section className="stack-sm" aria-label="Erros comuns">
            <h3 className="hb-label howto-head">Erros comuns</h3>
            <ul className="howto-list is-errors">
              {h.errors.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* The image teaches the movement; without one (or if it fails), a search on YouTube. */}
        {!online ? (
          media ? null : (
            <p className="t-caption howto-offline">
              <Icon icon={WifiOff} size={16} />
              Sem internet: por enquanto, só as dicas.
            </p>
          )
        ) : h.video ? (
          playing ? (
            <div className="howto-video">
              <iframe
                src={youtubeEmbedUrl(h.video)}
                title={`Vídeo: ${name}`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
            // Facade: nothing from YouTube loads until this tap.
            <button type="button" className="howto-facade" onClick={() => setPlaying(true)}>
              <Icon icon={CirclePlay} size={40} />
              <span className="howto-facade-title">Ver vídeo</span>
              <span className="t-caption">O vídeo do YouTube só carrega quando você toca.</span>
            </button>
          )
        ) : media ? null : (
          <a
            className="hb-btn hb-btn-outline howto-search"
            href={youtubeSearchUrl(name)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon icon={ExternalLink} size={18} />
            Buscar no YouTube
          </a>
        )}

        {media ? (
          <p className="t-caption" style={{ margin: 0 }}>
            Imagem: {media.fonte}. Créditos em Você, Créditos e licenças.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The movement on a loop: an animated file, or still frames shown in turn. */
function MediaLoop({
  media,
  name,
  onFail,
}: {
  media: ExerciseMedia;
  name: string;
  onFail: () => void;
}) {
  const frames = media.frames ?? [];
  const [index, setIndex] = useState(0);
  const [still] = useState(prefersReducedMotion);
  useEffect(() => {
    if (frames.length < 2 || still) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), 1100);
    return () => window.clearInterval(t);
  }, [frames.length, still]);

  if (media.url && /\.(mp4|webm)(\?|$)/i.test(media.url))
    return (
      <video
        className="howto-media"
        src={media.url}
        autoPlay={!still}
        loop
        muted
        playsInline
        controls={still}
        aria-label={`Movimento de ${name.toLowerCase()}`}
        onError={onFail}
      />
    );
  if (media.url)
    return (
      <img
        className="howto-media"
        src={media.url}
        alt={`Movimento de ${name.toLowerCase()}`}
        onError={onFail}
      />
    );
  // Reduced motion: the positions side by side instead of switching.
  return (
    <div
      className={`howto-media howto-frames${still ? ' is-still' : ''}`}
      role="img"
      aria-label={`Movimento de ${name.toLowerCase()}, do começo ao fim`}
    >
      {frames.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          data-on={still || i === index}
          onError={onFail}
          decoding="async"
        />
      ))}
    </div>
  );
}
