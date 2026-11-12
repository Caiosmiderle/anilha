// Supabase Edge Function (Deno): imports the RepDB free-tier exercise images into our own
// storage, so the app never loads media from a third-party site. It runs inside Supabase,
// where the service key already is: nobody copies the key. Called by hand, in batches
// (?inicio=0&fim=30), with a one-time token whose SHA-256 goes in TOKEN_SHA256; after the
// import it is deployed again switched off. Used on 20/10/2026 (89 exercises). Empty hash:
// every call is refused. License (RepDB Free Tier v1.0, read on 20/10/2026): commercial
// use inside apps with the visible link "Exercise data by RepDB (repdb.co)"; no
// redistribution as a dataset or API; no generative AI on the images.
const TOKEN_SHA256 = '';
const BASE = 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/';
const BUCKET = 'midia-exercicios';

/** Anilha id -> RepDB id (scripts/media/mapa-repdb.json). */
const MAPA: Record<string, string> = {
  'puxada-frente': 'lat-pulldown',
  'puxada-supinada': 'reverse-grip-lat-pulldown',
  'puxada-triangulo': 'v-bar-lat-pulldown',
  'barra-fixa': 'pull-up',
  'remada-curvada': 'barbell-row',
  'remada-unilateral': 'single-arm-db-row',
  'remada-baixa': 'seated-cable-row',
  'remada-cavalinho': 't-bar-row',
  'remada-maquina': 'chest-supported-machine-row',
  'remada-invertida': 'inverted-row',
  'pulldown-bracos-estendidos': 'straight-arm-pulldown',
  'pullover-halter': 'db-pullover',
  'hiperextensao-lombar': 'back-extension',
  'supino-reto-barra': 'bench-press',
  'supino-reto-halteres': 'db-bench-press',
  'supino-inclinado-barra': 'incline-bench-press',
  'supino-inclinado-halteres': 'incline-db-press',
  'supino-declinado': 'decline-bench-press-barbell',
  'supino-maquina': 'chest-press-machine',
  'crucifixo-halteres': 'db-fly',
  'crucifixo-maquina': 'machine-chest-fly',
  crossover: 'cable-fly',
  'flexao-bracos': 'push-up',
  'desenvolvimento-halteres-sentado': 'seated-db-press',
  'desenvolvimento-maquina': 'machine-shoulder-press',
  'desenvolvimento-barra': 'ohp',
  'desenvolvimento-arnold': 'arnold-press',
  'elevacao-lateral': 'lateral-raise',
  'elevacao-lateral-polia': 'cable-lateral-raise',
  'elevacao-lateral-maquina': 'plate-loaded-lateral-raise',
  'elevacao-frontal': 'dumbbell-front-raise',
  'remada-alta': 'upright-row',
  'crucifixo-inverso': 'dumbbell-reverse-fly',
  'crucifixo-inverso-maquina': 'machine-reverse-fly',
  'face-pull': 'face-pull',
  'encolhimento-halteres': 'db-shrug',
  'encolhimento-barra': 'shrug',
  'rosca-direta': 'barbell-curl',
  'rosca-barra-w': 'ez-bar-curl',
  'rosca-alternada': 'bicep-curl',
  'rosca-martelo': 'hammer-curl',
  'rosca-scott': 'preacher-curl',
  'rosca-concentrada': 'concentration-curl',
  'rosca-polia': 'cable-curl',
  'rosca-inclinada': 'incline-db-curl',
  'triceps-polia': 'tricep-pushdown',
  'triceps-frances': 'seated-dumbbell-tricep-extension',
  'triceps-testa': 'ez-bar-lying-tricep-extension',
  'triceps-coice': 'tricep-kickback',
  'triceps-maquina': 'machine-triceps-extension',
  'supino-fechado': 'close-grip-bench-press',
  paralelas: 'dips',
  'mergulho-banco': 'bench-dips',
  'agachamento-livre': 'squat',
  'agachamento-smith': 'smith-machine-squat',
  'agachamento-goblet': 'goblet-squat',
  'agachamento-sumo': 'db-sumo-squat',
  'agachamento-bulgaro': 'bulgarian-split-squat',
  afundo: 'db-lunge',
  passada: 'walking-lunge',
  'leg-press-45': 'leg-press',
  'leg-press-horizontal': 'horizontal-leg-press',
  'hack-squat': 'hack-squat',
  'cadeira-extensora': 'leg-extension',
  'mesa-flexora': 'leg-curl',
  'cadeira-flexora': 'seated-leg-curl',
  stiff: 'stiff-leg-deadlift',
  'stiff-halteres': 'dumbbell-romanian-deadlift',
  'levantamento-terra': 'deadlift',
  'elevacao-pelvica': 'hip-thrust',
  'swing-kettlebell': 'kettlebell-swing',
  'cadeira-abdutora': 'hip-abduction',
  'cadeira-adutora': 'hip-adduction',
  'panturrilha-em-pe': 'machine-calf-raise',
  'panturrilha-sentado': 'seated-calf-raise',
  'panturrilha-halter': 'single-leg-calf-raise',
  prancha: 'plank',
  'prancha-lateral': 'side-plank',
  'elevacao-pernas-cadeira': 'captains-chair-knee-raise',
  'elevacao-pernas-solo': 'lying-leg-raise',
  'elevacao-pernas-barra': 'hanging-leg-raise',
  'abdominal-polia': 'cable-crunch',
  'abdominal-supra': 'crunches',
  'abdominal-maquina': 'machine-seated-crunch',
  'abdominal-infra': 'reverse-crunches',
  'abdominal-bicicleta': 'bicycle-crunch',
  'roda-abdominal': 'ab-wheel-rollout',
  'pallof-press': 'cable-pallof-press',
  'dead-bug': 'dead-bug',
};

interface RepdbExercise {
  id: string;
  images?: { flat?: { main?: string; start?: string; peak?: string } };
}

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const token = req.headers.get('x-token') ?? '';
  if (!TOKEN_SHA256 || !token || (await sha256(token)) !== TOKEN_SHA256)
    return new Response('não', { status: 401 });

  const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  // Public bucket, images only: the app reads without a session; only the service key writes.
  const bucket = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 1048576,
      allowed_mime_types: ['image/webp', 'image/png', 'image/gif'],
    }),
  });
  if (!bucket.ok && bucket.status !== 409 && bucket.status !== 400)
    return Response.json(
      { erro: `bucket ${bucket.status} ${await bucket.text()}` },
      { status: 500 },
    );

  const params = new URL(req.url).searchParams;
  const ids = Object.keys(MAPA).sort();
  const inicio = Number(params.get('inicio') ?? 0);
  const fim = Math.min(ids.length, Number(params.get('fim') ?? ids.length));

  const dataset = (await (await fetch(`${BASE}exercises.json`)).json()) as {
    exercises: RepdbExercise[];
  };
  const byId = new Map(dataset.exercises.map((e) => [e.id, e]));

  const entradas: Record<string, { frames?: string[]; url?: string }> = {};
  const falhas: string[] = [];
  for (const id of ids.slice(inicio, fim)) {
    const flat = byId.get(MAPA[id] as string)?.images?.flat;
    const files =
      flat?.start && flat.peak
        ? [
            ['inicio', flat.start],
            ['fim', flat.peak],
          ]
        : flat?.main
          ? [['principal', flat.main]]
          : [];
    if (!files.length) {
      falhas.push(`${id}: sem imagem na fonte`);
      continue;
    }
    const urls: string[] = [];
    try {
      for (const [frame, path] of files) {
        const res = await fetch(`${BASE}${path}`);
        if (!res.ok) throw new Error(`download ${path} ${res.status}`);
        const ext = (path as string).split('.').pop() ?? 'webp';
        const dest = `repdb/${id}/${frame}.${ext}`;
        const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${dest}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': `image/${ext}`, 'x-upsert': 'true' },
          body: await res.arrayBuffer(),
        });
        if (!up.ok) throw new Error(`envio ${dest} ${up.status} ${await up.text()}`);
        urls.push(`${url}/storage/v1/object/public/${BUCKET}/${dest}`);
      }
      entradas[id] = urls.length > 1 ? { frames: urls } : { url: urls[0] };
    } catch (e) {
      falhas.push(`${id}: ${(e as Error).message}`);
    }
  }
  return Response.json({ total: ids.length, inicio, fim, entradas, falhas });
});
