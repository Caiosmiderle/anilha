import { rpc } from './client';
import { invalidateRemote, useRemote } from './remote';

/**
 * Messages to the person responsible for the app: problems, ideas and requests about
 * personal data (LGPD art. 18). The answer comes back here, within 15 days.
 */
export type TicketKind =
  | 'acesso'
  | 'correcao'
  | 'exclusao'
  | 'portabilidade'
  | 'compartilhamento'
  | 'revogacao'
  | 'privacidade'
  | 'problema'
  | 'sugestao'
  | 'outro';

export interface Ticket {
  id: string;
  kind: TicketKind;
  message: string;
  status: 'aberto' | 'respondido';
  answer: string | null;
  created_at: string;
  answered_at: string | null;
}

export const TICKET_LABEL: Record<TicketKind, string> = {
  acesso: 'Acesso aos meus dados',
  correcao: 'Corrigir dados',
  exclusao: 'Apagar dados',
  portabilidade: 'Levar meus dados',
  compartilhamento: 'Com quem meus dados são compartilhados',
  revogacao: 'Retirar um consentimento',
  privacidade: 'Privacidade',
  problema: 'Problema no app',
  sugestao: 'Sugestão',
  outro: 'Outro assunto',
};

/** Requests about personal data: legal deadline of 15 days (art. 19, II). */
export const PRIVACY_KINDS: TicketKind[] = [
  'acesso',
  'correcao',
  'exclusao',
  'portabilidade',
  'compartilhamento',
  'revogacao',
  'privacidade',
];

export function useMyTickets() {
  return useRemote<Ticket[]>('my_tickets', {});
}

export async function createTicket(kind: TicketKind, message: string): Promise<void> {
  await rpc('create_ticket', {
    p_kind: kind,
    p_message: message,
    p_version: __APP_VERSION__,
    // Sent only with problem reports, to find the bug; the server drops it otherwise.
    p_user_agent: kind === 'problema' ? navigator.userAgent.slice(0, 300) : null,
  });
  invalidateRemote('my_tickets');
}
