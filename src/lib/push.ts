import { env } from './env';

export type PushSupport =
  { ok: true } | { ok: false; reason: 'ios_browser' | 'unsupported' | 'denied' | 'no_server' };

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Web push on iOS only works from the home-screen app, iOS 16.4 or newer. */
export function pushSupport(): PushSupport {
  if (isIos() && !isStandalone()) return { ok: false, reason: 'ios_browser' };
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return { ok: false, reason: 'unsupported' };
  }
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  if (!env.vapidKey) return { ok: false, reason: 'no_server' };
  return { ok: true };
}

export const PUSH_REASON_TEXT: Record<Exclude<PushSupport, { ok: true }>['reason'], string> = {
  ios_browser:
    'No iPhone, lembretes só funcionam com o Anilha na tela de início (iOS 16.4 ou mais novo). Instale e ative por lá.',
  unsupported: 'Este navegador não recebe notificações. O resto do app funciona normal.',
  denied: 'As notificações estão bloqueadas nas configurações do navegador.',
  no_server: 'Este ambiente não tem servidor de lembretes. Eles funcionam no app publicado.',
};

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Asks permission (inside a tap) and registers this device for reminders. */
export async function subscribePush(): Promise<{
  endpoint: string;
  p256dh: string;
  auth: string;
} | null> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(env.vapidKey),
    }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

export async function unsubscribePush(): Promise<string | null> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
}

/**
 * Turns notifications on for this phone: permission (call it inside the tap, before any
 * await, or the browser refuses to ask) and the subscription on the server. ok also when
 * this build has no push server: the choice is saved and works in the published app.
 */
export async function enablePush(): Promise<{ ok: boolean; message: string | null }> {
  const support = pushSupport();
  if (!support.ok)
    return { ok: support.reason === 'no_server', message: PUSH_REASON_TEXT[support.reason] };
  try {
    const sub = await subscribePush();
    if (!sub)
      return {
        ok: false,
        message: 'Sem permissão, sem notificação. Dá para mudar depois nas configurações.',
      };
    const { rpc } = await import('../sync/client');
    await rpc('save_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
    });
    return { ok: true, message: null };
  } catch {
    return { ok: false, message: 'Não deu para ativar agora. Tente com conexão.' };
  }
}

/** Whether reminders can be offered here (the iPhone browser cannot receive them). */
export function canOfferReminders(): boolean {
  const support = pushSupport();
  return support.ok || support.reason === 'no_server';
}

/** The reminder goes some minutes before the workout: 06:00 gives 05:30. */
export function minutesBefore(time: string, minutes = 30): string {
  const [h, m] = time.split(':').map(Number);
  const total = ((((h ?? 0) * 60 + (m ?? 0) - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
