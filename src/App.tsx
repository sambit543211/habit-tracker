import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore, useUI } from './store';
import { useToday, isEvening } from './lib/useToday';
import { addDays } from './lib/date';
import { Today } from './screens/Today';
const Quick = lazy(() => import('./screens/Quick').then((m) => ({ default: m.Quick })));
const PlanTomorrow = lazy(() => import('./screens/PlanTomorrow').then((m) => ({ default: m.PlanTomorrow })));
const Insights = lazy(() => import('./screens/Insights').then((m) => ({ default: m.Insights })));
import { Onboarding } from './screens/Onboarding';
import { TabBar } from './components/TabBar';
import { ReasonSheet } from './components/ReasonSheet';
import { WaterSheet } from './components/WaterSheet';
import { PartsSheet } from './components/PartsSheet';
import { HabitEditor } from './components/HabitEditor';
import { PlanEditor } from './components/PlanEditor';
import { WeeklyReviewSheet } from './components/WeeklyReviewSheet';
import { Celebrations } from './components/Celebrations';
const Profile = lazy(() => import('./screens/Profile').then((m) => ({ default: m.Profile })));
const Quit = lazy(() => import('./screens/Quit').then((m) => ({ default: m.Quit })));
const Circle = lazy(() => import('./screens/Circle').then((m) => ({ default: m.Circle })));
const MoneyDaily = lazy(() => import('./screens/Money').then((m) => ({ default: m.MoneyDaily })));
const MoneyStats = lazy(() => import('./screens/Money').then((m) => ({ default: m.MoneyStats })));
const MoneyBudget = lazy(() => import('./screens/Money').then((m) => ({ default: m.MoneyBudget })));
import { ModeSwitch } from './components/ModeSwitch';
import { ExpenseSheet } from './components/ExpenseSheet';
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
  // #quick → the one-screen Quick page (save it to the Home Screen as a second icon).
  const [quick, setQuick] = useState(() => location.hash === '#quick');
  useEffect(() => {
    const on = () => setQuick(location.hash === '#quick');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const { today, hour } = useToday();
  const tomorrowEmpty = useStore((s) => !s.plans.some((p) => p.day === addDays(today, 1)));

  useAppBadge(today);
  // New day (or app opened after one): unfinished plans roll onto today.
  const ready = useSync((s) => s.ready);
  const planCount = useStore((s) => s.plans.length);
  useEffect(() => {
    if (!ready) return;
    const n = useStore.getState().rollOverPlans(today);
    useStore.getState().makeRepeats([today, addDays(today, 1)]);
    if (n) useUI.getState().showToast(`${n} unfinished plan${n > 1 ? 's' : ''} moved to today`, { tone: 'plan' });
  }, [today, ready, planCount]);
  const hasName = useStore((s) => !!s.profile.name);
  const session = useSync((s) => s.session);

  if (CLOUD_ENABLED && !ready) return <Splash />;
  if (CLOUD_ENABLED && !session) return <Login />;
  if (CLOUD_ENABLED && !hasName) return <NamePrompt />;
  if (!onboarded) return <Onboarding />;

  if (quick)
    return (
      <>
        <Suspense fallback={<Splash />}>
          <Quick today={today} />
        </Suspense>
        <PlanEditor />
        <ReasonSheet />
        <WaterSheet />
        <PartsSheet />
        <Toast />
      </>
    );

  return (
    <>
      <main className="safe-top mx-auto min-h-dvh w-full max-w-md px-4 pb-28">
        <ModeSwitch />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Suspense fallback={<div className="min-h-[60dvh]" />}>
              {tab === 'today' && <Today today={today} hour={hour} />}
              {tab === 'plan' && <PlanTomorrow today={today} hour={hour} />}
              {tab === 'insights' && <Insights today={today} />}
              {tab === 'profile' && <Profile today={today} />}
              {tab === 'quit' && <Quit today={today} />}
              {tab === 'circle' && <Circle today={today} />}
              {tab === 'money' && <MoneyDaily today={today} />}
              {tab === 'mstats' && <MoneyStats today={today} />}
              {tab === 'budget' && <MoneyBudget today={today} />}
            </Suspense>
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
      <WaterSheet />
      <PartsSheet />
      <ExpenseSheet today={today} />
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
