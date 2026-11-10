import { motion } from 'framer-motion';
import { useState } from 'react';
import { PlusIcon, StarIcon } from './icons';
import { haptic } from '../lib/feedback';

interface Props {
  onAdd: (title: string, must: boolean) => void;
  placeholder: string;
  defaultMust?: boolean;
}

export function PlanInput({ onAdd, placeholder, defaultMust = false }: Props) {
  const [title, setTitle] = useState('');
  const [must, setMust] = useState(defaultMust);
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    haptic(6);
    onAdd(t, must);
    setTitle('');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 rounded-[20px] border border-dashed border-line-strong/60 bg-surface/40 py-1.5 pr-1.5 pl-2"
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        onClick={() => setMust((m) => !m)}
        aria-pressed={must}
        aria-label="Must-do"
        title="Must-do"
        className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors ${must ? 'text-gold' : 'text-faint'}`}
      >
        <StarIcon size={18} filled={must} />
      </motion.button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-faint"
      />
      <motion.button
        type="submit"
        whileTap={{ scale: 0.9 }}
        disabled={!title.trim()}
        aria-label="Add plan"
        className="grid size-10 shrink-0 place-items-center rounded-2xl bg-plan text-white transition-opacity disabled:opacity-25"
      >
        <PlusIcon size={20} strokeWidth={2.4} />
      </motion.button>
    </form>
  );
}
