import { motion } from 'framer-motion';
import { useState } from 'react';
import { useData } from '../lib/useData';
import { dayStats, reasonCounts, weekdayAverages } from '../lib/score';
import { addDays, formatDay, fromKey, range, toKey, WEEKDAYS } from '../lib/date';
import { REASONS } from '../lib/reasons';
import { HabitHistorySheet } from '../components/HabitHistorySheet';
import type { Habit } from '../types';
import { weekStart } from '../lib/time';
import { AnimatedNumber } from '../components/Ring';
import { HabitGrid } from '../components/HabitGrid';
import { RecapCard } from '../components/RecapCard';
import { lastWeekRecap } from '../lib/game';

const WEEKS = 15;

export function Insights({ today }: { today: string }) {
  const data = useData();
  const { startDay } = data;
  const recap = lastWeekRecap(data, today);

  const [history, setHistory] = useState<Habit | null>(null);
  const [showMore, setShowMore] = useState(false);

  // This week's finished days (Mon → yesterday) vs last week (Mon → Sun): comparing to your past self.
  // Today is excluded while it's still in progress — otherwise mornings always look like a dip.
  const avgOf = (from: string, to: string) => {
    const xs = range(from, to).map((d) => dayStats(data, d).score).filter((s): s is number => s !== null);
    return xs.length ? { avg: xs.reduce((a, b) => a + b, 0) / xs.length, days: xs.length } : null;
  };
  const thisMon = weekStart(today);
  const thisWeek = today > thisMon ? avgOf(thisMon, addDays(today, -1)) : null;
  const lastWeek = avgOf(addDays(thisMon, -7), addDays(thisMon, -1));

  const from30 = addDays(today, -30);
  const reasons = reasonCounts(data, from30, today);
  const reasonTotal = Object.values(reasons).reduce((a, b) => a + b, 0);
  const weekdayAvg = weekdayAverages(data, from30, addDays(today, -1));

  const insight = buildInsight(reasons, reasonTotal, weekdayAvg);

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-2">
        <div className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Your patterns</div>
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.03em]">Insights</h1>
      </header>

      {(!startDay || startDay > addDays(today, -3)) && (
        <section className="card px-5 py-6 text-center">
          <div className="text-[34px]" aria-hidden>📈</div>
          <h2 className="mt-1 text-[18px] font-semibold">Your patterns start here</h2>
          <p className="mx-auto mt-1 max-w-xs text-[14px] text-muted">
            {startDay && startDay > today
              ? `Tracking starts ${formatDay(startDay, { weekday: 'long' })}. After a few days you'll see which habits stick and which slip.`
              : "After 3 finished days you'll see which habits stick and which slip."}
          </p>
        </section>
      )}

      <WeekCompare thisWeek={thisWeek} lastWeek={lastWeek} />

      {recap && <RecapCard recap={recap} />}

      <HabitHistorySheet habit={history} today={today} onClose={() => setHistory(null)} />
      <HabitGrid data={data} today={today} onOpen={setHistory} />

      <button
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="min-h-12 rounded-2xl border border-line bg-surface text-[14px] font-semibold text-muted"
      >
        {showMore ? 'Hide details' : 'More insights — calendar, why you miss'}
      </button>
      {showMore && (
        <>
        {insight && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[20px] border border-plan/30 bg-plan/10 px-4 py-3.5 text-[14px] leading-relaxed">
            <span className="font-semibold text-plan">Insight · </span>
            <span className="text-muted">{insight}</span>
          </motion.div>
        )}

        <Heatmap today={today} score={(d) => (startDay && d >= startDay && d <= today ? dayStats(data, d).score : undefined)} />

        <Card title="Why you miss · last 30 days">
          {reasonTotal === 0 ? (
            <p className="text-[14px] text-muted">No misses logged yet. Keep it honest — the data gets useful fast.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {REASONS.filter((r) => reasons[r.code])
                .sort((a, b) => (reasons[b.code] ?? 0) - (reasons[a.code] ?? 0))
                .map((r, i) => {
                  const pct = (reasons[r.code] ?? 0) / reasonTotal;
                  return (
                    <div key={r.code}>
                      <div className="mb-1 flex justify-between text-[13.5px]">
                        <span>{r.emoji} {r.label}</span>
                        <span className="tabular text-muted">{reasons[r.code]}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <motion.div className="h-full rounded-full bg-miss" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ delay: i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card px-4 py-4">
      <h2 className="mb-3.5 text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** "Don't break the chain" calendar — one square per day, coloured by efficacy. */
function Heatmap({ today, score }: { today: string; score: (d: string) => number | null | undefined }) {
  const [selected, setSelected] = useState<string | null>(null);
  // Start on the Monday WEEKS-1 weeks ago.
  const t = fromKey(today);
  const mondayOffset = (t.getDay() + 6) % 7;
  const start = addDays(toKey(t), -mondayOffset - (WEEKS - 1) * 7);
  const days = range(start, addDays(start, WEEKS * 7 - 1));
  const sel = selected ? score(selected) : undefined;

  const color = (s: number | null | undefined) => {
    if (s === undefined) return 'var(--surface-2)';
    if (s === null) return 'var(--surface-3)';
    if (s === 0) return 'color-mix(in srgb, var(--miss) 35%, var(--surface-2))';
    return `color-mix(in srgb, var(--habit) ${Math.round(25 + s * 75)}%, var(--surface-2))`;
  };

  return (
    <Card title={`Consistency · ${WEEKS} weeks`}>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <motion.button
            key={d}
            onClick={() => setSelected(d === selected ? null : d)}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: d > today ? 0 : 1, scale: 1 }}
            transition={{ delay: i * 0.002 }}
            disabled={d > today}
            className={`aspect-square rounded-[4px] ${d === selected ? 'ring-2 ring-text' : d === today ? 'ring-1 ring-line-strong' : ''}`}
            style={{ background: color(score(d)) }}
            aria-label={d}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
        <span>
          {selected
            ? `${formatDay(selected, { weekday: 'short', day: 'numeric', month: 'short' })} · ${sel === undefined || sel === null ? 'no data' : `${Math.round(sel * 100)}%`}`
            : 'Tap a day'}
        </span>
        <span className="flex items-center gap-1">
          Less
          {[0.1, 0.4, 0.7, 1].map((s) => (
            <span key={s} className="size-2.5 rounded-[3px]" style={{ background: color(s) }} />
          ))}
          More
        </span>
      </div>
    </Card>
  );
}

function buildInsight(
  reasons: Partial<Record<string, number>>,
  total: number,
  weekdayAvg: (number | null)[],
): string | null {
  const parts: string[] = [];
  if (total >= 3) {
    const [code, n] = Object.entries(reasons).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    const label = REASONS.find((r) => r.code === code)?.label.toLowerCase();
    parts.push(`${Math.round(((n ?? 0) / total) * 100)}% of your misses are "${label}".`);
  }
  const valid = weekdayAvg.map((v, i) => [v, i] as const).filter(([v]) => v !== null) as [number, number][];
  if (valid.length >= 4) {
    const worst = valid.reduce((a, b) => (b[0] < a[0] ? b : a));
    const best = valid.reduce((a, b) => (b[0] > a[0] ? b : a));
    if (best[0] - worst[0] >= 0.15)
      parts.push(`${WEEKDAYS[worst[1]]}s are your hardest day (${Math.round(worst[0] * 100)}%) — plan lighter.`);
  }
  return parts.length ? parts.join(' ') : null;
}

function WeekCompare({ thisWeek, lastWeek }: { thisWeek: { avg: number; days: number } | null; lastWeek: { avg: number; days: number } | null }) {
  if (!thisWeek && !lastWeek) return null;
  const now = thisWeek ? Math.round(thisWeek.avg * 100) : null;
  const prev = lastWeek ? Math.round(lastWeek.avg * 100) : null;
  const delta = now !== null && prev !== null ? now - prev : null;
  const up = delta !== null && delta > 0;
  const flat = delta !== null && Math.abs(delta) < 1;
  const color = delta === null || flat ? 'var(--muted)' : up ? 'var(--habit)' : 'var(--miss)';
  return (
    <section className="card hero px-4 py-4">
      <div className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">You vs. last week</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-start">
            {now === null ? (
              <span className="text-[40px] leading-none font-bold">–</span>
            ) : (
              <AnimatedNumber value={now} className="tabular text-[40px] leading-none font-bold tracking-[-0.04em]" />
            )}
            {now !== null && <span className="mt-1 ml-0.5 text-[16px] font-semibold text-muted">%</span>}
          </div>
          <div className="mt-1 text-[12.5px] text-muted">
            {thisWeek ? `this week · ${thisWeek.days} finished day${thisWeek.days === 1 ? '' : 's'}` : 'this week starts counting tomorrow'}
          </div>
        </div>
        <div className="text-right">
          {delta !== null && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="tabular text-[22px] font-bold"
              style={{ color }}
            >
              {flat ? '=' : up ? '↑' : '↓'} {Math.abs(delta)}
            </motion.div>
          )}
          <div className="text-[12.5px] text-muted">last week {prev === null ? '–' : `${prev}%`}</div>
        </div>
      </div>
      {delta !== null && !flat && (
        <p className="mt-2.5 text-[13px] text-muted">
          {up ? 'Better than last week. Keep the trend going.' : 'A dip — open More insights below to see why.'}
        </p>
      )}
    </section>
  );
}
