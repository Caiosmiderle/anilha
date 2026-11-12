import type { ReminderSettings } from '../engine/types';
import { backendConfigured } from '../lib/env';
import { rpc } from './client';

/**
 * Notification at the end of a rest, for when the phone is locked. The phone tells the
 * server when the rest ends; a new rest replaces it, skipping the rest cancels it, and
 * it is also cancelled seconds before the end if the app is on screen (the chime there
 * is enough).
 */
let scheduledEnd: number | null = null;

export function restAlertsWanted(settings: ReminderSettings | null | undefined): boolean {
  return (
    settings?.rest !== false &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    backendConfigured()
  );
}

export async function scheduleRestAlert(endMs: number, title: string, body: string) {
  if (scheduledEnd === endMs || !navigator.onLine) return;
  scheduledEnd = endMs;
  try {
    await rpc('schedule_rest_alert', {
      p_due: new Date(endMs).toISOString(),
      p_title: title,
      p_body: body,
    });
  } catch {
    scheduledEnd = null;
  }
}

export async function cancelRestAlert() {
  if (scheduledEnd == null) return;
  scheduledEnd = null;
  try {
    await rpc('cancel_rest_alert');
  } catch {
    // Offline: the server sends it anyway; one extra notification, nothing lost.
  }
}
