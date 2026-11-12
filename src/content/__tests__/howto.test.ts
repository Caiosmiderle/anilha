import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../engine/exercises';
import HOWTO from '../howto.json';
import {
  hasHowTo,
  howToFor,
  mediaCredits,
  videoOk,
  youtubeEmbedUrl,
  youtubeSearchUrl,
  type ExerciseMedia,
} from '../howto';

const raw = HOWTO as Record<
  string,
  { tips: string[]; errors: string[]; videoId: string; start: number | null; end: number | null }
>;

describe('conteúdo de cada exercício', () => {
  it('todo exercício do catálogo tem dicas, e não sobra dica sem exercício', () => {
    const ids = EXERCISES.map((e) => e.id).sort();
    expect(Object.keys(raw).sort()).toEqual(ids);
  });

  it.each(EXERCISES.map((e) => e.id))('%s: 3 a 4 dicas, até 2 erros, frases curtas', (id) => {
    const h = raw[id];
    expect(h?.tips.length).toBeGreaterThanOrEqual(3);
    expect(h?.tips.length).toBeLessThanOrEqual(4);
    expect(h?.errors.length).toBeGreaterThanOrEqual(1);
    expect(h?.errors.length).toBeLessThanOrEqual(2);
    for (const t of [...(h?.tips ?? []), ...(h?.errors ?? [])]) {
      expect(t.length).toBeLessThanOrEqual(90);
      expect(t).toMatch(/^[A-ZÀ-Ú].*[.?]$/);
    }
  });

  it('nenhum vídeo inventado: só id que o Caio passar', () => {
    // Every videoId starts empty; a filled one must at least look like a YouTube id.
    for (const [id, h] of Object.entries(raw)) {
      if (h.videoId) expect(videoOk(h.videoId, {}), id).toBe(true);
      else {
        expect(h.start, id).toBeNull();
        expect(h.end, id).toBeNull();
      }
    }
  });
});

describe('o que a folha mostra', () => {
  const sources = {
    howto: {
      a: {
        tips: ['Um.', 'Dois.', 'Três.', 'Quatro.', 'Cinco.'],
        errors: ['X.', 'Y.', 'Z.'],
        videoId: 'abcdefghijk',
        start: 12,
        end: 40,
      },
      b: { tips: ['Um.', 'Dois.', 'Três.'], errors: [], videoId: '', start: null, end: null },
      c: { tips: ['Um.', 'Dois.', 'Três.'], errors: [], videoId: 'curto', start: null, end: null },
    },
    media: {},
    status: {},
  };

  it('no máximo 4 dicas e 2 erros', () => {
    const h = howToFor('a', sources);
    expect(h?.tips).toHaveLength(4);
    expect(h?.errors).toHaveLength(2);
  });

  it('vídeo só com id válido e saudável na última checagem', () => {
    expect(howToFor('a', sources)?.video).toEqual({ id: 'abcdefghijk', start: 12, end: 40 });
    expect(howToFor('b', sources)?.video).toBeNull();
    expect(howToFor('c', sources)?.video).toBeNull();
    const down = {
      ...sources,
      status: { abcdefghijk: { ok: false, since: '2026-10-26', reason: 'removido' } },
    };
    expect(howToFor('a', down)?.video).toBeNull();
  });

  it('sem conteúdo (exercício criado pela pessoa): sem botão', () => {
    expect(howToFor('meu-exercicio', sources)).toBeNull();
    expect(hasHowTo('meu-exercicio')).toBe(false);
    expect(hasHowTo('supino-reto-barra')).toBe(true);
  });

  it('player do youtube-nocookie com início e fim; busca em nova aba', () => {
    expect(youtubeEmbedUrl({ id: 'abcdefghijk', start: 12.7, end: 40 })).toBe(
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0&playsinline=1&modestbranding=1&start=12&end=40',
    );
    expect(youtubeSearchUrl('Supino reto com barra')).toBe(
      'https://www.youtube.com/results?search_query=Supino%20reto%20com%20barra%20como%20fazer',
    );
  });

  it('mídia só com arquivo; créditos agrupados por fonte', () => {
    const m: ExerciseMedia = {
      frames: ['https://x.supabase.co/storage/v1/object/public/midia-exercicios/a/1.webp'],
      fonte: 'Fonte',
      autor: 'Autor',
      licenca: 'Licença',
      licencaUrl: 'https://exemplo.dev/licenca',
    };
    expect(howToFor('b', { ...sources, media: { b: m } })?.media).toEqual(m);
    expect(howToFor('b', { ...sources, media: { b: { ...m, frames: [] } } })?.media).toBeNull();
    expect(mediaCredits({ a: m, b: m })).toEqual([
      {
        fonte: 'Fonte',
        autor: 'Autor',
        licenca: 'Licença',
        licencaUrl: 'https://exemplo.dev/licenca',
        exercises: 2,
      },
    ]);
  });
});
