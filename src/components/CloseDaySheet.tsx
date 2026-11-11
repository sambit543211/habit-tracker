import { motion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, habitsOn, plansOn, streak } from '../lib/score';
import { levelFor, promisesKept } from '../lib/game';
import { addDays } from '../lib/date';
import { Sheet } from './Sheet';
import { Ring } from './Ring';
import { HabitRows } from './HabitRows';
import { PlanRows } from './PlanRows';
import { BedtimeNote } from './BedtimeNote';

/**
 * End-of-day ritual in one flow: resolve what's left → see the day → plan
 * tomorrow. Ending on a clear, positive summary matters: we remember
 * experiences by their peak and their end (Kahneman et al., 1993).
 */
export function CloseDaySheet({ today }: { today: string }) {
  const open = useUI((s) => s.closeDayOpen);
  const setOpen = useUI((s) => s.setCloseDay);
  const setTab = useUI((s) => s.setTab);
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const profile = useStore((s) => s.profile);
  const markDayClosed = useStore((s) => s.markDayClosed);

  const data = { habits, plans, logs, startDay };
  const stats = useMemo(() => dayStats(data, today), [habits, plans, logs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => streak(data, today, profile.shields !== false), [habits, logs, startDay, today, profile.shields]); // eslint-disable-line react-hooks/exhaustive-deps
  const level = useMemo(() => levelFor(promisesKept(data, today)), [habits, plans, logs, startDay, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const openHabits = habitsOn(data, today).filter((h) => !logs[today]?.[h.id]);
  const openPlans = plansOn(data, today).filter((p) => p.status === 'pending');
  const closed = stats.pending === 0;
  const tomorrowPlanned = plansOn(data, addDays(today, 1)).length;
  const score = Math.round((stats.score ?? 0) * 100);
  const keptToday = stats.habitsDone + stats.plansDone;

  useEffect(() => {
    if (open && closed) markDayClosed(today);
  }, [open, closed, today, markDayClosed]);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} z={55}>
      {!closed ? (
        <>
          <div className="text-[13px] font-medium tracking-wide text-plan uppercase">Step 1 of 2</div>
          <h2 className="mt-1 text-[24px] font-bold tracking-[-0.02em]">Close the day honestly</h2>
          <p className="mt-1 text-[14px] text-muted">
            {stats.pending} left. Tick what you did, cross what you didn't — every cross gets a reason.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {openHabits.length > 0 && <HabitRows habits={openHabits} day={today} showTiny />}
            {openPlans.length > 0 && <PlanRows plans={openPlans} />}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center pt-1 text-center">
          <div className="self-start text-[13px] font-medium tracking-wide text-plan uppercase">Step 2 of 2</div>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="mt-3">
            <Ring value={stats.score} color="var(--habit)" size={124} stroke={11} label={`Efficacy ${score} percent`}>
              <span className="tabular text-[34px] font-bold tracking-[-0.03em]">{score}%</span>
            </Ring>
          </motion.div>
          <h2 className="mt-4 text-[24px] font-bold tracking-[-0.02em]">{score === 100 ? 'Every promise kept' : 'Day closed'}</h2>
          <p className="mt-1 max-w-xs text-[14.5px] text-muted">
            {score === 100
              ? `${profile.name ? `${profile.name.split(/\s+/)[0]}, you` : 'You'} did everything you said you would.`
              : 'Everything is accounted for. Honesty is what makes the score mean something.'}
          </p>
          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            <Mini label="Habits" value={`${stats.habitsDone}/${stats.habitsTotal}`} color="var(--habit)" />
            <Mini label="Plans" value={`${stats.plansDone}/${stats.plansTotal}`} color="var(--plan)" />
            <Mini label={st.todayDone ? 'Streak' : 'Streak · at risk'} value={String(st.current)} color="var(--gold)" />
          </div>
          <div className="mt-3 w-full rounded-2xl bg-surface-2 px-4 py-3 text-left">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-semibold">
                Lv {level.level} · {level.name}
              </span>
              <span className="text-muted">+{keptToday} today</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
              <motion.div className="h-full rounded-full bg-plan" initial={{ width: 0 }} animate={{ width: `${level.progress * 100}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
            </div>
            {level.next !== null && (
              <div className="mt-1.5 text-[12px] text-muted">
                {level.toNext} more promise{level.toNext === 1 ? '' : 's'} to “{level.nextName}”
              </div>
            )}
          </div>
          <div className="mt-4 w-full text-left">
            <BedtimeNote day={today} />
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setTab('plan');
              window.scrollTo({ top: 0 });
            }}
            className="mt-5 min-h-12 w-full rounded-2xl bg-text text-[16px] font-semibold text-bg"
          >
            {tomorrowPlanned ? `Review tomorrow (${tomorrowPlanned} planned) →` : 'Plan tomorrow →'}
          </button>
          <button onClick={() => setOpen(false)} className="mt-1 min-h-11 w-full text-[14px] font-medium text-muted">
            Done for tonight
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-2 py-3">
      <div className="tabular text-[18px] font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}
