import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore, useUI } from '../store';
import { useSync } from '../sync';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { Switch } from './Switch';
import { clearNotifications } from '../lib/useAppBadge';
import { APP_NAME } from '../config';

/** Notification permission + nudge settings (Habits tab). */
export function RemindersCard() {
  const session = useSync((s) => s.session);
  const reminders = useStore((s) => s.reminders);
  const setReminders = useStore((s) => s.setReminders);
  const showToast = useUI((s) => s.showToast);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  if (!session || state === null) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
    setBusy(false);
  };

  return (
    <section className="card mt-2 px-4 py-4">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Reminders</h2>

      {state === 'needs-install' && (
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          On iPhone, notifications only work from the Home Screen app. In Safari tap <b className="text-text">Share</b> →{' '}
          <b className="text-text">Add to Home Screen</b>, then open {APP_NAME} from its icon.
        </p>
      )}
      {state === 'unsupported' && (
        <p className="mt-2 text-[14px] text-muted">This browser can't show notifications. On iPhone you need iOS 16.4 or later.</p>
      )}
      {state === 'denied' && (
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Notifications are blocked. Turn them on in <b className="text-text">Settings → Notifications → {APP_NAME}</b>, then come back.
        </p>
      )}
      {(state === 'on' || state === 'off') && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-[15px] font-medium">{state === 'on' ? 'Notifications on' : 'Notifications off'}</div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={busy}
            onClick={() => void toggle()}
            className={`rounded-full px-4 py-2 text-[14px] font-semibold disabled:opacity-40 ${
              state === 'on' ? 'bg-surface-2 text-muted' : 'bg-plan text-white'
            }`}
          >
            {busy ? '…' : state === 'on' ? 'Turn off' : 'Turn on'}
          </motion.button>
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-miss">{error}</p>}

      {state === 'on' && (
        <div className="mt-3 divide-y divide-line">
          {/* Your two daily reminders — each one only fires when there's something to say */}
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className={`text-[15px] font-medium ${reminders.brief !== false ? '' : 'text-muted'}`}>🌅 Morning summary</div>
              <div className="text-[12.5px] text-faint">When you wake up: today's must-dos and first plan</div>
            </div>
            <Switch on={reminders.brief !== false} onChange={(v) => setReminders({ brief: v })} label="Morning summary" />
          </div>
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className={`text-[15px] font-medium ${reminders.evening ? '' : 'text-muted'}`}>🌙 Evening check-in</div>
              <div className="text-[12.5px] text-faint">What's still open, and a nudge to plan tomorrow</div>
            </div>
            {reminders.evening && (
              <input
                type="time"
                value={reminders.evening}
                onChange={(e) => e.target.value && setReminders({ evening: e.target.value })}
                className="tabular rounded-xl bg-surface-2 px-2.5 py-1.5 text-[15px] outline-none"
                aria-label="Evening check-in time"
              />
            )}
            <Switch on={!!reminders.evening} onChange={(v) => setReminders({ evening: v ? '21:00' : null })} label="Evening check-in" />
          </div>
          <p className="py-3 text-[12.5px] text-faint">⏰ Habits and plans can have their own reminder time — set it when you add or edit them.</p>
          {/* Circle */}
          <div className="py-3">
            <div className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">From your circles</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className={`text-[15px] font-medium ${reminders.nudges !== false ? '' : 'text-muted'}`}>👋 Nudges</div>
                <div className="text-[12.5px] text-faint">Every nudge, any time except 12 am – 8 am</div>
              </div>
              <Switch on={reminders.nudges !== false} onChange={(v) => setReminders({ nudges: v })} label="Nudges" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className={`text-[15px] font-medium ${reminders.cheers !== false ? '' : 'text-muted'}`}>👏 Cheers</div>
                <div className="text-[12.5px] text-faint">At most one a day; the rest show in the app</div>
              </div>
              <Switch on={reminders.cheers !== false} onChange={(v) => setReminders({ cheers: v })} label="Cheers" />
            </div>
            <p className="mt-2 text-[12.5px] text-faint">🌙 Quiet hours: nobody can buzz you between 12 am and 8 am — nudges wait until 8.</p>
          </div>
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className={`text-[15px] font-medium ${reminders.badge ? '' : 'text-muted'}`}>Number on app icon</div>
              <div className="text-[12.5px] text-faint">Red count of habits and plans still open today</div>
            </div>
            <Switch on={!!reminders.badge} onChange={(v) => setReminders({ badge: v })} label="Number on app icon" />
          </div>
          <div className="py-3">
            <button
              onClick={async () => {
                const n = await clearNotifications();
                showToast(n ? `Cleared ${n} notification${n === 1 ? '' : 's'}` : 'No notifications to clear', { tone: 'plan' });
              }}
              className="min-h-11 w-full rounded-2xl bg-surface-2 text-[14px] font-semibold"
            >
              Clear notifications
            </button>
          </div>

        </div>
      )}
    </section>
  );
}
