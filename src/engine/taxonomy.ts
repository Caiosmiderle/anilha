import type {
  Equipment,
  Joint,
  Muscle,
  MuscleGroup,
  Pattern,
  RunType,
  SplitKey,
  VolumeGroup,
} from './types';

/** Pastel token per content type. One fixed pastel each, everywhere in the app. */
export type Pastel = 'sky' | 'peach' | 'lime' | 'lavender' | 'pink' | 'mint' | 'butter' | 'neutral';

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  costas: 'Costas',
  peito: 'Peito',
  pernas: 'Pernas',
  ombros: 'Ombros',
  bracos: 'Braços',
  core: 'Abdômen',
};

export const GROUP_PASTEL: Record<MuscleGroup, Pastel> = {
  costas: 'sky',
  peito: 'peach',
  pernas: 'lime',
  ombros: 'lavender',
  bracos: 'pink',
  core: 'neutral',
};

export const RUN_PASTEL: Pastel = 'mint';
export const PLAN_PASTEL: Pastel = 'butter';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  costas: 'costas',
  lombar: 'lombar',
  trapezio: 'trapézio',
  peito: 'peito',
  ombro_anterior: 'ombro anterior',
  ombro_lateral: 'ombro lateral',
  ombro_posterior: 'ombro posterior',
  biceps: 'bíceps',
  triceps: 'tríceps',
  antebraco: 'antebraço',
  quadriceps: 'quadríceps',
  posterior_coxa: 'posterior de coxa',
  gluteos: 'glúteos',
  adutores: 'adutores',
  panturrilha: 'panturrilha',
  abdomen: 'abdômen',
};

export const MUSCLE_VOLUME_GROUP: Record<Muscle, VolumeGroup> = {
  costas: 'costas',
  lombar: 'costas',
  trapezio: 'ombros',
  peito: 'peito',
  ombro_anterior: 'ombros',
  ombro_lateral: 'ombros',
  ombro_posterior: 'ombros',
  biceps: 'biceps',
  triceps: 'triceps',
  antebraco: 'biceps',
  quadriceps: 'quadriceps',
  posterior_coxa: 'posteriores',
  gluteos: 'posteriores',
  adutores: 'quadriceps',
  panturrilha: 'panturrilha',
  abdomen: 'core',
};

export const VOLUME_GROUP_LABEL: Record<VolumeGroup, string> = {
  costas: 'Costas',
  peito: 'Peito',
  ombros: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  quadriceps: 'Quadríceps',
  posteriores: 'Posteriores',
  panturrilha: 'Panturrilha',
  core: 'Abdômen',
};

export const VOLUME_GROUP_PARENT: Record<VolumeGroup, MuscleGroup> = {
  costas: 'costas',
  peito: 'peito',
  ombros: 'ombros',
  biceps: 'bracos',
  triceps: 'bracos',
  quadriceps: 'pernas',
  posteriores: 'pernas',
  panturrilha: 'pernas',
  core: 'core',
};

export const VOLUME_GROUPS = Object.keys(VOLUME_GROUP_LABEL) as VolumeGroup[];

export const JOINT_LABEL: Record<Joint, string> = {
  ombro: 'ombro',
  cotovelo: 'cotovelo',
  joelho: 'joelho',
  lombar: 'lombar',
  punho: 'punho',
};

/** Movement pattern of an exercise the person creates, by its main group. */
export const DEFAULT_PATTERN: Record<MuscleGroup, Pattern> = {
  costas: 'puxar_horizontal',
  peito: 'empurrar_horizontal',
  pernas: 'agachamento',
  ombros: 'elevacao_lateral',
  bracos: 'rosca',
  core: 'core_flexao',
};

export const JOINTS: Joint[] = ['ombro', 'cotovelo', 'joelho', 'lombar', 'punho'];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  halteres: 'Halteres',
  barra: 'Barra e anilhas',
  polia: 'Polias',
  maquina: 'Máquinas',
  peso_corporal: 'Peso corporal',
  kettlebell: 'Kettlebell',
  barra_fixa: 'Barra fixa',
};

export const ALL_EQUIPMENT: Equipment[] = [
  'halteres',
  'barra',
  'polia',
  'maquina',
  'peso_corporal',
  'kettlebell',
  'barra_fixa',
];

/** Adjective that agrees with "corrida". */
export const RUN_TYPE_LABEL: Record<RunType, string> = {
  leve: 'leve',
  longo: 'longa',
  intervalado: 'de qualidade',
};

export interface SplitInfo {
  key: SplitKey;
  label: string;
  groups: MuscleGroup[];
  /** Main muscles, used to spot overlap between consecutive days. */
  muscles: Muscle[];
  pastel: Pastel;
}

export const SPLITS: Record<SplitKey, SplitInfo> = {
  costas_biceps: {
    key: 'costas_biceps',
    label: 'Costas e bíceps',
    groups: ['costas', 'bracos'],
    muscles: ['costas', 'biceps', 'ombro_posterior'],
    pastel: 'sky',
  },
  peito_triceps: {
    key: 'peito_triceps',
    label: 'Peito e tríceps',
    groups: ['peito', 'bracos'],
    muscles: ['peito', 'triceps', 'ombro_anterior'],
    pastel: 'peach',
  },
  perna: {
    key: 'perna',
    label: 'Perna',
    groups: ['pernas'],
    muscles: ['quadriceps', 'posterior_coxa', 'gluteos', 'panturrilha'],
    pastel: 'lime',
  },
  ombro_abdomen: {
    key: 'ombro_abdomen',
    label: 'Ombro e abdômen',
    groups: ['ombros', 'core'],
    muscles: ['ombro_lateral', 'ombro_anterior', 'ombro_posterior', 'trapezio', 'abdomen'],
    pastel: 'lavender',
  },
  corpo_inteiro_a: {
    key: 'corpo_inteiro_a',
    label: 'Corpo inteiro A',
    groups: ['pernas', 'peito', 'costas', 'ombros'],
    muscles: ['quadriceps', 'peito', 'costas', 'ombro_anterior'],
    pastel: 'neutral',
  },
  corpo_inteiro_b: {
    key: 'corpo_inteiro_b',
    label: 'Corpo inteiro B',
    groups: ['pernas', 'costas', 'peito', 'ombros'],
    muscles: ['posterior_coxa', 'gluteos', 'costas', 'peito', 'ombro_lateral'],
    pastel: 'neutral',
  },
  superior_a: {
    key: 'superior_a',
    label: 'Superior A',
    groups: ['peito', 'costas', 'ombros', 'bracos'],
    muscles: ['peito', 'costas', 'ombro_anterior', 'triceps', 'biceps'],
    pastel: 'sky',
  },
  superior_b: {
    key: 'superior_b',
    label: 'Superior B',
    groups: ['costas', 'peito', 'ombros', 'bracos'],
    muscles: ['costas', 'peito', 'ombro_lateral', 'biceps', 'triceps'],
    pastel: 'sky',
  },
  anterior: {
    key: 'anterior',
    label: 'Anterior de coxa',
    groups: ['pernas'],
    muscles: ['quadriceps', 'adutores', 'panturrilha'],
    pastel: 'lime',
  },
  posterior: {
    key: 'posterior',
    label: 'Posterior de coxa',
    groups: ['pernas'],
    muscles: ['posterior_coxa', 'gluteos', 'panturrilha'],
    pastel: 'lime',
  },
  gluteos: {
    key: 'gluteos',
    label: 'Glúteos',
    groups: ['pernas'],
    muscles: ['gluteos', 'posterior_coxa'],
    pastel: 'lime',
  },
  posterior_gluteos: {
    key: 'posterior_gluteos',
    label: 'Posterior e glúteos',
    groups: ['pernas'],
    muscles: ['posterior_coxa', 'gluteos', 'panturrilha'],
    pastel: 'lime',
  },
  superiores: {
    key: 'superiores',
    label: 'Parte de cima',
    groups: ['peito', 'costas', 'ombros', 'bracos'],
    muscles: ['peito', 'costas', 'ombro_anterior', 'triceps', 'biceps'],
    pastel: 'sky',
  },
  superiores_b: {
    key: 'superiores_b',
    label: 'Parte de cima B',
    groups: ['costas', 'peito', 'ombros', 'bracos'],
    muscles: ['costas', 'peito', 'ombro_lateral', 'biceps', 'triceps'],
    pastel: 'sky',
  },
  inferior_a: {
    key: 'inferior_a',
    label: 'Inferior A',
    groups: ['pernas', 'core'],
    muscles: ['quadriceps', 'gluteos', 'panturrilha', 'abdomen'],
    pastel: 'lime',
  },
  inferior_b: {
    key: 'inferior_b',
    label: 'Inferior B',
    groups: ['pernas', 'core'],
    muscles: ['posterior_coxa', 'gluteos', 'quadriceps', 'abdomen'],
    pastel: 'lime',
  },
  empurrar: {
    key: 'empurrar',
    label: 'Empurrar',
    groups: ['peito', 'ombros', 'bracos'],
    muscles: ['peito', 'ombro_anterior', 'ombro_lateral', 'triceps'],
    pastel: 'peach',
  },
  puxar: {
    key: 'puxar',
    label: 'Puxar',
    groups: ['costas', 'bracos'],
    muscles: ['costas', 'biceps', 'ombro_posterior', 'trapezio'],
    pastel: 'sky',
  },
  peito: {
    key: 'peito',
    label: 'Peito',
    groups: ['peito'],
    muscles: ['peito', 'ombro_anterior'],
    pastel: 'peach',
  },
  costas: {
    key: 'costas',
    label: 'Costas',
    groups: ['costas'],
    muscles: ['costas', 'ombro_posterior', 'trapezio'],
    pastel: 'sky',
  },
  bracos: {
    key: 'bracos',
    label: 'Braços',
    groups: ['bracos'],
    muscles: ['biceps', 'triceps', 'antebraco'],
    pastel: 'pink',
  },
  livre: {
    key: 'livre',
    label: 'Treino livre',
    groups: [],
    muscles: [],
    pastel: 'neutral',
  },
};

export function splitLabel(key: SplitKey | null | undefined): string {
  return key ? SPLITS[key].label : 'Treino livre';
}

export function splitHasLegs(key: SplitKey | null | undefined): boolean {
  return key ? SPLITS[key].groups.includes('pernas') : false;
}

/** Quick effort labels shown in the UI. The data stores RIR. */
export const EFFORT_OPTIONS = [
  { rir: 3, label: 'Fácil' },
  { rir: 2, label: 'Ok' },
  { rir: 1, label: 'Pesado' },
  { rir: 0, label: 'No limite' },
] as const;

export function effortLabel(rir: number | null | undefined): string | null {
  if (rir == null) return null;
  if (rir >= 3) return 'Fácil';
  if (rir === 2) return 'Ok';
  if (rir === 1) return 'Pesado';
  return 'No limite';
}

export const FICHA_LETTERS = 'ABCDE';

/** "A", "B"... for a split in a rotation, or null when it is not part of it. */
export function fichaLetter(
  rotation: SplitKey[] | null | undefined,
  split: SplitKey | null | undefined,
): string | null {
  if (!rotation?.length || !split) return null;
  const i = rotation.indexOf(split);
  return i >= 0 ? (FICHA_LETTERS[i] ?? null) : null;
}

/** "Ficha B: Costas e bíceps" in a rotation, the plain label otherwise. */
export function fichaName(
  rotation: SplitKey[] | null | undefined,
  split: SplitKey | null | undefined,
): string {
  const letter = fichaLetter(rotation, split);
  return letter ? `Ficha ${letter}: ${splitLabel(split)}` : splitLabel(split);
}
