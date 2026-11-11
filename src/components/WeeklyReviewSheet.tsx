import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { Sheet } from './Sheet';
import { addDays, formatDay, range, weekday } from '../lib/date';
import { dayStats, reasonCounts } from '../lib/score';
import { reasonLabel } from '../lib/reasons';
import { weekStart } from '../lib/time';
import { weekSummary } from '../lib/game';
import { shareText } from '../screens/Profile';
import type { ReasonCode } from '../types';

/** The week being reviewed: Sunday reviews this week, Monday still reviews last week. */
export const reviewWeekFor = (today: string) => (weekday(today) === 1 ? weekStart(addDays(today, -1)) : weekStart(today));

/**
 * Weekly review — 3 short questions. Structured reflection improves later
 * performance (Di Stefano, Gino, Pisano & Staats, 2014).
 */
export function WeeklyReviewSheet({ today }: { today: string }) {
  const open = useUI((s) => s.reviewWeekOpen);
  const setOpen = useUI((s) => s.setReviewWeek);
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const reviews = useStore((s) => s.weeklyReviews);
  const save = useStore((s) => s.setWeeklyReview);

  const week = reviewWeekFor(today);
  const existing = reviews[week];
  const [wentWell, setWentWell] = useState('');
  const [change, setChange] = useState('');
  const [experiment, setExperiment] = useState('');

  useEffect(() => {
    if (!open) return;
    setWentWell(existing?.wentWell ?? '');
    setChange(existing?.change ?? '');
    setExperiment(existing?.experiment ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const summary = useMemo(() => {
    const data = { habits, plans, logs, startDay };
    const end = [addDays(week, 6), today].sort()[0];
    const scores = range(week, end).map((d) => dayStats(data, d).score).filter((s): s is number => s !== null);
    const reasons = reasonCounts(data, week, end);
    const top = (Object.entries(reasons) as [ReasonCode, number][]).sort((a, b) => b[1] - a[1])[0];
    return { avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, top, days: scores.length };
  }, [habits, plans, logs, startDay, week, today]);

  const field =
    'mt-1.5 w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 outline-none placeholder:text-faint focus:border-line-strong';

  return (
    <Sheet open={open} onClose={() => setOpen(false)}>
      <div className="text-[13px] font-medium tracking-wide text-plan uppercase">
        Week of {formatDay(week, { day: 'numeric', month: 'short' })}
      </div>
      <h2 className="mt-1 text-[24px] font-bold tracking-[-0.02em]">Weekly review</h2>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface-2 px-4 py-3">
          <div className="text-[22px] font-bold tabular">{summary.avg === null ? '–' : `${Math.round(summary.avg * 100)}%`}</div>
          <div className="text-[12px] text-muted">avg efficacy · {summary.days} days</div>
        </div>
        <div className="rounded-2xl bg-surface-2 px-4 py-3">
          <div className="truncate text-[17px] font-semibold">{summary.top ? reasonLabel(summary.top[0]) : 'No misses'}</div>
          <div className="text-[12px] text-muted">{summary.top ? `top miss reason · ${summary.top[1]}×` : 'nothing logged'}</div>
        </div>
      </div>

      <label className="mt-5 block text-[14px] font-medium">1. What went well?</label>
      <textarea rows={2} value={wentWell} onChange={(e) => setWentWell(e.target.value)} placeholder="A win worth repeating…" className={field} />

      <label className="mt-4 block text-[14px] font-medium">2. What got in the way — and what will you change?</label>
      <textarea
        rows={2}
        value={change}
        onChange={(e) => setChange(e.target.value)}
        placeholder={summary.top ? `"${reasonLabel(summary.top[0])}" came up most. One fix…` : 'One fix…'}
        className={field}
      />

      <label className="mt-4 block text-[14px] font-medium">3. One experiment for next week</label>
      <input value={experiment} onChange={(e) => setExperiment(e.target.value)} placeholder="e.g. phone in another room after 11 pm" className={field} />
      <p className="mt-1.5 text-[12.5px] text-faint">It'll show on your Profile all week as a reminder.</p>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          save(week, { wentWell: wentWell.trim() || undefined, change: change.trim() || undefined, experiment: experiment.trim() || undefined });
          setOpen(false);
        }}
        disabled={!wentWell.trim() && !change.trim() && !experiment.trim()}
        className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg disabled:opacity-30"
      >
        Save review
      </motion.button>
      <button
        onClick={async () => {
          const st = useStore.getState();
          const text = weekSummary({ habits, plans, logs, startDay }, today, st.profile.name, experiment.trim() || undefined);
          const partner = st.profile.partner?.trim();
          const r = await shareText(partner ? `Hi ${partner},\n${text}` : text);
          if (r === 'copied') useUI.getState().showToast('Summary copied — paste it in a message', { tone: 'plan' });
        }}
        className="mt-2 min-h-11 w-full text-[14px] font-semibold text-plan"
      >
        Share this week with your partner
      </button>
    </Sheet>
  );
}
