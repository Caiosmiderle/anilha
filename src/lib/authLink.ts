/**
 * Login by the link in the e-mail, as a fallback to the 6-digit code. Supabase sends
 * the person back to the site with the session in the URL hash. The hash is read
 * before the router runs (a redirect to /entrar would drop it) and removed from the
 * address bar right away, so the tokens never stay in history.
 *
 * The link is also kept in sessionStorage until the login finishes: when a new version
 * of the app takes over, the service worker reloads the page, and the login resumes
 * after the reload instead of being lost.
 */
export type AuthLink =
  { kind: 'session'; accessToken: string; refreshToken: string } | { kind: 'error'; code: string };

const KEY = 'anilha:auth-link';
const USER_KEY = 'anilha:user';

let memory: AuthLink | null = null;
let taken = false;

export function captureAuthLink(): void {
  const hash = window.location.hash;
  if (!hash.includes('access_token=') && !hash.includes('error')) return;
  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const error = params.get('error_code') ?? params.get('error');
  let link: AuthLink;
  if (accessToken && refreshToken) link = { kind: 'session', accessToken, refreshToken };
  else if (error) link = { kind: 'error', code: error };
  else return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  // Someone already signed in on this device: the link has nothing to do.
  if (localStorage.getItem(USER_KEY)) return;
  memory = link;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(link));
  } catch {
    // Without sessionStorage the link still works, it just does not survive a reload.
  }
}

/** A login link arrived and is not finished: the way in is the login screen, not the landing. */
export function hasAuthLink(): boolean {
  if (memory) return true;
  try {
    return sessionStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

/** The pending link, once per page load. It stays stored until finishAuthLink. */
export function takeAuthLink(): AuthLink | null {
  if (taken) return null;
  taken = true;
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthLink) : null;
  } catch {
    return null;
  }
}

export function finishAuthLink(): void {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
