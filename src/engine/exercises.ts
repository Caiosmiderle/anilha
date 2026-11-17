import type {
  Equipment,
  ExerciseDef,
  Joint,
  Level,
  Measure,
  Muscle,
  MuscleGroup,
  Pattern,
} from './types';

interface Opts {
  muscles: Muscle[];
  sec?: Muscle[];
  secGroups?: MuscleGroup[];
  eq: Equipment;
  pattern: Pattern;
  joints?: Joint[];
  compound?: boolean;
  measure?: Measure;
  inc?: number;
  bw?: boolean;
  hint?: string;
}

const DEFAULT_INC: Record<Equipment, number> = {
  halteres: 2,
  barra: 2,
  polia: 2.5,
  maquina: 2.5,
  peso_corporal: 2.5,
  kettlebell: 4,
  barra_fixa: 2.5,
};

function ex(id: string, name: string, group: MuscleGroup, o: Opts): ExerciseDef {
  return {
    id,
    name,
    primary_group: group,
    secondary_groups: o.secGroups ?? [],
    muscles: o.muscles,
    secondary_muscles: o.sec ?? [],
    equipment: o.eq,
    measure: o.measure ?? 'weight_reps',
    increment_kg: o.inc ?? DEFAULT_INC[o.eq],
    joints: o.joints ?? [],
    compound: o.compound ?? false,
    bodyweight: o.bw ?? false,
    pattern: o.pattern,
    progression_hint: o.hint ?? null,
    // No default: a test fails if an exercise is missing from the table below.
    level: LEVEL[id],
  };
}

/**
 * Difficulty of each exercise: how much technique and base strength it asks before it is
 * safe to push. Iniciante: machines, cables, simple dumbbell and body weight moves.
 * Intermediário: free barbell lifts and moves that need balance or a long range.
 * Avançado: moves many people cannot do yet (pull-up, dips) or that load the spine heavy.
 */
const LEVEL: Record<string, Level> = {
  // Costas
  'puxada-frente': 'iniciante',
  'puxada-supinada': 'iniciante',
  'puxada-triangulo': 'iniciante',
  'barra-fixa': 'avancado',
  'remada-curvada': 'intermediario',
  'remada-unilateral': 'iniciante',
  'remada-baixa': 'iniciante',
  'remada-cavalinho': 'intermediario',
  'remada-maquina': 'iniciante',
  'remada-invertida': 'intermediario',
  'pulldown-bracos-estendidos': 'iniciante',
  'pullover-halter': 'intermediario',
  'hiperextensao-lombar': 'iniciante',
  // Peito
  'supino-reto-barra': 'intermediario',
  'supino-reto-halteres': 'iniciante',
  'supino-inclinado-barra': 'intermediario',
  'supino-inclinado-halteres': 'iniciante',
  'supino-declinado': 'intermediario',
  'supino-maquina': 'iniciante',
  'supino-inclinado-maquina': 'iniciante',
  'crucifixo-halteres': 'iniciante',
  'crucifixo-maquina': 'iniciante',
  crossover: 'iniciante',
  'flexao-bracos': 'iniciante',
  // Ombros
  'desenvolvimento-halteres-sentado': 'iniciante',
  'desenvolvimento-maquina': 'iniciante',
  'desenvolvimento-barra': 'intermediario',
  'desenvolvimento-arnold': 'intermediario',
  'elevacao-lateral': 'iniciante',
  'elevacao-lateral-polia': 'iniciante',
  'elevacao-lateral-maquina': 'iniciante',
  'elevacao-frontal': 'iniciante',
  'remada-alta': 'intermediario',
  'crucifixo-inverso': 'iniciante',
  'crucifixo-inverso-maquina': 'iniciante',
  'face-pull': 'iniciante',
  'encolhimento-halteres': 'iniciante',
  'encolhimento-barra': 'iniciante',
  // Braços
  'rosca-direta': 'iniciante',
  'rosca-barra-w': 'iniciante',
  'rosca-alternada': 'iniciante',
  'rosca-martelo': 'iniciante',
  'rosca-scott': 'iniciante',
  'rosca-concentrada': 'iniciante',
  'rosca-polia': 'iniciante',
  'rosca-inclinada': 'intermediario',
  'triceps-polia': 'iniciante',
  'triceps-corda': 'iniciante',
  'triceps-frances': 'intermediario',
  'triceps-testa': 'intermediario',
  'triceps-coice': 'iniciante',
  'triceps-maquina': 'iniciante',
  'supino-fechado': 'intermediario',
  paralelas: 'avancado',
  'mergulho-banco': 'iniciante',
  // Pernas
  'agachamento-livre': 'intermediario',
  'agachamento-smith': 'iniciante',
  'agachamento-goblet': 'iniciante',
  'agachamento-sumo': 'iniciante',
  'agachamento-bulgaro': 'intermediario',
  afundo: 'intermediario',
  passada: 'intermediario',
  'leg-press-45': 'iniciante',
  'leg-press-horizontal': 'iniciante',
  'hack-squat': 'iniciante',
  'cadeira-extensora': 'iniciante',
  'mesa-flexora': 'iniciante',
  'cadeira-flexora': 'iniciante',
  stiff: 'intermediario',
  'stiff-halteres': 'intermediario',
  'levantamento-terra': 'avancado',
  'elevacao-pelvica': 'iniciante',
  'swing-kettlebell': 'intermediario',
  'cadeira-abdutora': 'iniciante',
  'cadeira-adutora': 'iniciante',
  'panturrilha-em-pe': 'iniciante',
  'panturrilha-sentado': 'iniciante',
  'panturrilha-leg-press': 'iniciante',
  'panturrilha-halter': 'iniciante',
  // Core
  prancha: 'iniciante',
  'prancha-lateral': 'iniciante',
  'elevacao-pernas-cadeira': 'iniciante',
  'elevacao-pernas-solo': 'iniciante',
  'elevacao-pernas-barra': 'avancado',
  'abdominal-polia': 'iniciante',
  'abdominal-supra': 'iniciante',
  'abdominal-maquina': 'iniciante',
  'abdominal-infra': 'iniciante',
  'abdominal-bicicleta': 'iniciante',
  'roda-abdominal': 'avancado',
  'pallof-press': 'iniciante',
  'dead-bug': 'iniciante',
  // Novos de 17/11/2026
  'remada-pendlay': 'intermediario',
  'remada-curvada-halteres': 'intermediario',
  'remada-apoiada-halteres': 'iniciante',
  'remada-curvada-supinada': 'intermediario',
  'remada-smith': 'iniciante',
  'puxada-unilateral': 'iniciante',
  'remada-baixa-aberta': 'iniciante',
  'remada-unilateral-polia': 'iniciante',
  'barra-fixa-supinada': 'avancado',
  'barra-fixa-neutra': 'avancado',
  'extensao-lombar-maquina': 'iniciante',
  'crucifixo-inclinado': 'iniciante',
  'supino-declinado-halteres': 'iniciante',
  'supino-smith': 'iniciante',
  'supino-inclinado-smith': 'iniciante',
  'supino-polia': 'iniciante',
  'flexao-inclinada': 'iniciante',
  'flexao-joelhos': 'iniciante',
  'flexao-declinada': 'intermediario',
  'supino-chao-halteres': 'iniciante',
  'desenvolvimento-halteres-em-pe': 'intermediario',
  'desenvolvimento-smith': 'iniciante',
  'elevacao-lateral-sentado': 'iniciante',
  'elevacao-frontal-polia': 'iniciante',
  'elevacao-frontal-barra': 'iniciante',
  'remada-alta-polia': 'iniciante',
  'remada-alta-halteres': 'iniciante',
  'crucifixo-inverso-polia': 'iniciante',
  'encolhimento-smith': 'iniciante',
  'rosca-scott-halter': 'iniciante',
  'rosca-maquina': 'iniciante',
  'rosca-martelo-polia': 'iniciante',
  'rosca-inversa': 'iniciante',
  'rosca-spider': 'intermediario',
  'rosca-sentado': 'iniciante',
  'rosca-punho': 'iniciante',
  'triceps-acima-polia': 'iniciante',
  'triceps-unilateral-polia': 'iniciante',
  'triceps-testa-halteres': 'iniciante',
  'triceps-barra-v': 'iniciante',
  'triceps-coice-polia': 'iniciante',
  'triceps-frances-barra': 'intermediario',
  'mergulho-maquina': 'iniciante',
  'flexao-diamante': 'intermediario',
  'agachamento-frontal': 'avancado',
  'agachamento-halteres': 'iniciante',
  'agachamento-bulgaro-smith': 'intermediario',
  'afundo-smith': 'iniciante',
  'afundo-reverso': 'intermediario',
  'afundo-barra': 'intermediario',
  'subida-banco': 'iniciante',
  'terra-romeno': 'intermediario',
  'terra-sumo': 'avancado',
  'terra-hexagonal': 'intermediario',
  'elevacao-pelvica-maquina': 'iniciante',
  'elevacao-pelvica-smith': 'iniciante',
  'ponte-gluteos': 'iniciante',
  'elevacao-pelvica-unilateral': 'intermediario',
  'coice-polia': 'iniciante',
  'extensora-unilateral': 'iniciante',
  'flexora-unilateral': 'iniciante',
  'leg-press-unilateral': 'iniciante',
  'stiff-unilateral': 'intermediario',
  'panturrilha-smith': 'iniciante',
  'panturrilha-burrinho': 'iniciante',
  'good-morning': 'intermediario',
  'abdominal-declinado': 'iniciante',
  'abdominal-canivete': 'intermediario',
  'elevacao-joelhos-barra': 'intermediario',
  'rotacao-russa': 'iniciante',
  'canoa': 'intermediario',
  'flexao-lateral-halter': 'iniciante',
  'abdominal-completo': 'iniciante',
};

/** Built-in library (pt-BR). Ids are stable: never rename them. */
export const EXERCISES: ExerciseDef[] = [
  // Costas
  ex('puxada-frente', 'Puxada frente na polia', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior'], secGroups: ['bracos'],
    eq: 'polia', pattern: 'puxar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('puxada-supinada', 'Puxada supinada na polia', 'costas', {
    muscles: ['costas'], sec: ['biceps'], secGroups: ['bracos'],
    eq: 'polia', pattern: 'puxar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('puxada-triangulo', 'Puxada com triângulo', 'costas', {
    muscles: ['costas'], sec: ['biceps'], secGroups: ['bracos'],
    eq: 'polia', pattern: 'puxar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('barra-fixa', 'Barra fixa', 'costas', {
    muscles: ['costas'], sec: ['biceps'], secGroups: ['bracos'], eq: 'barra_fixa',
    pattern: 'puxar_vertical', joints: ['ombro', 'cotovelo'], compound: true, measure: 'reps',
    bw: true, hint: 'descida mais lenta, depois carga extra no cinto',
  }),
  ex('remada-curvada', 'Remada curvada com barra', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior', 'lombar'], secGroups: ['bracos'],
    eq: 'barra', pattern: 'puxar_horizontal', joints: ['lombar', 'ombro'], compound: true,
  }),
  ex('remada-unilateral', 'Remada unilateral com halter', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior'], secGroups: ['bracos'],
    eq: 'halteres', pattern: 'puxar_horizontal', joints: ['ombro'], compound: true,
  }),
  ex('remada-baixa', 'Remada baixa na polia', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior'], secGroups: ['bracos'],
    eq: 'polia', pattern: 'puxar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('remada-cavalinho', 'Remada cavalinho', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'lombar'], secGroups: ['bracos'],
    eq: 'barra', pattern: 'puxar_horizontal', joints: ['lombar'], compound: true,
  }),
  ex('remada-maquina', 'Remada na máquina', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior'], secGroups: ['bracos'],
    eq: 'maquina', pattern: 'puxar_horizontal', joints: ['ombro'], compound: true,
  }),
  ex('remada-invertida', 'Remada invertida', 'costas', {
    muscles: ['costas'], sec: ['biceps'], secGroups: ['bracos'], eq: 'barra_fixa',
    pattern: 'puxar_horizontal', joints: ['ombro'], compound: true, measure: 'reps', bw: true,
    hint: 'pés elevados e corpo mais horizontal',
  }),
  ex('pulldown-bracos-estendidos', 'Pulldown com braços estendidos', 'costas', {
    muscles: ['costas'], eq: 'polia', pattern: 'pullover', joints: ['ombro'],
  }),
  ex('pullover-halter', 'Pullover com halter', 'costas', {
    muscles: ['costas'], sec: ['peito'], secGroups: ['peito'], eq: 'halteres',
    pattern: 'pullover', joints: ['ombro', 'cotovelo'],
  }),
  ex('hiperextensao-lombar', 'Hiperextensão lombar', 'costas', {
    muscles: ['lombar'], sec: ['gluteos', 'posterior_coxa'], secGroups: ['pernas'],
    eq: 'peso_corporal', pattern: 'extensao_lombar', joints: ['lombar'], measure: 'reps', bw: true,
    hint: 'pausa de 2 s no topo, depois anilha no peito',
  }),

  ex('remada-pendlay', 'Remada Pendlay', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior', 'lombar'], secGroups: ['bracos'],
    eq: 'barra', pattern: 'puxar_horizontal', joints: ['lombar', 'ombro'], compound: true,
  }),
  ex('remada-curvada-halteres', 'Remada curvada com halteres', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior', 'lombar'], secGroups: ['bracos'],
    eq: 'halteres', pattern: 'puxar_horizontal', joints: ['lombar', 'ombro'], compound: true,
  }),
  ex('remada-apoiada-halteres', 'Remada apoiada no banco com halteres', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior'], secGroups: ['bracos'],
    eq: 'halteres', pattern: 'puxar_horizontal', joints: ['ombro'], compound: true,
  }),
  ex('remada-curvada-supinada', 'Remada curvada supinada', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'lombar'], secGroups: ['bracos'],
    eq: 'barra', pattern: 'puxar_horizontal', joints: ['lombar', 'ombro', 'cotovelo'], compound: true,
  }),
  ex('remada-smith', 'Remada curvada no Smith', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior', 'lombar'], secGroups: ['bracos'],
    eq: 'maquina', pattern: 'puxar_horizontal', joints: ['lombar', 'ombro'], compound: true,
  }),
  ex('puxada-unilateral', 'Puxada unilateral na polia', 'costas', {
    muscles: ['costas'], sec: ['biceps'], secGroups: ['bracos'],
    eq: 'polia', pattern: 'puxar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('remada-baixa-aberta', 'Remada baixa com pegada aberta', 'costas', {
    muscles: ['costas'], sec: ['ombro_posterior', 'biceps'], secGroups: ['bracos', 'ombros'],
    eq: 'polia', pattern: 'puxar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('remada-unilateral-polia', 'Remada unilateral na polia', 'costas', {
    muscles: ['costas'], sec: ['biceps', 'ombro_posterior'], secGroups: ['bracos'],
    eq: 'polia', pattern: 'puxar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('barra-fixa-supinada', 'Barra fixa supinada', 'costas', {
    muscles: ['costas', 'biceps'], secGroups: ['bracos'], eq: 'barra_fixa',
    pattern: 'puxar_vertical', joints: ['ombro', 'cotovelo'], compound: true, measure: 'reps',
    bw: true, hint: 'descida mais lenta, depois carga extra no cinto',
  }),
  ex('barra-fixa-neutra', 'Barra fixa com pegada neutra', 'costas', {
    muscles: ['costas'], sec: ['biceps'], secGroups: ['bracos'], eq: 'barra_fixa',
    pattern: 'puxar_vertical', joints: ['ombro', 'cotovelo'], compound: true, measure: 'reps',
    bw: true, hint: 'descida mais lenta, depois carga extra no cinto',
  }),
  ex('extensao-lombar-maquina', 'Extensão lombar na máquina', 'costas', {
    muscles: ['lombar'], sec: ['gluteos', 'posterior_coxa'], secGroups: ['pernas'],
    eq: 'maquina', pattern: 'extensao_lombar', joints: ['lombar'],
  }),

  // Peito
  ex('supino-reto-barra', 'Supino reto com barra', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'barra', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'],
    compound: true,
  }),
  ex('supino-reto-halteres', 'Supino reto com halteres', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'halteres', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('supino-inclinado-barra', 'Supino inclinado com barra', 'peito', {
    muscles: ['peito'], sec: ['ombro_anterior', 'triceps'], secGroups: ['ombros', 'bracos'],
    eq: 'barra', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'],
    compound: true,
  }),
  ex('supino-inclinado-halteres', 'Supino inclinado com halteres', 'peito', {
    muscles: ['peito'], sec: ['ombro_anterior', 'triceps'], secGroups: ['ombros', 'bracos'],
    eq: 'halteres', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('supino-declinado', 'Supino declinado com barra', 'peito', {
    muscles: ['peito'], sec: ['triceps'], secGroups: ['bracos'], eq: 'barra',
    pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'], compound: true,
  }),
  ex('supino-maquina', 'Supino na máquina', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'maquina', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('supino-inclinado-maquina', 'Supino inclinado na máquina', 'peito', {
    muscles: ['peito'], sec: ['ombro_anterior', 'triceps'], secGroups: ['ombros', 'bracos'],
    eq: 'maquina', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('crucifixo-halteres', 'Crucifixo com halteres', 'peito', {
    muscles: ['peito'], eq: 'halteres', pattern: 'crucifixo', joints: ['ombro'],
  }),
  ex('crucifixo-maquina', 'Crucifixo na máquina', 'peito', {
    muscles: ['peito'], eq: 'maquina', pattern: 'crucifixo', joints: ['ombro'],
  }),
  ex('crossover', 'Crossover na polia', 'peito', {
    muscles: ['peito'], eq: 'polia', pattern: 'crucifixo', joints: ['ombro'],
  }),
  ex('flexao-bracos', 'Flexão de braços', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos'],
    eq: 'peso_corporal', pattern: 'empurrar_horizontal', joints: ['ombro', 'punho'],
    compound: true, measure: 'reps', bw: true, hint: 'pés elevados, descida mais lenta',
  }),

  ex('crucifixo-inclinado', 'Crucifixo inclinado com halteres', 'peito', {
    muscles: ['peito'], sec: ['ombro_anterior'], eq: 'halteres', pattern: 'crucifixo',
    joints: ['ombro'],
  }),
  ex('supino-declinado-halteres', 'Supino declinado com halteres', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'halteres', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('supino-smith', 'Supino reto no Smith', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'maquina', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'],
    compound: true,
  }),
  ex('supino-inclinado-smith', 'Supino inclinado no Smith', 'peito', {
    muscles: ['peito'], sec: ['ombro_anterior', 'triceps'], secGroups: ['ombros', 'bracos'],
    eq: 'maquina', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'],
    compound: true,
  }),
  ex('supino-polia', 'Supino na polia', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'polia', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('flexao-inclinada', 'Flexão inclinada', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'peso_corporal', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'],
    compound: true, measure: 'reps', bw: true, hint: 'apoio mais baixo até chegar à flexão no chão',
  }),
  ex('flexao-joelhos', 'Flexão com joelhos no chão', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'peso_corporal', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'],
    compound: true, measure: 'reps', bw: true, hint: 'descida mais lenta, depois flexão completa',
  }),
  ex('flexao-declinada', 'Flexão declinada', 'peito', {
    muscles: ['peito'], sec: ['ombro_anterior', 'triceps'], secGroups: ['ombros', 'bracos'],
    eq: 'peso_corporal', pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo', 'punho'],
    compound: true, measure: 'reps', bw: true, hint: 'pés mais altos, depois colete ou anilha nas costas',
  }),
  ex('supino-chao-halteres', 'Supino no chão com halteres', 'peito', {
    muscles: ['peito'], sec: ['triceps', 'ombro_anterior'], secGroups: ['bracos', 'ombros'],
    eq: 'halteres', pattern: 'empurrar_horizontal', joints: ['cotovelo'], compound: true,
  }),

  // Ombros
  ex('desenvolvimento-halteres-sentado', 'Desenvolvimento com halteres sentado', 'ombros', {
    muscles: ['ombro_anterior', 'ombro_lateral'], sec: ['triceps'], secGroups: ['bracos'],
    eq: 'halteres', pattern: 'empurrar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('desenvolvimento-maquina', 'Desenvolvimento na máquina', 'ombros', {
    muscles: ['ombro_anterior', 'ombro_lateral'], sec: ['triceps'], secGroups: ['bracos'],
    eq: 'maquina', pattern: 'empurrar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('desenvolvimento-barra', 'Desenvolvimento militar com barra', 'ombros', {
    muscles: ['ombro_anterior', 'ombro_lateral'], sec: ['triceps'], secGroups: ['bracos'],
    eq: 'barra', pattern: 'empurrar_vertical', joints: ['ombro', 'cotovelo', 'lombar'],
    compound: true,
  }),
  ex('desenvolvimento-arnold', 'Desenvolvimento Arnold', 'ombros', {
    muscles: ['ombro_anterior', 'ombro_lateral'], sec: ['triceps'], secGroups: ['bracos'],
    eq: 'halteres', pattern: 'empurrar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('elevacao-lateral', 'Elevação lateral com halteres', 'ombros', {
    muscles: ['ombro_lateral'], eq: 'halteres', pattern: 'elevacao_lateral', joints: ['ombro'],
  }),
  ex('elevacao-lateral-polia', 'Elevação lateral na polia', 'ombros', {
    muscles: ['ombro_lateral'], eq: 'polia', pattern: 'elevacao_lateral', joints: ['ombro'],
  }),
  ex('elevacao-lateral-maquina', 'Elevação lateral na máquina', 'ombros', {
    muscles: ['ombro_lateral'], eq: 'maquina', pattern: 'elevacao_lateral', joints: ['ombro'],
  }),
  ex('elevacao-frontal', 'Elevação frontal com halteres', 'ombros', {
    muscles: ['ombro_anterior'], eq: 'halteres', pattern: 'elevacao_frontal', joints: ['ombro'],
  }),
  ex('remada-alta', 'Remada alta com barra', 'ombros', {
    muscles: ['ombro_lateral', 'trapezio'], eq: 'barra', pattern: 'elevacao_lateral',
    joints: ['ombro', 'punho'],
  }),
  ex('crucifixo-inverso', 'Crucifixo inverso com halteres', 'ombros', {
    muscles: ['ombro_posterior'], sec: ['costas'], secGroups: ['costas'], eq: 'halteres',
    pattern: 'crucifixo_inverso', joints: ['ombro'],
  }),
  ex('crucifixo-inverso-maquina', 'Crucifixo inverso na máquina', 'ombros', {
    muscles: ['ombro_posterior'], sec: ['costas'], secGroups: ['costas'], eq: 'maquina',
    pattern: 'crucifixo_inverso', joints: ['ombro'],
  }),
  ex('face-pull', 'Face pull na polia', 'ombros', {
    muscles: ['ombro_posterior'], sec: ['trapezio', 'costas'], secGroups: ['costas'], eq: 'polia',
    pattern: 'crucifixo_inverso', joints: ['ombro'],
  }),
  ex('encolhimento-halteres', 'Encolhimento com halteres', 'ombros', {
    muscles: ['trapezio'], sec: ['antebraco'], eq: 'halteres', pattern: 'encolhimento',
    joints: ['punho'],
  }),
  ex('encolhimento-barra', 'Encolhimento com barra', 'ombros', {
    muscles: ['trapezio'], sec: ['antebraco'], eq: 'barra', pattern: 'encolhimento',
    joints: ['punho'],
  }),

  ex('desenvolvimento-halteres-em-pe', 'Desenvolvimento com halteres em pé', 'ombros', {
    muscles: ['ombro_anterior', 'ombro_lateral'], sec: ['triceps'], secGroups: ['bracos'],
    eq: 'halteres', pattern: 'empurrar_vertical', joints: ['ombro', 'cotovelo', 'lombar'], compound: true,
  }),
  ex('desenvolvimento-smith', 'Desenvolvimento no Smith', 'ombros', {
    muscles: ['ombro_anterior', 'ombro_lateral'], sec: ['triceps'], secGroups: ['bracos'],
    eq: 'maquina', pattern: 'empurrar_vertical', joints: ['ombro', 'cotovelo'], compound: true,
  }),
  ex('elevacao-lateral-sentado', 'Elevação lateral sentado', 'ombros', {
    muscles: ['ombro_lateral'], eq: 'halteres', pattern: 'elevacao_lateral', joints: ['ombro'],
  }),
  ex('elevacao-frontal-polia', 'Elevação frontal na polia', 'ombros', {
    muscles: ['ombro_anterior'], eq: 'polia', pattern: 'elevacao_frontal', joints: ['ombro'],
  }),
  ex('elevacao-frontal-barra', 'Elevação frontal com barra', 'ombros', {
    muscles: ['ombro_anterior'], eq: 'barra', pattern: 'elevacao_frontal', joints: ['ombro', 'punho'],
  }),
  ex('remada-alta-polia', 'Remada alta na polia', 'ombros', {
    muscles: ['ombro_lateral', 'trapezio'], eq: 'polia', pattern: 'elevacao_lateral',
    joints: ['ombro', 'punho'],
  }),
  ex('remada-alta-halteres', 'Remada alta com halteres', 'ombros', {
    muscles: ['ombro_lateral', 'trapezio'], eq: 'halteres', pattern: 'elevacao_lateral',
    joints: ['ombro'],
  }),
  ex('crucifixo-inverso-polia', 'Crucifixo inverso na polia', 'ombros', {
    muscles: ['ombro_posterior'], sec: ['trapezio'], eq: 'polia', pattern: 'crucifixo_inverso',
    joints: ['ombro'],
  }),
  ex('encolhimento-smith', 'Encolhimento no Smith', 'ombros', {
    muscles: ['trapezio'], sec: ['antebraco'], eq: 'maquina', pattern: 'encolhimento',
    joints: ['punho'],
  }),

  // Braços: bíceps
  ex('rosca-direta', 'Rosca direta com barra', 'bracos', {
    muscles: ['biceps'], sec: ['antebraco'], eq: 'barra', pattern: 'rosca',
    joints: ['cotovelo', 'punho'],
  }),
  ex('rosca-barra-w', 'Rosca com barra W', 'bracos', {
    muscles: ['biceps'], sec: ['antebraco'], eq: 'barra', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-alternada', 'Rosca alternada com halteres', 'bracos', {
    muscles: ['biceps'], sec: ['antebraco'], eq: 'halteres', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-martelo', 'Rosca martelo', 'bracos', {
    muscles: ['biceps', 'antebraco'], eq: 'halteres', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-scott', 'Rosca Scott', 'bracos', {
    muscles: ['biceps'], eq: 'maquina', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-concentrada', 'Rosca concentrada', 'bracos', {
    muscles: ['biceps'], eq: 'halteres', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-polia', 'Rosca na polia', 'bracos', {
    muscles: ['biceps'], eq: 'polia', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-inclinada', 'Rosca inclinada com halteres', 'bracos', {
    muscles: ['biceps'], eq: 'halteres', pattern: 'rosca', joints: ['cotovelo', 'ombro'],
  }),

  ex('rosca-scott-halter', 'Rosca Scott com halter', 'bracos', {
    muscles: ['biceps'], eq: 'halteres', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-maquina', 'Rosca na máquina', 'bracos', {
    muscles: ['biceps'], eq: 'maquina', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-martelo-polia', 'Rosca martelo na polia', 'bracos', {
    muscles: ['biceps'], sec: ['antebraco'], eq: 'polia', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-inversa', 'Rosca inversa com barra W', 'bracos', {
    muscles: ['antebraco', 'biceps'], eq: 'barra', pattern: 'rosca', joints: ['cotovelo', 'punho'],
  }),
  ex('rosca-spider', 'Rosca spider', 'bracos', {
    muscles: ['biceps'], eq: 'halteres', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-sentado', 'Rosca sentado com halteres', 'bracos', {
    muscles: ['biceps'], sec: ['antebraco'], eq: 'halteres', pattern: 'rosca', joints: ['cotovelo'],
  }),
  ex('rosca-punho', 'Rosca de punho com halteres', 'bracos', {
    muscles: ['antebraco'], eq: 'halteres', pattern: 'rosca', joints: ['punho'], inc: 1,
  }),

  // Braços: tríceps
  ex('triceps-polia', 'Tríceps na polia com barra', 'bracos', {
    muscles: ['triceps'], eq: 'polia', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-corda', 'Tríceps na polia com corda', 'bracos', {
    muscles: ['triceps'], eq: 'polia', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-frances', 'Tríceps francês com halter', 'bracos', {
    muscles: ['triceps'], eq: 'halteres', pattern: 'extensao_cotovelo',
    joints: ['cotovelo', 'ombro'],
  }),
  ex('triceps-testa', 'Tríceps testa com barra W', 'bracos', {
    muscles: ['triceps'], eq: 'barra', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-coice', 'Tríceps coice com halter', 'bracos', {
    muscles: ['triceps'], eq: 'halteres', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-maquina', 'Tríceps na máquina', 'bracos', {
    muscles: ['triceps'], eq: 'maquina', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('supino-fechado', 'Supino fechado', 'bracos', {
    muscles: ['triceps'], sec: ['peito'], secGroups: ['peito'], eq: 'barra',
    pattern: 'empurrar_horizontal', joints: ['cotovelo', 'ombro', 'punho'], compound: true,
  }),
  ex('paralelas', 'Paralelas', 'bracos', {
    muscles: ['triceps', 'peito'], secGroups: ['peito'], eq: 'barra_fixa',
    pattern: 'empurrar_horizontal', joints: ['ombro', 'cotovelo'], compound: true,
    measure: 'reps', bw: true, hint: 'descida mais lenta, depois carga extra no cinto',
  }),
  ex('mergulho-banco', 'Mergulho no banco', 'bracos', {
    muscles: ['triceps'], eq: 'peso_corporal', pattern: 'extensao_cotovelo',
    joints: ['ombro', 'cotovelo', 'punho'], measure: 'reps', bw: true,
    hint: 'pés elevados, depois anilha no colo',
  }),

  ex('triceps-acima-polia', 'Tríceps acima da cabeça na polia', 'bracos', {
    muscles: ['triceps'], eq: 'polia', pattern: 'extensao_cotovelo', joints: ['cotovelo', 'ombro'],
  }),
  ex('triceps-unilateral-polia', 'Tríceps unilateral na polia', 'bracos', {
    muscles: ['triceps'], eq: 'polia', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-testa-halteres', 'Tríceps testa com halteres', 'bracos', {
    muscles: ['triceps'], eq: 'halteres', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-barra-v', 'Tríceps na polia com barra V', 'bracos', {
    muscles: ['triceps'], eq: 'polia', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-coice-polia', 'Tríceps coice na polia', 'bracos', {
    muscles: ['triceps'], eq: 'polia', pattern: 'extensao_cotovelo', joints: ['cotovelo'],
  }),
  ex('triceps-frances-barra', 'Tríceps francês com barra W', 'bracos', {
    muscles: ['triceps'], eq: 'barra', pattern: 'extensao_cotovelo', joints: ['cotovelo', 'ombro'],
  }),
  ex('mergulho-maquina', 'Mergulho na máquina', 'bracos', {
    muscles: ['triceps'], sec: ['peito'], secGroups: ['peito'], eq: 'maquina',
    pattern: 'extensao_cotovelo', joints: ['ombro', 'cotovelo'],
  }),
  ex('flexao-diamante', 'Flexão diamante', 'bracos', {
    muscles: ['triceps', 'peito'], secGroups: ['peito'], eq: 'peso_corporal',
    pattern: 'empurrar_horizontal', joints: ['cotovelo', 'punho'], compound: true, measure: 'reps',
    bw: true, hint: 'descida mais lenta, depois pés elevados',
  }),

  // Pernas
  ex('agachamento-livre', 'Agachamento livre com barra', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], sec: ['lombar'], eq: 'barra', pattern: 'agachamento',
    joints: ['joelho', 'lombar'], compound: true,
  }),
  ex('agachamento-smith', 'Agachamento no Smith', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'maquina', pattern: 'agachamento', joints: ['joelho'],
    compound: true,
  }),
  ex('agachamento-goblet', 'Agachamento goblet', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'halteres', pattern: 'agachamento',
    joints: ['joelho'], compound: true,
  }),
  ex('agachamento-sumo', 'Agachamento sumô com halter', 'pernas', {
    muscles: ['gluteos', 'adutores'], sec: ['quadriceps'], eq: 'halteres', pattern: 'agachamento',
    joints: ['joelho'], compound: true,
  }),
  ex('agachamento-bulgaro', 'Agachamento búlgaro', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'halteres', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('afundo', 'Afundo com halteres', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'halteres', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('passada', 'Passada com halteres', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'halteres', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('leg-press-45', 'Leg press 45', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'maquina', pattern: 'agachamento', joints: ['joelho'],
    compound: true, inc: 5,
  }),
  ex('leg-press-horizontal', 'Leg press horizontal', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'maquina', pattern: 'agachamento', joints: ['joelho'],
    compound: true, inc: 5,
  }),
  ex('hack-squat', 'Hack squat', 'pernas', {
    muscles: ['quadriceps'], sec: ['gluteos'], eq: 'maquina', pattern: 'agachamento',
    joints: ['joelho'], compound: true, inc: 5,
  }),
  ex('cadeira-extensora', 'Cadeira extensora', 'pernas', {
    muscles: ['quadriceps'], eq: 'maquina', pattern: 'extensao_joelho', joints: ['joelho'],
  }),
  ex('mesa-flexora', 'Mesa flexora', 'pernas', {
    muscles: ['posterior_coxa'], eq: 'maquina', pattern: 'flexao_joelho', joints: ['joelho'],
  }),
  ex('cadeira-flexora', 'Cadeira flexora', 'pernas', {
    muscles: ['posterior_coxa'], eq: 'maquina', pattern: 'flexao_joelho', joints: ['joelho'],
  }),
  ex('stiff', 'Stiff com barra', 'pernas', {
    muscles: ['posterior_coxa', 'gluteos'], sec: ['lombar'], eq: 'barra', pattern: 'dobradica',
    joints: ['lombar'], compound: true,
  }),
  ex('stiff-halteres', 'Stiff com halteres', 'pernas', {
    muscles: ['posterior_coxa', 'gluteos'], sec: ['lombar'], eq: 'halteres',
    pattern: 'dobradica', joints: ['lombar'], compound: true,
  }),
  ex('levantamento-terra', 'Levantamento terra', 'pernas', {
    muscles: ['gluteos', 'posterior_coxa'], sec: ['lombar', 'costas', 'trapezio'],
    secGroups: ['costas'], eq: 'barra', pattern: 'dobradica', joints: ['lombar', 'joelho'],
    compound: true,
  }),
  ex('elevacao-pelvica', 'Elevação pélvica com barra', 'pernas', {
    muscles: ['gluteos'], sec: ['posterior_coxa'], eq: 'barra', pattern: 'dobradica',
    compound: true, inc: 5,
  }),
  ex('swing-kettlebell', 'Swing com kettlebell', 'pernas', {
    muscles: ['gluteos', 'posterior_coxa'], sec: ['lombar'], eq: 'kettlebell',
    pattern: 'dobradica', joints: ['lombar'], compound: true,
  }),
  ex('cadeira-abdutora', 'Cadeira abdutora', 'pernas', {
    muscles: ['gluteos'], eq: 'maquina', pattern: 'abducao',
  }),
  ex('cadeira-adutora', 'Cadeira adutora', 'pernas', {
    muscles: ['adutores'], eq: 'maquina', pattern: 'aducao',
  }),
  ex('panturrilha-em-pe', 'Panturrilha em pé na máquina', 'pernas', {
    muscles: ['panturrilha'], eq: 'maquina', pattern: 'panturrilha', inc: 5,
  }),
  ex('panturrilha-sentado', 'Panturrilha sentado', 'pernas', {
    muscles: ['panturrilha'], eq: 'maquina', pattern: 'panturrilha',
  }),
  ex('panturrilha-leg-press', 'Panturrilha no leg press', 'pernas', {
    muscles: ['panturrilha'], eq: 'maquina', pattern: 'panturrilha', inc: 5,
  }),
  ex('panturrilha-halter', 'Panturrilha unilateral com halter', 'pernas', {
    muscles: ['panturrilha'], eq: 'halteres', pattern: 'panturrilha',
  }),

  ex('agachamento-frontal', 'Agachamento frontal com barra', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], sec: ['abdomen'], eq: 'barra', pattern: 'agachamento',
    joints: ['joelho', 'lombar', 'punho'], compound: true,
  }),
  ex('agachamento-halteres', 'Agachamento com halteres', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'halteres', pattern: 'agachamento', joints: ['joelho'],
    compound: true,
  }),
  ex('agachamento-bulgaro-smith', 'Agachamento búlgaro no Smith', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'maquina', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('afundo-smith', 'Afundo no Smith', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'maquina', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('afundo-reverso', 'Afundo reverso com halteres', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'halteres', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('afundo-barra', 'Afundo com barra', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'barra', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('subida-banco', 'Subida no banco com halteres', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'halteres', pattern: 'avanco', joints: ['joelho'],
    compound: true,
  }),
  ex('terra-romeno', 'Levantamento terra romeno', 'pernas', {
    muscles: ['posterior_coxa', 'gluteos'], sec: ['lombar'], eq: 'barra', pattern: 'dobradica',
    joints: ['lombar'], compound: true,
  }),
  ex('terra-sumo', 'Levantamento terra sumô', 'pernas', {
    muscles: ['gluteos', 'quadriceps'], sec: ['posterior_coxa', 'adutores', 'lombar'],
    eq: 'barra', pattern: 'dobradica', joints: ['lombar', 'joelho'], compound: true,
  }),
  ex('terra-hexagonal', 'Levantamento terra com barra hexagonal', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], sec: ['posterior_coxa', 'lombar', 'trapezio'],
    eq: 'barra', pattern: 'dobradica', joints: ['lombar', 'joelho'], compound: true,
  }),
  ex('elevacao-pelvica-maquina', 'Elevação pélvica na máquina', 'pernas', {
    muscles: ['gluteos'], sec: ['posterior_coxa'], eq: 'maquina', pattern: 'dobradica',
    compound: true, inc: 5,
  }),
  ex('elevacao-pelvica-smith', 'Elevação pélvica no Smith', 'pernas', {
    muscles: ['gluteos'], sec: ['posterior_coxa'], eq: 'maquina', pattern: 'dobradica',
    compound: true, inc: 5,
  }),
  ex('ponte-gluteos', 'Ponte de glúteos', 'pernas', {
    muscles: ['gluteos'], sec: ['posterior_coxa'], eq: 'peso_corporal', pattern: 'dobradica',
    measure: 'reps', bw: true, hint: 'uma perna só, depois peso sobre o quadril',
  }),
  ex('elevacao-pelvica-unilateral', 'Elevação pélvica unilateral', 'pernas', {
    muscles: ['gluteos'], sec: ['posterior_coxa'], eq: 'peso_corporal', pattern: 'dobradica',
    measure: 'reps', bw: true, hint: 'pausa no alto, depois peso sobre o quadril',
  }),
  ex('coice-polia', 'Coice na polia', 'pernas', {
    muscles: ['gluteos'], eq: 'polia', pattern: 'dobradica',
  }),
  ex('extensora-unilateral', 'Cadeira extensora unilateral', 'pernas', {
    muscles: ['quadriceps'], eq: 'maquina', pattern: 'extensao_joelho', joints: ['joelho'],
  }),
  ex('flexora-unilateral', 'Mesa flexora unilateral', 'pernas', {
    muscles: ['posterior_coxa'], eq: 'maquina', pattern: 'flexao_joelho', joints: ['joelho'],
  }),
  ex('leg-press-unilateral', 'Leg press unilateral', 'pernas', {
    muscles: ['quadriceps', 'gluteos'], eq: 'maquina', pattern: 'agachamento', joints: ['joelho'],
    compound: true,
  }),
  ex('stiff-unilateral', 'Stiff unilateral com halteres', 'pernas', {
    muscles: ['posterior_coxa', 'gluteos'], sec: ['lombar'], eq: 'halteres', pattern: 'dobradica',
    joints: ['lombar'], compound: true,
  }),
  ex('panturrilha-smith', 'Panturrilha no Smith', 'pernas', {
    muscles: ['panturrilha'], eq: 'maquina', pattern: 'panturrilha', inc: 5,
  }),
  ex('panturrilha-burrinho', 'Panturrilha burrinho na máquina', 'pernas', {
    muscles: ['panturrilha'], eq: 'maquina', pattern: 'panturrilha', inc: 5,
  }),
  ex('good-morning', 'Good morning com barra', 'pernas', {
    muscles: ['posterior_coxa', 'gluteos'], sec: ['lombar'], eq: 'barra', pattern: 'dobradica',
    joints: ['lombar'], compound: true,
  }),

  // Abdômen
  ex('prancha', 'Prancha', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_anti_extensao', measure: 'time',
    bw: true, hint: 'pés mais afastados do apoio ou um pé elevado',
  }),
  ex('prancha-lateral', 'Prancha lateral', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_lateral', measure: 'time', bw: true,
    hint: 'perna de cima elevada',
  }),
  ex('elevacao-pernas-cadeira', 'Elevação de pernas na cadeira', 'core', {
    muscles: ['abdomen'], eq: 'maquina', pattern: 'core_quadril', measure: 'reps', bw: true,
    hint: 'pernas mais esticadas, descida mais lenta',
  }),
  ex('elevacao-pernas-solo', 'Elevação de pernas deitado', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_quadril', measure: 'reps',
    bw: true, joints: ['lombar'], hint: 'pernas esticadas, descida em 3 s',
  }),
  ex('elevacao-pernas-barra', 'Elevação de pernas na barra fixa', 'core', {
    muscles: ['abdomen'], eq: 'barra_fixa', pattern: 'core_quadril', measure: 'reps', bw: true,
    joints: ['ombro'], hint: 'pernas esticadas até a altura do quadril',
  }),
  ex('abdominal-polia', 'Abdominal na polia', 'core', {
    muscles: ['abdomen'], eq: 'polia', pattern: 'core_flexao',
  }),
  ex('abdominal-supra', 'Abdominal supra', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_flexao', measure: 'reps', bw: true,
    hint: 'descida mais lenta, depois anilha no peito',
  }),
  ex('abdominal-maquina', 'Abdominal na máquina', 'core', {
    muscles: ['abdomen'], eq: 'maquina', pattern: 'core_flexao',
  }),
  ex('abdominal-infra', 'Abdominal infra', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_quadril', measure: 'reps', bw: true,
    joints: ['lombar'], hint: 'pernas mais esticadas',
  }),
  ex('abdominal-bicicleta', 'Abdominal bicicleta', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_rotacao', measure: 'reps', bw: true,
    hint: 'ritmo mais lento',
  }),
  ex('roda-abdominal', 'Roda abdominal', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_anti_extensao', measure: 'reps',
    bw: true, joints: ['lombar', 'ombro'], hint: 'rolar mais longe, depois em pé',
  }),
  ex('pallof-press', 'Pallof press na polia', 'core', {
    muscles: ['abdomen'], eq: 'polia', pattern: 'core_rotacao',
  }),
  ex('dead-bug', 'Dead bug', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_anti_extensao', measure: 'reps',
    bw: true, hint: 'braços e pernas mais longe do corpo',
  }),
  ex('abdominal-declinado', 'Abdominal no banco declinado', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_flexao', measure: 'reps', bw: true,
    hint: 'banco mais inclinado, depois anilha no peito',
  }),
  ex('abdominal-canivete', 'Abdominal canivete', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_flexao', measure: 'reps', bw: true,
    hint: 'descida mais lenta',
  }),
  ex('elevacao-joelhos-barra', 'Elevação de joelhos na barra fixa', 'core', {
    muscles: ['abdomen'], eq: 'barra_fixa', pattern: 'core_quadril', measure: 'reps', bw: true,
    joints: ['ombro'], hint: 'pernas mais esticadas a cada fase',
  }),
  ex('rotacao-russa', 'Rotação russa', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_rotacao', measure: 'reps', bw: true,
    joints: ['lombar'], hint: 'pés fora do chão, depois anilha nas mãos',
  }),
  ex('canoa', 'Canoa', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_anti_extensao', measure: 'time',
    bw: true, hint: 'braços acima da cabeça e pernas mais baixas',
  }),
  ex('flexao-lateral-halter', 'Flexão lateral com halter', 'core', {
    muscles: ['abdomen'], eq: 'halteres', pattern: 'core_lateral', joints: ['lombar'],
  }),
  ex('abdominal-completo', 'Abdominal completo', 'core', {
    muscles: ['abdomen'], eq: 'peso_corporal', pattern: 'core_flexao', measure: 'reps', bw: true,
    hint: 'descida mais lenta, depois anilha no peito',
  }),
];

export const EXERCISES_BY_ID: ReadonlyMap<string, ExerciseDef> = new Map(
  EXERCISES.map((e) => [e.id, e]),
);
