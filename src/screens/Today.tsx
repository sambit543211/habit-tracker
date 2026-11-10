import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, habitsOn, openPastItems, plansOn, streak } from '../lib/score';
import { addDays, formatDay, weekday } from '../lib/date';
import { isEvening } from '../lib/useToday';
import { AnimatedNumber, Ring } from '../components/Ring';
import { HabitRows } from '../components/HabitRows';
import { PlanRows } from '../components/PlanRows';
import { PlanInput } from '../components/PlanInput';
import { ArrowRightIcon, FlameIcon, MoonIcon, XIcon } from '../components/icons';
import { celebrateBig, celebrateSmall, haptic } from '../lib/feedback';

export function Today({ today, hour }: { today: string; hour: number }) {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const freshStartSeen = useStore((s) => s.freshStartSeen);
  const { addPlan, dismissFreshStart } = useStore();
  const { setTab, setReview } = useUI();

  const data = { habits, plans, logs, startDay };
  const stats = useMemo(() => dayStats(data, today), [habits, plans, logs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => streak(data, today), [habits, logs, startDay, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useMemo(() => openPastItems(data, today), [habits, plans, logs, startDay, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayHabits = habitsOn(data, today);
  const todayPlans = plansOn(data, today);
  const tomorrowCount = plansOn(data, addDays(today, 1)).length;

  useCelebrations(stats.perfectHabits, stats.score === 1 && stats.pending === 0, today);

  const evening = isEvening(hour);
  const isFreshStart = (weekday(today) === 1 || today.endsWith('-01')) && freshStartSeen !== today;
  const atRisk = !st.todayDone && st.current > 0 && evening;
  const score = stats.score === null ? 0 : Math.round(stats.score * 100);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex items-end justify-between pt-2">
        <div>
          <div className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
            {formatDay(today, { weekday: 'long' })}
          </div>
          <h1 className="text-[30px] leading-tight font-bold tracking-[-0.03em]">
            {formatDay(today, { day: 'numeric', month: 'long' })}
          </h1>
        </div>
        <motion.div
          animate={atRisk ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={atRisk ? { repeat: Infinity, duration: 1.6 } : undefined}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
            st.todayDone ? 'border-gold/40 bg-gold/15 text-gold' : atRisk ? 'border-miss/40 bg-miss/10 text-miss' : 'border-line bg-surface text-muted'
          }`}
          title={atRisk ? 'Streak at risk — finish your habits before 2 am' : 'Strict streak: days with every habit done'}
        >
          <FlameIcon size={16} />
          <span className="tabular text-[15px] font-semibold">{st.current}</span>
        </motion.div>
      </header>

      {/* Hero: Habits ring · Efficacy · Plans ring */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="card relative overflow-hidden px-4 pt-5 pb-4"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, var(--habit), transparent), radial-gradient(closest-side, var(--plan), transparent)' }}
        />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <RingStat label="Habits" color="var(--habit)" done={stats.habitsDone} total={stats.habitsTotal} pct={stats.habitPct} />
          <div className="flex flex-col items-center px-1">
            <div className="flex items-start">
              <AnimatedNumber value={score} className="tabular text-[52px] leading-none font-bold tracking-[-0.04em]" />
              <span className="mt-1.5 text-[18px] font-semibold text-muted">%</span>
            </div>
            <div className="mt-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Efficacy</div>
          </div>
          <RingStat label="Plans" color="var(--plan)" done={stats.plansDone} total={stats.plansTotal} pct={stats.planPct} />
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={nudge(stats)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="relative mt-4 text-center text-[14px] text-muted"
          >
            {nudge(stats)}
          </motion.p>
        </AnimatePresence>
      </motion.section>

      {/* Contextual cards */}
      <AnimatePresence>
        {open.length > 0 && (
          <Banner key="review" tone="miss" onClick={() => setReview(true)}
            title="Close the loop"
            text={`${open.length} item${open.length > 1 ? 's' : ''} from earlier still open`} />
        )}
        {isFreshStart && (
          <Banner key="fresh" tone="habit"
            title={today.endsWith('-01') ? 'New month. Fresh start.' : 'New week. Fresh start.'}
            text="Whatever happened last week is history. Today counts."
            onDismiss={() => dismissFreshStart(today)} />
        )}
        {evening && (
          <Banner key="evening" tone="plan" icon={<MoonIcon size={18} />} onClick={() => setTab('plan')}
            title="Plan tomorrow"
            text={tomorrowCount ? `${tomorrowCount} planned · tap to review` : 'Write it down tonight, sleep easier.'} />
        )}
      </AnimatePresence>

      {/* Habits */}
      <section>
        <SectionHeader title="Habits" color="var(--habit)" count={`${stats.habitsDone}/${stats.habitsTotal}`} />
        {todayHabits.length ? (
          <HabitRows habits={todayHabits} day={today} showTiny={hour >= 18 || hour < 2} />
        ) : (
          <button onClick={() => setTab('habits')} className="w-full rounded-[20px] border border-dashed border-line-strong/60 py-5 text-[14px] text-muted">
            Add your daily habits →
          </button>
        )}
      </section>

      {/* Plans */}
      <section>
        <SectionHeader title="Plans" color="var(--plan)" count={`${stats.plansDone}/${stats.plansTotal}`} />
        <div className="flex flex-col gap-2">
          <PlanRows plans={todayPlans} />
          <PlanInput placeholder="Add a plan for today" onAdd={(t, m) => addPlan(today, t, m)} />
        </div>
      </section>

      <p className="pb-2 text-center text-[12px] text-faint">Swipe right to complete · swipe left if you didn't</p>
    </div>
  );
}

function RingStat({ label, color, done, total, pct }: { label: string; color: string; done: number; total: number; pct: number | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Ring value={pct} color={color} size={84} stroke={8}>
        <div className="tabular text-[17px] font-semibold tracking-[-0.02em]">
          {done}
          <span className="text-muted">/{total}</span>
        </div>
      </Ring>
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </div>
    </div>
  );
}

function SectionHeader({ title, color, count }: { title: string; color: string; count: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
        <span className="h-4 w-1 rounded-full" style={{ background: color }} />
        {title}
      </h2>
      <span className="tabular text-[13px] font-medium text-muted">{count}</span>
    </div>
  );
}

function Banner({ title, text, tone, icon, onClick, onDismiss }: {
  title: string; text: string; tone: 'habit' | 'plan' | 'miss'; icon?: React.ReactNode; onClick?: () => void; onDismiss?: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="relative flex items-center gap-3 overflow-hidden rounded-[20px] border px-4 py-3.5"
      style={{
        borderColor: `color-mix(in srgb, var(--${tone}) 30%, transparent)`,
        background: `color-mix(in srgb, var(--${tone}) 10%, var(--surface))`,
      }}
    >
      <button onClick={() => { haptic(6); onClick?.(); }} className="flex min-w-0 flex-1 items-center gap-3 text-left" disabled={!onClick}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, var(--${tone}) 20%, transparent)`, color: `var(--${tone})` }}>
          {icon ?? <span className="size-2 rounded-full" style={{ background: `var(--${tone})` }} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-[13px] text-muted">{text}</span>
        </span>
        {onClick && <ArrowRightIcon size={18} className="ml-auto shrink-0 text-muted" />}
      </button>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full text-muted">
          <XIcon size={16} />
        </button>
      )}
    </motion.div>
  );
}

/** Goal-gradient copy: the closer you are, the more it pulls. */
function nudge(s: ReturnType<typeof dayStats>) {
  const total = s.habitsTotal + s.plansTotal;
  if (!total) return 'Add a habit or a plan to start your day.';
  if (s.pending === 0) {
    if (s.score === 1) return 'Perfect day. Every promise kept. ✨';
    return 'Day closed. Every item accounted for.';
  }
  if (s.pending === 1) return 'One left. Finish strong.';
  if (s.pending <= 3) return `${s.pending} left — you're close.`;
  if (s.habitsDone + s.plansDone === 0) return `${s.pending} promises today. Start with the easiest.`;
  return `${s.pending} to go. Keep the momentum.`;
}

/** Fire confetti only on transitions (never on first render / reload). */
function useCelebrations(allHabits: boolean, perfect: boolean, day: string) {
  const prev = useRef({ allHabits, perfect, day });
  useEffect(() => {
    const p = prev.current;
    if (p.day === day) {
      if (perfect && !p.perfect) {
        haptic([20, 40, 30]);
        celebrateBig();
      } else if (allHabits && !p.allHabits) {
        haptic([15, 30, 15]);
        celebrateSmall();
      }
    }
    prev.current = { allHabits, perfect, day };
  }, [allHabits, perfect, day]);
}
