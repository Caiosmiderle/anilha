/**
 * The three kinetic films, scene by scene. Times in seconds, written on a 0.5 s grid;
 * build.mjs then fits each scene to whole beats of the music (90 BPM, 0.667 s). Camera keys are in screenshot pixels
 * (1170 x 2532): `cx, cy` is the point of the screen put at the format's focus, `s` its
 * scale. Read SPEC.md for why each shot is what it is.
 */

// The app's primary button (sampled from the captures): the zoom through it lands here.
const BLUE = '#0071bd';
const BUTTER = '#fde88a';
const SKY = '#bae3fd';
const LIME = '#e8f0a4';
const MINT = '#b5edeb';
const PEACH = '#f8d6b0';
const GROUND = '#fafafa';

/**
 * The bed: "The Mountain - Hip Hop Sport" (Pixabay, chosen by Caio on 04/11/2026), 90 BPM.
 * It starts at its drop, 10.785 s in (a downbeat: the B section opens at 8.125 s, four
 * beats earlier). The file peaks above 0 dBTP at -9.5 LUFS, so it sits well down.
 * build.mjs fits every scene to whole beats of it.
 */
const MUSIC = { file: 'trilha.mp3', bpm: 90, from: 10.785, volume: 0.5, fadeOut: 1.2 };

const wide = {
  w: 1920,
  h: 1080,
  ground: '#e3f2fd',
  focus: [1360, 540],
  // Screen scales are written for a 1170 px wide area; this one is 1120, so 0.94 of them.
  zoom: 0.94,
  panel: 'left: 0; top: 0; width: 800px; height: 100%',
  textBox: 'left: 110px; top: 0; width: 660px; height: 100%',
  lineSize: 84,
  slamSize: 300,
  floodAlign: 'flex-start',
  floodPad: 150,
  hookSize: 128,
  hookPad: '0 150px',
  hookStrike: 14,
  endPad: '0',
  markSize: 190,
  brandLineSize: 72,
  ctaSize: 60,
  ctaPad: '30px 70px',
  noteSize: 38,
};

const tall = {
  w: 1080,
  h: 1920,
  ground: '#e3f2fd',
  focus: [540, 1010],
  zoom: 1,
  panel: 'left: 0; top: 0; width: 100%; height: 640px',
  textBox: 'left: 90px; top: 210px; width: 880px; height: 410px',
  lineSize: 92,
  slamSize: 210,
  floodAlign: 'flex-start',
  floodPad: 90,
  hookSize: 104,
  hookPad: '0 90px',
  hookStrike: 12,
  endPad: '0 80px',
  markSize: 150,
  brandLineSize: 70,
  ctaSize: 60,
  ctaPad: '30px 66px',
  noteSize: 38,
};

// ---- Pieces shared by the films ------------------------------------------------------

const hook = (d, lines) => ({
  kind: 'hook',
  name: 'gancho',
  d,
  ground: GROUND,
  lines,
  strike: lines.length - 1,
  strikeAt: r(d - 0.6),
  sfx: [{ t: r(d - 0.6), file: 'tick' }],
});

const brand = (d, lines, accent) => ({
  kind: 'brand',
  name: 'marca',
  d,
  ground: GROUND,
  lines,
  accent,
  sfx: [{ t: 0.05, file: 'pop' }],
});

const slam = (name, d, phases) => ({
  kind: 'words',
  name,
  d,
  phases,
  sfx: phases.map((p) => ({ t: p.t, file: 'pop' })),
});

const end = (d, note) => ({
  kind: 'end',
  name: 'final',
  d,
  ground: GROUND,
  lines: ['Seu treino, num toque.'],
  accent: 'num toque.',
  cta: 'Comece grátis',
  note,
  sfx: [
    { t: 0.05, file: 'pop' },
    { t: 1.9, file: 'tick' },
  ],
});

function r(n) {
  return Math.round(n * 1000) / 1000;
}

// Screen regions (screenshot px), measured on the captures of 04/11/2026.
const HOJE_CARD = { cx: 585, cy: 760, s: 1.0 };
const HOJE_BUTTON = { cx: 585, cy: 1208, s: 1.7 };
const INTO_BUTTON = { cx: 200, cy: 1190, s: 9 }; // the button's blue, left of its label
const SERIES_ROWS = { cx: 585, cy: 1500, s: 1.0 };
const EDITOR = { cx: 585, cy: 2150, s: 1.0 };
const DONE_BUTTON = [48, 2330, 1122, 2497];
const REST_AND_EFFORT = { cx: 585, cy: 1560, s: 1.0 };
const REST_NUMBER = { cx: 380, cy: 1710, s: 1.5 };
const SUGGESTION = { cx: 585, cy: 890, s: 1.05 };
const SUGGESTION_LINE = { cx: 519, cy: 760, s: 1.6 };
const CHART = { cx: 585, cy: 1430, s: 1.0 };
const PLAN_TOP = { cx: 585, cy: 700, s: 1.0 };
const PLAN_STRIP = { cx: 585, cy: 1000, s: 1.12 };
const RANKING = { cx: 585, cy: 1225, s: 1.0 };
const RANKING_YOU = { cx: 585, cy: 1560, s: 1.12 };

// ---- Desktop ad: 1920 x 1080, 32 s ----------------------------------------------------

const desktop = {
  title: 'anúncio no computador',
  music: MUSIC,
  format: wide,
  scenes: [
    hook(2.0, ['Ainda anota o treino', 'no bloco de notas?']),
    brand(2.0, ['Monta sua semana.', 'Anota cada série.'], 'Anota cada série.'),
    {
      kind: 'screen',
      name: 'hoje',
      d: 3.5,
      enter: 'whip',
      images: ['hoje'],
      cam: [
        { t: 0, cx: 585, cy: 1266, s: 0.4 },
        { t: 0.45, ...HOJE_CARD, d: 0.5 },
        { t: 2.3, ...HOJE_BUTTON, d: 0.4 },
        { t: 3.0, ...INTO_BUTTON, d: 0.5, ease: 'power3.in', through: true },
      ],
      text: [{ t: 0.6, lines: ['Abre e já sabe', 'o que treinar.'], accent: 'o que treinar.' }],
    },
    slam('toque', 1.0, [{ t: 0, bg: BLUE, color: '#fff', lines: ['Um toque.'] }]),
    {
      kind: 'screen',
      name: 'treino',
      d: 5.0,
      enter: 'settle',
      images: ['treino-serie', 'treino-esforco', 'treino-descanso'],
      cam: [
        { t: 0, ...SERIES_ROWS },
        { t: 1.7, ...EDITOR, d: 0.45 },
        { t: 2.6, ...REST_AND_EFFORT, d: 0.4 },
        { t: 3.7, ...REST_NUMBER, cut: true },
      ],
      presses: [{ t: 2.4, box: DONE_BUTTON }],
      swaps: [
        { t: 2.62, i: 1 },
        { t: 3.7, i: 2 },
      ],
      text: [
        { t: 0.3, out: 2.45, lines: ['Carga e repetições', 'já preenchidas.'], accent: 'já preenchidas.' },
        { t: 2.7, lines: ['Um toque e o', 'descanso conta', 'sozinho.'], accent: 'sozinho.', style: 'line' },
      ],
      sfx: [{ t: 2.4, file: 'tick' }],
    },
    slam('meta', 1.0, [{ t: 0, bg: BUTTER, lines: ['Bateu', 'a meta?'] }]),
    {
      kind: 'screen',
      name: 'sugestao',
      d: 3.0,
      enter: 'rise',
      images: ['treino-serie'],
      cam: [
        { t: 0, ...SUGGESTION },
        { t: 1.6, ...SUGGESTION_LINE, d: 0.4 },
      ],
      text: [
        { t: 0.35, out: 1.55, lines: ['Ele sobe', 'a carga.'], accent: 'sobe' },
        { t: 1.75, lines: ['Na hora certa,', 'com o motivo.'], style: 'ink' },
      ],
    },
    {
      kind: 'screen',
      name: 'progresso',
      d: 2.5,
      enter: 'whip',
      images: ['progresso'],
      cam: [{ t: 0, ...CHART }],
      text: [{ t: 0.3, lines: ['Cada exercício,', 'a evolução.'], accent: 'a evolução.' }],
    },
    slam('semana', 1.0, [{ t: 0, bg: LIME, lines: ['Sua', 'semana.'] }]),
    {
      kind: 'screen',
      name: 'plano',
      d: 3.0,
      enter: 'settle',
      images: ['plano'],
      cam: [
        { t: 0, ...PLAN_TOP },
        { t: 1.2, ...PLAN_STRIP, d: 0.45 },
      ],
      text: [
        { t: 0.3, out: 1.3, lines: ['Fichas', 'em rodízio.'], accent: 'rodízio.' },
        { t: 1.5, lines: ['Corrida', 'no seu dia.'], accent: 'Corrida', style: 'line' },
      ],
    },
    {
      kind: 'screen',
      name: 'grupo',
      d: 3.5,
      enter: 'whip',
      images: ['grupo'],
      cam: [
        { t: 0, ...RANKING },
        { t: 1.6, ...RANKING_YOU, d: 0.45 },
      ],
      text: [
        { t: 0.3, out: 1.6, lines: ['Treine com', 'os amigos.'] },
        { t: 1.8, lines: ['Vale o plano', 'de cada um.'], accent: 'plano', style: 'ink' },
      ],
    },
    slam('gratis', 1.5, [
      { t: 0, bg: MINT, lines: ['Grátis.'] },
      { t: 0.75, bg: SKY, lines: ['Funciona', 'sem sinal.'] },
    ]),
    end(3.5),
  ],
};

// ---- Mobile ad: 1080 x 1920, 21 s -----------------------------------------------------

const m = (k, s) => ({ ...k, s });

const mobile = {
  title: 'anúncio no celular',
  music: MUSIC,
  format: tall,
  scenes: [
    hook(1.5, ['Ainda anota', 'o treino no', 'bloco de notas?']),
    brand(1.5, ['Cada série,', 'num toque.'], 'num toque.'),
    {
      kind: 'screen',
      name: 'treino',
      d: 4.0,
      enter: 'rise',
      images: ['treino-serie', 'treino-esforco', 'treino-descanso'],
      cam: [
        { t: 0, ...m(SERIES_ROWS, 0.92), cy: 1560 },
        { t: 1.3, ...m(EDITOR, 0.92), d: 0.4 },
        { t: 2.1, ...m(REST_AND_EFFORT, 0.92), cy: 1500, d: 0.4 },
        { t: 3.0, cx: 420, cy: 1710, s: 1.5, cut: true },
      ],
      presses: [{ t: 1.9, box: DONE_BUTTON }],
      swaps: [
        { t: 2.12, i: 1 },
        { t: 3.0, i: 2 },
      ],
      text: [
        { t: 0.25, out: 1.95, lines: ['Carga e reps', 'já preenchidas.'], accent: 'já preenchidas.' },
        { t: 2.15, lines: ['Um toque e', 'o descanso conta.'], accent: 'conta.', style: 'line' },
      ],
      sfx: [{ t: 1.9, file: 'tick' }],
    },
    slam('meta', 1.0, [{ t: 0, bg: BUTTER, lines: ['Bateu', 'a meta?'] }]),
    {
      kind: 'screen',
      name: 'sugestao',
      d: 2.5,
      enter: 'settle',
      images: ['treino-serie'],
      cam: [
        { t: 0, ...m(SUGGESTION, 1.0) },
        { t: 1.3, ...SUGGESTION_LINE, s: 1.45, d: 0.4 },
      ],
      text: [{ t: 0.3, lines: ['Ele sobe', 'a carga.'], accent: 'sobe' }],
    },
    slam('semana', 1.0, [{ t: 0, bg: LIME, lines: ['Sua', 'semana.'] }]),
    {
      kind: 'screen',
      name: 'plano',
      d: 2.5,
      enter: 'whip',
      images: ['plano'],
      cam: [
        { t: 0, ...m(PLAN_TOP, 0.95), cy: 800 },
        { t: 1.1, ...m(PLAN_STRIP, 1.05), d: 0.4 },
      ],
      text: [{ t: 0.3, lines: ['Fichas em rodízio.', 'Corrida no seu dia.'], accent: 'Corrida' }],
    },
    {
      kind: 'screen',
      name: 'grupo',
      d: 2.5,
      enter: 'rise',
      images: ['grupo'],
      cam: [
        { t: 0, ...m(RANKING, 0.95) },
        { t: 1.2, ...m(RANKING_YOU, 1.05), d: 0.4 },
      ],
      text: [{ t: 0.3, lines: ['Com os amigos.', 'Vale o plano', 'de cada um.'], accent: 'plano', style: 'ink' }],
    },
    slam('gratis', 1.5, [
      { t: 0, bg: MINT, lines: ['Grátis.'] },
      { t: 0.75, bg: SKY, lines: ['Funciona', 'sem sinal.'] },
    ]),
    end(3.5),
  ],
};

// ---- Landing: 1920 x 1080, 60 s, plays muted in a loop --------------------------------

const landing = {
  title: 'vídeo da landing',
  music: MUSIC,
  format: wide,
  scenes: [
    hook(2.5, ['Ainda anota o treino', 'no bloco de notas?']),
    brand(2.5, ['Monta sua semana.', 'Anota cada série.'], 'Anota cada série.'),
    slam('monta', 1.0, [{ t: 0, bg: BUTTER, lines: ['Seu', 'plano.'] }]),
    {
      kind: 'screen',
      name: 'dias',
      d: 3.0,
      enter: 'whip',
      images: ['comecar-2'],
      cam: [
        { t: 0, cx: 585, cy: 1266, s: 0.4 },
        { t: 0.4, cx: 585, cy: 800, s: 1.0, d: 0.5 },
      ],
      text: [{ t: 0.55, lines: ['Diga seus dias', 'de academia', 'e de corrida.'], accent: 'corrida.' }],
    },
    {
      kind: 'screen',
      name: 'montado',
      d: 3.0,
      enter: 'settle',
      images: ['comecar-plano'],
      cam: [
        { t: 0, cx: 585, cy: 760, s: 1.0 },
        { t: 1.6, cx: 585, cy: 1500, s: 1.0, d: 0.5 },
      ],
      text: [{ t: 0.3, lines: ['Ele monta', 'as fichas', 'da semana.'], accent: 'fichas', style: 'ink' }],
    },
    {
      kind: 'screen',
      name: 'hoje',
      d: 3.5,
      enter: 'whip',
      images: ['hoje'],
      cam: [
        { t: 0, ...HOJE_CARD },
        { t: 2.3, ...HOJE_BUTTON, d: 0.4 },
        { t: 3.0, ...INTO_BUTTON, d: 0.5, ease: 'power3.in', through: true },
      ],
      text: [{ t: 0.3, lines: ['Abre e já sabe', 'o que treinar.'], accent: 'o que treinar.' }],
    },
    slam('toque', 1.0, [{ t: 0, bg: BLUE, color: '#fff', lines: ['Um toque.'] }]),
    {
      kind: 'screen',
      name: 'aquecimento',
      d: 3.0,
      enter: 'settle',
      images: ['treino-aquecimento'],
      cam: [
        { t: 0, cx: 585, cy: 1000, s: 1.0 },
        { t: 1.4, cx: 585, cy: 790, s: 1.15, d: 0.4 },
      ],
      text: [{ t: 0.3, lines: ['Aquecimento', 'já calculado.'], accent: 'já calculado.' }],
    },
    {
      kind: 'screen',
      name: 'serie',
      d: 4.0,
      enter: 'cut',
      images: ['treino-serie', 'treino-esforco'],
      cam: [
        { t: 0, ...SERIES_ROWS },
        { t: 1.6, ...EDITOR, d: 0.45 },
        { t: 2.7, cx: 585, cy: 1720, s: 1.1, d: 0.4 },
      ],
      presses: [{ t: 2.4, box: DONE_BUTTON }],
      swaps: [{ t: 2.62, i: 1 }],
      text: [
        { t: 0.3, out: 2.45, lines: ['Carga e repetições', 'já preenchidas.'], accent: 'já preenchidas.' },
        { t: 2.8, lines: ['Como foi?', 'Um toque.'], accent: 'Um toque.', style: 'line' },
      ],
      sfx: [{ t: 2.4, file: 'tick' }],
    },
    {
      kind: 'screen',
      name: 'descanso',
      d: 2.5,
      enter: 'cut',
      images: ['treino-descanso'],
      cam: [
        { t: 0, ...REST_NUMBER, s: 1.7 },
        { t: 1.0, cx: 585, cy: 1708, s: 1.0, d: 0.5 },
      ],
      text: [{ t: 0.2, lines: ['O descanso', 'conta sozinho.'], accent: 'sozinho.' }],
    },
    slam('meta', 1.0, [{ t: 0, bg: BUTTER, lines: ['Bateu', 'a meta?'] }]),
    {
      kind: 'screen',
      name: 'sugestao',
      d: 3.0,
      enter: 'rise',
      images: ['treino-serie'],
      cam: [
        { t: 0, ...SUGGESTION },
        { t: 1.6, ...SUGGESTION_LINE, d: 0.4 },
      ],
      text: [
        { t: 0.35, out: 1.55, lines: ['Ele sobe', 'a carga.'], accent: 'sobe' },
        { t: 1.75, lines: ['Na hora certa,', 'com o motivo.'], style: 'ink' },
      ],
    },
    {
      kind: 'screen',
      name: 'progresso',
      d: 3.0,
      enter: 'whip',
      images: ['progresso'],
      cam: [
        { t: 0, ...CHART },
        { t: 1.5, cx: 585, cy: 1740, s: 1.1, d: 0.45 },
      ],
      text: [
        { t: 0.3, out: 1.5, lines: ['Cada exercício,', 'a evolução.'], accent: 'a evolução.' },
        { t: 1.7, lines: ['Recordes e', 'carga máxima.'], style: 'line' },
      ],
    },
    {
      kind: 'screen',
      name: 'calendario',
      d: 3.0,
      enter: 'settle',
      images: ['historico'],
      cam: [{ t: 0, cx: 585, cy: 1100, s: 1.0 }],
      text: [{ t: 0.3, lines: ['O mês inteiro', 'num olhar.'], accent: 'num olhar.' }],
    },
    {
      kind: 'screen',
      name: 'cardio',
      d: 3.0,
      enter: 'whip',
      images: ['cardio'],
      cam: [
        { t: 0, cx: 585, cy: 1000, s: 1.0 },
        { t: 1.5, cx: 585, cy: 700, s: 1.2, d: 0.45 },
      ],
      text: [
        { t: 0.3, out: 1.5, lines: ['Corrida, bike,', 'natação.'], accent: 'Corrida,' },
        { t: 1.7, lines: ['Ou importa', 'do relógio.'], accent: 'relógio.', style: 'ink' },
      ],
    },
    slam('junto', 1.0, [{ t: 0, bg: PEACH, lines: ['Junto.'] }]),
    {
      kind: 'screen',
      name: 'grupo',
      d: 3.5,
      enter: 'rise',
      images: ['grupo'],
      cam: [
        { t: 0, ...RANKING },
        { t: 1.6, ...RANKING_YOU, d: 0.45 },
      ],
      text: [
        { t: 0.3, out: 1.6, lines: ['Ranking pelo', 'plano de cada um.'], accent: 'plano' },
        { t: 1.8, lines: ['Treinar a mais', 'não sobe.'], style: 'ink' },
      ],
    },
    {
      kind: 'screen',
      name: 'ficha',
      d: 3.0,
      enter: 'whip',
      images: ['enviar-ficha'],
      cam: [{ t: 0, cx: 585, cy: 1950, s: 1.0 }],
      text: [{ t: 0.3, lines: ['Mande sua ficha', 'para um amigo.'], accent: 'amigo.' }],
    },
    {
      kind: 'screen',
      name: 'cartao',
      d: 3.0,
      enter: 'settle',
      images: ['cartao-treino'],
      cam: [
        { t: 0, cx: 585, cy: 1300, s: 0.62 },
        { t: 1.4, cx: 585, cy: 1180, s: 0.95, d: 0.5 },
      ],
      text: [{ t: 0.3, lines: ['O treino vira', 'um cartão', 'para postar.'], accent: 'cartão' }],
    },
    slam('gratis', 2.0, [
      { t: 0, bg: MINT, lines: ['Grátis.'] },
      { t: 0.5, bg: SKY, lines: ['Sem anúncio.'] },
      { t: 1.0, bg: LIME, lines: ['Funciona', 'sem sinal.'] },
    ]),
    end(4.0, 'Instala pelo navegador, sem loja.'),
  ],
};

export const films = { desktop, mobile, landing };
