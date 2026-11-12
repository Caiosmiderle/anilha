/**
 * Back navigation. The app installed on the iPhone has no browser back button and no
 * edge swipe (Apple turns it off for home screen web apps), so every screen below a tab
 * gets its own "Voltar" and, there, the swipe from the left edge.
 */

/** Where "Voltar" goes when there is no previous screen (opened by a link or a notification). */
export function parentOf(pathname: string): string | null {
  // A conversa de fichas volta para a página do amigo.
  const thread = /^\/amigos\/([^/]+)\/fichas\/?$/.exec(pathname);
  if (thread) return `/amigos/${thread[1]}`;
  const rules: [RegExp, string][] = [
    [/^\/plano\/rotina\/[^/]+/, '/plano'],
    [/^\/plano\/fichas-prontas\/?$/, '/plano'],
    [/^\/plano\/pedir\/?$/, '/plano'],
    [/^\/historico\/treino\/[^/]+/, '/historico'],
    [/^\/exercicios\/[^/]+/, '/exercicios'],
    [/^\/exercicios\/?$/, '/plano'],
    [/^\/amigos\/.+/, '/amigos'],
    [/^\/convite\/.+/, '/amigos'],
    [/^\/avisos\/?$/, '/'],
    [/^\/ajustes\/?$/, '/voce'],
    [/^\/voce\/.+/, '/voce'],
    [/^\/mensagens\/?$/, '/voce'],
    [/^\/admin\/?$/, '/voce'],
  ];
  return rules.find(([re]) => re.test(pathname))?.[1] ?? null;
}

/** The swipe starts at the left edge and goes clearly sideways. */
export const EDGE_SWIPE = { edge: 24, distance: 70 } as const;

export function isBackSwipe(
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  const dx = end.x - start.x;
  const dy = Math.abs(end.y - start.y);
  return start.x <= EDGE_SWIPE.edge && dx >= EDGE_SWIPE.distance && dx > dy * 2;
}
