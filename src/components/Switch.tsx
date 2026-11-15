import { motion } from 'framer-motion';

/** iOS-style on/off switch. */
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
