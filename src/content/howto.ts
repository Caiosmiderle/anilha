/**
 * "Como fazer" of each exercise. Three files, each with one owner:
 * - howto.json: tips and common errors written by the Anilha team, and the YouTube video
 *   (videoId, start, end in seconds) that Caio curates by hand. Empty videoId: no video.
 * - media.json: the loop on top of the sheet, written by scripts/media/import.ts from a
 *   licensed source and served from our own storage, with source, author and license.
 * - video-status.json: written every week by scripts/media/check-videos.mjs (GitHub
 *   Action): a video taken down or with embedding off stops showing.
 */
import HOWTO from './howto.json';
import MEDIA from './media.json';
import VIDEO_STATUS from './video-status.json';

interface RawHowTo {
  tips: string[];
  errors: string[];
  videoId: string;
  start: number | null;
  end: number | null;
}

export interface ExerciseMedia {
  /** Two or more still frames shown in turn (start and peak of the movement). */
  frames?: string[];
  /** Or one animated file: webp, gif, mp4 or webm. */
  url?: string;
  fonte: string;
  autor: string;
  licenca: string;
  licencaUrl: string;
  /** The source's page, for the credits. */
  origem?: string;
  /** Attribution text the license asks for, shown as is in Créditos e licenças. */
  atribuicao?: string;
}

export interface VideoStatus {
  ok: boolean;
  /** Since when it is like this (YYYY-MM-DD): the file only changes when a video changes. */
  since: string;
  /** Why it stopped: removed, private or embedding off. */
  reason?: string;
}

export interface HowTo {
  tips: string[];
  errors: string[];
  media: ExerciseMedia | null;
  /** Only when curated and healthy at the last check. */
  video: { id: string; start: number | null; end: number | null } | null;
}

const howto = HOWTO as Record<string, RawHowTo>;
const media = MEDIA as Record<string, ExerciseMedia>;
const status = VIDEO_STATUS as Record<string, VideoStatus>;

/** A YouTube id is 11 letters, digits, - or _: anything else is a typo, not a video. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function videoOk(id: string, statuses: Record<string, VideoStatus> = status): boolean {
  return VIDEO_ID.test(id) && statuses[id]?.ok !== false;
}

/**
 * Tests only: the content takes only the video ids Caio gives and only imported media, so
 * the E2E build (and dev) can set a video or a media in localStorage to check the sheet.
 * The production build drops this.
 */
function testContent(): { videos: Record<string, string>; midia: Record<string, ExerciseMedia> } {
  const none = { videos: {}, midia: {} };
  if (import.meta.env.MODE !== 'e2e' && !import.meta.env.DEV) return none;
  try {
    return { ...none, ...JSON.parse(localStorage.getItem('anilha:conteudo-de-teste') ?? '{}') };
  } catch {
    return none;
  }
}

/** The content of an exercise, or null when there is none (exercises the person creates). */
export function howToFor(
  exerciseId: string,
  sources: {
    howto?: Record<string, RawHowTo>;
    media?: Record<string, ExerciseMedia>;
    status?: Record<string, VideoStatus>;
  } = {},
): HowTo | null {
  const h = (sources.howto ?? howto)[exerciseId];
  if (!h || !h.tips.length) return null;
  const test = sources.howto ? null : testContent();
  const m = test?.midia[exerciseId] ?? (sources.media ?? media)[exerciseId] ?? null;
  const id = h.videoId.trim() || (test?.videos[exerciseId] ?? '');
  return {
    tips: h.tips.slice(0, 4),
    errors: h.errors.slice(0, 2),
    media: m && (m.url || m.frames?.length) ? m : null,
    video: id && videoOk(id, sources.status ?? status) ? { id, start: h.start, end: h.end } : null,
  };
}

export function hasHowTo(exerciseId: string): boolean {
  return howToFor(exerciseId) != null;
}

/** The player loads only after the tap, without cookies until play (youtube-nocookie). */
export function youtubeEmbedUrl(v: { id: string; start: number | null; end: number | null }) {
  const q = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1', modestbranding: '1' });
  if (v.start != null) q.set('start', String(Math.max(0, Math.floor(v.start))));
  if (v.end != null) q.set('end', String(Math.max(0, Math.floor(v.end))));
  return `https://www.youtube-nocookie.com/embed/${v.id}?${q.toString()}`;
}

/** Without a curated video: a search on YouTube, in a new tab. */
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} como fazer`)}`;
}

/** Sources of the media in use, for Créditos e licenças: one line per source. */
export function mediaCredits(
  all: Record<string, ExerciseMedia> = media,
): (Omit<ExerciseMedia, 'frames' | 'url'> & { exercises: number })[] {
  const by = new Map<string, Omit<ExerciseMedia, 'frames' | 'url'> & { exercises: number }>();
  for (const m of Object.values(all)) {
    const key = `${m.fonte}|${m.autor}|${m.licenca}`;
    const cur = by.get(key);
    if (cur) cur.exercises += 1;
    else
      by.set(key, {
        fonte: m.fonte,
        autor: m.autor,
        licenca: m.licenca,
        licencaUrl: m.licencaUrl,
        ...(m.origem ? { origem: m.origem } : {}),
        ...(m.atribuicao ? { atribuicao: m.atribuicao } : {}),
        exercises: 1,
      });
  }
  return [...by.values()];
}
