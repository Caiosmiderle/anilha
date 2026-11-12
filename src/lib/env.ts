export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  vapidKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '',
  /** Local server only: shows the login code on screen instead of an email. */
  showDevCode: import.meta.env.VITE_SHOW_DEV_CODE === '1',
};

export function backendConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseKey);
}
