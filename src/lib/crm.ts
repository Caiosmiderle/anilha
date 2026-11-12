/**
 * Who needs attention, from the management panel's account list: segments by training
 * activity and the funnel from sign-up to a second week of training.
 */
import { addDays, diffDays } from '../engine/dates';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  plan: boolean;
  workouts: number;
  cardio: number;
  first_day: string | null;
  last_day: string | null;
  weeks: number;
  friends: number;
  push: boolean;
  /** Health consent: null when never answered. */
  health: boolean | null;
  terms: string | null;
  open_tickets: number;
  admin: boolean;
}

export type Segment = 'novo' | 'ativo' | 'risco' | 'inativo' | 'sem_treino';

export const SEGMENTS: { value: Segment; label: string; one: string }[] = [
  { value: 'novo', label: 'Novos', one: 'Novo' },
  { value: 'ativo', label: 'Ativos', one: 'Ativo' },
  { value: 'risco', label: 'Em risco', one: 'Em risco' },
  { value: 'inativo', label: 'Inativos', one: 'Inativo' },
  { value: 'sem_treino', label: 'Nunca treinaram', one: 'Nunca treinou' },
];

/** The account's creation day in Brazil (the panel's calendar). */
export function brDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function segmentOf(u: AdminUser, today: string): Segment {
  if (brDay(u.created_at) > addDays(today, -7)) return 'novo';
  if (!u.last_day) return 'sem_treino';
  const idle = diffDays(u.last_day, today);
  if (idle < 7) return 'ativo';
  if (idle <= 21) return 'risco';
  return 'inativo';
}

/** From sign-up to coming back: each step counts the accounts that reached it. */
export function funnel(users: AdminUser[], today: string): { label: string; value: number }[] {
  const trained = users.filter((u) => u.workouts + u.cardio > 0);
  return [
    { label: 'Criaram conta', value: users.length },
    { label: 'Montaram o plano', value: users.filter((u) => u.plan).length },
    { label: 'Primeiro treino', value: trained.length },
    { label: 'Duas semanas', value: users.filter((u) => u.weeks >= 2).length },
    {
      label: 'Ativos (7 dias)',
      value: trained.filter((u) => u.last_day && diffDays(u.last_day, today) < 7).length,
    },
  ];
}
