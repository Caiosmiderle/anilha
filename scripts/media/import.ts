/**
 * Imports the media of the exercises from a licensed source into the Anilha storage, so the
 * app never loads anything from a third-party site. For each exercise it records the URL in
 * our storage, the source, the author, the license and the license link in
 * src/content/media.json.
 *
 * Without --enviar it only checks: license, mapping, what is missing. Nothing is uploaded and
 * no file changes.
 *
 *   npx tsx scripts/media/import.ts --fonte repdb
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/media/import.ts --fonte repdb --enviar
 *
 * The service key stays in the shell of whoever runs it: never in a file of the repository.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { EXERCISES } from '../../src/engine/exercises';
import type { ExerciseMedia } from '../../src/content/howto';

interface Source {
  nome: string;
  /** Whether the terms allow copying the media to our storage in a commercial app. */
  comercial: boolean;
  /** What the terms say, in one line; read on the date below. */
  termos: string;
  lidoEm: string;
  termosUrl: string;
  autor?: string;
  licenca?: string;
  licencaUrl?: string;
  origem?: string;
  atribuicao?: string;
  /** Where the dataset and the files are downloaded from. */
  base?: string;
}

const SOURCES: Record<string, Source> = {
  repdb: {
    nome: 'RepDB, versão gratuita',
    comercial: true,
    termos:
      'Uso pessoal e comercial dentro de apps, sem custo, com o link "Exercise data by RepDB (repdb.co)" visível; não pode republicar como dataset ou API, nem usar as imagens em IA generativa; as animações de amostra da versão paga não podem ir para produção.',
    lidoEm: '2026-10-20',
    termosUrl: 'https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md',
    autor: 'RepDB (Sergei Argutin)',
    licenca: 'RepDB Free Tier License v1.0',
    licencaUrl: 'https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md',
    origem: 'https://repdb.co',
    atribuicao: 'Exercise data by RepDB (repdb.co)',
    base: 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/',
  },
  'exercisedb-v1': {
    nome: 'ExerciseDB V1, versão gratuita (AscendAPI)',
    comercial: false,
    termos:
      'A versão gratuita (oss.exercisedb.dev) permite projetos pessoais, protótipos, ferramentas educativas e apps não comerciais; produtos comerciais, SaaS ou qualquer uso monetizado precisam de plano pago pela RapidAPI. Atribuição à AscendAPI obrigatória. O código do repositório é AGPL-3.0, o que não cobre as mídias.',
    lidoEm: '2026-10-20',
    termosUrl: 'https://oss.exercisedb.dev/docs',
  },
  'exercisedb-v2': {
    nome: 'ExerciseDB com vídeos e imagens, plano pago (AscendAPI na RapidAPI)',
    comercial: false,
    termos:
      'Acesso só em tempo real: o conteúdo (GIFs, vídeos, imagens, textos) não pode ser guardado no aparelho, em servidor, banco ou nuvem, nem em cache por mais de 1 hora, nem usado depois da assinatura. Ou seja, só carregando do CDN deles, o que o Anilha não faz.',
    lidoEm: '2026-10-20',
    termosUrl: 'https://rapidapi.com/ascendapi/api/edb-with-videos-and-images-by-ascendapi/details',
  },
};

const BUCKET = 'midia-exercicios';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : '';
}

interface RepdbExercise {
  id: string;
  name_en: string;
  images?: { flat?: { main?: string; start?: string; peak?: string } };
}

async function main() {
  const fonte = arg('fonte');
  const send = arg('enviar') !== null;
  const source = fonte ? SOURCES[fonte] : undefined;
  if (!fonte || !source) {
    console.error(`Escolha a fonte com --fonte: ${Object.keys(SOURCES).join(', ')}.`);
    process.exit(2);
  }

  console.log(`Fonte: ${source.nome}`);
  console.log(`Termos (lidos em ${source.lidoEm}): ${source.termos}`);
  console.log(`Texto: ${source.termosUrl}\n`);
  if (!source.comercial) {
    console.error(
      'Parado: os termos desta fonte não permitem copiar a mídia para o nosso armazenamento num app comercial.',
    );
    process.exit(1);
  }

  const mapa = JSON.parse(readFileSync(`scripts/media/mapa-${fonte}.json`, 'utf8')) as {
    mapa: Record<string, string | null>;
    aproximados?: string[];
  };
  const dataset = (await (await fetch(`${source.base}exercises.json`)).json()) as {
    exercises: RepdbExercise[];
  };
  const byId = new Map(dataset.exercises.map((e) => [e.id, e]));

  const plan: { id: string; files: { frame: string; path: string }[] }[] = [];
  const missing: string[] = [];
  for (const e of EXERCISES) {
    const theirs = mapa.mapa[e.id];
    const item = theirs ? byId.get(theirs) : undefined;
    const flat = item?.images?.flat;
    const files =
      flat?.start && flat.peak
        ? [
            { frame: 'inicio', path: flat.start },
            { frame: 'fim', path: flat.peak },
          ]
        : flat?.main
          ? [{ frame: 'principal', path: flat.main }]
          : [];
    if (!files.length) missing.push(`${e.id} (${e.name})`);
    else plan.push({ id: e.id, files });
  }

  console.log(`Com mídia: ${plan.length} de ${EXERCISES.length}.`);
  if (mapa.aproximados?.length) console.log(`Aproximados, revise: ${mapa.aproximados.join(', ')}.`);
  console.log(`Sem equivalente na fonte: ${missing.length ? missing.join('; ') : 'nenhum'}.\n`);

  if (!send) {
    console.log('Só conferência: nada foi enviado. Para enviar, rode de novo com --enviar.');
    return;
  }

  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    process.exit(2);
  }
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  // Public bucket: the app reads the files without a session; only the service key writes.
  const created = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!created.ok && created.status !== 409 && created.status !== 400) {
    console.error(`Não deu para criar o bucket: ${created.status} ${await created.text()}`);
    process.exit(1);
  }

  const media = JSON.parse(readFileSync('src/content/media.json', 'utf8')) as Record<
    string,
    ExerciseMedia
  >;
  for (const p of plan) {
    const urls: string[] = [];
    for (const f of p.files) {
      const res = await fetch(`${source.base}${f.path}`);
      if (!res.ok) throw new Error(`Download falhou: ${f.path} (${res.status})`);
      const body = Buffer.from(await res.arrayBuffer());
      const ext = f.path.split('.').pop() ?? 'webp';
      const path = `${fonte}/${p.id}/${f.frame}.${ext}`;
      const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...auth, 'content-type': `image/${ext}`, 'x-upsert': 'true' },
        body,
      });
      if (!up.ok) throw new Error(`Envio falhou: ${path} (${up.status} ${await up.text()})`);
      urls.push(`${url}/storage/v1/object/public/${BUCKET}/${path}`);
    }
    media[p.id] = {
      ...(urls.length > 1 ? { frames: urls } : { url: urls[0] as string }),
      fonte: source.nome,
      autor: source.autor as string,
      licenca: source.licenca as string,
      licencaUrl: source.licencaUrl as string,
      ...(source.origem ? { origem: source.origem } : {}),
      ...(source.atribuicao ? { atribuicao: source.atribuicao } : {}),
    };
    console.log(`ok ${p.id}`);
  }
  const sorted = Object.fromEntries(Object.entries(media).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync('src/content/media.json', JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\nsrc/content/media.json atualizado: ${plan.length} exercícios.`);
}

await main();
