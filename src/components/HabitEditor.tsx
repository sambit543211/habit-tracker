import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { Sheet } from './Sheet';
import { fmtWater, waterTarget } from '../lib/water';
import { PartsEditor, partId, type DraftPart } from './PartsEditor';
import { comboName } from '../lib/parts';

export function HabitEditor() {
  const editing = useUI((s) => s.editingHabit);
  const editHabit = useUI((s) => s.editHabit);
  const habits = useStore((s) => s.habits);
  const { addHabit, updateHabit, archiveHabit, absorbHabits } = useStore();
  const habit = editing && editing !== 'new' ? habits.find((h) => h.id === editing) : undefined;

  const [name, setName] = useState('');
  const [cue, setCue] = useState('');
  const [tiny, setTiny] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [perWeek, setPerWeek] = useState<number | undefined>(undefined);
  const [pairWith, setPairWith] = useState('');
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [parts, setParts] = useState<DraftPart[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(habit?.name ?? '');
    setCue(habit?.cue ?? '');
    setTiny(habit?.tiny ?? '');
    setRemindAt(habit?.remindAt ?? '');
    setPerWeek(habit?.perWeek);
    setPairWith(habit?.pairWith ?? '');
    setMore(!!(habit?.cue || habit?.tiny || habit?.pairWith));
    setConfirm(false);
    setParts(habit?.parts?.map((p) => ({ ...p })) ?? []);
    setPicking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const nameRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (editing === 'new') nameRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const close = () => editHabit(null);
  const combo = parts.length >= 2;
  const partsOk = !combo || parts.every((p) => p.name.trim());
  const autoName = combo ? comboName(parts) : '';
  const finalName = name.trim() || autoName;
  // Habits that can be folded into this one: active, not water, not already a combo, not this one.
  const others = habits.filter((h) => h.id !== habit?.id && !h.archivedDay && !waterTarget(h) && !h.parts?.length);
  const startParts = (from?: (typeof habits)[number]) => {
    setParts([
      { id: partId(), name: name.trim(), weight: 50 },
      { id: partId(), name: from?.name ?? '', weight: 50, from: from?.id },
    ]);
    setPicking(false);
  };
  const save = () => {
    if (!finalName || !partsOk) return;
    const cleanParts = combo ? parts.map(({ id, name, weight, from }) => ({ id, name: name.trim(), weight, ...(from ? { from } : {}) })) : undefined;
    const data = { name: finalName, cue: cue.trim() || undefined, tiny: tiny.trim() || undefined, remindAt: remindAt || undefined, pairWith: pairWith.trim() || undefined, perWeek, parts: cleanParts };
    const id = habit ? (updateHabit(habit.id, data), habit.id) : addHabit(data);
    const absorbed = Object.fromEntries(parts.filter((p) => p.from).map((p) => [p.from!, p.id]));
    if (combo && Object.keys(absorbed).length) absorbHabits(id, absorbed);
    close();
  };

  const field = 'mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint';

  return (
    <Sheet open={!!editing} onClose={close}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{habit ? 'Edit habit' : 'New habit'}</h2>
      <p className="mt-1 text-[14px] text-muted">A daily non-negotiable. Small and specific wins.</p>

      <label className="mt-5 block text-[13px] font-medium text-muted">I will…</label>
      <input
        ref={nameRef}
        value={name}
        enterKeyHint="done"
        onKeyDown={(e) => e.key === 'Enter' && save()}
        onChange={(e) => setName(e.target.value)}
        placeholder={autoName || 'Read 10 pages'}
        className={field}
      />
      {waterTarget({ name }) && (
        <p className="mt-1.5 text-[12.5px] text-sky-400">
          💧 Tracked in sips: target {fmtWater(waterTarget({ name })!)} — put the amount in the name to change it (e.g. “Drink 3L water”).
        </p>
      )}

      <label className="mt-4 block text-[13px] font-medium text-muted">
        Parts <span className="text-faint">(optional — two or three things that count as this habit)</span>
      </label>
      {combo ? (
        <>
          <PartsEditor parts={parts} setParts={setParts} others={others} />
          <p className="mt-1.5 text-[12.5px] text-faint">Any part done keeps your streak (shown orange). All parts = full green day.</p>
        </>
      ) : waterTarget({ name }) ? null : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button onClick={() => startParts()} className="min-h-10 rounded-full border border-dashed border-line-strong/60 px-3 text-[13.5px] font-medium text-muted">
              ⊕ Split into parts
            </button>
            {others.length > 0 && (
              <button onClick={() => setPicking((v) => !v)} aria-expanded={picking} className="min-h-10 rounded-full border border-dashed border-line-strong/60 px-3 text-[13.5px] font-medium text-muted">
                ↪ Combine with an existing habit
              </button>
            )}
          </div>
          {picking && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {others.map((h) => (
                <button key={h.id} onClick={() => startParts(h)} className="min-h-10 rounded-full bg-surface-2 px-3 text-[13.5px] font-medium">
                  {h.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <label className="mt-4 block text-[13px] font-medium text-muted">How often</label>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="How often">
        {[undefined, 1, 2, 3, 4, 5].map((n) => (
          <button
            key={n ?? 'daily'}
            role="radio"
            aria-checked={perWeek === n}
            onClick={() => setPerWeek(n)}
            className={`min-h-10 rounded-full border px-3 text-[13.5px] font-medium ${perWeek === n ? 'border-habit bg-habit/15 text-text' : 'border-line bg-surface-2 text-muted'}`}
          >
            {n === undefined ? 'Every day' : `${n}× a week`}
          </button>
        ))}
      </div>
      {perWeek && <p className="mt-1.5 text-[12.5px] text-faint">Do it any {perWeek} days of the week. Days you don't do it never count as missed.</p>}

      <label className="mt-4 block text-[13px] font-medium text-muted">Remind me at <span className="text-faint">(optional)</span></label>
      <div className="mt-1.5 flex items-center gap-2">
        <input type="time" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={`${field} mt-0 tabular`} />
        {remindAt && (
          <button onClick={() => setRemindAt('')} className="shrink-0 rounded-2xl bg-surface-2 px-4 py-3.5 text-[14px] text-muted">
            Clear
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] text-faint">Skipped if you've already done it.</p>

      <button
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="mt-4 flex min-h-11 w-full items-center justify-between text-[14px] font-medium text-muted"
      >
        More options — trigger, tiny version, pair with
        <motion.span animate={{ rotate: more ? 90 : 0 }} aria-hidden>
          ›
        </motion.span>
      </button>
      {more && (
        <div>
        <label className="mt-2 block text-[13px] font-medium text-muted">After I… <span className="text-faint">(your trigger)</span></label>
        <input value={cue} onChange={(e) => setCue(e.target.value)} placeholder="pour my morning coffee" className={field} />

        <label className="mt-4 block text-[13px] font-medium text-muted">Tiny version for hard days</label>
        <input value={tiny} onChange={(e) => setTiny(e.target.value)} placeholder="Read 1 page" className={field} />

        <label className="mt-4 block text-[13px] font-medium text-muted">Pair it with… <span className="text-faint">(optional)</span></label>
        <input value={pairWith} onChange={(e) => setPairWith(e.target.value)} placeholder="my favourite podcast — only while doing this" className={field} />
        <p className="mt-1.5 text-[12.5px] text-faint">A treat you only allow while doing the habit.</p>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={save}
        disabled={!finalName || !partsOk}
        className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg disabled:opacity-30"
      >
        {habit ? 'Save' : 'Add habit'}
      </motion.button>

      {habit && (
        <button
          onClick={() => {
            if (!confirm) return setConfirm(true);
            archiveHabit(habit.id);
            close();
          }}
          className={`mt-2 w-full py-3 text-[14px] font-medium ${confirm ? 'text-miss' : 'text-faint'}`}
        >
          {confirm ? 'Tap again to remove (history is kept)' : 'Remove habit'}
        </button>
      )}
    </Sheet>
  );
}
