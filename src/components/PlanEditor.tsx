import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore, useUI, type PlanDetails } from '../store';
import { Sheet } from './Sheet';
import { StarIcon } from './icons';
import { fmtDuration, fmtTime, fromMin, toMin } from '../lib/time';
import { formatDay } from '../lib/date';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const OFFSETS: { v: number | undefined; label: string }[] = [
  { v: undefined, label: 'None' },
  { v: 0, label: 'At start' },
  { v: 5, label: '5 min' },
  { v: 10, label: '10 min' },
  { v: 15, label: '15 min' },
  { v: 30, label: '30 min' },
];

/** Add or edit a plan: note, time block, reminder and an if-then obstacle plan. */
export function PlanEditor() {
  const target = useUI((s) => s.editingPlan);
  const editPlan = useUI((s) => s.editPlan);
  const plans = useStore((s) => s.plans);
  const { addPlan, updatePlan, deletePlan } = useStore();

  const existing = target && 'id' in target ? plans.find((p) => p.id === target.id) : undefined;
  const day = existing?.day ?? (target && 'day' in target ? target.day : '');

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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const close = () => editPlan(null);
  const save = () => {
    const t = title.trim();
    if (!t) return;
    const details: PlanDetails = {
      title: t,
      must,
      note: note.trim() || undefined,
      start: timed ? start : undefined,
      duration: timed ? Math.max(15, duration) : undefined,
      remindOffset: timed ? offset : undefined,
      remindAt: !timed && remindAt ? remindAt : undefined,
      obstacle: obstacle.trim() || undefined,
      ifThen: ifThen.trim() || undefined,
    };
    if (existing) updatePlan(existing.id, details);
    else addPlan(day, t, must, details);
    close();
  };

  const field =
    'mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint';
  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-colors ${on ? 'border-plan bg-plan/15 text-text' : 'border-line bg-surface-2 text-muted'}`;
  const end = fromMin(toMin(start) + Math.max(15, duration));

  return (
    <Sheet open={!!target} onClose={close}>
      <div className="text-[13px] font-medium tracking-wide text-plan uppercase">
        {day ? formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' }) : 'Plan'}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          autoFocus={!existing}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you plan to do?"
          className="min-w-0 flex-1 bg-transparent text-[22px] font-semibold tracking-[-0.02em] outline-none placeholder:text-faint"
        />
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => setMust((m) => !m)}
          aria-pressed={must}
          aria-label="Must-do"
          className={`grid size-10 shrink-0 place-items-center rounded-full ${must ? 'bg-gold/15 text-gold' : 'text-faint'}`}
        >
          <StarIcon size={20} filled={must} />
        </motion.button>
      </div>

      <label className="mt-4 block text-[13px] font-medium text-muted">Note</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional details…" className={`${field} resize-none`} />

      {/* When */}
      <div className="mt-5 flex items-center justify-between">
        <div>
          <div className="text-[15px] font-medium">Block a time</div>
          <div className="text-[12.5px] text-faint">Puts it on your calendar. Deciding when boosts follow-through.</div>
        </div>
        <Switch on={timed} onChange={setTimed} label="Block a time" />
      </div>

      <AnimatePresence initial={false}>
        {timed && (
          <motion.div key="timed" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 flex items-center gap-3">
              <input type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={`${field} mt-0 tabular flex-1`} aria-label="Start time" />
              <span className="tabular shrink-0 text-[14px] text-muted">→ {fmtTime(end)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => { setDuration(d); setCustomDur(false); }} className={chip(!customDur && duration === d)}>
                  {fmtDuration(d)}
                </button>
              ))}
              <button onClick={() => setCustomDur(true)} className={chip(customDur)}>Custom</button>
            </div>
            {customDur && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
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
                <button key={o.label} onClick={() => setOffset(o.v)} className={chip(offset === o.v)}>
                  {o.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {!timed && (
          <motion.div key="untimed" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <label className="mt-3 block text-[13px] font-medium text-muted">Remind me at <span className="text-faint">(optional)</span></label>
            <div className="mt-1.5 flex items-center gap-2">
              <input type="time" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={`${field} mt-0 tabular`} aria-label="Reminder time" />
              {remindAt && (
                <button onClick={() => setRemindAt('')} className="shrink-0 rounded-2xl bg-surface-2 px-4 py-3.5 text-[14px] text-muted">Clear</button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WOOP */}
      <div className="mt-6 rounded-2xl border border-line bg-surface-2/60 p-4">
        <div className="text-[15px] font-medium">Obstacle check <span className="text-[12.5px] font-normal text-faint">· optional</span></div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-faint">
          Naming what could stop you, then planning for it, makes follow-through more likely (Oettingen's WOOP).
        </p>
        <input value={obstacle} onChange={(e) => setObstacle(e.target.value)} placeholder="What might get in the way?" className={`${field} bg-surface`} />
        <input value={ifThen} onChange={(e) => setIfThen(e.target.value)} placeholder="If that happens, I will…" className={`${field} bg-surface`} />
      </div>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={save}
        disabled={!title.trim()}
        className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg disabled:opacity-30"
      >
        {existing ? 'Save' : 'Add plan'}
      </motion.button>
      {existing && (
        <button
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            deletePlan(existing.id);
            close();
          }}
          className={`mt-2 w-full py-3 text-[14px] font-medium ${confirmDelete ? 'text-miss' : 'text-faint'}`}
        >
          {confirmDelete ? 'Tap again to delete' : 'Delete plan'}
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
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${on ? 'bg-habit' : 'bg-surface-3'}`}
    >
      <motion.span
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        animate={{ left: on ? 23 : 3 }}
        className="absolute top-[3px] size-6 rounded-full bg-white shadow"
      />
    </button>
  );
}
