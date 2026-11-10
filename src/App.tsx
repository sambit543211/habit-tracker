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
import { ReviewSheet } from './components/ReviewSheet';
import { HabitEditor } from './components/HabitEditor';

export default function App() {
  const onboarded = useStore((s) => s.onboarded);
  const tab = useUI((s) => s.tab);
  const { today, hour } = useToday();
  const tomorrowEmpty = useStore((s) => !s.plans.some((p) => p.day === addDays(today, 1)));

  if (!onboarded) return <Onboarding />;

  return (
    <>
      <main className="safe-top mx-auto w-full max-w-md px-4 pb-32">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === 'today' && <Today today={today} hour={hour} />}
            {tab === 'plan' && <PlanTomorrow today={today} />}
            {tab === 'insights' && <Insights today={today} />}
            {tab === 'habits' && <Habits today={today} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar planBadge={isEvening(hour) && tomorrowEmpty} />
      <ReviewSheet today={today} />
      <HabitEditor />
      <ReasonSheet />
    </>
  );
}
