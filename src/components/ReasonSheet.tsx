import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore, useUI } from '../store';
import { REASONS, REASON_TIPS } from '../lib/reasons';
import type { ReasonCode } from '../types';
import { Sheet } from './Sheet';
import { dayKeyAt } from '../lib/date';

/** Habits: "What got in the way?" (reason required). Plans: drop or move, reason optional. */
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
  // One tap logs it. "Add a note" first switches to pick-then-save.
  const [detailed, setDetailed] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    if (target) {
      setReason(null);
      setNote('');
      setNextTime('');
      setMakeCue(false);
      setDetailed(false);
      setShowWhy(false);
    }
  }, [target]);

  const habit = target?.kind === 'habit' ? habits.find((h) => h.id === target.id) : undefined;
  const plan = target?.kind === 'plan' ? plans.find((p) => p.id === target.id) : undefined;
  const title = habit?.name ?? plan?.title ?? '';
  const close = () => openMiss(null);
  const canCarry = plan && plan.day <= dayKeyAt();

  const submit = (picked: ReasonCode | null = reason) => {
    if (!picked || !target) return;
    const miss = { reason: picked, note: note.trim() || undefined, nextTime: nextTime.trim() || undefined };
    const { clearHabit } = useStore.getState();
    const showToast = useUI.getState().showToast;
    if (target.kind === 'habit') {
      missHabit(target.day, target.id, miss);
      if (makeCue && miss.nextTime) updateHabit(target.id, { cue: miss.nextTime });
      const t = target;
      showToast(picked === 'skip' ? 'Skipped today — streak safe' : 'Logged as not done', {
        tone: picked === 'skip' ? 'plan' : 'miss',
        undo: () => clearHabit(t.day, t.id),
      });
    }
    close();
  };

  return (
    <Sheet open={!!liveTarget} onClose={close} z={70}>
      {plan && (
        <>
          <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 text-[14px] text-muted">What happened with this plan?</p>
          {!showWhy ? (
            <button onClick={() => setShowWhy(true)} className="mt-2 min-h-10 text-[13.5px] font-medium text-muted underline underline-offset-2">
              {reason ? `Reason: ${REASONS.find((r) => r.code === reason)?.label}` : 'Add a reason (optional)'}
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => {
                    setReason(reason === r.code ? null : r.code);
                    setShowWhy(false);
                  }}
                  aria-pressed={reason === r.code}
                  className={`min-h-10 rounded-full border px-3 text-[13.5px] font-medium ${
                    reason === r.code ? 'border-miss bg-miss/10 text-text' : 'border-line bg-surface-2 text-muted'
                  }`}
                >
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {canCarry && (
              <Choice
                emoji="↪"
                title={`Move to ${plan.day < dayKeyAt() ? 'today' : 'tomorrow'}`}
                text={plan.start ? 'Still want to do it — pick a new time there. Counts as not done today.' : 'Still want to do it. Counts as not done today.'}
                onClick={() => {
                  const id = plan.id;
                  carryPlan(id, reason ? { reason } : undefined);
                  close();
                  useUI.getState().showToast(`Moved to ${plan.day < dayKeyAt() ? 'today' : 'tomorrow'}`, { tone: 'plan', undo: () => useStore.getState().clearPlan(id) });
                }}
              />
            )}
            <Choice
              emoji="✕"
              tone="miss"
              title="I didn't do it"
              text="Counts as missed today, and it won't come back tomorrow."
              onClick={() => {
                const id = plan.id;
                missPlan(id, reason ? { reason } : undefined);
                close();
                useUI.getState().showToast('Marked as not done', { tone: 'miss', undo: () => useStore.getState().clearPlan(id) });
              }}
            />
            <Choice
              emoji="🗑"
              title="Not needed any more"
              text="Plans change. It's removed and doesn't count against you."
              onClick={() => {
                const copy = plan;
                deletePlan(plan.id);
                close();
                useUI.getState().showToast('Plan removed', { tone: 'plan', undo: () => useStore.getState().restorePlan(copy) });
              }}
            />
          </div>
        </>
      )}
      {!plan && (
        <>
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
              onClick={() => (detailed ? setReason(r.code) : submit(r.code))}
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

      <button
        onClick={() => submit('skip')}
        className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 text-left"
      >
        <span className="text-[18px]" aria-hidden>🛌</span>
        <span>
          <span className="block text-[14.5px] font-semibold">Skip today</span>
          <span className="block text-[12.5px] text-muted">Sick, travelling or a rest day — not counted, streak safe</span>
        </span>
      </button>
      {!detailed && (
        <button onClick={() => setDetailed(true)} className="mt-3 min-h-11 w-full text-[13.5px] font-medium text-muted">
          Tap a reason to log it · <span className="underline underline-offset-2">add a note first</span>
        </button>
      )}

      <AnimatePresence initial={false}>
        {detailed && reason && (
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
              placeholder="e.g. do it right after brushing my teeth"
              className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 outline-none focus:border-line-strong"
            />
            {habit && nextTime.trim() && (
              <label className="mt-2.5 flex items-center gap-2.5 text-[14px] text-muted">
                <input type="checkbox" checked={makeCue} onChange={(e) => setMakeCue(e.target.checked)} className="size-4 accent-(--habit)" />
                Make this the habit's new trigger
              </label>
            )}

          </motion.div>
        )}
      </AnimatePresence>

      {detailed && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={!reason}
          onClick={() => submit()}
          className="mt-5 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg transition-opacity disabled:opacity-30"
        >
          {reason ? 'Log it' : 'Pick a reason above'}
        </motion.button>
      )}
        </>
      )}
    </Sheet>
  );
}

function Choice({ emoji, title, text, tone, onClick }: { emoji: string; title: string; text: string; tone?: 'miss'; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left ${tone === 'miss' ? 'border-miss/35 bg-miss/5' : 'border-line bg-surface-2'}`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[17px] font-bold ${tone === 'miss' ? 'bg-miss/15 text-miss' : 'bg-surface text-text'}`} aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0">
        <span className="block text-[15.5px] font-semibold">{title}</span>
        <span className="block text-[12.5px] leading-snug text-muted">{text}</span>
      </span>
    </motion.button>
  );
}
