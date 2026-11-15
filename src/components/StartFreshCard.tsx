import { useState } from 'react';
import { useUI } from '../store';
import { startFresh } from '../sync';
import { addDays, dayKeyAt, formatDay } from '../lib/date';

/** Me → Account: wipe the trial period and start counting from today or tomorrow. */
export function StartFreshCard() {
  const today = dayKeyAt();
  const tomorrow = addDays(today, 1);
  const [day, setDay] = useState(tomorrow);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const showToast = useUI((s) => s.showToast);

  const go = async () => {
    setStep(2);
    try {
      await startFresh(day);
      useUI.getState().setTab('today');
      showToast(day === today ? 'Fresh start — day 1 is today' : `Fresh start — day 1 is ${formatDay(day, { weekday: 'long' })}`, { tone: 'habit' });
    } catch (e) {
      showToast((e as Error).message || "Couldn't reset — try again", { tone: 'miss' });
    }
    setStep(0);
  };

  return (
    <section className="card px-4 py-4">
      <h2 className="text-[15px] font-semibold">Start fresh</h2>
      <p className="mt-1 text-[12.5px] text-faint">
        Done experimenting? Clears every check-in, past plan, reason, reflection, weekly review and smoke log, and resets your score,
        streak, level and badges. <span className="text-muted">Your habits, settings and upcoming plans stay.</span>
      </p>
      {step === 0 ? (
        <button onClick={() => setStep(1)} className="mt-3 min-h-11 w-full rounded-2xl border border-miss/40 text-[14px] font-semibold text-miss">
          Start fresh…
        </button>
      ) : (
        <div className="mt-3">
          <div className="text-[13px] font-medium text-muted">Day 1 is…</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="First day">
            {[today, tomorrow].map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={day === d}
                onClick={() => setDay(d)}
                className={`min-h-11 rounded-xl text-[14px] font-medium ${day === d ? 'bg-surface text-text shadow-sm' : 'text-muted'}`}
              >
                {d === today ? 'Today' : 'Tomorrow'} <span className="text-[12px] text-faint">{formatDay(d, { weekday: 'short' })}</span>
              </button>
            ))}
          </div>
          <button
            onClick={go}
            disabled={step === 2}
            className="mt-3 min-h-12 w-full rounded-2xl bg-miss text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {step === 2 ? 'Resetting…' : `Erase history, start ${day === today ? 'today' : 'tomorrow'}`}
          </button>
          <button onClick={() => setStep(0)} className="mt-1 min-h-11 w-full text-[14px] font-medium text-muted">
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
