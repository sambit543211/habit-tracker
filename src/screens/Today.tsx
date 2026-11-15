import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, habitsOn, plansOn, streakFor } from '../lib/score';
import { useData } from '../lib/useData';
import { addDays, formatDay, weekday } from '../lib/date';
import { isEvening } from '../lib/useToday';
import { AnimatedNumber, Ring } from '../components/Ring';
import { HabitRows } from '../components/HabitRows';
import { PlanRows } from '../components/PlanRows';
import { Banner, ColumnHeader, EmptyColumn, SmartEmptyPlans, Tonight } from '../components/TodayParts';
import { FlameIcon, PlusIcon } from '../components/icons';
import { celebrateBig, celebrateSmall, haptic } from '../lib/feedback';
import { reviewWeekFor } from '../components/WeeklyReviewSheet';
import { greeting, sinceWake, toMin } from '../lib/time';
import { pace } from '../lib/game';
import { fmtElapsed, quitStats } from '../lib/quit';
import { circleScore, groupStreak, useCircle } from '../lib/circle';

export function Today({ today, hour }: { today: string; hour: number }) {
  const data = useData();
  const { logs, startDay } = data;
  const freshStartSeen = useStore((s) => s.freshStartSeen);
  const profile = useStore((s) => s.profile);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const { dismissFreshStart, markSwipeHintSeen, markSeen } = useStore();
  const shieldSeen = useStore((s) => s.shieldSeen);
  const dayClosedSeen = useStore((s) => s.dayClosedSeen);
  const setCloseDay = useUI((s) => s.setCloseDay);
  const swipeHintSeen = useStore((s) => s.swipeHintSeen);
  const { setTab, setReviewWeek, editPlan, editHabit } = useUI();

  const stats = useMemo(() => dayStats(data, today), [data, today]);
  const st = useMemo(() => streakFor(data, today, profile), [data, today, profile]);
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
  const wd = weekday(today);
  const reviewDue = (wd === 0 || wd === 1) && !weeklyReviews[reviewWeekFor(today)] && !!startDay && startDay < today;
  // One-time swipe tutorial on the first open habit.
  const hintHabit = !swipeHintSeen ? todayHabits.find((h) => !logs[today]?.[h.id]) : undefined;
  const pc = stats.pending > 0 ? pace(data, today, nowSince, toMin(profile.wake)) : null;
  const paceText =
    pc && (pc.usual > 0 || pc.diff !== 0)
      ? pc.diff > 0
        ? { text: `Ahead of your usual by ${pc.diff}`, color: 'var(--habit)' }
        : pc.diff === 0
          ? { text: `On pace · usually ${pc.usual} habit${pc.usual === 1 ? '' : 's'} by now`, color: 'var(--muted)' }
          : { text: `Behind your usual by ${-pc.diff}`, color: 'var(--gold)' }
      : null;
  const yesterday = addDays(today, -1);
  const shieldUsed = st.shieldedDays.includes(yesterday) && shieldSeen !== yesterday;
  const lateEvening = hour >= 21 || hour < 2;
  const showCloseDay = lateEvening && stats.habitsTotal + stats.plansTotal > 0 && (stats.pending > 0 || dayClosedSeen !== today);
  const newUser = !startDay || startDay > addDays(today, -7);
  const smokes = useStore((s) => s.smokes);
  const q = profile.quit?.enabled ? profile.quit : null;
  const qs = q ? quitStats(q, smokes, today) : null;
  const circleData = useCircle((s) => s.data);
  const refreshCircle = useCircle((s) => s.refresh);
  const circleOn = !!profile.circle;
  useEffect(() => {
    if (!circleOn) return;
    const t = setTimeout(() => void refreshCircle(today), 1200); // after my ticks have synced
    return () => clearTimeout(t);
  }, [circleOn, today, logs, refreshCircle]);
  const cs = circleOn ? circleScore(circleData) : null;
  const activeMembers = circleData?.circle?.members.filter((m) => m.status === 'active').length ?? 0;
  const bestGroup = Math.max(0, ...(circleData?.circle?.goals ?? []).map((g) => groupStreak(g, activeMembers)));
  const pendingInvite = circleOn && !!circleData?.invite;
  const nudges = circleData?.circle?.reactions.filter((r) => r.to === circleData.me && r.kind === 'nudge').length ?? 0;
  const addPlan = () => {
    haptic(8);
    editPlan({ day: today });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
            {formatDay(today, { weekday: 'long', day: 'numeric', month: 'short' })}
          </div>
          <h1 className="truncate text-[22px] leading-tight font-bold tracking-[-0.03em] min-[380px]:text-[24px]">
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
          title={atRisk ? 'Streak at risk — finish your habits before 2 am' : profile.streakRule === 'most' ? 'Streak: days with at least 80% of habits done' : 'Strict streak: days with every habit done'}
        >
          <FlameIcon size={15} />
          <span className="tabular text-[15px] font-semibold">{st.current}</span>
          {st.shields > 0 && (
            <span className="tabular ml-0.5 text-[12px] font-semibold opacity-90" aria-label={`${st.shields} streak shield${st.shields > 1 ? 's' : ''}`}>
              🛡{st.shields}
            </span>
          )}
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
          <div className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
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
          {paceText && (
            <p className="mt-0.5 truncate text-[12px] font-medium" style={{ color: paceText.color }}>
              {paceText.text}
            </p>
          )}
        </div>
        <div className="relative shrink-0">
          <Ring value={stats.habitPct} color="var(--habit)" size={92} stroke={10} label={`Habits: ${stats.habitsDone} of ${stats.habitsTotal} done`} />
          <div className="absolute inset-[13px]">
            <Ring value={stats.planPct} color="var(--plan)" size={66} stroke={10} label={`Plans: ${stats.plansDone} of ${stats.plansTotal} done`} />
          </div>
        </div>
      </motion.section>

      {(() => {
        const showCircle = circleOn && (!!cs || pendingInvite);
        const both = showCircle && !!qs;
        const tone = (v: number) => (v === 1 ? 'var(--habit)' : v >= 0.5 ? 'var(--gold)' : 'var(--muted)');
        const cell = 'flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-left';
        if (!showCircle && !qs) return null;
        return (
          <div className={`grid gap-2 ${both ? 'grid-cols-2' : ''}`}>
            {showCircle && (
              <button
                onClick={() => setTab('circle')}
                aria-label={cs ? `Circle score ${Math.round(cs.score * 100)} percent. Open circle` : 'You have a circle request'}
                className={cell}
              >
                <span className="min-w-0 truncate text-[13px] font-medium">
                  <span aria-hidden>👥 </span>
                  {pendingInvite
                    ? 'Circle request'
                    : both
                      ? `Circle ${cs!.done}/${cs!.total}${nudges ? ` · 👋${nudges}` : bestGroup > 0 ? ` · 🔥${bestGroup}` : ''}`
                      : `Circle · ${cs!.done} of ${cs!.total} done${bestGroup > 0 ? ` · 🔥 ${bestGroup} together` : ''}${nudges ? ` · 👋 ${nudges}` : ''}`}
                </span>
                {cs && (
                  <span className="tabular shrink-0 text-[15px] font-bold" style={{ color: tone(cs.score) }}>
                    {Math.round(cs.score * 100)}%
                  </span>
                )}
              </button>
            )}
            {qs && (
              <button
                onClick={() => setTab('quit')}
                aria-label={`Quit smoking score ${Math.round(qs.score * 100)} percent. ${qs.today} smoked today. Open quit tab`}
                className={cell}
              >
                <span className="min-w-0 truncate text-[13px] font-medium">
                  <span aria-hidden>🚭 </span>
                  {qs.limit === 0 ? `${fmtElapsed(qs.smokeFreeMs)} free` : both ? `Quit ${qs.today}/${qs.limit}` : `Quit · ${qs.today} of ${qs.limit} today`}
                </span>
                <span className="tabular shrink-0 text-[15px] font-bold" style={{ color: qs.score === 1 ? 'var(--habit)' : qs.score >= 0.5 ? 'var(--gold)' : 'var(--miss)' }}>
                  {Math.round(qs.score * 100)}%
                </span>
              </button>
            )}
          </div>
        );
      })()}

      <AnimatePresence>
        {hintHabit && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted"
          >
            <span className="font-semibold text-habit">Swipe →</span> done
            <span className="text-faint">·</span>
            <span className="font-semibold text-miss">← Swipe</span> didn't
          </motion.div>
        )}
      </AnimatePresence>

      {/* Habits | Plans side by side */}
      <div className="grid grid-cols-2 gap-2.5">
        <section className="min-w-0">
          <ColumnHeader
            title="Habits"
            color="var(--habit)"
            done={stats.habitsDone}
            total={stats.habitsTotal}
            action={
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => {
                  haptic(8);
                  editHabit('new');
                }}
                aria-label="Add a habit"
                className="relative grid size-9 place-items-center rounded-full border border-habit/40 bg-habit/15 text-habit before:absolute before:-inset-1 before:content-['']"
              >
                <PlusIcon size={18} strokeWidth={2.6} />
              </motion.button>
            }
          />
          {todayHabits.length ? (
            <HabitRows
              habits={todayHabits}
              day={today}
              showTiny={hour >= 18 || hour < 2}
              compact
              hintId={hintHabit?.id}
              onHintDone={() => setTimeout(markSwipeHintSeen, 2500)}
            />
          ) : (
            <EmptyColumn text="No habits yet" cta="Add a habit" onClick={() => editHabit('new')} />
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
                className="relative grid size-9 place-items-center rounded-full bg-plan text-white shadow-[0_4px_16px_color-mix(in_srgb,var(--plan)_45%,transparent)] before:absolute before:-inset-1 before:content-['']"
              >
                <PlusIcon size={18} strokeWidth={2.6} />
              </motion.button>
            }
          />
          {todayPlans.length ? (
            <PlanRows plans={todayPlans} compact />
          ) : (
            <SmartEmptyPlans today={today} onAdd={addPlan} />
          )}
        </section>
      </div>

      {/* Tonight: one card for the end-of-day ritual (close the day → plan tomorrow → weekly review on Sun/Mon) */}
      {evening && (
        <Tonight
          showClose={showCloseDay}
          pending={stats.pending}
          tomorrowCount={tomorrowCount}
          reviewDue={reviewDue}
          onClose={() => setCloseDay(true)}
          onPlan={() => setTab('plan')}
          onReview={() => setReviewWeek(true)}
        />
      )}

      <AnimatePresence>
        {shieldUsed && (
          <Banner
            key="shield"
            tone="habit"
            icon={<span className="text-[16px]">🛡</span>}
            title="Shield used — streak saved"
            text={`Yesterday's miss didn't break your ${st.current}-day streak. ${st.shields} left.`}
            onDismiss={() => markSeen({ shieldSeen: yesterday })}
          />
        )}
        {reviewDue && !evening && (
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
      </AnimatePresence>

      {newUser && <p className="pb-2 text-center text-[12px] text-faint">Tap ○ when done · unfinished plans move to tomorrow · tap a plan to edit</p>}
    </div>
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
