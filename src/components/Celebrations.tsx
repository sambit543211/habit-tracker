import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { dayStats, streak } from '../lib/score';
import { celebrateBig } from '../lib/feedback';
import { Sheet } from './Sheet';
import { Ring } from './Ring';
import { FlameIcon } from './icons';

/** Streak milestones. 66 days ≈ median time for a habit to become automatic (Lally et al., 2010). */
const MILESTONES: { n: number; title: string; text: string }[] = [
  { n: 7, title: 'One full week', text: 'Seven days of every promise kept. The hardest part is behind you.' },
  { n: 21, title: 'Three weeks strong', text: "It's starting to feel normal. That's the habit forming." },
  { n: 30, title: 'A whole month', text: 'Thirty days without breaking the chain. Rare air.' },
  { n: 66, title: 'Automatic', text: '66 days is the median time it takes a habit to become automatic. This is who you are now.' },
  { n: 100, title: 'Triple digits', text: 'One hundred days. Most people never get here.' },
  { n: 365, title: 'One year', text: 'A full year of keeping your word to yourself.' },
];

/** Day-closed summary + streak milestone moments. */
export function Celebrations({ today }: { today: string }) {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const name = useStore((s) => s.profile.name);
  const milestonesSeen = useStore((s) => s.milestonesSeen);
  const markMilestone = useStore((s) => s.markMilestone);
  const dayClosedSeen = useStore((s) => s.dayClosedSeen);
  const markDayClosed = useStore((s) => s.markDayClosed);

  const data = { habits, plans, logs, startDay };
  const stats = useMemo(() => dayStats(data, today), [habits, plans, logs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => streak(data, today), [habits, logs, startDay, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const closed = stats.habitsTotal + stats.plansTotal > 0 && stats.pending === 0;

  // Day closed: only when it happens now (not on reload).
  const prevClosed = useRef(closed);
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => {
    if (closed && !prevClosed.current && dayClosedSeen !== today) {
      setTimeout(() => setShowClosed(true), 900); // let the confetti play first
      markDayClosed(today);
    }
    prevClosed.current = closed;
  }, [closed, today, dayClosedSeen, markDayClosed]);

  // Milestones: the first time a streak reaches each one.
  const milestone = st.todayDone ? MILESTONES.find((m) => m.n === st.current && !milestonesSeen.includes(m.n)) : undefined;
  useEffect(() => {
    if (milestone) setTimeout(() => celebrateBig(), 300);
  }, [milestone]);

  const score = Math.round((stats.score ?? 0) * 100);

  return (
    <>
      <Sheet open={showClosed && !milestone} onClose={() => setShowClosed(false)} z={60}>
        <div className="flex flex-col items-center pt-2 pb-2 text-center">
          <Ring value={stats.score} color="var(--habit)" size={120} stroke={11}>
            <span className="tabular text-[34px] font-bold tracking-[-0.03em]">{score}%</span>
          </Ring>
          <h2 className="mt-5 text-[24px] font-bold tracking-[-0.02em]">{score === 100 ? 'Every promise kept' : 'Day closed'}</h2>
          <p className="mt-1.5 max-w-xs text-[14.5px] text-muted">
            {score === 100
              ? `${name ? `${name}, you` : 'You'} did everything you said you would.`
              : 'Every item accounted for. Honesty is what makes the score mean something.'}
          </p>
          <div className="mt-5 grid w-full grid-cols-3 gap-2">
            <Mini label="Habits" value={`${stats.habitsDone}/${stats.habitsTotal}`} color="var(--habit)" />
            <Mini label="Plans" value={`${stats.plansDone}/${stats.plansTotal}`} color="var(--plan)" />
            <Mini label="Streak" value={String(st.current)} color="var(--gold)" />
          </div>
          <button onClick={() => setShowClosed(false)} className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg">
            Done
          </button>
        </div>
      </Sheet>

      <AnimatePresence>
        {milestone && (
          <motion.div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-8 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => markMilestone(milestone.n)}
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -8, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              className="flex flex-col items-center text-center text-white"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                className="relative grid size-40 place-items-center rounded-full"
                style={{ background: 'radial-gradient(circle at 30% 30%, #ffd88a, #ffb547 45%, #e8890c)', boxShadow: '0 0 80px rgba(255,181,71,0.55)' }}
              >
                <div className="flex flex-col items-center">
                  <FlameIcon size={34} className="text-white/90" />
                  <span className="text-[44px] leading-none font-black tabular">{milestone.n}</span>
                  <span className="text-[11px] font-bold tracking-[0.2em] uppercase opacity-80">days</span>
                </div>
              </motion.div>
              <h2 className="mt-8 text-[30px] font-bold tracking-[-0.03em]">{milestone.title}</h2>
              <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-white/75">{milestone.text}</p>
              <button className="mt-8 rounded-full bg-white px-8 py-3 text-[15px] font-semibold text-black">Keep going</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-2 py-3">
      <div className="tabular text-[18px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  );
}
