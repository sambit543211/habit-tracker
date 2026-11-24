import { motion } from 'framer-motion';
import { useUI } from '../store';
import { haptic } from '../lib/feedback';

/** Habits ⇄ Money, at the top of every main screen. */
export function ModeSwitch() {
  const mode = useUI((s) => s.mode);
  const setMode = useUI((s) => s.setMode);
  return (
    <div className="flex justify-center pt-1 pb-2">
      <div className="flex rounded-full bg-surface-2 p-0.5" role="radiogroup" aria-label="Habits or Money">
        {(['habits', 'money'] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              if (mode === m) return;
              haptic(8);
              setMode(m);
              window.scrollTo({ top: 0 });
            }}
            className={`relative min-h-9 rounded-full px-4 text-[13.5px] font-semibold ${mode === m ? 'text-text' : 'text-muted'}`}
          >
            {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-surface shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{m === 'habits' ? '✅ Habits' : '₹ Money'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
