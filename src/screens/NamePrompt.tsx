import { motion } from 'framer-motion';
import { useState } from 'react';
import { useStore } from '../store';

/** Asked once: your name is your accountability. */
export function NamePrompt() {
  const setProfile = useStore((s) => s.setProfile);
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) setProfile({ name: name.trim() });
      }}
      className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),48px)] pb-[max(env(safe-area-inset-bottom),24px)]"
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col">
        <div className="text-[44px]">👋</div>
        <h1 className="mt-4 text-[32px] leading-[1.1] font-bold tracking-[-0.03em]">What should we call you?</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Your name goes on every day's promises. People work harder to keep commitments they've put their name to.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          placeholder="Your first name"
          className="mt-8 w-full rounded-2xl border border-line bg-surface px-4 py-4 text-[20px] font-semibold outline-none placeholder:font-normal placeholder:text-faint focus:border-line-strong"
        />
        <div className="flex-1" />
        <motion.button
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={!name.trim()}
          className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg disabled:opacity-30"
        >
          Continue
        </motion.button>
      </motion.div>
    </form>
  );
}
