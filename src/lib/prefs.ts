import { useEffect, useState } from 'react';

/**
 * Preferences of this device, not of the account: a phone at the gym and a computer at
 * home can want different things (theme, sound). Kept in localStorage.
 */
export type ThemePref = 'auto' | 'light' | 'dark';
export type RestAlertPref = 'sound' | 'vibrate' | 'silent';

export interface DevicePrefs {
  theme: ThemePref;
  restAlert: RestAlertPref;
  keepAwake: boolean;
  /** The workout opens in focus mode: the clock and one big button. */
  focusMode: boolean;
}

const KEY = 'anilha:ajustes';
const EVENT = 'anilha:ajustes';
const DEFAULTS: DevicePrefs = {
  theme: 'auto',
  restAlert: 'sound',
  keepAwake: true,
  focusMode: false,
};

export function readPrefs(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DevicePrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function setPrefs(changes: Partial<DevicePrefs>): void {
  const next = { ...readPrefs(), ...changes };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Without storage the choice lasts until the app closes.
  }
  applyTheme(next.theme);
  window.dispatchEvent(new Event(EVENT));
}

export function usePrefs(): DevicePrefs {
  const [prefs, set] = useState(readPrefs);
  useEffect(() => {
    const update = () => set(readPrefs());
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return prefs;
}

const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

/** Explicit choice goes on <html data-theme>; automatic follows the system through CSS. */
export function applyTheme(theme: ThemePref = readPrefs().theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const isDark = theme === 'dark' || (theme === 'auto' && dark());
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#0f1012' : '#fafafa');
}

/** Runs before the first paint, and again when the system theme changes. */
export function initTheme(): void {
  applyTheme();
  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => applyTheme());
}
