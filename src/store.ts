import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_REMINDERS, type Data, type Habit, type Miss, type MissTarget, type Plan, type Reminders } from './types';
import { addDays, dayKeyAt } from './lib/date';

/** RFC 4122 v4 UUID (the database stores ids as uuid). */
const uid = (): string => {
  const c = globalThis.crypto as Crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

interface Store extends Data {
  onboarded: boolean;
  reminders: Reminders;
  setReminders: (patch: Partial<Reminders>) => void;
  freshStartSeen?: string;

  completeOnboarding: (habits: { name: string; cue?: string }[]) => void;
  addHabit: (h: { name: string; cue?: string; tiny?: string; remindAt?: string }) => void;
  updateHabit: (id: string, patch: Partial<Pick<Habit, 'name' | 'cue' | 'tiny' | 'remindAt'>>) => void;
  archiveHabit: (id: string) => void;

  markHabit: (day: string, id: string) => void;
  missHabit: (day: string, id: string, miss: Miss) => void;
  clearHabit: (day: string, id: string) => void;

  addPlan: (day: string, title: string, must: boolean) => void;
  deletePlan: (id: string) => void;
  toggleMust: (id: string) => void;
  markPlan: (id: string) => void;
  missPlan: (id: string, miss: Miss) => void;
  carryPlan: (id: string, miss: Miss) => void;
  clearPlan: (id: string) => void;

  dismissFreshStart: (day: string) => void;

  /** Replace all tracked data (used when loading from the cloud). */
  replaceData: (data: Data & { onboarded: boolean; reminders?: Reminders }) => void;
  /** Wipe local data (sign-out). */
  reset: () => void;
}

const updatePlan = (plans: Plan[], id: string, patch: Partial<Plan>) =>
  plans.map((p) => (p.id === id ? { ...p, ...patch } : p));

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      habits: [],
      logs: {},
      plans: [],
      onboarded: false,
      reminders: DEFAULT_REMINDERS,

      setReminders: (patch) => set((s) => ({ reminders: { ...s.reminders, ...patch } })),

      completeOnboarding: (habits) => {
        const today = dayKeyAt();
        set((s) => ({
          onboarded: true,
          startDay: s.startDay ?? today,
          habits: [
            ...s.habits,
            ...habits.map((h) => ({ id: uid(), name: h.name, cue: h.cue, createdDay: today })),
          ],
        }));
      },

      addHabit: ({ name, cue, tiny, remindAt }) => {
        const today = dayKeyAt();
        set((s) => ({
          startDay: s.startDay ?? today,
          habits: [...s.habits, { id: uid(), name, cue, tiny, remindAt, createdDay: today }],
        }));
      },

      updateHabit: (id, patch) =>
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),

      archiveHabit: (id) => {
        const today = dayKeyAt();
        const habit = get().habits.find((h) => h.id === id);
        if (!habit) return;
        const hasHistory = Object.values(get().logs).some((l) => l[id]);
        set((s) => ({
          habits:
            habit.createdDay === today && !hasHistory
              ? s.habits.filter((h) => h.id !== id)
              : s.habits.map((h) => (h.id === id ? { ...h, archivedDay: today } : h)),
        }));
      },

      markHabit: (day, id) =>
        set((s) => ({
          logs: { ...s.logs, [day]: { ...s.logs[day], [id]: { status: 'done', at: Date.now() } } },
        })),

      missHabit: (day, id, miss) =>
        set((s) => ({
          logs: {
            ...s.logs,
            [day]: { ...s.logs[day], [id]: { status: 'missed', miss, at: Date.now() } },
          },
        })),

      clearHabit: (day, id) =>
        set((s) => {
          const dayLogs = { ...s.logs[day] };
          delete dayLogs[id];
          return { logs: { ...s.logs, [day]: dayLogs } };
        }),

      addPlan: (day, title, must) => {
        const today = dayKeyAt();
        set((s) => ({
          startDay: s.startDay ?? today,
          plans: [
            ...s.plans,
            { id: uid(), title, day, must, status: 'pending', carryCount: 0, createdAt: Date.now() },
          ],
        }));
      },

      deletePlan: (id) => set((s) => ({ plans: s.plans.filter((p) => p.id !== id) })),

      toggleMust: (id) =>
        set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, must: !p.must } : p)) })),

      markPlan: (id) => set((s) => ({ plans: updatePlan(s.plans, id, { status: 'done' }) })),

      missPlan: (id, miss) =>
        set((s) => ({ plans: updatePlan(s.plans, id, { status: 'missed', miss }) })),

      /** Mark as not done (with a reason) and move a copy forward. */
      carryPlan: (id, miss) => {
        const plan = get().plans.find((p) => p.id === id);
        if (!plan) return;
        const today = dayKeyAt();
        const target = plan.day < today ? today : addDays(plan.day, 1);
        const copy: Plan = {
          id: uid(),
          title: plan.title,
          day: target,
          must: plan.must,
          status: 'pending',
          carryCount: plan.carryCount + 1,
          createdAt: Date.now(),
        };
        set((s) => ({
          plans: [...updatePlan(s.plans, id, { status: 'carried', miss, carriedTo: copy.id }), copy],
        }));
      },

      /** Undo: back to pending (removes the carried copy if untouched). */
      clearPlan: (id) =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === id);
          const child = plan?.carriedTo ? s.plans.find((p) => p.id === plan.carriedTo) : undefined;
          const plans = s.plans.filter((p) => !(child && p.id === child.id && p.status === 'pending'));
          return {
            plans: updatePlan(plans, id, { status: 'pending', miss: undefined, carriedTo: undefined }),
          };
        }),

      dismissFreshStart: (day) => set({ freshStartSeen: day }),

      replaceData: (data) =>
        set({
          habits: data.habits,
          logs: data.logs,
          plans: data.plans,
          startDay: data.startDay,
          onboarded: data.onboarded,
          reminders: data.reminders ?? DEFAULT_REMINDERS,
        }),

      reset: () =>
        set({ habits: [], logs: {}, plans: [], startDay: undefined, onboarded: false, freshStartSeen: undefined, reminders: DEFAULT_REMINDERS }),
    }),
    { name: 'keep-habit-tracker', version: 1 },
  ),
);

/** Ephemeral UI state (not persisted). */
interface UI {
  tab: 'today' | 'plan' | 'insights' | 'habits';
  missTarget: MissTarget | null;
  reviewOpen: boolean;
  editingHabit: string | 'new' | null;
  setTab: (t: UI['tab']) => void;
  openMiss: (t: MissTarget | null) => void;
  setReview: (o: boolean) => void;
  editHabit: (id: string | 'new' | null) => void;
}

export const useUI = create<UI>()((set) => ({
  tab: 'today',
  missTarget: null,
  reviewOpen: false,
  editingHabit: null,
  setTab: (tab) => set({ tab }),
  openMiss: (missTarget) => set({ missTarget }),
  setReview: (reviewOpen) => set({ reviewOpen }),
  editHabit: (editingHabit) => set({ editingHabit }),
}));
