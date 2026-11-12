import type { AdminUser } from '../lib/crm';
import { rpc } from './client';
import { useRemote } from './remote';
import type { Ticket } from './tickets';

/**
 * Management panel (only for accounts in public.admins; the server checks every call).
 * Reads go straight to the server: nothing of it is kept on the phone.
 */
export interface AdminOverview {
  accounts: number;
  new_7d: number;
  new_30d: number;
  active_7d: number;
  active_30d: number;
  workouts_7d: number;
  cardio_7d: number;
  push: number;
  terms_ok: number;
  health_on: number;
  health_off: number;
  tickets_open: number;
  privacy_open: number;
  privacy_due: string | null;
  errors_24h: number;
  error_kinds_7d: number;
  routines_30d: number;
  routines_added_30d: number;
  signups: { day: string; value: number }[];
  weekly_active: { day: string; value: number }[];
}

export interface AdminTicket extends Ticket {
  user_id: string;
  email: string;
  name: string | null;
  app_version: string | null;
  user_agent: string | null;
}

export interface AdminError {
  message: string;
  count: number;
  people: number;
  first_at: string;
  last_at: string;
  version: string | null;
  url: string | null;
  stack: string | null;
}

export interface AdminUserDetail {
  weeks: { day: string; treino: number; cardio: number }[];
  tickets: { id: string; kind: Ticket['kind']; status: Ticket['status']; created_at: string }[];
  consents: { kind: 'termos' | 'saude'; version: string; granted: boolean; at: string }[];
  errors: {
    message: string;
    count: number;
    last_at: string;
    version: string | null;
    url: string | null;
  }[];
  /** Fichas the team sent to this person. */
  routines: {
    id: string;
    name: string;
    status: 'pending' | 'accepted' | 'declined';
    created_at: string;
  }[];
}

/** Shows the panel link; false for everyone else. */
export function useIsAdmin(): boolean {
  return useRemote<boolean>('is_admin', {}).data === true;
}

export function useAdminOverview(today: string) {
  return useRemote<AdminOverview>('admin_overview', { p_today: today });
}

export function useAdminUsers() {
  return useRemote<AdminUser[]>('admin_users', {});
}

export function useAdminUser(id: string | null, today: string) {
  return useRemote<AdminUserDetail>('admin_user', { p_id: id, p_today: today }, id !== null);
}

export function useAdminTickets() {
  return useRemote<AdminTicket[]>('admin_tickets', {});
}

/** One request to the assistant, as the queue shows it. */
export interface AgentRequest {
  id: string;
  at: string;
  name: string | null;
  pedido: string;
  categoria: string;
  nivel: 0 | 1 | 2 | 3;
  resultado: string;
  avisos: number;
  status: 'novo' | 'planejado' | 'feito' | 'nao_vamos';
}

export function useAgentRequests() {
  return useRemote<AgentRequest[]>('admin_agent_requests', {});
}

/** "feito" tells who asked, in the inbox. */
export async function setAgentRequestStatus(id: string, status: AgentRequest['status']) {
  await rpc('admin_agent_request_status', { p_id: id, p_status: status });
}

export function useAdminErrors() {
  return useRemote<AdminError[]>('admin_errors', {});
}

export async function answerTicket(id: string, answer: string): Promise<void> {
  await rpc('admin_answer_ticket', { p_id: id, p_answer: answer });
}

/** Everyone, or only who set up a plan and never trained. */
export type Audience = 'todos' | 'sem_treino';

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  audience?: Audience;
}

export interface AdminLibraryRoutine {
  id: string;
  name: string;
  description: string | null;
  exercises_count: number;
  adds: number;
  created_at: string;
}

export function useAdminAnnouncements() {
  return useRemote<AdminAnnouncement[]>('admin_announcements', {});
}

export function useAdminLibrary() {
  return useRemote<AdminLibraryRoutine[]>('admin_library', {});
}

/** News for the inbox of an audience; with push, also a notification to who has them on. */
export async function announce(
  title: string,
  body: string,
  url: string | null,
  push: boolean,
  audience: Audience = 'todos',
): Promise<void> {
  await rpc('admin_announce', {
    p_title: title,
    p_body: body,
    p_url: url,
    p_push: push,
    p_audience: audience,
  });
}

/** How many accounts an audience reaches now. */
export function useAudienceSize(audience: Audience) {
  return useRemote<number>('admin_audience_size', { p_audience: audience });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await rpc('admin_delete_announcement', { p_id: id });
}

export async function publishRoutine(
  name: string,
  description: string,
  payload: { items: unknown[]; exercises: unknown[] },
): Promise<void> {
  await rpc('admin_publish_routine', {
    p_name: name,
    p_description: description,
    p_items: payload.items,
    p_exercises: payload.exercises,
  });
}

export async function unpublishRoutine(id: string): Promise<void> {
  await rpc('admin_unpublish_routine', { p_id: id });
}
