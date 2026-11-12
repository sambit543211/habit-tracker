import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { CalendarIcon, ChartIcon, NoSmokeIcon, SunIcon, UserIcon, UsersIcon } from './icons';
import { haptic } from '../lib/feedback';
import { useSync } from '../sync';

/**
 * Floating bottom bar. Habits lives inside "Me"; Circle and Quit appear only
 * when those modes are switched on in Profile.
 */
export function TabBar({ planBadge }: { planBadge?: boolean }) {
  const { tab, setTab } = useUI();
  const quitOn = useStore((s) => !!s.profile.quit?.enabled);
  const circleOn = useStore((s) => !!s.profile.circle);
  // Unsynced changes or offline → small amber dot on Me (where sync status lives).
  const unsynced = useSync((s) => !!s.session && (s.pending > 0 || s.status === 'offline' || s.status === 'error'));
  type Tab = Parameters<typeof setTab>[0];
  const tabs: { id: Tab; label: string; Icon: typeof SunIcon }[] = [
    { id: 'today', label: 'Today', Icon: SunIcon },
    { id: 'plan', label: 'Plan', Icon: CalendarIcon },
    { id: 'insights', label: 'Insights', Icon: ChartIcon },
    ...(circleOn ? [{ id: 'circle' as Tab, label: 'Circle', Icon: UsersIcon }] : []),
    ...(quitOn ? [{ id: 'quit' as Tab, label: 'Quit', Icon: NoSmokeIcon }] : []),
    { id: 'profile', label: 'Me', Icon: UserIcon },
  ];
  // The Habits screen is reached from Me, so Me stays highlighted there.
  const current = tab === 'habits' ? 'profile' : tab;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(calc(env(safe-area-inset-bottom)-14px),10px)]">
      <div className="tabbar flex w-full max-w-md items-center justify-between rounded-[26px] p-1.5">
        {tabs.map(({ id, label, Icon }) => {
          const active = current === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (!active) haptic(6);
                setTab(id);
                window.scrollTo({ top: 0 });
              }}
              className="relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px]"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="tabbar-pill absolute inset-0 rounded-[20px]"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className={`relative transition-colors ${active ? 'tabbar-icon text-plan' : 'text-muted'}`}>
                <Icon size={22} strokeWidth={active ? 2.2 : 1.9} />
                {id === 'plan' && planBadge && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-plan ring-2 ring-surface" />}
                {id === 'profile' && unsynced && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-1 size-2 rounded-full bg-gold ring-2 ring-surface"
                    aria-label="Changes not synced yet"
                  />
                )}
              </span>
              <span className={`relative truncate text-[12px] ${active ? 'font-semibold text-text' : 'font-medium text-muted'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
