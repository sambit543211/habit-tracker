import { motion } from 'framer-motion';
import type { Recap } from '../lib/game';
import { formatDay } from '../lib/date';
import { reasonLabel } from '../lib/reasons';

/** "Your week": best habit, the one that slipped, plans done, and one suggestion. */
export function RecapCard({ recap }: { recap: Recap }) {
  const pct = recap.avg === null ? null : Math.round(recap.avg * 100);
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card px-4 py-4" aria-label="Last week recap">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Last week</h2>
        <span className="text-[12px] text-faint">
          {formatDay(recap.from, { day: 'numeric', month: 'short' })} – {formatDay(recap.to, { day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Num value={pct === null ? '–' : `${pct}%`} label="Avg score" />
        <Num value={`${recap.plans.done}/${recap.plans.of}`} label="Plans done" />
        <Num value={String(recap.days)} label="Days tracked" />
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-[13.5px]">
        {recap.best && (
          <li className="flex gap-2">
            <span aria-hidden>🏆</span>
            <span>
              <b>{recap.best.name}</b> — {recap.best.done}/{recap.best.of} days. Your strongest.
            </span>
          </li>
        )}
        {recap.worst && (
          <li className="flex gap-2">
            <span aria-hidden>🔧</span>
            <span>
              <b>{recap.worst.name}</b> slipped — {recap.worst.done}/{recap.worst.of} days
              {recap.worst.reason ? `, mostly “${reasonLabel(recap.worst.reason).toLowerCase()}”` : ''}.
            </span>
          </li>
        )}
      </ul>
      <p className="mt-3 rounded-xl bg-plan/10 px-3 py-2.5 text-[13px] leading-snug">
        <span className="font-semibold text-plan">This week: </span>
        {recap.tip}
      </p>
    </motion.section>
  );
}

function Num({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 py-2.5">
      <div className="tabular text-[18px] font-bold">{value}</div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  );
}
