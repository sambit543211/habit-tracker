import { motion } from 'framer-motion';
import { useUI } from '../store';
import { CalendarIcon, ChartIcon, RepeatIcon, SunIcon, UserIcon } from './icons';
import { haptic } from '../lib/feedback';

const TABS = [
  { id: 'today', label: 'Today', Icon: SunIcon },
  { id: 'plan', label: 'Plan', Icon: CalendarIcon },
  { id: 'insights', label: 'Insights', Icon: ChartIcon },
  { id: 'habits', label: 'Habits', Icon: RepeatIcon },
  { id: 'profile', label: 'Profile', Icon: UserIcon },
] as const;

export function TabBar({ planBadge }: { planBadge?: boolean }) {
  const { tab, setTab } = useUI();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="glass flex w-full max-w-md items-center justify-between rounded-[26px] border border-line p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.18)]">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (!active) haptic(6);
                setTab(id);
                window.scrollTo({ top: 0 });
              }}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-[20px] py-2"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-[20px] bg-surface-3/70"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className={`relative transition-colors ${active ? 'text-text' : 'text-muted'}`}>
                <Icon size={21} strokeWidth={active ? 2.1 : 1.8} />
                {id === 'plan' && planBadge && (
                  <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-plan ring-2 ring-surface" />
                )}
              </span>
              <span className={`relative text-[10.5px] font-medium ${active ? 'text-text' : 'text-muted'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
