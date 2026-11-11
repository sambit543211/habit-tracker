import { motion } from 'framer-motion';
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

/** Apple-Calendar-style day view from wake time to bedtime. */
export function DayCalendar({ day, plans, habits, profile, now, doneHabits }: Props) {
  const editPlan = useUI((s) => s.editPlan);
  const total = windowLength(profile);
  const height = (total / 60) * HOUR;
  const px = (min: number) => (min / 60) * HOUR;
  const wake = toMin(profile.wake);

  const blocks = layoutBlocks(activeBlocks(plans), profile).filter((b) => b.s < total);
  const markers = habits
    .filter((h) => h.remindAt && sinceWake(h.remindAt, profile) < total)
    .map((h) => ({ h, at: sinceWake(h.remindAt!, profile) }));
  // Habit markers get their own lane on the right so they never cover plans.
  const LANE = markers.length ? 92 : 0;
  const right = 8 + LANE;

  const onEmptyTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const min = Math.floor(((y / HOUR) * 60) / 15) * 15;
    haptic(6);
    editPlan({ day, start: fromMin(wake + min) });
  };

  const hours = Array.from({ length: Math.ceil(total / 60) + 1 }, (_, i) => i);

  return (
    <div className="relative rounded-[20px] border border-line bg-surface">
      <div className="relative" style={{ height: height + 16 }}>
        {/* Hour grid */}
        {hours.map((i) => (
          <div key={i} className="pointer-events-none absolute inset-x-0" style={{ top: 8 + px(i * 60) }}>
            <div className="absolute left-0 w-[42px] -translate-y-1/2 pr-1 text-right text-[10px] font-medium text-faint tabular">
              {i * 60 <= total ? fmtTime(fromMin(wake + i * 60)).replace(':00', '') : ''}
            </div>
            <div className="absolute right-0 border-t border-line" style={{ left: GUTTER }} />
          </div>
        ))}

        {/* Tap empty space to add a plan at that time */}
        <div className="absolute right-0 bottom-2 cursor-copy" style={{ top: 8, left: GUTTER }} onClick={onEmptyTap} aria-label="Add a plan at this time" />

        {/* Habit reminder markers */}
        {markers.map(({ h, at }) => (
          <div
            key={h.id}
            className="pointer-events-none absolute right-1.5 flex max-w-[86px] -translate-y-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
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
                className={`flex items-center gap-1 font-semibold ${compact ? 'h-full text-[11px] leading-none' : 'text-[12px] leading-tight'} ${done ? 'text-muted line-through' : ''}`}
              >
                {it.must && !done && <StarIcon size={10} filled className="shrink-0 text-gold" />}
                {done && <CheckIcon size={11} strokeWidth={3} className="shrink-0 text-habit" />}
                <span className="truncate">{it.title}</span>
                {compact && <span className="ml-auto shrink-0 text-[10px] font-medium text-muted">{fmtTime(it.start)}</span>}
              </div>
              {!compact && (
                <div className="mt-0.5 truncate text-[11px] text-muted tabular">
                  {fmtTime(it.start)} – {fmtTime(fromMin(toMin(it.start) + (e - s)))}
                </div>
              )}
            </motion.button>
          );
        })}

        {/* Now line */}
        {now !== null && now >= 0 && now <= total && (
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
  );
}
