import type { Stage } from './client';

/**
 * What the screen says while the assistant works. Each list belongs to a real step: reading
 * the request, or a tool that ran and the answer being written about it. Never a step that
 * is not happening.
 */
const READING = [
  'Lendo seu pedido',
  'Entendendo o que você quer mudar',
  'Olhando suas fichas',
  'Revendo sua semana de treino',
  'Vendo o que dá para fazer',
  'Conferindo seu perfil de treino',
  'Pensando no melhor caminho',
  'Comparando com o que você faz hoje',
];

const BY_TOOL: Record<string, string[]> = {
  propor_plano: [
    'Refazendo a semana com o gerador',
    'Montando o plano novo',
    'Conferindo o volume por músculo',
    'Comparando antes e depois',
    'Vendo se cabe no seu tempo',
    'Checando os avisos da proposta',
    'Escrevendo a explicação',
  ],
  editar_ficha: [
    'Ajustando a ficha',
    'Conferindo o volume da semana',
    'Montando o antes e depois',
    'Checando os avisos da mudança',
    'Escrevendo a explicação',
  ],
  nova_ficha: [
    'Montando a ficha nova',
    'Conferindo o volume da semana',
    'Vendo onde ela entra',
    'Checando os avisos da ficha',
    'Escrevendo a explicação',
  ],
  substitutos: [
    'Procurando substitutos',
    'Vendo o que trabalha o mesmo músculo',
    'Conferindo o que sua academia tem',
    'Escolhendo a melhor troca',
  ],
  mostrar_onde: ['Achando onde isso fica no app', 'Escrevendo o caminho'],
  nao_consigo: ['Registrando seu pedido para a equipe', 'Escrevendo a resposta'],
};

export function phrasesFor(stage: Stage): string[] {
  if (stage.kind === 'lendo') return READING;
  return BY_TOOL[stage.tool] ?? ['Escrevendo a resposta'];
}

/** Another phrase of the list, never the one on screen. */
export function nextPhrase(list: string[], current: string | null, random = Math.random): string {
  const options = list.length > 1 ? list.filter((p) => p !== current) : list;
  return options[Math.floor(random() * options.length)] ?? list[0] ?? '';
}
