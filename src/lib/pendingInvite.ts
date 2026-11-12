/**
 * An invite opened before login. It waits in localStorage, not sessionStorage: the
 * login link in the e-mail opens a new tab, and a new account goes through the
 * onboarding first. Invites expire in 7 days on the server, so this does too.
 */
const KEY = 'anilha:pending-invite';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function savePendingInvite(code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // Private mode without storage: the code is still on screen to type later.
  }
}

export function readPendingInvite(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number };
    if (!code || !at || Date.now() - at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
