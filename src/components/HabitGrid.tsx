import { motion } from 'framer-motion';
import { useState } from 'react';
import { addDays, formatDay, fromKey, range, WEEKDAYS } from '../lib/date';
import { habitsOn } from '../lib/score';
import type { Data, Habit } from '../types';
import { isPartial, partCredit } from '../lib/parts';
import { waterTarget } from '../lib/water';

const SPANS = [7, 14, 30] as const;
const MIN_DAYS = 3;
type Span = (typeof SPANS)[number];

type Cell = 'done' | 'part' | 'missed' | 'unchecked' | 'today' | 'off';

/** One frame: every habit × the last N days. Green kept, red missed. Sorted strongest → weakest. */
export function HabitGrid({ data, today, onOpen }: { data: Data; today: string; onOpen: (h: Habit) => void }) {
  const [span, setSpan] = useState<Span>(14);
  const days = range(addDays(today, -(span - 1)), today);
  const habits = habitsOn(data, today);

  const cell = (h: Habit, d: string): Cell => {
    if (d < h.createdDay || (h.archivedDay && d >= h.archivedDay)) return 'off';
    const s = data.logs[d]?.[h.id]?.status;
    if (s === 'done') return isPartial(h, data.logs[d]?.[h.id]) ? 'part' : 'done';
    if (data.logs[d]?.[h.id]?.miss?.reason === 'skip') return 'off';
    if (h.perWeek) return d === today ? 'today' : 'off'; // weekly: a day without it isn't a miss
    if (s === 'missed') return 'missed';
    // Water: some drunk but short of the target is a part-done day, not "no check-in".
    if (d !== today && (data.amounts?.[d]?.[h.id] ?? 0) > 0 && waterTarget(h)) return 'part';
    return d === today ? 'today' : 'unchecked';
  };

  // Share of the day's credit: combo parts by weight, water by how much of the target you drank.
  const credit = (h: Habit, d: string) => {
    const log = data.logs[d]?.[h.id];
    if (log?.status === 'done') return partCredit(h, log);
    const goal = waterTarget(h);
    return goal ? Math.min(0.99, (data.amounts?.[d]?.[h.id] ?? 0) / goal) : 0;
  };

  const rows = habits
    .map((h) => {
      const cells = days.map((d) => cell(h, d));
      // Rates use finished days only (today is still in progress), and need 3 of them to mean anything.
      const past = cells.slice(0, -1);
      const counted = past.filter((c) => c === 'done' || c === 'part' || c === 'missed' || c === 'unchecked').length;
      // A part-done day counts by its share (Stretch only = 0.3 of a day).
      const done = Math.round(past.reduce((n, c, i) => n + (c === 'done' ? 1 : c === 'part' ? credit(h, days[i]) : 0), 0) * 10) / 10;
      // Weekly habits: done vs. what the target asks for in these days (3× a week over 14 days → 6).
      const due = h.perWeek ? Math.max(1, Math.round((h.perWeek * past.filter((c) => c !== 'off' || h.perWeek).length) / 7)) : counted;
      const enough = h.perWeek ? past.length >= 7 : counted >= MIN_DAYS;
      return { h, cells, done, counted: due, rate: enough ? Math.min(1, done / due) : null };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));

  // Bottom row: share of habits kept each day.
  const daily = days.map((d) => {
    const on = habits.filter((h) => cell(h, d) !== 'off');
    if (!on.length || d === today) return null;
    return on.reduce((n, h) => n + (cell(h, d) === 'done' ? 1 : cell(h, d) === 'part' ? credit(h, d) : 0), 0) / on.length;
  });

  const rated = rows.filter((r) => r.rate !== null);
  const learning = rated.length === 0;
  const best = rated[0];
  const worst = rated.length > 1 ? rated[rated.length - 1] : undefined;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rateColor = (v: number | null) => (v === null ? 'var(--muted)' : v >= 0.8 ? 'var(--habit)' : v >= 0.5 ? 'var(--gold)' : 'var(--miss)');
  const gap = span === 30 ? 'gap-[2px]' : 'gap-[3px]';

  if (!habits.length) return null;

  return (
    <section className="card px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Habits at a glance</h2>
        <div className="flex gap-0.5 rounded-full bg-surface-2 p-0.5" role="radiogroup" aria-label="Range">
          {SPANS.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={span === s}
              onClick={() => setSpan(s)}
              className={`relative min-h-8 rounded-full px-2.5 text-[12.5px] font-semibold ${span === s ? 'text-text' : 'text-muted'}`}
            >
              {span === s && <motion.span layoutId="grid-span" className="absolute inset-0 rounded-full bg-surface shadow-sm" />}
              <span className="relative">{s}d</span>
            </button>
          ))}
        </div>
      </div>

      {/* Day labels */}
      <div className="flex items-end gap-2">
        <div className="w-[92px] shrink-0" />
        <div className={`flex flex-1 ${gap}`}>
          {days.map((d) => (
            <div key={d} className={`flex-1 text-center text-[10px] leading-none ${d === today ? 'font-bold text-text' : 'text-faint'}`}>
              {span === 30 ? ((days.length - 1 - days.indexOf(d)) % 7 === 0 ? fromKey(d).getDate() : '') : WEEKDAYS[fromKey(d).getDay()][0]}
            </div>
          ))}
        </div>
        <div className="w-9 shrink-0" />
      </div>

      <div className="mt-1.5 flex flex-col gap-1">
        {rows.map(({ h, cells, done, counted, rate }) => (
          <button
            key={h.id}
            onClick={() => onOpen(h)}
            aria-label={`${h.name}: ${done} of ${counted} days kept. Open history`}
            className="flex min-h-8 w-full items-center gap-2 text-left"
          >
            <span className="line-clamp-2 w-[92px] shrink-0 text-[12.5px] leading-[1.2] font-medium break-words">{h.name}</span>
            <span className={`flex h-5 flex-1 ${gap}`} aria-hidden>
              {cells.map((c, i) => (
                <motion.span
                  key={days[i]}
                  initial={{ opacity: 0, scaleY: 0.4 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ delay: i * 0.012 }}
                  className={`flex-1 rounded-[3px] ${c === 'today' ? 'ring-1 ring-line-strong ring-inset' : ''}`}
                  style={{ background: CELL_BG[c] }}
                />
              ))}
            </span>
            <span className="tabular w-9 shrink-0 text-right text-[13px] font-semibold" style={{ color: rateColor(rate) }}>
              {rate === null ? '–' : pct(rate)}
            </span>
          </button>
        ))}

        {/* Daily total */}
        <div className="mt-1 flex items-center gap-2 border-t border-line pt-2" aria-hidden>
          <span className="w-[92px] shrink-0 text-[12px] font-medium text-muted">All habits</span>
          <span className={`flex h-3 flex-1 ${gap}`}>
            {daily.map((v, i) => (
              <span
                key={days[i]}
                className="flex-1 rounded-[3px]"
                style={{
                  background:
                    v === null
                      ? 'var(--surface-2)'
                      : v === 1
                        ? 'var(--habit)'
                        : v === 0
                          ? 'color-mix(in srgb, var(--miss) 70%, var(--surface-2))'
                          : `color-mix(in srgb, var(--habit) ${Math.round(20 + v * 60)}%, var(--surface-2))`,
                }}
              />
            ))}
          </span>
          <span className="w-9 shrink-0" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
        <Legend bg={CELL_BG.done} label="Done" />
        {habits.some((h) => h.parts?.length) && <Legend bg={CELL_BG.part} label="Part done" />}
        <Legend bg={CELL_BG.missed} label="Missed" />
        <Legend bg={CELL_BG.unchecked} label="No check-in" />
        <span className="ml-auto text-faint">
          {formatDay(days[0], { day: 'numeric', month: 'short' })} – today
        </span>
      </div>

      {learning && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-muted">
          🌱 Percentages appear after {MIN_DAYS} finished days — no judging yet.
        </p>
      )}
      {best && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-muted">
          <span className="font-semibold text-habit">Strongest:</span> {best.h.name} ({pct(best.rate!)})
          {worst && worst.rate! < best.rate! && (
            <>
              <br />
              <span className="font-semibold text-miss">Needs work:</span> {worst.h.name} ({pct(worst.rate!)}) — tap it to see why
            </>
          )}
        </p>
      )}
    </section>
  );
}

const CELL_BG: Record<Cell, string> = {
  done: 'var(--habit)',
  part: 'var(--part)',
  missed: 'var(--miss)',
  unchecked: 'color-mix(in srgb, var(--miss) 35%, var(--surface-2))',
  today: 'var(--surface-2)',
  off: 'transparent',
};

function Legend({ bg, label }: { bg: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-2.5 rounded-[3px]" style={{ background: bg }} />
      {label}
    </span>
  );
}
