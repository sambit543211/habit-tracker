import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore, useUI } from './store';
import { useToday, isEvening } from './lib/useToday';
import { addDays } from './lib/date';
import { Today } from './screens/Today';
import { PlanTomorrow } from './screens/PlanTomorrow';
import { Insights } from './screens/Insights';
import { Habits } from './screens/Habits';
import { Onboarding } from './screens/Onboarding';
import { TabBar } from './components/TabBar';
import { ReasonSheet } from './components/ReasonSheet';
import { HabitEditor } from './components/HabitEditor';
import { PlanEditor } from './components/PlanEditor';
import { WeeklyReviewSheet } from './components/WeeklyReviewSheet';
import { Celebrations } from './components/Celebrations';
import { Profile } from './screens/Profile';
import { Quit } from './screens/Quit';
import { Circle } from './screens/Circle';
import { NamePrompt } from './screens/NamePrompt';
import { Toast } from './components/Toast';
import { CloseDaySheet } from './components/CloseDaySheet';
import { useAppBadge } from './lib/useAppBadge';
import { Login } from './screens/Login';
import { Ring } from './components/Ring';
import { useSync } from './sync';
import { CLOUD_ENABLED } from './config';

export default function App() {
  const onboarded = useStore((s) => s.onboarded);
  const tab = useUI((s) => s.tab);
  const { today, hour } = useToday();
  const tomorrowEmpty = useStore((s) => !s.plans.some((p) => p.day === addDays(today, 1)));

  useAppBadge(today);
  // New day (or app opened after one): unfinished plans roll onto today.
  const syncReady = useSync((s) => s.ready);
  const planCount = useStore((s) => s.plans.length);
  useEffect(() => {
    if (!syncReady) return;
    const n = useStore.getState().rollOverPlans(today);
    if (n) useUI.getState().showToast(`${n} unfinished plan${n > 1 ? 's' : ''} moved to today`, { tone: 'plan' });
  }, [today, syncReady, planCount]);
  const hasName = useStore((s) => !!s.profile.name);
  const ready = useSync((s) => s.ready);
  const session = useSync((s) => s.session);

  if (CLOUD_ENABLED && !ready) return <Splash />;
  if (CLOUD_ENABLED && !session) return <Login />;
  if (CLOUD_ENABLED && !hasName) return <NamePrompt />;
  if (!onboarded) return <Onboarding />;

  return (
    <>
      <main className="safe-top mx-auto min-h-dvh w-full max-w-md px-4 pb-28">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === 'today' && <Today today={today} hour={hour} />}
            {tab === 'plan' && <PlanTomorrow today={today} hour={hour} />}
            {tab === 'insights' && <Insights today={today} />}
            {tab === 'habits' && <Habits today={today} />}
            {tab === 'profile' && <Profile today={today} />}
            {tab === 'quit' && <Quit today={today} />}
            {tab === 'circle' && <Circle today={today} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar planBadge={isEvening(hour) && tomorrowEmpty} />
      <HabitEditor />
      <PlanEditor />
      <WeeklyReviewSheet today={today} />
      <CloseDaySheet today={today} />
      <Celebrations today={today} />
      <ReasonSheet />
      <Toast />
    </>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}>
        <Ring value={0.7} color="var(--habit)" size={56} stroke={6} />
      </motion.div>
    </div>
  );
}
