import { motion } from 'framer-motion';
import { useState } from 'react';
import type { Habit, Plan, Profile } from '../types';
import { activeBlocks, fmtTime, fromMin, layoutBlocks, sinceWake, toMin, windowLength } from '../lib/time';
import { useUI } from '../store';
import { haptic } from '../lib/feedback';
import { CheckIcon, StarIcon } from './icons';

const HOUR = 30; // px per hour — the whole day fits without scrolling
const GUTTER = 46; // px for hour labels

interface Props {
  day: string;
  plans: Plan[];
  habits: Habit[];
  profile: Profile;
  /** Minutes since wake right now, or null when not viewing today */
  now: number | null;
  doneHabits: Set<string>;
}

/**
 * Apple-Calendar-style day view. Shows only the hours around what's planned (plus now);
 * "Show full day" opens wake → bedtime. With nothing timed it stays a one-line card.
 */
export function DayCalendar({ day, plans, habits, profile, now, doneHabits }: Props) {
  const editPlan = useUI((s) => s.editPlan);
  const [full, setFull] = useState(false);
  const total = windowLength(profile);
  const wake = toMin(profile.wake);

  const blocks = layoutBlocks(activeBlocks(plans), profile).filter((b) => b.s < total);
  const markers = habits
    .filter((h) => h.remindAt && sinceWake(h.remindAt, profile) < total)
    .map((h) => ({ h, at: sinceWake(h.remindAt!, profile) }));

  // Visible window (minutes since wake), whole hours.
  // Habit reminders don't stretch the window when there are plans (a late-night habit would
  // otherwise turn a one-plan morning into the whole day); they show if they fall inside it.
  const nowPts = now !== null && now >= 0 && now <= total ? [now] : [];
  const points = blocks.length ? [...blocks.flatMap((b) => [b.s, Math.min(b.e, total)]), ...nowPts] : [...markers.map((m) => m.at), ...nowPts];
  const timed = blocks.length > 0 || markers.length > 0;
  let from = 0;
  let to = total;
  if (!full && points.length) {
    from = Math.max(0, Math.floor((Math.min(...points) - 60) / 60) * 60);
    to = Math.min(total, Math.ceil((Math.max(...points) + 60) / 60) * 60);
    if (to - from < 240) to = Math.min(total, from + 240);
    if (to - from < 240) from = Math.max(0, to - 240);
  }
  const cropped = from > 0 || to < total;
  const shown = markers.filter((m) => m.at >= from && m.at <= to);

  if (!timed && !full) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[20px] border border-dashed border-line-strong/60 px-4 py-3.5">
        <span className="text-[13.5px] text-muted">Nothing on the calendar yet.</span>
        <button onClick={() => setFull(true)} className="min-h-10 shrink-0 rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold">
          Pick a time
        </button>
      </div>
    );
  }

  const height = ((to - from) / 60) * HOUR;
  const px = (min: number) => ((min - from) / 60) * HOUR;
  // Habit markers get their own lane on the right so they never cover plans.
  const LANE = shown.length ? 92 : 0;
  const right = 8 + LANE;

  const onEmptyTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const min = from + Math.floor(((y / HOUR) * 60) / 15) * 15;
    haptic(6);
    editPlan({ day, start: fromMin(wake + min) });
  };

  const hours = Array.from({ length: Math.ceil((to - from) / 60) + 1 }, (_, i) => from / 60 + i);

  return (
    <div>
    <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="relative" style={{ height: height + 16 }}>
        {/* Hour grid */}
        {hours.map((i) => (
          <div key={i} className="pointer-events-none absolute inset-x-0" style={{ top: 8 + px(i * 60) }}>
            <div className="absolute left-0 w-[42px] -translate-y-1/2 pr-1 text-right text-[12px] font-medium text-faint tabular">
              {i * 60 <= to ? fmtTime(fromMin(wake + i * 60)).replace(':00', '') : ''}
            </div>
            <div className="absolute right-0 border-t border-line" style={{ left: GUTTER }} />
          </div>
        ))}

        {/* Tap empty space to add a plan at that time */}
        <div className="absolute right-0 bottom-2 cursor-copy" style={{ top: 8, left: GUTTER }} onClick={onEmptyTap} aria-label="Add a plan at this time" />

        {/* Habit reminder markers */}
        {shown.map(({ h, at }) => (
          <div
            key={h.id}
            className="pointer-events-none absolute right-1.5 flex max-w-[86px] -translate-y-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium"
            style={{
              top: 8 + px(at),
              background: 'color-mix(in srgb, var(--habit) 16%, var(--surface))',
              color: doneHabits.has(h.id) ? 'var(--muted)' : 'var(--habit)',
            }}
          >
            {doneHabits.has(h.id) ? <CheckIcon size={10} strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-habit" />}
            <span className={`truncate ${doneHabits.has(h.id) ? 'line-through' : ''}`}>{h.name}</span>
          </div>
        ))}

        {/* Plan blocks */}
        {blocks.map(({ it, s, e, col, cols }, i) => {
          const done = it.status === 'done';
          const h = Math.max(px(e - s) - 2, 18);
          const compact = h < 34;
          return (
            <motion.button
              key={it.id}
              initial={{ opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 400, damping: 30 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => editPlan({ id: it.id })}
              className={`absolute overflow-hidden rounded-lg border-l-[3px] text-left ${compact ? 'px-1.5 py-0' : 'px-2 py-1'}`}
              style={{
                top: 8 + px(s) + 1,
                height: h,
                left: `calc(${GUTTER + 4}px + (100% - ${GUTTER + 4 + right}px) * ${col / cols})`,
                width: `calc((100% - ${GUTTER + 4 + right}px) / ${cols} - 3px)`,
                borderColor: done ? 'var(--habit)' : it.must ? 'var(--gold)' : 'var(--plan)',
                background: done
                  ? 'color-mix(in srgb, var(--habit) 14%, var(--surface))'
                  : 'color-mix(in srgb, var(--plan) 18%, var(--surface))',
              }}
            >
              <div
                className={`flex items-center gap-1 font-semibold ${compact ? 'h-full text-[12px] leading-none' : 'text-[12px] leading-tight'} ${done ? 'text-muted line-through' : ''}`}
              >
                {it.must && !done && <StarIcon size={10} filled className="shrink-0 text-gold" />}
                {done && <CheckIcon size={11} strokeWidth={3} className="shrink-0 text-habit" />}
                <span className="truncate">{it.title}</span>
                {compact && <span className="ml-auto shrink-0 text-[12px] font-medium text-muted">{fmtTime(it.start)}</span>}
              </div>
              {!compact && (
                <div className="mt-0.5 truncate text-[12px] text-muted tabular">
                  {fmtTime(it.start)} – {fmtTime(fromMin(toMin(it.start) + (e - s)))}
                </div>
              )}
            </motion.button>
          );
        })}

        {/* Now line */}
        {now !== null && now >= from && now <= to && (
          <div className="pointer-events-none absolute right-0 z-10 flex items-center" style={{ top: 8 + px(now), left: GUTTER - 5 }}>
            <motion.span
              className="size-2.5 rounded-full bg-miss"
              animate={{ scale: [1, 1.35, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <span className="h-[2px] flex-1 bg-miss" />
          </div>
        )}
      </div>
    </div>
    {(cropped || full) && (
      <button onClick={() => setFull((f) => !f)} className="mt-1.5 min-h-10 w-full text-[13px] font-semibold text-muted">
        {full ? 'Show less' : 'Show full day'}
      </button>
    )}
    </div>
  );
}
