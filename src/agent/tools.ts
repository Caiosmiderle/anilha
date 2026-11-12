import { EXERCISES } from '../engine/exercises';

/**
 * The agent's tools, the same for every model. None of them saves anything: each one turns
 * into a proposal the app shows before and after, and only the person saves. Exercises are
 * an enum of the catalog ids, so no model can name an exercise the app does not have.
 */
export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const EXERCISE_ID = { type: 'string', enum: EXERCISES.map((e) => e.id) };

/**
 * Every field is required; one that may stay empty takes null. A model skips optional fields
 * (the comparison caught "quero emagrecer" with no objetivo), but must decide a required one.
 */
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** The same field, or null (anyOf: Claude rejects an enum under a type list). */
function orNull({ description, ...schema }: { description?: string; [k: string]: unknown }) {
  return { anyOf: [schema, { type: 'null' }], ...(description ? { description } : {}) };
}

/** Where things live in the app, for "it already exists, it is here". */
export const PLACES = {
  perfil_treino:
    'Você > Perfil de treino: objetivo, foco, nível, dias por semana, tempo por treino, horário, divisão, onde treina, articulações a poupar e modo retorno.',
  ajustes:
    'Você > Ajustes: tema, aviso do fim do descanso, tela acesa no treino, unidade de carga (kg ou lb), descanso padrão e notificações.',
  exercicio:
    'Plano > Exercícios > o exercício: histórico, incremento mínimo de carga e nota pessoal.',
  historico: 'Histórico: treinos passados, progresso das cargas e corpo.',
  seus_dados:
    'Você > Seus dados: exportar as fichas em planilha, exportar e importar os dados, apagar a conta.',
  privacidade: 'Você > Privacidade: dados de saúde, o que os amigos veem e bloqueados.',
  amigos: 'Amigos: convidar, grupos e as fichas trocadas com cada amigo.',
  enviar_ficha: 'Plano > abrir a ficha > Enviar ficha: mandar uma ficha para um amigo.',
  fichas_prontas: 'Plano > Fichas prontas: fichas já montadas para escolher.',
  hoje_descanso: 'Hoje > Hoje é descanso: descansar num dia de treino sem zerar a sequência.',
  treino_menu: 'Durante o treino, menu do exercício: substituir exercício e marcar dor.',
  fale_conosco: 'Você > Fale com o Anilha: sugestões, problemas e pedidos.',
} as const;

export type Place = keyof typeof PLACES;

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'propor_plano',
    description:
      'Refaz o plano pelo gerador do app com o que mudar no perfil de treino: foco, dias de academia por semana, divisão, número de fichas, objetivo, nível ou tempo por treino. Uma chamada só. Cada campo leva o valor novo, ou null se não muda; com tudo null, nada muda. Devolve o plano novo, o volume por músculo antes e depois e os avisos.',
    input_schema: obj({
      foco: orNull({
        type: 'array',
        items: {
          type: 'string',
          enum: ['equilibrado', 'pernas', 'costas_ombros', 'peito_bracos', 'abdomen'],
        },
        description: 'Grupos com mais trabalho; pernas inclui glúteos. null se não muda.',
      }),
      dias_academia: orNull({
        type: 'integer',
        enum: [1, 2, 3, 4, 5, 6],
        description: 'Dias de academia por semana, de 1 a 6. null se não muda.',
      }),
      divisao: orNull({
        type: 'string',
        enum: ['grupos', 'superior_inferior', 'corpo_inteiro'],
        description: 'null se não muda.',
      }),
      fichas: orNull({
        type: 'integer',
        enum: [3, 4, 5],
        description:
          'Quantas fichas na divisão por grupos: ABC é 3, ABCD é 4, ABCDE é 5. Os dias por semana não mudam junto. null se não muda.',
      }),
      objetivo: orNull({
        type: 'string',
        enum: ['hipertrofia', 'emagrecimento', 'condicionamento', 'saude', 'forca'],
        description: 'emagrecimento para quem quer emagrecer. null se não muda.',
      }),
      nivel: orNull({
        type: 'string',
        enum: ['iniciante', 'intermediario', 'avancado'],
        description: 'null se não muda.',
      }),
      minutos: orNull({
        type: 'integer',
        description: 'Tempo por treino, em minutos inteiros positivos. null se não muda.',
      }),
      motivo: { type: 'string', description: 'O que a pessoa pediu, numa frase.' },
    }),
  },
  {
    name: 'editar_ficha',
    description:
      'Muda uma ficha que a pessoa já tem: trocar, adicionar ou remover exercício, mudar séries, repetições, descanso ou a ordem. Uma chamada por ficha. Devolve o antes e depois e os avisos.',
    input_schema: obj({
      ficha_id: { type: 'string', description: 'O id da ficha, do contexto.' },
      mudancas: {
        type: 'array',
        items: obj({
          tipo: {
            type: 'string',
            enum: ['trocar', 'adicionar', 'remover', 'series', 'repeticoes', 'descanso', 'mover'],
          },
          exercicio_id: orNull({
            ...EXERCISE_ID,
            description: 'O exercício da ficha que muda; null em adicionar.',
          }),
          novo_exercicio_id: orNull({
            ...EXERCISE_ID,
            description: 'O exercício que entra, em trocar e adicionar; null nos outros.',
          }),
          series: orNull({
            type: 'integer',
            enum: Array.from({ length: 12 }, (_, n) => n + 1),
            description: 'De 1 a 12, em series e adicionar; null nos outros.',
          }),
          repeticoes_min: orNull({
            type: 'integer',
            description: 'De 1 a 3600, em repeticoes e adicionar.',
          }),
          repeticoes_max: orNull({
            type: 'integer',
            description: 'De 1 a 3600 e maior ou igual ao mínimo, em repeticoes e adicionar.',
          }),
          descanso_segundos: orNull({
            type: 'integer',
            description: 'De 0 a 600 segundos, em descanso.',
          }),
          posicao: orNull({
            type: 'integer',
            description: 'Nova posição, começando em 1, em mover.',
          }),
        }),
      },
      motivo: { type: 'string', description: 'O que a pessoa pediu, numa frase.' },
    }),
  },
  {
    name: 'nova_ficha',
    description:
      'Monta uma ficha nova só com exercícios do catálogo. Se a pessoa quer que ela entre no lugar de uma ficha que existe ("no lugar de", "substituir", "trocar a ficha"), preencha substitui_ficha_id com o ficha_id do contexto. Devolve a ficha, o volume e os avisos.',
    input_schema: obj({
      nome: { type: 'string', description: 'Nome da ficha, de 1 a 80 caracteres.' },
      exercicios: {
        type: 'array',
        items: obj({
          exercicio_id: EXERCISE_ID,
          series: { type: 'integer', enum: Array.from({ length: 12 }, (_, n) => n + 1) },
          repeticoes_min: { type: 'integer', description: 'De 1 a 3600.' },
          repeticoes_max: {
            type: 'integer',
            description: 'De 1 a 3600 e maior ou igual ao mínimo.',
          },
        }),
      },
      substitui_ficha_id: orNull({
        type: 'string',
        description: 'O ficha_id da ficha que sai; null se a ficha nova é uma a mais.',
      }),
      motivo: { type: 'string', description: 'O que a pessoa pediu, numa frase.' },
    }),
  },
  {
    name: 'substitutos',
    description:
      'Lista exercícios que trabalham o mesmo músculo, os melhores primeiro, para quando falta o aparelho, ele está ocupado, dói ou a pessoa não gosta. Depois proponha a troca com editar_ficha.',
    input_schema: obj({
      exercicio_id: EXERCISE_ID,
      por_que: { type: 'string', enum: ['sem_aparelho', 'ocupado', 'dor', 'preferencia'] },
    }),
  },
  {
    name: 'mostrar_onde',
    description:
      'Quando o que a pessoa quer já existe no app e ela mesma faz em poucos toques: mostra onde fica.',
    input_schema: obj({
      lugar: { type: 'string', enum: Object.keys(PLACES) },
      explicacao: { type: 'string', description: 'O que fazer lá, numa frase.' },
    }),
  },
  {
    name: 'nao_consigo',
    description:
      'Quando nenhuma ferramenta resolve o pedido: registra para a equipe do Anilha avaliar. Diga à pessoa, com honestidade, que ainda não dá e que o pedido foi registrado.',
    input_schema: obj({
      pedido: { type: 'string', description: 'O que a pessoa queria, numa frase.' },
      categoria: {
        type: 'string',
        enum: ['nutricao', 'integracao', 'equipamento', 'lembrete', 'relatorio', 'social', 'outro'],
      },
      motivo: { type: 'string', description: 'Por que as ferramentas não resolvem.' },
    }),
  },
];
