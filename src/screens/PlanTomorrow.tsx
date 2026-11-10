import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useStore } from '../store';
import { planCapacity, plansOn } from '../lib/score';
import { addDays, formatDay } from '../lib/date';
import { PlanInput } from '../components/PlanInput';
import { StarIcon, TrashIcon } from '../components/icons';
import type { Plan } from '../types';

const MUST_LIMIT = 3;

/** Evening ritual: decide tomorrow tonight. */
export function PlanTomorrow({ today }: { today: string }) {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const { addPlan, deletePlan, toggleMust } = useStore();

  const tomorrow = addDays(today, 1);
  const list = plansOn({ habits, plans, logs, startDay }, tomorrow);
  const musts = list.filter((p) => p.must).sort((a, b) => a.createdAt - b.createdAt);
  const extras = list.filter((p) => !p.must).sort((a, b) => a.createdAt - b.createdAt);
  const capacity = useMemo(() => planCapacity({ habits, plans, logs, startDay }, today), [habits, plans, logs, startDay, today]);
  const overplanned = capacity !== null && list.length > Math.ceil(capacity) + 1;

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-2">
        <div className="text-[13px] font-semibold tracking-[0.08em] text-plan uppercase">Tonight's ritual</div>
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.03em]">Plan tomorrow</h1>
        <p className="mt-1 text-[15px] text-muted">{formatDay(tomorrow, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </header>

      <div className="card px-4 py-3.5 text-[13.5px] leading-relaxed text-muted">
        <span className="font-semibold text-text">Why tonight?</span> Writing tomorrow's to-dos before bed helped people fall asleep faster
        (Scullin et al., 2018) — your brain stops rehearsing them.
      </div>

      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            <StarIcon size={16} filled className="text-gold" /> Must-dos
          </h2>
          <span className={`tabular text-[13px] font-medium ${musts.length > MUST_LIMIT ? 'text-miss' : 'text-muted'}`}>
            {musts.length}/{MUST_LIMIT}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {musts.map((p) => (
              <PlanCard key={p.id} plan={p} onDelete={() => deletePlan(p.id)} onToggle={() => toggleMust(p.id)} />
            ))}
          </AnimatePresence>
        </ul>
        {musts.length > MUST_LIMIT && (
          <p className="mt-2 px-1 text-[13px] text-miss">More than 3 must-dos dilutes focus. Demote one to "nice to have"?</p>
        )}
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="text-[17px] font-semibold">Nice to have</h2>
          <span className="tabular text-[13px] font-medium text-muted">{extras.length}</span>
        </div>
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {extras.map((p) => (
              <PlanCard key={p.id} plan={p} onDelete={() => deletePlan(p.id)} onToggle={() => toggleMust(p.id)} />
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <PlanInput
        key={musts.length < MUST_LIMIT ? 'must' : 'extra'}
        defaultMust={musts.length < MUST_LIMIT}
        placeholder={musts.length < MUST_LIMIT ? 'A must-do for tomorrow' : 'Something nice to get done'}
        onAdd={(t, m) => addPlan(tomorrow, t, m)}
      />

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
              You usually finish about {capacity!.toFixed(1)} plans a day, and you've planned {list.length}. We all overestimate how much fits
              in a day — trim now so tomorrow feels like a win.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {list.length > 0 && (
        <p className="text-center text-[13px] text-faint">Saved automatically. Close the app and rest. 🌙</p>
      )}
    </div>
  );
}

function PlanCard({ plan, onDelete, onToggle }: { plan: Plan; onDelete: () => void; onToggle: () => void }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.18 } }}
      className="flex min-h-[60px] list-none items-center gap-3 rounded-[20px] border border-line bg-surface px-3 py-2.5"
    >
      <motion.button whileTap={{ scale: 0.85 }} onClick={onToggle} aria-label="Toggle must-do"
        className={`grid size-9 shrink-0 place-items-center rounded-full ${plan.must ? 'text-gold' : 'text-faint'}`}>
        <StarIcon size={18} filled={plan.must} />
      </motion.button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15.5px] font-medium">{plan.title}</div>
        {plan.carryCount > 0 && (
          <div className={`text-[12.5px] ${plan.carryCount >= 3 ? 'text-miss' : 'text-gold'}`}>Moved {plan.carryCount}×</div>
        )}
      </div>
      <motion.button whileTap={{ scale: 0.85 }} onClick={onDelete} aria-label="Delete plan" className="grid size-9 shrink-0 place-items-center rounded-full text-faint hover:text-miss">
        <TrashIcon size={17} />
      </motion.button>
    </motion.li>
  );
}
