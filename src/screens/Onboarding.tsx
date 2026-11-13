import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useStore } from '../store';
import { CheckIcon, PlusIcon } from '../components/icons';
import { Ring } from '../components/Ring';

const SUGGESTIONS = [
  { name: 'Drink 2L water', cue: 'wake up' },
  { name: 'Workout 30 min', cue: 'finish work' },
  { name: 'Read 10 pages', cue: 'get into bed' },
  { name: 'Meditate 5 min', cue: 'brush my teeth in the morning' },
  { name: 'Journal', cue: 'finish dinner' },
  { name: 'No phone in bed', cue: 'get into bed' },
  { name: 'Walk 8k steps', cue: 'have lunch' },
  { name: 'Learn something new', cue: 'commute home' },
];

const STEPS = [
  { color: 'var(--habit)', title: 'Habits', text: 'Your daily non-negotiables. Every one, every day.' },
  { color: 'var(--plan)', title: 'Plans', text: "What you intend to do. Unfinished ones carry over until they're done." },
  { color: 'var(--miss)', title: 'Be honest', text: 'Missed a habit? Say why. Your score shows how well you keep your word.' },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<{ name: string; cue?: string }[]>([]);
  const [custom, setCustom] = useState('');
  const complete = useStore((s) => s.completeOnboarding);

  const toggle = (h: { name: string; cue?: string }) =>
    setPicked((p) => (p.some((x) => x.name === h.name) ? p.filter((x) => x.name !== h.name) : [...p, h]));

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <AnimatePresence mode="wait">
        {step === 0 ? (
          <motion.div key="intro" className="flex flex-1 flex-col" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="mt-2 flex justify-center">
              <div className="relative">
                <Ring value={0.78} color="var(--habit)" size={120} stroke={11} />
                <div className="absolute inset-[18px]">
                  <Ring value={0.62} color="var(--plan)" size={84} stroke={11}>
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: 'spring' }} className="text-2xl">✦</motion.span>
                  </Ring>
                </div>
              </div>
            </div>
            <h1 className="mt-7 text-[30px] leading-[1.1] font-bold tracking-[-0.035em]">
              Keep the promises you make to yourself.
            </h1>
            <div className="mt-6 flex flex-col gap-4">
              {STEPS.map((s, i) => (
                <motion.div key={s.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.12 }} className="flex gap-4">
                  <span className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ background: s.color }} />
                  <div>
                    <div className="text-[16px] font-semibold">{s.title}</div>
                    <div className="text-[14.5px] text-muted">{s.text}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="flex-1" />
            <PrimaryButton onClick={() => setStep(1)}>Get started</PrimaryButton>
          </motion.div>
        ) : (
          <motion.div key="habits" className="flex flex-1 flex-col" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div className="text-[13px] font-semibold tracking-[0.08em] text-habit uppercase">Step 1 of 1</div>
            <h1 className="mt-1 text-[30px] leading-tight font-bold tracking-[-0.03em]">Pick your daily habits</h1>
            <p className="mt-2 text-[14.5px] text-muted">
              Start with 2–4. Streaks are strict, so fewer, smaller habits beat an ambitious list you can't keep. You can add triggers later.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[...SUGGESTIONS, ...picked.filter((p) => !SUGGESTIONS.some((s) => s.name === p.name))].map((s) => {
                const on = picked.some((p) => p.name === s.name);
                return (
                  <motion.button
                    key={s.name}
                    layout
                    whileTap={{ scale: 0.94 }}
                    onClick={() => toggle(s)}
                    className={`flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[14.5px] font-medium transition-colors ${
                      on ? 'border-habit bg-habit/15 text-text' : 'border-line bg-surface text-muted'
                    }`}
                  >
                    {on && <CheckIcon size={15} strokeWidth={2.6} className="text-habit" />}
                    {s.name}
                  </motion.button>
                );
              })}
            </div>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = custom.trim();
                if (n && !picked.some((p) => p.name === n)) setPicked((p) => [...p, { name: n }]);
                setCustom('');
              }}
            >
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Or write your own…"
                className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 outline-none placeholder:text-faint focus:border-line-strong" />
              <button type="submit" disabled={!custom.trim()} aria-label="Add" className="grid size-12 place-items-center rounded-2xl bg-surface-3 disabled:opacity-40">
                <PlusIcon size={20} />
              </button>
            </form>
            <div className="flex-1" />
            <p className="mb-3 text-center text-[13px] text-muted">{picked.length} selected</p>
            <PrimaryButton disabled={!picked.length} onClick={() => complete(picked)}>
              Start tracking
            </PrimaryButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PrimaryButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button whileTap={{ scale: 0.98 }} {...(p as object)} className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg disabled:opacity-30">
      {children}
    </motion.button>
  );
}
