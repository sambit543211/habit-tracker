import { useMemo } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, habitsOn, plansOn } from '../lib/score';
import { useData } from '../lib/useData';
import { Ring, AnimatedNumber } from '../components/Ring';
import { HabitRows } from '../components/HabitRows';
import { PlanRows } from '../components/PlanRows';
import { PlusIcon } from '../components/icons';
import { APP_NAME } from '../config';

/**
 * Quick page (open with #quick): today's ring, one-tap habits and water, and add-a-plan.
 * Meant to be saved to the Home Screen as a second icon for 2-second check-ins.
 */
export function Quick({ today }: { today: string }) {
  const data = useData();
  const stats = useMemo(() => dayStats(data, today), [data, today]);
  const name = useStore((s) => s.profile.name?.trim().split(/\s+/)[0]);
  const habits = habitsOn(data, today);
  const plans = plansOn(data, today);
  const score = Math.round((stats.score ?? 0) * 100);
  return (
    <main className="safe-top mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-10">
      <header className="flex items-center gap-4 pt-3">
        <div className="relative shrink-0">
          <Ring value={stats.habitPct} color="var(--habit)" size={76} stroke={9} />
          <div className="absolute inset-[11px]">
            <Ring value={stats.planPct} color="var(--plan)" size={54} stroke={9} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold tracking-[0.1em] text-muted uppercase">{APP_NAME} · Quick</div>
          <div className="flex items-start">
            <AnimatedNumber value={score} className="tabular text-[38px] leading-none font-bold" />
            <span className="mt-1 ml-0.5 text-[15px] font-semibold text-muted">%</span>
          </div>
          <div className="truncate text-[13px] text-muted">{stats.pending ? `${stats.pending} left${name ? `, ${name}` : ''}` : 'All done today ✨'}</div>
        </div>
      </header>
      {habits.length > 0 && <HabitRows habits={habits} day={today} />}
      {plans.length > 0 && <PlanRows plans={plans} />}
      <button
        onClick={() => useUI.getState().editPlan({ day: today })}
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-plan/50 bg-plan/10 text-[15px] font-semibold text-plan"
      >
        <PlusIcon size={18} strokeWidth={2.6} /> Add a plan
      </button>
      <a href="./" className="mt-auto py-2 text-center text-[13px] font-medium text-muted underline underline-offset-2">
        Open the full app
      </a>
    </main>
  );
}
