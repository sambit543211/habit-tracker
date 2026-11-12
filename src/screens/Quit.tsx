import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useStore, useUI } from '../store';
import { addDays, formatDay, range } from '../lib/date';
import { HEALTH_MILESTONES, TRIGGER_LABEL, fmtElapsed, limitOn, quitStats, smokedOn, triggerCounts } from '../lib/quit';
import { SMOKE_TRIGGERS, type QuitSettings, type SmokeTrigger } from '../types';
import { Sheet } from '../components/Sheet';
import { Ring } from '../components/Ring';
import { haptic } from '../lib/feedback';

const defaultCurrency = () => (/Calcutta|Kolkata/.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? '₹' : '$');
const money = (n: number, cur: string) => `${cur}${Math.round(n).toLocaleString()}`;

/** Quit-smoking mode: one screen to log, ride out cravings and see progress. */
export function Quit({ today }: { today: string }) {
  const quit = useStore((s) => s.profile.quit);
  const [editing, setEditing] = useState(false);
  if (!quit || editing) return <QuitSetup today={today} existing={quit} onDone={() => setEditing(false)} />;
  return <QuitDashboard today={today} q={quit} onEdit={() => setEditing(true)} />;
}

function QuitDashboard({ today, q, onEdit }: { today: string; q: QuitSettings; onEdit: () => void }) {
  const smokes = useStore((s) => s.smokes);
  const { logSmoke, removeSmoke } = useStore();
  const showToast = useUI((s) => s.showToast);
  const [now, setNow] = useState(Date.now());
  const [picking, setPicking] = useState(false);
  const [craving, setCraving] = useState(false);
  const cur = (q as QuitSettings & { currency?: string }).currency ?? defaultCurrency();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const s = useMemo(() => quitStats(q, smokes, today, now), [q, smokes, today, now]);
  const triggers = useMemo(() => triggerCounts(smokes.filter((e) => e.day >= addDays(today, -29))), [smokes, today]);
  const last14 = range(addDays(today, -13), today);
  const maxBar = Math.max(q.baseline, ...last14.map((d) => smokedOn(smokes, d)), 1);
  const hours = s.smokeFreeMs / 3_600_000;
  const nextMilestone = HEALTH_MILESTONES.find((m) => m.hours > hours);
  const over = s.today > s.limit;
  const zeroDay = s.limit === 0;

  const smoke = (trigger?: SmokeTrigger) => {
    haptic(10);
    const id = logSmoke('smoked', trigger);
    setPicking(false);
    showToast(zeroDay ? 'Logged. A slip is data, not the end.' : 'Logged', { tone: 'miss', undo: () => removeSmoke(id) });
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between pt-1">
        <div>
          <div className="text-[12px] font-semibold tracking-[0.08em] text-habit uppercase">
            {s.quitReached ? 'Smoke-free' : q.mode === 'cold' ? `Quit day in ${s.daysToQuit} day${s.daysToQuit === 1 ? '' : 's'}` : `Cutting down · ${s.daysToQuit} days to zero`}
          </div>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">Quit smoking</h1>
        </div>
        <button onClick={onEdit} className="min-h-11 rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-muted">
          Settings
        </button>
      </header>

      {/* Hero: time since last cigarette + today's count */}
      <section className="card hero flex items-center gap-4 px-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">Since your last cigarette</div>
          <div className="tabular mt-1 text-[40px] leading-none font-bold tracking-[-0.04em]">{fmtElapsed(s.smokeFreeMs)}</div>
          <p className="mt-1.5 text-[13px] text-muted">
            {nextMilestone ? `Next: ${nextMilestone.title} — ${nextMilestone.text.toLowerCase()}` : 'Every milestone reached. Remarkable.'}
          </p>
        </div>
        <Ring
          value={zeroDay ? (s.today === 0 ? 1 : 0) : Math.min(1, s.today / Math.max(1, s.limit))}
          color={over || (zeroDay && s.today > 0) ? 'var(--miss)' : zeroDay ? 'var(--habit)' : 'var(--gold)'}
          size={88}
          stroke={9}
          label={`Today: ${s.today} smoked${zeroDay ? '' : ` of a limit of ${s.limit}`}`}
        >
          <div className="text-center leading-none">
            <div className="tabular text-[22px] font-bold">{s.today}</div>
            <div className="mt-0.5 text-[12px] text-muted">{zeroDay ? 'today' : `of ${s.limit}`}</div>
          </div>
        </Ring>
      </section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setCraving(true)}
          className="min-h-14 rounded-2xl bg-habit px-3 text-[15px] font-semibold text-black/85 shadow-[0_6px_20px_color-mix(in_srgb,var(--habit)_35%,transparent)]"
        >
          🌊 I have a craving
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setPicking(true)}
          className="min-h-14 rounded-2xl border border-line-strong/50 bg-surface px-3 text-[15px] font-semibold"
        >
          🚬 I smoked one
        </motion.button>
      </div>
      {over && !zeroDay && (
        <p className="-mt-1 px-1 text-[13px] text-gold">
          {s.today - s.limit} over today's limit. Tomorrow is a fresh count — try the craving timer first next time.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Money saved" value={money(s.saved, cur)} />
        <Stat label="Not smoked" value={String(s.avoided)} />
        <Stat label="Smoke-free days" value={`${s.smokeFreeDays30}/${s.days30}`} sub="last 30 days" />
        <Stat label="Cravings beaten" value={String(s.cravingsBeaten)} />
      </div>

      <section className="card px-4 py-4">
        <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">Last 14 days</h2>
        <div className="flex h-24 items-end gap-1.5" role="img" aria-label="Cigarettes per day for the last 14 days">
          {last14.map((d) => {
            const n = d >= q.startDay ? smokedOn(smokes, d) : null;
            const lim = limitOn(q, d);
            return (
              <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <motion.div
                  className="w-full rounded-md"
                  initial={{ height: 0 }}
                  animate={{ height: n === null ? 3 : n === 0 ? 6 : `${(n / maxBar) * 100}%` }}
                  style={{ background: n === null ? 'var(--track)' : n === 0 ? 'var(--habit)' : n > lim ? 'var(--miss)' : 'var(--gold)' }}
                />
                <span className={`text-[12px] ${d === today ? 'font-bold text-text' : 'text-faint'}`}>{formatDay(d, { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-faint">Green = smoke-free · amber = within limit · red = over</p>
      </section>

      {triggers.length > 0 && (
        <section className="card px-4 py-4">
          <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">Your triggers · 30 days</h2>
          <div className="flex flex-col gap-2.5">
            {triggers.slice(0, 5).map(([t, n]) => (
              <div key={t}>
                <div className="mb-1 flex justify-between text-[13.5px]">
                  <span>
                    {TRIGGER_LABEL[t].emoji} {TRIGGER_LABEL[t].label}
                  </span>
                  <span className="tabular text-muted">{n}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full rounded-full bg-gold" initial={{ width: 0 }} animate={{ width: `${(n / triggers[0][1]) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Plan for “{TRIGGER_LABEL[triggers[0][0]].label.toLowerCase()}”: decide now what you'll do instead when it comes up.
          </p>
        </section>
      )}

      <section className="card px-4 py-4">
        <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">What your body is doing</h2>
        <ul className="flex flex-col">
          {HEALTH_MILESTONES.map((m) => {
            const reached = hours >= m.hours;
            return (
              <li key={m.title} className="flex list-none items-start gap-3 py-2">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${reached ? 'bg-habit text-black/80' : 'bg-surface-3 text-faint'}`}
                  aria-hidden
                >
                  {reached ? '✓' : ''}
                </span>
                <span className={reached ? '' : 'text-muted'}>
                  <span className="block text-[14px] font-semibold">{m.title}</span>
                  <span className="block text-[13px] text-muted">{m.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[12px] text-faint">Typical timings from public-health sources (CDC, American Cancer Society). The clock restarts after a cigarette.</p>
      </section>

      <p className="px-1 pb-2 text-[12.5px] leading-relaxed text-faint">
        Keep is a tracker, not treatment. Nicotine replacement or a doctor's support makes quitting more likely to stick — worth asking about.
      </p>

      {/* Trigger picker */}
      <Sheet open={picking} onClose={() => setPicking(false)}>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">What set it off?</h2>
        <p className="mt-1 text-[14px] text-muted">No judgment — knowing your triggers is how you beat them.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {SMOKE_TRIGGERS.map((t) => (
            <motion.button
              key={t}
              whileTap={{ scale: 0.95 }}
              onClick={() => smoke(t)}
              className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-surface-2 px-3.5 text-left text-[14px] font-medium"
            >
              <span className="text-[18px]">{TRIGGER_LABEL[t].emoji}</span>
              {TRIGGER_LABEL[t].label}
            </motion.button>
          ))}
        </div>
        <button onClick={() => smoke()} className="mt-2 min-h-11 w-full text-[14px] font-medium text-muted">
          Skip — just log it
        </button>
      </Sheet>

      <CravingTimer
        open={craving}
        onClose={() => setCraving(false)}
        onPassed={() => {
          logSmoke('craving_passed');
          setCraving(false);
          showToast('Craving beaten 💪', { tone: 'habit' });
        }}
        onSmoked={() => {
          setCraving(false);
          setPicking(true);
        }}
      />
    </div>
  );
}

/** Five-minute ride-it-out timer with paced breathing. Cravings usually fade within minutes. */
function CravingTimer({ open, onClose, onPassed, onSmoked }: { open: boolean; onClose: () => void; onPassed: () => void; onSmoked: () => void }) {
  const TOTAL = 300;
  const [left, setLeft] = useState(TOTAL);
  useEffect(() => {
    if (!open) return;
    setLeft(TOTAL);
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [open]);
  const tips = ['Drink a glass of water, slowly.', 'Walk to another room.', 'Text someone in your circle.', 'Notice the urge rise — and fall.', 'Chew something. Keep your hands busy.'];
  const tip = tips[Math.floor((TOTAL - left) / 60) % tips.length];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Craving timer"
          className="fixed inset-0 z-[75] flex flex-col items-center justify-center bg-bg px-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="text-[13px] font-semibold tracking-[0.1em] text-habit uppercase">Ride it out</div>
          <div className="relative mt-8 grid size-56 place-items-center">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--habit) 40%, transparent), transparent 70%)' }}
              animate={{ scale: [0.7, 1, 0.7] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative">
              <div className="tabular text-[52px] leading-none font-bold tracking-[-0.03em]">
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </div>
              <div className="mt-2 text-[14px] text-muted">Breathe in as it grows, out as it shrinks</div>
            </div>
          </div>
          <p className="mt-8 min-h-12 max-w-xs text-[16px] font-medium">{left === 0 ? 'Five minutes. The worst has passed.' : tip}</p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
            <button onClick={onPassed} className="min-h-14 rounded-2xl bg-habit text-[16px] font-semibold text-black/85">
              It passed 💪
            </button>
            <button onClick={onSmoked} className="min-h-12 rounded-2xl border border-line text-[15px] font-medium text-muted">
              I smoked
            </button>
            <button onClick={onClose} className="min-h-11 text-[14px] text-faint">
              Close
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="tabular text-[24px] leading-none font-bold tracking-[-0.03em]">{value}</div>
      <div className="mt-1.5 text-[12px] font-medium tracking-wide text-muted uppercase">{label}</div>
      {sub && <div className="text-[12px] text-faint">{sub}</div>}
    </div>
  );
}

function QuitSetup({ today, existing, onDone }: { today: string; existing?: QuitSettings; onDone: () => void }) {
  const setProfile = useStore((s) => s.setProfile);
  const setTab = useUI((s) => s.setTab);
  const ex = existing as (QuitSettings & { currency?: string }) | undefined;
  const [mode, setMode] = useState<QuitSettings['mode']>(ex?.mode ?? 'reduce');
  const [baseline, setBaseline] = useState(String(ex?.baseline ?? ''));
  const [price, setPrice] = useState(String(ex?.price ?? ''));
  const [currency, setCurrency] = useState(ex?.currency ?? defaultCurrency());
  const [quitDate, setQuitDate] = useState(ex?.quitDate ?? addDays(today, 28));
  const [touchedDate, setTouchedDate] = useState(!!ex);

  const pickMode = (m: QuitSettings['mode']) => {
    setMode(m);
    if (!touchedDate) setQuitDate(addDays(today, m === 'cold' ? 3 : 28));
  };
  const b = Number(baseline);
  const p = Number(price);
  const valid = b > 0 && b <= 100 && p >= 0 && price !== '' && quitDate >= (ex?.startDay ?? today);
  const field = 'mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint';

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-1">
        <div className="text-[12px] font-semibold tracking-[0.08em] text-habit uppercase">{ex ? 'Settings' : 'Set up'}</div>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">Quit smoking</h1>
        <p className="mt-1 text-[14.5px] text-muted">Two minutes to set up. You can change any of this later.</p>
      </header>

      <section className="card px-4 py-4">
        <h2 className="text-[15px] font-semibold">How do you want to quit?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quit method">
          {(
            [
              ['reduce', 'Cut down', 'A daily limit that drops every week until zero.'],
              ['cold', 'Cold turkey', 'Pick a day and stop completely.'],
            ] as const
          ).map(([m, title, text]) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => pickMode(m)}
              className={`rounded-2xl border p-3 text-left ${mode === m ? 'border-habit bg-habit/10' : 'border-line bg-surface-2'}`}
            >
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{text}</span>
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[12.5px] text-faint">
          In a trial, stopping abruptly worked more often than cutting down (Lindson-Hawley et al., 2016) — so cutting down here always ends on a firm quit date.
        </p>
      </section>

      <section className="card px-4 py-4">
        <label className="block text-[13px] font-medium text-muted">Cigarettes per day right now</label>
        <input inputMode="numeric" value={baseline} onChange={(e) => setBaseline(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 10" className={`${field} tabular`} />

        <label className="mt-4 block text-[13px] font-medium text-muted">Price of one cigarette</label>
        <div className="mt-1.5 flex gap-2">
          <input value={currency} onChange={(e) => setCurrency(e.target.value.slice(0, 3))} aria-label="Currency symbol" className={`${field} mt-0 w-16 text-center`} />
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 18" className={`${field} mt-0 tabular flex-1`} />
        </div>

        <label className="mt-4 block text-[13px] font-medium text-muted">{mode === 'cold' ? 'Quit day' : 'Zero by'}</label>
        <input
          type="date"
          min={today}
          value={quitDate}
          onChange={(e) => {
            if (e.target.value) {
              setQuitDate(e.target.value);
              setTouchedDate(true);
            }
          }}
          className={`${field} tabular`}
        />
        {mode === 'reduce' && b > 0 && (
          <p className="mt-2 text-[12.5px] text-muted">
            Your limit starts at {b} a day and steps down weekly until {formatDay(quitDate, { day: 'numeric', month: 'short' })}.
          </p>
        )}
      </section>

      <motion.button
        whileTap={{ scale: 0.98 }}
        disabled={!valid}
        onClick={() => {
          setProfile({
            quit: { enabled: true, mode, baseline: b, price: p, startDay: ex?.startDay ?? today, quitDate, currency } as QuitSettings,
          });
          onDone();
        }}
        className="min-h-14 w-full rounded-2xl bg-text text-[16px] font-semibold text-bg disabled:opacity-30"
      >
        {ex ? 'Save' : 'Start'}
      </motion.button>
      {ex ? (
        <>
          <button onClick={onDone} className="min-h-11 text-[14px] font-medium text-muted">
            Cancel
          </button>
          <button
            onClick={() => {
              setProfile({ quit: { ...ex, enabled: false } });
              setTab('profile');
            }}
            className="min-h-11 text-[14px] font-medium text-miss/80"
          >
            Turn off quit mode (your history is kept)
          </button>
        </>
      ) : (
        <button onClick={() => setTab('profile')} className="min-h-11 text-[14px] font-medium text-muted">
          Not now
        </button>
      )}
    </div>
  );
}
