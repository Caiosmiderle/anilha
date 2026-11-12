import { useEffect, useState } from 'react';
import { addDays } from '../engine/dates';
import { useToday } from '../data/hooks';
import { useRemote } from './remote';
import type { InboxItem } from './social';

/**
 * The inbox: the last 30 days from the server. What was read is remembered on this
 * device: everything up to "Marcar tudo como lido", and after it each item touched (opened,
 * answered). Opening the list alone does not read anything.
 */
const SEEN_KEY = 'anilha:avisos-vistos';
const READ_KEY = 'anilha:avisos-lidos';
const SEEN_EVENT = 'anilha:avisos-vistos';

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function readKeys(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/** One item, the same across reloads. */
export function inboxKey(item: InboxItem): string {
  const ref = 'id' in item ? item.id : 'actor_id' in item ? item.actor_id : '';
  return `${item.kind}:${item.at}:${ref ?? ''}`;
}

/** Everything until now is read. */
export function markInboxSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    localStorage.removeItem(READ_KEY);
  } catch {
    // Without storage the badge just stays until the next visit.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** One item touched: opened or answered. */
export function markInboxItemRead(key: string): void {
  try {
    const keys = [key, ...readKeys().filter((k) => k !== key)].slice(0, 300);
    localStorage.setItem(READ_KEY, JSON.stringify(keys));
  } catch {
    // Without storage it stays new.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function useInbox() {
  const today = useToday();
  const since = `${addDays(today, -30)}T00:00:00Z`;
  const remote = useRemote<InboxItem[]>('inbox', { p_since: since });
  const [seen, setSeen] = useState(readSeen);
  const [read, setRead] = useState(() => new Set(readKeys()));
  const { refresh } = remote;

  useEffect(() => {
    const update = () => {
      setSeen(readSeen());
      setRead(new Set(readKeys()));
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener(SEEN_EVENT, update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(SEEN_EVENT, update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  const items = Array.isArray(remote.data) ? remote.data : [];
  const isUnread = (i: InboxItem) =>
    !(seen && new Date(i.at).getTime() <= new Date(seen).getTime()) && !read.has(inboxKey(i));
  const unread = items.filter(isUnread).length;
  return { ...remote, items, unread, isUnread };
}
