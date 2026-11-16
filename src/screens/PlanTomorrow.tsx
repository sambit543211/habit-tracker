import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore, useUI } from '../store';
import { useData } from '../lib/useData';
import { habitsOn, planCapacity, plansOn } from '../lib/score';
import { addDays, formatDay } from '../lib/date';
import { isEvening } from '../lib/useToday';
import { PlanRows } from '../components/PlanRows';
import { DayCalendar } from '../components/DayCalendar';
import { PlusIcon, StarIcon } from '../components/icons';
import { dayProfile, fmtDuration, freeFromNow, sinceWake, timeBudget, windowLength } from '../lib/time';
import type { Plan } from '../types';
import { planMetaText } from '../lib/planMeta';

const MUST_LIMIT = 3;

/** Plan today or tomorrow: calendar, free time, must-dos. */
export function PlanTomorrow({ today, hour }: { today: string; hour: number }) {
  const data = useData();
  const { logs } = data;
  const baseProfile = useStore((s) => s.profile);
  const editPlan = useUI((s) => s.editPlan);

  const evening = isEvening(hour);
  const [which, setWhich] = useState<'today' | 'tomorrow'>(evening ? 'tomorrow' : 'today');
  const tomorrow = addDays(today, 1);
  const day = which === 'today' ? today : tomorrow;
  const list = plansOn(data, day);
  // Calendar and free time include plans set before your usual wake-up (e.g. "Gym 7 am").
  const profile = useMemo(() => dayProfile(list, baseProfile), [list, baseProfile]);
  const dayHabits = habitsOn(data, day);
  const doneHabits = new Set(Object.entries(logs[day] ?? {}).filter(([, l]) => l.status === 'done').map(([id]) => id));
  const musts = list.filter((p) => p.must);
  const capacity = useMemo(() => planCapacity(data, today), [data, today]);
  const overplanned = which === 'tomorrow' && capacity !== null && list.length > Math.ceil(capacity) + 1;

  // Minutes since wake right now (only meaningful for today).
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const nowSince = which === 'today' ? sinceWake(nowHHMM, profile) : null;
  const total = windowLength(profile);
  const budget = timeBudget(list, profile);
  const free = which === 'today' && nowSince !== null && nowSince < total ? freeFromNow(list, profile, nowSince) : budget.free;
  const overbooked = budget.planned > total * 0.8;

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-2">
        <div className="text-[13px] font-semibold tracking-[0.08em] text-plan uppercase">
          {which === 'tomorrow' && evening ? "Tonight's ritual" : 'Your day'}
        </div>
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.03em]">Plan</h1>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
          {(['today', 'tomorrow'] as const).map((w) => (
            <button key={w} onClick={() => setWhich(w)} className={`relative min-h-11 rounded-xl text-[14px] font-medium ${which === w ? 'text-text' : 'text-muted'}`}>
              {which === w && <motion.span layoutId="plan-day" className="absolute inset-0 rounded-xl bg-surface shadow-sm" />}
              <span className="relative">
                {w === 'today' ? 'Today' : 'Tomorrow'}
                <span className="ml-1.5 text-[12px] text-faint">{formatDay(w === 'today' ? today : tomorrow, { weekday: 'short', day: 'numeric' })}</span>
              </span>
            </button>
          ))}
        </div>
      </header>



      {/* All plans for the day */}
      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            <StarIcon size={16} filled className="text-gold" /> Plans
          </h2>
          <span className={`tabular text-[13px] font-medium ${musts.length > MUST_LIMIT ? 'text-miss' : 'text-muted'}`}>
            {musts.length}/{MUST_LIMIT} must-dos · {list.length} total
          </span>
        </div>
        {which === 'today' ? (
          <PlanRows plans={list} />
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {[...list]
                .sort((a, b) => Number(b.must) - Number(a.must) || (a.start ?? '99').localeCompare(b.start ?? '99') || a.createdAt - b.createdAt)
                .map((p) => (
                  <PlanCard key={p.id} plan={p} onOpen={() => editPlan({ id: p.id })} />
                ))}
            </AnimatePresence>
          </ul>
        )}
        {musts.length > MUST_LIMIT && <p className="mt-2 px-1 text-[13px] text-miss">More than 3 must-dos dilutes focus. Demote one?</p>}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => editPlan({ day })}
          className="mt-2.5 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-plan/50 bg-plan/10 py-3.5 text-[15px] font-semibold text-plan"
        >
          <PlusIcon size={18} strokeWidth={2.6} />
          Add a plan for {which === 'today' ? 'today' : 'tomorrow'}
        </motion.button>
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="text-[17px] font-semibold">Calendar</h2>
          <span className="tabular text-[13px] text-muted">
            <span className="font-semibold text-text">{fmtDuration(free)}</span> free · {fmtDuration(budget.planned)} blocked
          </span>
        </div>
        {(budget.overlaps > 0 || overbooked) && (
          <p className="-mt-1 mb-2 px-1 text-[12.5px] text-gold">
            {budget.overlaps > 0 && `${budget.overlaps} plan${budget.overlaps > 1 ? 's overlap' : ' overlaps'}. `}
            {overbooked && 'Packed day — leave some buffer.'}
          </p>
        )}
        <DayCalendar day={day} plans={list} habits={dayHabits} profile={profile} now={nowSince} doneHabits={doneHabits} />
      </section>

      <AnimatePresence>
        {overplanned && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-[20px] border border-gold/30 bg-gold/10 px-4 py-3.5 text-[13.5px] leading-relaxed"
          >
            <span className="font-semibold text-gold">Heads up — planning fallacy.</span>{' '}
            <span className="text-muted">
              You usually finish about {capacity!.toFixed(1)} plans a day, and you've planned {list.length}. Trim now so tomorrow feels like a win.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

function PlanCard({ plan, onOpen }: { plan: Plan; onOpen: () => void }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.18 } }}
      className="list-none"
    >
      <button onClick={onOpen} className="flex min-h-[60px] w-full items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-2.5 text-left">
        <StarIcon size={16} filled={plan.must} className={`shrink-0 ${plan.must ? 'text-gold' : 'text-faint'}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-medium">{plan.title}</div>
          <PlanMeta plan={plan} />
        </div>
      </button>
    </motion.li>
  );
}

function PlanMeta({ plan }: { plan: Plan }) {
  const text = planMetaText(plan);
  if (!text) return null;
  return <div className={`truncate text-[12.5px] ${plan.carryCount >= 3 ? 'text-miss' : 'text-muted'}`}>{text}</div>;
}
