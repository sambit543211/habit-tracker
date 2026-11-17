import { AnimatePresence, motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { Sheet } from './Sheet';
import { WATER_STEP, fmtWater, waterTarget } from '../lib/water';
import { haptic, celebrateSmall } from '../lib/feedback';

const ADD = [WATER_STEP, 250, 500];

/** Log water a sip at a time; the glass fills up toward the day's target. */
export function WaterSheet() {
  const target = useUI((s) => s.water);
  const close = () => useUI.getState().openWater(null);
  const habit = useStore((s) => (target ? s.habits.find((h) => h.id === target.id) : undefined));
  const amount = useStore((s) => (target ? (s.amounts[target.day]?.[target.id] ?? 0) : 0));
  const addWater = useStore((s) => s.addWater);
  const goal = habit ? (waterTarget(habit) ?? 2000) : 2000;
  const pct = Math.min(1, amount / goal);
  const done = amount >= goal;

  const add = (ml: number) => {
    if (!target) return;
    const before = amount;
    haptic(10);
    addWater(target.day, target.id, ml);
    if (before < goal && before + ml >= goal) {
      haptic([20, 40, 30]);
      celebrateSmall();
    }
  };

  return (
    <Sheet open={!!target} onClose={close}>
      {habit && (
        <div className="flex flex-col items-center text-center">
          <h2 className="self-start text-[22px] font-semibold tracking-[-0.02em]">💧 {habit.name}</h2>
          <p className="self-start text-[13.5px] text-muted">Tap each time you drink. It ticks itself at {fmtWater(goal)}.</p>

          {/* The glass */}
          <div className="relative mt-5 h-52 w-36">
            <svg viewBox="0 0 120 170" className="absolute inset-0 size-full" aria-hidden>
              <defs>
                <clipPath id="glass">
                  <path d="M10 6 H110 L98 160 Q97 166 90 166 H30 Q23 166 22 160 Z" />
                </clipPath>
              </defs>
              <g clipPath="url(#glass)">
                <rect x="0" y="0" width="120" height="170" fill="var(--surface-2)" />
                <motion.g initial={false} animate={{ y: 166 - 160 * pct }} transition={{ type: 'spring', stiffness: 90, damping: 16 }}>
                  <motion.path
                    d="M-60 6 Q-45 0 -30 6 T0 6 T30 6 T60 6 T90 6 T120 6 T150 6 T180 6 V200 H-60 Z"
                    fill="#38bdf8"
                    opacity={0.9}
                    animate={{ x: [0, 60] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'linear' }}
                  />
                </motion.g>
              </g>
              <path d="M10 6 H110 L98 160 Q97 166 90 166 H30 Q23 166 22 160 Z" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="rounded-2xl bg-bg/60 px-3 py-1.5 backdrop-blur-sm">
                <div className="tabular text-[24px] font-bold">{fmtWater(amount)}</div>
                <div className="text-[12px] text-muted">of {fmtWater(goal)}</div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.p
              key={done ? 'done' : 'left'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-3 text-[14.5px] font-semibold ${done ? 'text-habit' : 'text-muted'}`}
            >
              {done ? 'Target reached — habit ticked ✓' : `${fmtWater(goal - amount)} to go · about ${Math.ceil((goal - amount) / 250)} glass${Math.ceil((goal - amount) / 250) === 1 ? '' : 'es'}`}
            </motion.p>
          </AnimatePresence>

          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            {ADD.map((ml) => (
              <motion.button
                key={ml}
                whileTap={{ scale: 0.92 }}
                onClick={() => add(ml)}
                className="min-h-16 rounded-2xl border border-sky-400/40 bg-sky-400/10 text-[16px] font-bold text-sky-400"
              >
                +{ml}
                <span className="block text-[11.5px] font-medium text-muted">{ml === 200 ? 'sip' : ml === 250 ? 'glass' : 'bottle'}</span>
              </motion.button>
            ))}
          </div>
          <button
            disabled={amount === 0}
            onClick={() => add(-Math.min(WATER_STEP, amount))}
            className="mt-2 min-h-11 w-full text-[14px] font-medium text-muted disabled:opacity-30"
          >
            Undo {WATER_STEP} ml
          </button>
        </div>
      )}
    </Sheet>
  );
}
