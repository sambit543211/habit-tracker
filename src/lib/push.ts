import { supabase } from './supabase';

export type PushState =
  | 'unsupported' // browser can't do push at all
  | 'needs-install' // iPhone in Safari: must add to Home Screen first
  | 'denied'
  | 'off'
  | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const { data } = await supabase!.auth.getUser();
  if (!data.user || !json.keys) throw new Error('Not signed in');
  const { error } = await supabase!.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, user_id: data.user.id, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

/** The server generates its own key pair; only the public half is readable. */
async function vapidPublicKey(): Promise<string> {
  const { data, error } = await supabase!.rpc('get_vapid_public_key');
  if (error || !data) throw new Error("Reminders aren't set up on the server yet.");
  return data as string;
}

/** Must be called from a tap (iOS requires a user gesture). */
export async function enablePush(): Promise<PushState> {
  const keyPromise = vapidPublicKey();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(await keyPromise) });
  }
  await save(sub);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return 'off';
}

/** Re-save the subscription on launch (endpoints can rotate). */
export async function refreshPush() {
  try {
    if ((await pushState()) !== 'on') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch {
    /* offline or signed out — try next launch */
  }
}
