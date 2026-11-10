import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, streak } from '../lib/score';
import { addDays, formatDay, range } from '../lib/date';
import { AnimatedNumber } from '../components/Ring';
import { RemindersCard } from '../components/RemindersCard';
import { AccountCard } from '../components/AccountCard';
import { FlameIcon } from '../components/icons';
import { fmtDuration, weekStart, windowLength } from '../lib/time';

export const initials = (name?: string) =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '·';

export function Profile({ today }: { today: string }) {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const profile = useStore((s) => s.profile);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const setProfile = useStore((s) => s.setProfile);
  const setReviewWeek = useUI((s) => s.setReviewWeek);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name ?? '');

  const stats = useMemo(() => {
    const data = { habits, plans, logs, startDay };
    if (!startDay) return { days: 0, best: 0, avg: null as number | null, kept: 0 };
    let days = 0;
    let sum = 0;
    let n = 0;
    let kept = 0;
    for (const d of range(startDay, today)) {
      const s = dayStats(data, d);
      kept += s.habitsDone + s.plansDone;
      if (s.score !== null && d < today) {
        days++;
        sum += s.score;
        n++;
      }
    }
    return { days, best: streak(data, today).best, avg: n ? sum / n : null, kept };
  }, [habits, plans, logs, startDay, today]);

  const thisWeek = weeklyReviews[weekStart(today)];
  const lastWeek = weeklyReviews[weekStart(addDays(today, -7))];
  const experiment = thisWeek?.experiment || lastWeek?.experiment;

  const saveName = () => {
    const n = draft.trim();
    if (n) setProfile({ name: n });
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center pt-6 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="relative grid size-24 place-items-center rounded-full text-[34px] font-bold text-white shadow-[0_12px_40px_color-mix(in_srgb,var(--plan)_35%,transparent)]"
          style={{ background: 'linear-gradient(135deg, var(--habit), var(--plan))' }}
        >
          {initials(profile.name)}
        </motion.div>
        {editing ? (
          <form
            className="mt-4 flex w-full max-w-xs gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-center text-[18px] font-semibold outline-none focus:border-line-strong"
              aria-label="Your name"
            />
            <button type="submit" className="rounded-2xl bg-text px-4 font-semibold text-bg">Save</button>
          </form>
        ) : (
          <button onClick={() => { setDraft(profile.name ?? ''); setEditing(true); }} className="mt-4">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">{profile.name || 'Add your name'}</h1>
            <span className="text-[12.5px] text-faint">Tap to edit</span>
          </button>
        )}
        {startDay && (
          <p className="mt-1 text-[14px] text-muted">Keeping promises since {formatDay(startDay, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Days tracked" value={stats.days} />
        <Stat label="Best streak" value={stats.best} icon={<FlameIcon size={16} className="text-gold" />} />
        <Stat label="Avg efficacy" value={stats.avg === null ? null : Math.round(stats.avg * 100)} suffix="%" />
        <Stat label="Promises kept" value={stats.kept} />
      </div>

      {experiment && (
        <div className="rounded-[20px] border border-plan/30 bg-plan/10 px-4 py-3.5">
          <div className="text-[12px] font-semibold tracking-wide text-plan uppercase">This week's experiment</div>
          <div className="mt-1 text-[15px] font-medium">{experiment}</div>
        </div>
      )}

      <button onClick={() => setReviewWeek(true)} className="card flex items-center justify-between px-4 py-4 text-left">
        <span>
          <span className="block text-[15px] font-semibold">Weekly review</span>
          <span className="block text-[13px] text-muted">{thisWeek ? 'Done for this week — tap to edit' : '3 questions · about 2 minutes'}</span>
        </span>
        <span className="text-[20px]">{thisWeek ? '✅' : '🗓️'}</span>
      </button>

      <section className="card px-4 py-4">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Your day</h2>
        <p className="mt-1 text-[12.5px] text-faint">Used for your calendar and free-time count · {fmtDuration(windowLength(profile))} awake</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TimeField label="Wake up" value={profile.wake} onChange={(wake) => setProfile({ wake })} />
          <TimeField label="Sleep" value={profile.sleep} onChange={(sleep) => setProfile({ sleep })} />
        </div>
      </section>

      <RemindersCard />
      <AccountCard />
    </div>
  );
}

function Stat({ label, value, suffix, icon }: { label: string; value: number | null; suffix?: string; icon?: React.ReactNode }) {
  return (
    <div className="card px-4 py-4">
      <div className="flex items-center gap-1 text-[26px] leading-none font-bold tracking-[-0.03em] tabular">
        {icon}
        {value === null ? '–' : <AnimatedNumber value={value} />}
        {value !== null && suffix && <span className="text-[16px] text-muted">{suffix}</span>}
      </div>
      <div className="mt-1.5 text-[12px] font-medium tracking-wide text-muted uppercase">{label}</div>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="tabular mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[16px] outline-none focus:border-line-strong"
      />
    </label>
  );
}
