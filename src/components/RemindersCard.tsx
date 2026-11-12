import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useSync } from '../sync';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { Switch } from './PlanEditor';

type TimeKey = 'morning' | 'evening' | 'streak';
type FlagKey = 'brief' | 'lastCall';
type Row =
  | { key: TimeKey; kind: string; title: string; text: string; fallback: string }
  | { key: FlagKey; kind: string; title: string; text: string; fallback?: undefined };

/** `kind` is the server's name for the reminder (used for pausing). */
const ROWS: Row[] = [
  { key: 'brief', kind: 'brief', title: 'Morning brief', text: 'At wake-up: your must-dos and first time block' },
  { key: 'morning', kind: 'morning', title: 'Carried-over plans', text: 'Only if unfinished plans rolled onto today', fallback: '08:30' },
  { key: 'evening', kind: 'evening', title: 'Plan tomorrow', text: 'Only if tomorrow is still empty', fallback: '21:00' },
  { key: 'streak', kind: 'streak', title: 'Streak at risk', text: 'Only if habits are still open', fallback: '22:30' },
  { key: 'lastCall', kind: 'lastcall', title: 'Last call', text: '1 hour before bed, only if habits are open' },
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
            const paused = (reminders.paused ?? []).includes(r.kind);
            const unpause = () => ({ paused: (reminders.paused ?? []).filter((k) => k !== r.kind) });
            const isTime = r.fallback !== undefined;
            const value = isTime ? reminders[r.key as TimeKey] : null;
            const on = isTime ? !!value : reminders[r.key as FlagKey] !== false;
            return (
              <div key={r.key} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={`text-[15px] font-medium ${on ? '' : 'text-muted'}`}>{r.title}</div>
                    <div className="text-[12.5px] text-faint">{r.text}</div>
                  </div>
                  {isTime && value && (
                    <input
                      type="time"
                      value={value}
                      onChange={(e) => e.target.value && setReminders({ [r.key]: e.target.value, ...unpause() })}
                      className="tabular rounded-xl bg-surface-2 px-2.5 py-1.5 text-[15px] outline-none"
                      aria-label={`${r.title} time`}
                    />
                  )}
                  <Switch
                    on={on}
                    onChange={(v) => setReminders({ [r.key]: isTime ? (v ? r.fallback : null) : v, ...unpause() })}
                    label={r.title}
                  />
                </div>
                {paused && on && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gold/10 px-3 py-2 text-[12.5px]">
                    <span className="text-gold">Paused — ignored 3 days in a row.{isTime ? ' Try a different time?' : ''}</span>
                    <button onClick={() => setReminders(unpause())} className="shrink-0 font-semibold text-text underline underline-offset-2">
                      Resume
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <p className="pt-3 text-[12.5px] text-faint">Wording rotates so it stays fresh. Nudges are skipped when you're on track, and pause themselves if you keep ignoring them.</p>
        </div>
      )}
    </section>
  );
}
