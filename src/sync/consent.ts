import { useSyncExternalStore } from 'react';
import { getMeta, setMeta, type AnilhaDB } from '../data/db';
import { backendConfigured } from '../lib/env';
import { rpc } from './client';
import { syncNow } from './sync';

/**
 * Consent (LGPD). The terms and the privacy policy are accepted once per version, before
 * anything else. Health data (weight, waist, pain, joints to spare) has its own consent:
 * optional, revocable and never in the way. Until the person answers, it is a pending
 * item in Você (a red dot on the tab) and health features stay off. The server keeps the
 * history (proof of consent); the phone keeps the last answer, so the app opens offline.
 */
export const TERMS_VERSION = '2026-10-19';
export const HEALTH_VERSION = '2026-10-19';

export interface Choice {
  version: string;
  granted: boolean;
  at: string;
}

export interface ConsentState {
  termos: Choice | null;
  saude: Choice | null;
}

export interface ConsentSnapshot {
  /** loading: reading the phone; ask: the terms screen is due; ok: carry on. */
  status: 'loading' | 'ask' | 'ok';
  /** Health features on: only with consent. */
  health: boolean;
  /** Never answered about health data: shows as a pending item in Você. */
  healthPending: boolean;
  state: ConsentState | null;
}

const META_KEY = 'consent';
let owner: AnilhaDB | null = null;
const LOADING: ConsentSnapshot = {
  status: 'loading',
  health: false,
  healthPending: false,
  state: null,
};
let snap: ConsentSnapshot = LOADING;
const listeners = new Set<() => void>();

function publish(next: ConsentSnapshot): void {
  snap = next;
  listeners.forEach((l) => l());
}

function derive(state: ConsentState | null): ConsentSnapshot {
  // Without a server (local demo) there is no one to keep the data: nothing to ask.
  if (!backendConfigured()) return { status: 'ok', health: true, healthPending: false, state };
  // Unknown (first open after the update, offline): do not lock the person out of their
  // workouts; health features stay off until the answer comes.
  if (!state) return { status: 'ok', health: false, healthPending: false, state };
  const ask = state.termos?.version !== TERMS_VERSION || !state.termos.granted;
  return {
    status: ask ? 'ask' : 'ok',
    health: state.saude?.granted === true,
    healthPending: state.saude === null,
    state,
  };
}

export function useConsent(): ConsentSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
  );
}

/** Health features (body tab, pain, joints to spare) are on. */
export function useHealthOn(): boolean {
  return useConsent().health;
}

/** Same, outside React (imports). */
export function healthOn(): boolean {
  return snap.health;
}

/** Called when an account opens: last answer from the phone, then the server's. */
export async function openConsent(d: AnilhaDB): Promise<void> {
  owner = d;
  publish(LOADING);
  const cached = (await getMeta<ConsentState>(d, META_KEY)) ?? null;
  if (owner !== d) return;
  if (cached) publish(derive(cached));
  // A gym connection that hangs must not hold the app on the splash.
  else
    setTimeout(() => {
      if (owner === d && snap.status === 'loading') publish(derive(null));
    }, 4000);
  await refreshConsent();
}

export function closeConsent(): void {
  owner = null;
  publish(LOADING);
}

/** Asks the server again. Health consent revoked on another phone: clean this one too. */
export async function refreshConsent(): Promise<void> {
  const d = owner;
  if (!d) return;
  if (!backendConfigured()) {
    publish(derive(null));
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline');
    const state = await rpc<ConsentState>('consent_state');
    if (owner !== d) return;
    const before = snap.state?.saude?.granted;
    await setMeta(d, META_KEY, state);
    if (state.saude?.granted === false && before !== false) await wipeHealthLocal(d);
    publish(derive(state));
  } catch {
    if (owner === d && snap.status === 'loading') publish(derive(null));
  }
}

async function record(kind: 'termos' | 'saude', granted: boolean): Promise<ConsentState> {
  return rpc<ConsentState>('record_consent', {
    p_kind: kind,
    p_version: kind === 'termos' ? TERMS_VERSION : HEALTH_VERSION,
    p_granted: granted,
  });
}

async function apply(d: AnilhaDB, state: ConsentState): Promise<void> {
  await setMeta(d, META_KEY, state);
  if (state.saude?.granted === false) await wipeHealthLocal(d);
  if (owner === d) publish(derive(state));
  if (state.saude?.granted === false) void syncNow();
}

/** The terms screen: terms and age, required to use the app. */
export async function acceptTerms(): Promise<void> {
  const d = owner;
  if (!d) throw new Error('Sem conta aberta');
  await apply(d, await record('termos', true));
}

/** Privacy settings: turn health data on or off. Off deletes it here and on the server. */
export async function setHealthConsent(granted: boolean): Promise<void> {
  const d = owner;
  if (!d) throw new Error('Sem conta aberta');
  await apply(d, await record('saude', granted));
}

/** How much health data this phone has, to say what a refusal deletes. */
export async function countHealthLocal(d: AnilhaDB): Promise<number> {
  const [body, pain, spare, items, profiles] = await Promise.all([
    d.body_logs.filter((r) => !r.deleted).count(),
    d.pain_reports.filter((r) => !r.deleted).count(),
    d.day_overrides.filter((r) => !r.deleted && r.action === 'spare_joint').count(),
    d.session_items.filter((r) => !r.deleted && r.pain_joint != null).count(),
    d.profiles.filter((p) => (p.onboarding?.spare_joints?.length ?? 0) > 0).count(),
  ]);
  return body + pain + spare + items + profiles;
}

/**
 * Removes health data from this phone. The server already deleted its copy
 * (record_consent); nothing here goes up again.
 */
export async function wipeHealthLocal(d: AnilhaDB): Promise<void> {
  await d.transaction(
    'rw',
    [d.body_logs, d.pain_reports, d.day_overrides, d.session_items, d.profiles, d.outbox],
    async () => {
      await d.body_logs.clear();
      await d.pain_reports.clear();
      const spare = await d.day_overrides.filter((o) => o.action === 'spare_joint').primaryKeys();
      await d.day_overrides.bulkDelete(spare);
      await d.session_items.filter((i) => i.pain_joint != null).modify({ pain_joint: null });
      await d.profiles.toCollection().modify((p) => {
        if (p.onboarding?.spare_joints?.length)
          p.onboarding = { ...p.onboarding, spare_joints: [] };
      });
      const gone = new Set(spare);
      const queued = await d.outbox
        .filter(
          (e) =>
            e.table === 'body_logs' ||
            e.table === 'pain_reports' ||
            (e.table === 'day_overrides' && gone.has(e.id)),
        )
        .primaryKeys();
      await d.outbox.bulkDelete(queued);
    },
  );
}
