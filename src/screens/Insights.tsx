import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { dayStats, habitRate, habitStreak, habitsOn, reasonCounts, streak, weekdayAverages } from '../lib/score';
import { addDays, formatDay, fromKey, range, toKey, WEEKDAYS } from '../lib/date';
import { REASONS } from '../lib/reasons';
import { FlameIcon } from '../components/icons';
import { weekStart } from '../lib/time';
import { AnimatedNumber } from '../components/Ring';

const WEEKS = 15;

export function Insights({ today }: { today: string }) {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const data = useMemo(() => ({ habits, plans, logs, startDay }), [habits, plans, logs, startDay]);

  const shieldsOn = useStore((s) => s.profile.shields !== false);
  const st = useMemo(() => streak(data, today, shieldsOn), [data, today, shieldsOn]);
  const last14 = range(addDays(today, -13), today);
  const scores14 = last14.map((d) => (startDay && d >= startDay ? dayStats(data, d).score : null));
  const past7 = range(addDays(today, -7), addDays(today, -1)).map((d) => dayStats(data, d).score).filter((s): s is number => s !== null);
  const avg7 = past7.length ? past7.reduce((a, b) => a + b, 0) / past7.length : null;

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
  const activeHabits = habitsOn(data, today);

  const insight = buildInsight(reasons, reasonTotal, weekdayAvg);

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-2">
        <div className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Your patterns</div>
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.03em]">Insights</h1>
      </header>

      <WeekCompare thisWeek={thisWeek} lastWeek={lastWeek} />

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Streak" value={st.current} icon={<FlameIcon size={15} className="text-gold" />} />
        <Stat label="Best" value={st.best} />
        <Stat label="7-day avg" value={avg7 === null ? '–' : `${Math.round(avg7 * 100)}%`} />
      </div>

      {insight && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[20px] border border-plan/30 bg-plan/10 px-4 py-3.5 text-[14px] leading-relaxed">
          <span className="font-semibold text-plan">Insight · </span>
          <span className="text-muted">{insight}</span>
        </motion.div>
      )}

      <Card title="Efficacy · last 14 days">
        <div className="flex h-32 items-end gap-1.5">
          {scores14.map((s, i) => (
            <div key={last14[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <motion.div
                className="w-full rounded-md"
                style={{ background: s === null ? 'var(--track)' : 'linear-gradient(to top, var(--plan), var(--habit))' }}
                initial={{ height: 0 }}
                animate={{ height: s === null ? 4 : `${Math.max(4, s * 100)}%` }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 120, damping: 18 }}
              />
              <span className={`text-[12px] ${last14[i] === today ? 'font-bold text-text' : 'text-faint'}`}>
                {WEEKDAYS[fromKey(last14[i]).getDay()][0]}
              </span>
            </div>
          ))}
        </div>
      </Card>

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

      <Card title="Habits · last 30 days">
        {activeHabits.length === 0 && <p className="text-[14px] text-muted">No habits yet.</p>}
        <div className="flex flex-col divide-y divide-line">
          {activeHabits.map((h) => {
            const rate = habitRate(data, h, today);
            const hs = habitStreak(data, h, today);
            return (
              <div key={h.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{h.name}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div className="h-full rounded-full bg-habit" initial={{ width: 0 }} animate={{ width: `${(rate ?? 0) * 100}%` }} transition={{ duration: 0.7 }} />
                  </div>
                </div>
                <div className="w-12 text-right">
                  <div className="tabular text-[15px] font-semibold">{rate === null ? '–' : `${Math.round(rate * 100)}%`}</div>
                  <div className="flex items-center justify-end gap-0.5 text-[12px] text-muted">
                    <FlameIcon size={11} className="text-gold" />{hs}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="card px-3 py-3.5 text-center">
      <div className="tabular flex items-center justify-center gap-1 text-[24px] font-bold tracking-[-0.03em]">
        {icon}
        {value}
      </div>
      <div className="mt-0.5 text-[12px] font-medium tracking-wide text-muted uppercase">{label}</div>
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
          {up ? 'Better than last week. Keep the trend going.' : 'A dip — check "Why you miss" below for the pattern.'}
        </p>
      )}
    </section>
  );
}
