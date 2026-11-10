import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useSync } from '../sync';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import type { Reminders } from '../types';

const ROWS: { key: keyof Omit<Reminders, 'enabled'>; title: string; text: string; fallback: string }[] = [
  { key: 'morning', title: 'Close the loop', text: "Only if yesterday has open items", fallback: '08:30' },
  { key: 'evening', title: 'Plan tomorrow', text: 'Only if tomorrow is still empty', fallback: '21:00' },
  { key: 'streak', title: 'Streak at risk', text: 'Only if habits are still open', fallback: '22:30' },
];

/** Notification permission + nudge settings (Habits tab). */
export function RemindersCard() {
  const session = useSync((s) => s.session);
  const reminders = useStore((s) => s.reminders);
  const setReminders = useStore((s) => s.setReminders);
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
          <b className="text-text">Add to Home Screen</b>, then open Keep from its icon.
        </p>
      )}
      {state === 'unsupported' && (
        <p className="mt-2 text-[14px] text-muted">This browser can't show notifications. On iPhone you need iOS 16.4 or later.</p>
      )}
      {state === 'denied' && (
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Notifications are blocked. Turn them on in <b className="text-text">Settings → Notifications → Keep</b>, then come back.
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
          {ROWS.map((r) => {
            const value = reminders[r.key];
            return (
              <div key={r.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] font-medium ${value ? '' : 'text-muted'}`}>{r.title}</div>
                  <div className="text-[12.5px] text-faint">{r.text}</div>
                </div>
                {value && (
                  <input
                    type="time"
                    value={value}
                    onChange={(e) => e.target.value && setReminders({ [r.key]: e.target.value })}
                    className="tabular rounded-xl bg-surface-2 px-2.5 py-1.5 text-[15px] outline-none"
                    aria-label={`${r.title} time`}
                  />
                )}
                <Switch on={!!value} onChange={(on) => setReminders({ [r.key]: on ? r.fallback : null })} label={r.title} />
              </div>
            );
          })}
          <p className="pt-3 text-[12.5px] text-faint">Set a time on any habit to get a nudge for it too. Nudges are skipped when you're on track.</p>
        </div>
      )}
    </section>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${on ? 'bg-habit' : 'bg-surface-3'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        className="absolute top-[3px] size-6 rounded-full bg-white shadow"
        style={{ left: on ? 23 : 3 }}
      />
    </button>
  );
}
