import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, useUI, type PlanDetails } from '../store';
import { Sheet } from './Sheet';
import { StarIcon } from './icons';
import { fmtDuration, fmtTime, fromMin, toMin } from '../lib/time';
import { addDays, dayKeyAt, formatDay } from '../lib/date';
import { parsePlan } from '../lib/parsePlan';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const OFFSETS: { v: number | undefined; label: string }[] = [
  { v: undefined, label: 'None' },
  { v: 0, label: 'At start' },
  { v: 5, label: '5 min' },
  { v: 10, label: '10 min' },
  { v: 15, label: '15 min' },
  { v: 30, label: '30 min' },
];

/** Add or edit a plan. Quick by default (name + Add); time, note and reminder under "Add details". */
export function PlanEditor() {
  const target = useUI((s) => s.editingPlan);
  const editPlan = useUI((s) => s.editPlan);
  const plans = useStore((s) => s.plans);
  const { addPlan, updatePlan, deletePlan } = useStore();

  const existing = target && 'id' in target ? plans.find((p) => p.id === target.id) : undefined;
  const targetDay = existing?.day ?? (target && 'day' in target ? target.day : '');
  const [day, setDay] = useState(targetDay);
  const [details, setDetails] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const today = dayKeyAt();
  const tomorrow = addDays(today, 1);

  const [title, setTitle] = useState('');
  const [must, setMust] = useState(false);
  const [note, setNote] = useState('');
  const [timed, setTimed] = useState(false);
  const [start, setStart] = useState('18:00');
  const [duration, setDuration] = useState(30);
  const [customDur, setCustomDur] = useState(false);
  const [offset, setOffset] = useState<number | undefined>(undefined);
  const [remindAt, setRemindAt] = useState('');
  const [obstacle, setObstacle] = useState('');
  const [ifThen, setIfThen] = useState('');

  useEffect(() => {
    if (!target) return;
    const p = existing;
    const presetStart = 'start' in target ? target.start : undefined;
    setTitle(p?.title ?? '');
    setMust(p?.must ?? false);
    setNote(p?.note ?? '');
    setTimed(!!(p?.start ?? presetStart));
    setStart(p?.start ?? presetStart ?? '18:00');
    setDuration(p?.duration ?? 30);
    setCustomDur(!!p?.duration && !DURATIONS.includes(p.duration));
    setOffset(p?.remindOffset);
    setRemindAt(p?.remindAt ?? '');
    setObstacle(p?.obstacle ?? '');
    setIfThen(p?.ifThen ?? '');
    setDay(p?.day ?? ('day' in target ? target.day : today));
    // Details open when editing a plan that already has some, or when a time slot was tapped.
    setDetails(!!(p?.start || p?.note || p?.remindAt || presetStart));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Focus the name field straight away without making the page jump (iOS).
  useLayoutEffect(() => {
    if (target && !('id' in target)) titleRef.current?.focus({ preventScroll: true });
  }, [target]);

  const close = () => editPlan(null);
  const wakeHour = useStore((s) => Math.floor(toMin(s.profile.wake) / 60));
  // "Gym 7pm 1h" typed in the title fills in the time block (unless one is already set).
  const parsed = !timed && title.trim() ? parsePlan(title, wakeHour) : null;
  const save = () => {
    let t = title.trim();
    if (!t) return;
    let useTimed = timed;
    let s = start;
    let d = duration;
    if (parsed?.start) {
      t = parsed.title;
      useTimed = true;
      s = parsed.start;
      d = parsed.duration ?? 30;
    }
    const details: PlanDetails = {
      title: t,
      must,
      note: note.trim() || undefined,
      start: useTimed ? s : undefined,
      duration: useTimed ? Math.max(15, d) : undefined,
      remindOffset: useTimed ? offset : undefined,
      remindAt: !useTimed && remindAt ? remindAt : undefined,
      obstacle: obstacle.trim() || undefined,
      ifThen: ifThen.trim() || undefined,
    };
    if (existing) updatePlan(existing.id, details);
    else addPlan(day || today, t, must, details);
    close();
  };

  const field =
    'mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint';
  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-colors ${on ? 'border-plan bg-plan/15 text-text' : 'border-line bg-surface-2 text-muted'}`;
  const end = fromMin(toMin(start) + Math.max(15, duration));

  const isNew = !existing;
  const canSwitchDay = isNew && (day === today || day === tomorrow);
  const detailSummary = [
    timed ? `${fmtTime(start)}–${fmtTime(end)}` : remindAt ? `⏰ ${fmtTime(remindAt)}` : null,
    note.trim() ? 'note' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet open={!!target} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{isNew ? 'New plan' : 'Edit plan'}</h2>
        {canSwitchDay ? (
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Day">
            {[today, tomorrow].map((d) => (
              <button
                type="button"
                key={d}
                role="radio"
                aria-checked={day === d}
                onClick={() => setDay(d)}
                className={`relative min-h-10 rounded-xl text-[14px] font-medium ${day === d ? 'text-text' : 'text-muted'}`}
              >
                {day === d && <motion.span layoutId="plan-editor-day" className="absolute inset-0 rounded-xl bg-surface shadow-sm" />}
                <span className="relative">{d === today ? 'Today' : 'Tomorrow'}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[14px] font-medium text-plan">{day ? formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' }) : ''}</p>
        )}

        <label htmlFor="plan-title" className="mt-4 block text-[13px] font-medium text-muted">
          What do you plan to do?
        </label>
        <input
          id="plan-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Call the bank"
          enterKeyHint="done"
          autoComplete="off"
          className="mt-1.5 w-full rounded-2xl border border-line-strong/60 bg-surface-2 px-4 py-4 text-[18px] font-semibold outline-none placeholder:font-normal placeholder:text-faint focus:border-plan"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setMust((m) => !m)}
            aria-pressed={must}
            className={`flex min-h-10 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
              must ? 'border-gold/50 bg-gold/15 text-gold' : 'border-line bg-surface-2 text-muted'
            }`}
          >
            <StarIcon size={14} filled={must} />
            Must-do
          </motion.button>
          {parsed?.start ? (
            <span className="text-[13px] font-medium text-plan">
              ⏰ {fmtTime(parsed.start)}–{fmtTime(fromMin(toMin(parsed.start) + (parsed.duration ?? 30)))}
            </span>
          ) : (
            isNew && <span className="text-[12.5px] text-faint">Tip: “Gym 7pm 1h” sets the time</span>
          )}
        </div>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          disabled={!title.trim()}
          className="mt-4 min-h-14 w-full rounded-2xl bg-plan text-[16px] font-semibold text-white shadow-[0_6px_20px_color-mix(in_srgb,var(--plan)_35%,transparent)] transition-opacity disabled:opacity-30 disabled:shadow-none"
        >
          {isNew ? `Add to ${day === tomorrow ? 'tomorrow' : day === today ? 'today' : 'plan'}` : 'Save'}
        </motion.button>
      </form>

      {/* Optional details */}
      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        aria-expanded={details}
        className="mt-3 flex min-h-12 w-full items-center justify-between rounded-2xl border border-line px-4 text-left"
      >
        <span>
          <span className="block text-[14.5px] font-semibold">{details ? 'Details' : 'Add details'}</span>
          <span className="block text-[12.5px] text-muted">{detailSummary || 'Time on your calendar, note, reminder'}</span>
        </span>
        <motion.span animate={{ rotate: details ? 90 : 0 }} className="text-[18px] text-muted" aria-hidden>
          ›
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {details && (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-medium">Block a time</div>
                <div className="text-[12.5px] text-faint">Puts it on your calendar.</div>
              </div>
              <Switch on={timed} onChange={setTimed} label="Block a time" />
            </div>

            {timed ? (
              <div>
                <div className="mt-3 flex items-center gap-3">
                  <input type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={`${field} mt-0 tabular flex-1`} aria-label="Start time" />
                  <span className="tabular shrink-0 text-[14px] text-muted">→ {fmtTime(end)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DURATIONS.map((d) => (
                    <button type="button" key={d} onClick={() => { setDuration(d); setCustomDur(false); }} className={chip(!customDur && duration === d)}>
                      {fmtDuration(d)}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCustomDur(true)} className={chip(customDur)}>
                    Custom
                  </button>
                </div>
                {customDur && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={15}
                      step={5}
                      value={duration}
                      onChange={(e) => setDuration(Math.max(15, Number(e.target.value) || 15))}
                      className={`${field} mt-0 tabular w-28`}
                      aria-label="Minutes"
                    />
                    <span className="text-[14px] text-muted">minutes (min 15)</span>
                  </div>
                )}
                <div className="mt-4 text-[13px] font-medium text-muted">Remind me before</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OFFSETS.map((o) => (
                    <button type="button" key={o.label} onClick={() => setOffset(o.v)} className={chip(offset === o.v)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="mt-3 block text-[13px] font-medium text-muted">Remind me at</label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input type="time" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={`${field} mt-0 tabular`} aria-label="Reminder time" />
                  {remindAt && (
                    <button type="button" onClick={() => setRemindAt('')} className="min-h-12 shrink-0 rounded-2xl bg-surface-2 px-4 text-[14px] text-muted">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            <label className="mt-4 block text-[13px] font-medium text-muted">Note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to remember…" className={`${field} resize-none`} />

            {!isNew || title.trim() ? (
              <button
                type="button"
                onClick={save}
                disabled={!title.trim()}
                className="mt-4 min-h-12 w-full rounded-2xl bg-surface-2 text-[15px] font-semibold disabled:opacity-30"
              >
                {isNew ? 'Add with these details' : 'Save'}
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {existing && (
        <button
          type="button"
          onClick={() => {
            const copy = existing;
            deletePlan(existing.id);
            close();
            useUI.getState().showToast('Plan deleted', { tone: 'miss', undo: () => useStore.getState().restorePlan(copy) });
          }}
          className="mt-2 min-h-11 w-full text-[14px] font-medium text-miss/80"
        >
          Delete plan
        </button>
      )}
    </Sheet>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] ${on ? 'bg-habit' : 'bg-surface-3'}`}
    >
      <motion.span
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        animate={{ left: on ? 23 : 3 }}
        className="absolute top-[3px] size-6 rounded-full bg-white shadow"
      />
    </button>
  );
}
