import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { fmtElapsed, fmtLife, quitStats, todayWin } from '../lib/quit';
import { bestGroupStreak, circleScore, nudgesForMe, useCircle } from '../lib/circle';

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
  const wide = useWide();
  const todayHabits = habitsOn(data, today);
  const todayPlans = plansOn(data, today);
  const tomorrowCount = plansOn(data, addDays(today, 1)).length;

  useCelebrations(stats.perfectHabits, stats.score === 1 && stats.pending === 0, today);

  const evening = isEvening(hour);
  // "Fresh start" only means something once you have a past to start fresh from.
  const isFreshStart = (weekday(today) === 1 || today.endsWith('-01')) && freshStartSeen !== today && !!startDay && startDay <= addDays(today, -7);
  const atRisk = !st.todayDone && st.current > 0 && evening;
  const score = stats.score === null ? 0 : Math.round(stats.score * 100);
  const firstName = profile.name?.split(/\s+/)[0];
  const now = new Date();
  const nowSince = sinceWake(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, profile);
  const wd = weekday(today);
  const reviewDue = (wd === 0 || wd === 1) && !weeklyReviews[reviewWeekFor(today)] && !!startDay && startDay < today;
  // One-time swipe tutorial on the first open habit.
  // How-to line until the first check-in ever; then it goes away for good.
  const anyLog = Object.keys(logs).length > 0;
  const showHowTo = !swipeHintSeen && !anyLog && todayHabits.length > 0;
  useEffect(() => {
    if (!swipeHintSeen && anyLog) markSwipeHintSeen();
  }, [swipeHintSeen, anyLog, markSwipeHintSeen]);
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
  const smokes = useStore((s) => s.smokes);
  const q = profile.quit?.enabled ? profile.quit : null;
  const qs = q ? quitStats(q, smokes, today) : null;
  const qw = q ? todayWin(q, smokes, today) : null;
  const circleData = useCircle((s) => s.data);
  const refreshCircle = useCircle((s) => s.refresh);
  const circleOn = !!profile.circle;
  // Always check (cheap): circle requests must show up even before Circle mode is switched on.
  useEffect(() => {
    const t = setTimeout(() => void refreshCircle(today), 1200); // after my ticks have synced
    return () => clearTimeout(t);
  }, [today, logs, refreshCircle]);
  const cs = circleOn ? circleScore(circleData) : null;
  const bestGroup = bestGroupStreak(circleData);
  // Invites show even when Circle mode is off — otherwise a request would be invisible.
  const invites = circleData?.invites.length ?? 0;
  const pendingInvite = invites > 0;
  const nudges = nudgesForMe(circleData);
  const markHabit = useStore((s) => s.markHabit);
  const setProfile = useStore((s) => s.setProfile);
  const [promoHidden, setPromoHidden] = useState(() => {
    try {
      return !!localStorage.getItem('keep-circle-promo');
    } catch {
      return false;
    }
  });
  // Friends nudged me about a shared habit I still haven't done → banner with a one-tap Done.
  const nudgedFor = (() => {
    if (!circleData) return [];
    const out = new Map<string, { habitId: string; habit: string; goal: string; from: string[]; msg?: string | null; again?: boolean }>();
    for (const c of circleData.circles ?? []) {
      const nameOf = (id: string) => c.members.find((m) => m.user_id === id)?.name.split(/\s+/)[0] ?? 'A friend';
      for (const r of c.reactions) {
        if (r.to !== circleData.me || r.kind !== 'nudge') continue;
        const g = c.goals.find((x) => x.id === r.goal);
        const link = g?.links.find((l) => l.user_id === circleData.me);
        if (!g || !link || logs[today]?.[link.habit_id]?.status === 'done') continue;
        if (!data.habits.some((h) => h.id === link.habit_id && !h.archivedDay)) continue;
        const e = out.get(link.habit_id) ?? { habitId: link.habit_id, habit: link.habit, goal: g.name, from: [] };
        if (!e.from.includes(nameOf(r.from))) e.from.push(nameOf(r.from));
        if (r.msg) e.msg = r.msg;
        if ((r.times ?? 1) > 1) e.again = true;
        out.set(link.habit_id, e);
      }
    }
    return [...out.values()];
  })();
  const addPlan = () => {
    haptic(8);
    editPlan({ day: today });
  };

  // After "Start fresh" with day 1 = tomorrow: nothing counts today.
  if (startDay && startDay > today) {
    const n = data.habits.filter((h) => !h.archivedDay).length;
    return (
      <div className="flex flex-col gap-4">
        <header className="pt-1">
          <div className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">{formatDay(today, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
          <h1 className="text-[24px] leading-tight font-bold tracking-[-0.03em]">
            {greeting(hour)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </header>
        <section className="card hero px-5 py-6 text-center">
          <div className="text-[40px]" aria-hidden>🌱</div>
          <h2 className="mt-2 text-[22px] font-bold tracking-[-0.02em]">Day 1 is {formatDay(startDay, { weekday: 'long' })}</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-[14.5px] text-muted">
            A clean slate: score, streak and level all start at zero. Your {n} habit{n === 1 ? ' is' : 's are'} ready.
          </p>
          <button onClick={() => setTab('plan')} className="mt-5 min-h-12 w-full rounded-2xl bg-plan text-[15px] font-semibold text-white">
            Plan {formatDay(startDay, { weekday: 'long' })} →
          </button>
          <button onClick={() => setTab('profile')} className="mt-1 min-h-11 w-full text-[14px] font-medium text-muted">
            Review or reorder your habits
          </button>
        </section>
      </div>
    );
  }

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
        {st.current > 0 && (
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
        )}
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
            {"Today's promises"}
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
        const showCircle = pendingInvite || (circleOn && !!cs);
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
                    ? invites > 1
                      ? `${invites} circle requests`
                      : 'Circle request'
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
                aria-label={`${qs.today} smoked today${qs.limit ? ` of a limit of ${qs.limit}` : ''}. ${fmtLife(qw!.minutes)} of life won back today. Open quit tab`}
                className={cell}
              >
                <span className="min-w-0 truncate text-[13px] font-medium">
                  <span aria-hidden>🚭 </span>
                  {qs.limit === 0 ? `${fmtElapsed(qs.smokeFreeMs)} free` : both ? `${qs.today}/${qs.limit} today` : `${qs.today} of ${qs.limit} today`}
                </span>
                <span className="tabular shrink-0 text-[13px] font-bold" style={{ color: qs.today > qs.limit ? 'var(--miss)' : 'var(--habit)' }}>
                  {qw!.minutes > 0 ? `+${fmtLife(qw!.minutes, true)}` : `${qs.today} 🚬`}
                </span>
              </button>
            )}
          </div>
        );
      })()}

      <AnimatePresence initial={false}>
        {nudgedFor.map((n) => (
          <motion.div
            key={n.habitId}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="flex items-center gap-3 rounded-[20px] border border-gold/40 bg-gold/10 px-3.5 py-3"
          >
            <span className="text-[24px]" aria-hidden>👋</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-semibold">
                {n.from.join(' & ')} nudged you{n.again ? ' again' : ''} · {n.goal}
              </div>
              <div className="truncate text-[13px] text-muted">{n.msg ? `“${n.msg}”` : `${n.habit} is still open`}</div>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                haptic([15, 30, 15]);
                markHabit(today, n.habitId);
              }}
              className="min-h-11 shrink-0 rounded-full bg-habit px-4 text-[14px] font-semibold text-black/80"
            >
              Done ✓
            </motion.button>
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {showHowTo && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted"
          >
            Tap a habit when it's done
            <span className="text-faint">·</span>
            <span className="font-semibold text-miss">← swipe</span> if you didn't
          </motion.div>
        )}
      </AnimatePresence>

      {/* Habits then Plans on phones; side by side when there's room */}
      <div className={wide ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-4'}>
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
              compact={wide}
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
                className="relative grid size-9 place-items-center rounded-full border border-plan/40 bg-plan/15 text-plan before:absolute before:-inset-1 before:content-['']"
              >
                <PlusIcon size={18} strokeWidth={2.6} />
              </motion.button>
            }
          />
          {todayPlans.length ? (
            <PlanRows plans={todayPlans} compact={wide} />
          ) : (
            <SmartEmptyPlans today={today} onAdd={addPlan} />
          )}
        </section>
      </div>

      {/* Circle is the social part of the app — offer it from day 2 to people who haven't tried it */}
      {!circleOn && !pendingInvite && !!startDay && startDay < today && !promoHidden && (
        <Banner
          key="circle-promo"
          tone="plan"
          icon={<span className="text-[16px]">👥</span>}
          title="Do it with a friend"
          text="Share a habit, nudge each other, keep a streak together."
          onClick={() => {
            setProfile({ circle: true });
            setTab('circle');
          }}
          onDismiss={() => {
            try {
              localStorage.setItem('keep-circle-promo', '1');
            } catch {
              /* ignore */
            }
            setPromoHidden(true);
          }}
        />
      )}

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

/** Two columns only when the screen is wide enough for them to read well (tablets, big landscape). */
function useWide(min = 560) {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
}
