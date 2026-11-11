import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, habitsOn, openPastItems, plansOn, streak } from '../lib/score';
import { addDays, formatDay, weekday } from '../lib/date';
import { isEvening } from '../lib/useToday';
import { AnimatedNumber, Ring } from '../components/Ring';
import { HabitRows } from '../components/HabitRows';
import { PlanRows } from '../components/PlanRows';
import { ArrowRightIcon, FlameIcon, MoonIcon, PlusIcon, XIcon } from '../components/icons';
import { celebrateBig, celebrateSmall, haptic } from '../lib/feedback';
import { BedtimeNote } from '../components/BedtimeNote';
import { reviewWeekFor } from '../components/WeeklyReviewSheet';
import { greeting, sinceWake, windowLength } from '../lib/time';

export function Today({ today, hour }: { today: string; hour: number }) {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const freshStartSeen = useStore((s) => s.freshStartSeen);
  const profile = useStore((s) => s.profile);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const { dismissFreshStart } = useStore();
  const { setTab, setReview, setReviewWeek, editPlan } = useUI();

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
  const firstName = profile.name?.split(/\s+/)[0];
  const now = new Date();
  const nowSince = sinceWake(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, profile);
  const nearBed = nowSince >= windowLength(profile) - 120;
  const wd = weekday(today);
  const reviewDue = (wd === 0 || wd === 1) && !weeklyReviews[reviewWeekFor(today)] && !!startDay && startDay < today;
  const addPlan = () => {
    haptic(8);
    editPlan({ day: today });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
            {formatDay(today, { weekday: 'long', day: 'numeric', month: 'short' })}
          </div>
          <h1 className="truncate text-[24px] leading-tight font-bold tracking-[-0.03em]">
            {greeting(hour)}
            {firstName && (
              <>
                <span className="text-muted">, </span>
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(90deg, var(--habit), var(--plan))' }}
                >
                  {firstName}
                </span>
              </>
            )}
          </h1>
        </div>
        <motion.div
          animate={atRisk ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={atRisk ? { repeat: Infinity, duration: 1.6 } : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 ${
            st.todayDone ? 'border-gold/40 bg-gold/15 text-gold' : atRisk ? 'border-miss/40 bg-miss/10 text-miss' : 'border-line bg-surface text-muted'
          }`}
          title={atRisk ? 'Streak at risk — finish your habits before 2 am' : 'Strict streak: days with every habit done'}
        >
          <FlameIcon size={15} />
          <span className="tabular text-[15px] font-semibold">{st.current}</span>
        </motion.div>
      </header>

      {/* Score card: efficacy + concentric rings */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="card hero relative flex items-center gap-4 overflow-hidden px-4 py-3.5"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase">
            {firstName ? `${firstName}'s promises today` : 'Efficacy today'}
          </div>
          <div className="mt-0.5 flex items-start">
            <AnimatedNumber value={score} className="tabular text-[46px] leading-none font-bold tracking-[-0.045em]" />
            <span className="mt-1 ml-0.5 text-[17px] font-semibold text-muted">%</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={nudge(stats)}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              className="mt-1 truncate text-[13px] text-muted"
            >
              {nudge(stats)}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="relative shrink-0">
          <Ring value={stats.habitPct} color="var(--habit)" size={92} stroke={10} />
          <div className="absolute inset-[13px]">
            <Ring value={stats.planPct} color="var(--plan)" size={66} stroke={10} />
          </div>
        </div>
      </motion.section>

      {open.length > 0 && (
        <button
          onClick={() => setReview(true)}
          className="flex items-center justify-between rounded-2xl border border-miss/30 bg-miss/10 px-3.5 py-2.5 text-left"
        >
          <span className="text-[13.5px] font-medium">
            <span className="text-miss">●</span> {open.length} item{open.length > 1 ? 's' : ''} from earlier still open
          </span>
          <span className="text-[13px] font-semibold text-miss">Close the loop →</span>
        </button>
      )}

      {/* Habits | Plans side by side */}
      <div className="grid grid-cols-2 gap-2.5">
        <section className="min-w-0">
          <ColumnHeader title="Habits" color="var(--habit)" done={stats.habitsDone} total={stats.habitsTotal} />
          {todayHabits.length ? (
            <HabitRows habits={todayHabits} day={today} showTiny={hour >= 18 || hour < 2} compact />
          ) : (
            <EmptyColumn text="No habits yet" cta="Add habits" onClick={() => setTab('habits')} />
          )}
        </section>
        <section className="min-w-0">
          <ColumnHeader
            title="Plans"
            color="var(--plan)"
            done={stats.plansDone}
            total={stats.plansTotal}
            action={
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={addPlan}
                aria-label="Add a plan for today"
                className="grid size-8 place-items-center rounded-full bg-plan text-white shadow-[0_4px_16px_color-mix(in_srgb,var(--plan)_45%,transparent)]"
              >
                <PlusIcon size={18} strokeWidth={2.6} />
              </motion.button>
            }
          />
          {todayPlans.length ? (
            <PlanRows plans={todayPlans} compact />
          ) : (
            <EmptyColumn text="Nothing planned" cta="Plan something" onClick={addPlan} />
          )}
        </section>
      </div>

      {/* Contextual cards (below the fold on purpose: today's promises come first) */}
      <AnimatePresence>
        {reviewDue && (
          <Banner key="weekly" tone="plan" onClick={() => setReviewWeek(true)} title="Weekly review" text="3 questions · 2 minutes · pick one experiment" />
        )}
        {isFreshStart && (
          <Banner
            key="fresh"
            tone="habit"
            title={today.endsWith('-01') ? 'New month. Fresh start.' : 'New week. Fresh start.'}
            text="Whatever happened last week is history. Today counts."
            onDismiss={() => dismissFreshStart(today)}
          />
        )}
        {evening && (
          <Banner
            key="evening"
            tone="plan"
            icon={<MoonIcon size={18} />}
            onClick={() => setTab('plan')}
            title="Plan tomorrow"
            text={tomorrowCount ? `${tomorrowCount} planned · tap to review` : 'Write it down tonight, sleep easier.'}
          />
        )}
      </AnimatePresence>

      {nearBed && <BedtimeNote day={today} />}

      <p className="pb-2 text-center text-[11.5px] text-faint">Tap ○ to complete · swipe left or tap × if you didn't · tap a plan for details</p>
    </div>
  );
}

function ColumnHeader({ title, color, done, total, action }: { title: string; color: string; done: number; total: number; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex h-8 items-center justify-between gap-1 px-0.5">
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em]">
        <span className="h-3.5 w-1 rounded-full" style={{ background: color }} />
        {title}
        <span className="tabular text-[12.5px] font-medium text-muted">
          {done}/{total}
        </span>
      </h2>
      {action}
    </div>
  );
}

function EmptyColumn({ text, cta, onClick }: { text: string; cta: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-line-strong/60 px-2 py-6 text-center"
    >
      <span className="text-[13px] text-muted">{text}</span>
      <span className="text-[13px] font-semibold text-plan">{cta} →</span>
    </button>
  );
}

function Banner({
  title,
  text,
  tone,
  icon,
  onClick,
  onDismiss,
}: {
  title: string;
  text: string;
  tone: 'habit' | 'plan' | 'miss';
  icon?: React.ReactNode;
  onClick?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="relative flex items-center gap-3 overflow-hidden rounded-[20px] border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, var(--${tone}) 30%, transparent)`,
        background: `color-mix(in srgb, var(--${tone}) 10%, var(--surface))`,
      }}
    >
      <button
        onClick={() => {
          haptic(6);
          onClick?.();
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        disabled={!onClick}
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full"
          style={{ background: `color-mix(in srgb, var(--${tone}) 20%, transparent)`, color: `var(--${tone})` }}
        >
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
  if (!total) return 'Add a habit or a plan to start.';
  if (s.pending === 0) return s.score === 1 ? 'Perfect day. Every promise kept ✨' : 'Day closed. All accounted for.';
  if (s.pending === 1) return 'One left. Finish strong.';
  if (s.pending <= 3) return `${s.pending} left — you're close.`;
  if (s.habitsDone + s.plansDone === 0) return `${s.pending} promises. Start with the easiest.`;
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
