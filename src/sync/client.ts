import type { SupabaseClient } from '@supabase/supabase-js';
import { currentStore, type CurrentStore } from '../data/store';
import { env } from '../lib/env';

let clientPromise: Promise<SupabaseClient> | null = null;

/** supabase-js loads lazily: the workout flow never waits for it. */
export function getClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(env.supabaseUrl, env.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'anilha-auth',
          flowType: 'implicit',
        },
      }),
    );
  }
  return clientPromise;
}

export class RpcError extends Error {
  code: string | undefined;
  status: number | undefined;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const client = await getClient();
  const { data, error, status } = await client.rpc(fn, args);
  if (error) throw new RpcError(error.message, error.code, status);
  return data as T;
}

/** A response belongs to the account that started it, even when login changes in flight. */
export class AccountChangedError extends Error {}

export async function accountRpc<T>(
  owner: CurrentStore,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const client = await getClient();
  const { data: auth } = await client.auth.getSession();
  if (currentStore() !== owner || auth.session?.user.id !== owner.userId)
    throw new AccountChangedError('A conta mudou. Tente novamente.');
  // Supabase normally reads the current token when sending. Freeze this account's
  // token so a switch between preparing and sending cannot upload to another user.
  const { data, error, status } = await client
    .rpc(fn, args)
    .setHeader('Authorization', `Bearer ${auth.session.access_token}`);
  if (currentStore() !== owner) throw new AccountChangedError('A conta mudou. Tente novamente.');
  if (error) throw new RpcError(error.message, error.code, status);
  return data as T;
}

export async function hasSession(): Promise<boolean> {
  const client = await getClient();
  const { data } = await client.auth.getSession();
  return Boolean(data.session);
}
