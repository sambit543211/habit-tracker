import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore, useUI } from '../store';
import { REASONS, REASON_TIPS } from '../lib/reasons';
import type { ReasonCode } from '../types';
import { Sheet } from './Sheet';
import { dayKeyAt } from '../lib/date';

/** "What got in the way?" — required reason for every miss. */
export function ReasonSheet() {
  const liveTarget = useUI((s) => s.missTarget);
  // Keep the last target so content stays visible during the exit animation.
  const [target, setTarget] = useState(liveTarget);
  useEffect(() => {
    if (liveTarget) setTarget(liveTarget);
  }, [liveTarget]);
  const openMiss = useUI((s) => s.openMiss);
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const { missHabit, missPlan, carryPlan, deletePlan, updateHabit } = useStore();

  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [makeCue, setMakeCue] = useState(false);
  const [action, setAction] = useState<'missed' | 'carry'>('missed');

  useEffect(() => {
    if (target) {
      setReason(null);
      setNote('');
      setNextTime('');
      setMakeCue(false);
      setAction(target.kind === 'plan' ? 'carry' : 'missed');
    }
  }, [target]);

  const habit = target?.kind === 'habit' ? habits.find((h) => h.id === target.id) : undefined;
  const plan = target?.kind === 'plan' ? plans.find((p) => p.id === target.id) : undefined;
  const title = habit?.name ?? plan?.title ?? '';
  const close = () => openMiss(null);
  const canCarry = plan && plan.day <= dayKeyAt();

  const submit = () => {
    if (!reason || !target) return;
    const miss = { reason, note: note.trim() || undefined, nextTime: nextTime.trim() || undefined };
    const { clearHabit, clearPlan } = useStore.getState();
    const showToast = useUI.getState().showToast;
    if (target.kind === 'habit') {
      missHabit(target.day, target.id, miss);
      if (makeCue && miss.nextTime) updateHabit(target.id, { cue: miss.nextTime });
      const t = target;
      showToast('Logged as not done', { tone: 'miss', undo: () => clearHabit(t.day, t.id) });
    } else {
      const id = target.id;
      if (action === 'carry' && canCarry) {
        carryPlan(id, miss);
        showToast('Moved forward', { tone: 'plan', undo: () => clearPlan(id) });
      } else {
        missPlan(id, miss);
        showToast('Logged as not done', { tone: 'miss', undo: () => clearPlan(id) });
      }
    }
    close();
  };

  return (
    <Sheet open={!!liveTarget} onClose={close} z={70}>
      <div className="mb-1 text-[13px] font-medium tracking-wide text-miss uppercase">Not done</div>
      <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-1.5 text-[14px] text-muted">What got in the way? No judgment — it's data that helps you design a better tomorrow.</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {REASONS.map((r) => {
          const active = reason === r.code;
          return (
            <motion.button
              key={r.code}
              whileTap={{ scale: 0.94 }}
              onClick={() => setReason(r.code)}
              className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-[14px] font-medium transition-colors ${
                active ? 'border-miss bg-miss/10 text-text' : 'border-line bg-surface-2 text-muted'
              }`}
            >
              <span className="text-[18px]">{r.emoji}</span>
              {r.label}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {reason && (
          <motion.div
            key="more"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] text-muted">
              💡 {REASON_TIPS[reason]}
            </div>

            <label className="mt-4 block text-[13px] font-medium text-muted">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="A bit more context…"
              className="mt-1.5 w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 outline-none focus:border-line-strong"
            />

            <label className="mt-3 block text-[13px] font-medium text-muted">Next time, I will…</label>
            <input
              value={nextTime}
              onChange={(e) => setNextTime(e.target.value)}
              placeholder={habit ? 'e.g. do it right after brushing my teeth' : 'e.g. do it first thing, before email'}
              className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 outline-none focus:border-line-strong"
            />
            {habit && nextTime.trim() && (
              <label className="mt-2.5 flex items-center gap-2.5 text-[14px] text-muted">
                <input type="checkbox" checked={makeCue} onChange={(e) => setMakeCue(e.target.checked)} className="size-4 accent-(--habit)" />
                Make this the habit's new trigger
              </label>
            )}

            {plan && canCarry && (
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
                {(['carry', 'missed'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={`relative rounded-xl py-2.5 text-[14px] font-medium ${action === a ? 'text-text' : 'text-muted'}`}
                  >
                    {action === a && (
                      <motion.span layoutId="carry-pill" className="absolute inset-0 rounded-xl bg-surface shadow-sm" />
                    )}
                    <span className="relative">{a === 'carry' ? `Move to ${plan.day < dayKeyAt() ? 'today' : 'tomorrow'}` : 'Drop it'}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.98 }}
        disabled={!reason}
        onClick={submit}
        className="mt-5 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg transition-opacity disabled:opacity-30"
      >
        Log it
      </motion.button>
      {plan && (
        <button
          onClick={() => {
            const copy = plan;
            deletePlan(plan.id);
            close();
            useUI.getState().showToast('Plan deleted', { tone: 'miss', undo: () => useStore.getState().restorePlan(copy) });
          }}
          className="mt-2 w-full py-2 text-[13px] text-faint"
        >
          Added by mistake? Delete this plan
        </button>
      )}
    </Sheet>
  );
}
