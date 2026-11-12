import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { dbName, ensureLibrary, openDb, type AnilhaDB } from '../data/db';
import { setCurrent } from '../data/store';
import { closeConsent, openConsent, refreshConsent } from '../sync/consent';
import { startSyncLoop, syncNow } from '../sync/sync';

const USER_KEY = 'anilha:user';

export interface Account {
  userId: string;
  email: string;
  db: AnilhaDB;
}

interface AccountApi {
  account: Account | null;
  ready: boolean;
  signIn(user: { id: string; email: string }): Promise<void>;
  signOut(opts?: { wipe?: boolean }): Promise<void>;
}

const Ctx = createContext<AccountApi | null>(null);

function readStoredUser(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; email?: string };
    return parsed.id && parsed.email ? { id: parsed.id, email: parsed.email } : null;
  } catch {
    return null;
  }
}

async function openAccount(user: { id: string; email: string }): Promise<Account> {
  const db = openDb(user.id);
  await db.open();
  await ensureLibrary(db, user.id);
  setCurrent({ db, userId: user.id });
  return { userId: user.id, email: user.email, db };
}

/**
 * The account opens from local storage, so the app starts offline. Login and sync
 * only need the network when they actually run.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredUser();
    if (!stored) {
      setReady(true);
      return;
    }
    openAccount(stored)
      .then(setAccount)
      .catch((err: unknown) => console.error(err))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!account) return;
    void openConsent(account.db);
    const stop = startSyncLoop();
    const online = () => void refreshConsent();
    window.addEventListener('online', online);
    return () => {
      stop();
      window.removeEventListener('online', online);
      closeConsent();
    };
  }, [account]);

  const signIn = useCallback(async (user: { id: string; email: string }) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const acc = await openAccount(user);
    setAccount(acc);
    await syncNow();
  }, []);

  const signOut = useCallback(
    async (opts: { wipe?: boolean } = {}) => {
      const current = account;
      localStorage.removeItem(USER_KEY);
      setCurrent(null);
      setAccount(null);
      try {
        const { getClient } = await import('../sync/client');
        const client = await getClient();
        await client.auth.signOut({ scope: 'local' });
      } catch {
        // Offline sign out still clears the local session.
      }
      if (current && opts.wipe) {
        current.db.close();
        const { default: Dexie } = await import('dexie');
        await Dexie.delete(dbName(current.userId));
      }
    },
    [account],
  );

  const value = useMemo(
    () => ({ account, ready, signIn, signOut }),
    [account, ready, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccountApi(): AccountApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('AccountProvider ausente');
  return v;
}

export function useAccount(): Account {
  const { account } = useAccountApi();
  if (!account) throw new Error('Sem conta aberta');
  return account;
}
