import { useEffect } from 'react';
import { useStore } from '../store';
import { useSync } from '../sync';
import { supabase } from './supabase';
import { dayStats } from './score';

/** Remove every app notification still showing in Notification Centre. Returns how many were cleared. */
export async function clearNotifications(): Promise<number> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const list = (await reg?.getNotifications?.()) ?? [];
    list.forEach((n) => n.close());
    return list.length;
  } catch {
    return 0;
  }
}

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/**
 * Home Screen icon badge = promises still open today (iOS 16.4+ PWAs).
 * Also tells the server the app was opened, so nudges that led to a visit
 * are not counted as ignored.
 */
export function useAppBadge(today: string) {
  const pending = useStore((s) => dayStats({ habits: s.habits, plans: s.plans, logs: s.logs, startDay: s.startDay }, today).pending);
  const show = useStore((s) => !!s.reminders.badge);
  const session = useSync((s) => s.session);

  useEffect(() => {
    const nav = navigator as BadgeNav;
    try {
      if (show && pending > 0) void nav.setAppBadge?.(pending)?.catch(() => {});
      else void nav.clearAppBadge?.()?.catch(() => {});
    } catch {
      /* not supported */
    }
  }, [pending, show]);

  // Opening the app clears Keep's notifications from Notification Centre.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void clearNotifications();
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    const seen = () => {
      if (document.visibilityState === 'visible') void supabase!.rpc('mark_notifications_acted').then(() => {}, () => {});
    };
    seen();
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, [session]);
}
