import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_PROFILE,
  DEFAULT_REMINDERS,
  type Data,
  type Habit,
  type Miss,
  type MissTarget,
  type Plan,
  type Profile,
  type Reminders,
  type SmokeEvent,
  type SmokeTrigger,
  type WeeklyReview,
} from './types';
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

/** Editable plan details (everything except identity and status). */
export type PlanDetails = Partial<
  Pick<Plan, 'title' | 'must' | 'note' | 'start' | 'duration' | 'remindOffset' | 'remindAt' | 'obstacle' | 'ifThen'>
>;

interface Store extends Data {
  onboarded: boolean;
  reminders: Reminders;
  setReminders: (patch: Partial<Reminders>) => void;
  profile: Profile;
  setProfile: (patch: Partial<Profile>) => void;
  reflections: Record<string, string>;
  weeklyReviews: Record<string, WeeklyReview>;
  setReflection: (day: string, text: string) => void;
  setWeeklyReview: (weekStart: string, review: WeeklyReview) => void;
  smokes: SmokeEvent[];
  logSmoke: (kind: SmokeEvent['kind'], trigger?: SmokeTrigger) => string;
  removeSmoke: (id: string) => void;
  /** Local-only (per device) */
  theme: 'system' | 'light' | 'dark';
  setTheme: (t: 'system' | 'light' | 'dark') => void;
  levelSeen: number;
  badgesSeen: string[];
  questsSeen: string[];
  shieldSeen?: string;
  markSeen: (patch: { levelSeen?: number; badgesSeen?: string[]; questsSeen?: string[]; shieldSeen?: string }) => void;
  milestonesSeen: number[];
  markMilestone: (n: number) => void;
  dayClosedSeen?: string;
  markDayClosed: (day: string) => void;
  freshStartSeen?: string;

  completeOnboarding: (habits: { name: string; cue?: string }[]) => void;
  addHabit: (h: { name: string; cue?: string; tiny?: string; remindAt?: string; pairWith?: string }) => void;
  updateHabit: (id: string, patch: Partial<Pick<Habit, 'name' | 'cue' | 'tiny' | 'remindAt' | 'pairWith'>>) => void;
  archiveHabit: (id: string) => void;

  markHabit: (day: string, id: string) => void;
  missHabit: (day: string, id: string, miss: Miss) => void;
  clearHabit: (day: string, id: string) => void;

  addPlan: (day: string, title: string, must: boolean, details?: PlanDetails) => string;
  updatePlan: (id: string, details: PlanDetails) => void;
  deletePlan: (id: string) => void;
  /** Put a deleted plan back (undo) */
  restorePlan: (plan: Plan) => void;
  swipeHintSeen?: boolean;
  markSwipeHintSeen: () => void;
  toggleMust: (id: string) => void;
  markPlan: (id: string) => void;
  missPlan: (id: string, miss?: Miss) => void;
  carryPlan: (id: string, miss?: Miss) => void;
  clearPlan: (id: string) => void;
  /** Move every unfinished plan from earlier days onto `today` (runs when a new day starts). */
  rollOverPlans: (today: string) => number;

  dismissFreshStart: (day: string) => void;

  /** Replace all tracked data (used when loading from the cloud). */
  replaceData: (data: Data & { onboarded: boolean; reminders?: Reminders; profile?: Profile }) => void;
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
      profile: DEFAULT_PROFILE,
      reflections: {},
      weeklyReviews: {},
      smokes: [],
      logSmoke: (kind, trigger) => {
        const id = uid();
        set((s) => ({ smokes: [...s.smokes, { id, day: dayKeyAt(), at: Date.now(), kind, trigger }] }));
        return id;
      },
      removeSmoke: (id) => set((s) => ({ smokes: s.smokes.filter((e) => e.id !== id) })),
      milestonesSeen: [],
      theme: 'system',
      levelSeen: 0,
      badgesSeen: [],
      questsSeen: [],
      setTheme: (theme) => set({ theme }),
      markSeen: (patch) => set(patch),

      setReminders: (patch) => set((s) => ({ reminders: { ...s.reminders, ...patch } })),
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setReflection: (day, text) =>
        set((s) => {
          const reflections = { ...s.reflections };
          if (text.trim()) reflections[day] = text.trim();
          else delete reflections[day];
          return { reflections };
        }),
      setWeeklyReview: (weekStart, review) =>
        set((s) => ({ weeklyReviews: { ...s.weeklyReviews, [weekStart]: review } })),
      markMilestone: (n) => set((s) => ({ milestonesSeen: [...new Set([...s.milestonesSeen, n])] })),
      markDayClosed: (day) => set({ dayClosedSeen: day }),

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

      addHabit: ({ name, cue, tiny, remindAt, pairWith }) => {
        const today = dayKeyAt();
        set((s) => ({
          startDay: s.startDay ?? today,
          habits: [...s.habits, { id: uid(), name, cue, tiny, remindAt, pairWith, createdDay: today }],
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

      addPlan: (day, title, must, details) => {
        const today = dayKeyAt();
        const id = uid();
        set((s) => ({
          startDay: s.startDay ?? today,
          plans: [
            ...s.plans,
            { id, title, day, must, status: 'pending', carryCount: 0, createdAt: Date.now(), ...details },
          ],
        }));
        return id;
      },

      updatePlan: (id, details) => set((s) => ({ plans: updatePlan(s.plans, id, details) })),

      deletePlan: (id) => set((s) => ({ plans: s.plans.filter((p) => p.id !== id) })),
      restorePlan: (plan) => set((s) => ({ plans: s.plans.some((p) => p.id === plan.id) ? s.plans : [...s.plans, plan] })),
      markSwipeHintSeen: () => set({ swipeHintSeen: true }),

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
          originDay: plan.originDay ?? plan.day,
          note: plan.note,
          start: plan.start,
          duration: plan.duration,
          remindOffset: plan.remindOffset,
          remindAt: plan.remindAt,
          obstacle: plan.obstacle,
          ifThen: plan.ifThen,
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

      rollOverPlans: (today) => {
        const past = get().plans.filter((p) => p.day < today && p.status === 'pending');
        if (!past.length) return 0;
        // Deterministic id per (plan, day) so two devices rolling over the same plan don't duplicate it.
        const rollId = (id: string) => id.slice(0, 24) + `0000${today.replace(/-/g, '')}`;
        set((s) => {
          const ids = new Set(s.plans.map((p) => p.id));
          const stale = new Set(past.map((p) => p.id));
          const copies: Plan[] = [];
          for (const p of past) {
            const id = rollId(p.id);
            if (ids.has(id)) continue;
            copies.push({ ...p, id, day: today, status: 'pending', miss: undefined, carriedTo: undefined, carryCount: p.carryCount + 1, originDay: p.originDay ?? p.day });
          }
          return {
            plans: [...s.plans.map((p) => (stale.has(p.id) ? { ...p, status: 'carried' as const, carriedTo: rollId(p.id) } : p)), ...copies],
          };
        });
        return past.length;
      },

      dismissFreshStart: (day) => set({ freshStartSeen: day }),

      replaceData: (data) =>
        set({
          habits: data.habits,
          logs: data.logs,
          plans: data.plans,
          startDay: data.startDay,
          onboarded: data.onboarded,
          reminders: data.reminders ?? DEFAULT_REMINDERS,
          profile: data.profile ?? DEFAULT_PROFILE,
          reflections: data.reflections ?? {},
          weeklyReviews: data.weeklyReviews ?? {},
          smokes: data.smokes ?? [],
        }),

      reset: () =>
        set({
          habits: [],
          logs: {},
          plans: [],
          startDay: undefined,
          onboarded: false,
          freshStartSeen: undefined,
          reminders: DEFAULT_REMINDERS,
          profile: DEFAULT_PROFILE,
          reflections: {},
          weeklyReviews: {},
          smokes: [],
          milestonesSeen: [],
          dayClosedSeen: undefined,
        }),
    }),
    { name: 'keep-habit-tracker', version: 1 },
  ),
);

/** Ephemeral UI state (not persisted). */
export type PlanEditTarget = { id: string } | { day: string; start?: string };

export interface Toast {
  id: number;
  message: string;
  tone?: 'habit' | 'plan' | 'miss';
  undo?: () => void;
}

interface UI {
  tab: 'today' | 'plan' | 'insights' | 'habits' | 'profile' | 'quit' | 'circle';
  editingPlan: PlanEditTarget | null;
  editPlan: (t: PlanEditTarget | null) => void;
  reviewWeekOpen: boolean;
  setReviewWeek: (o: boolean) => void;
  closeDayOpen: boolean;
  setCloseDay: (o: boolean) => void;
  toast: Toast | null;
  showToast: (message: string, opts?: { undo?: () => void; tone?: Toast['tone'] }) => void;
  hideToast: () => void;
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
  editingPlan: null,
  editPlan: (editingPlan) => set({ editingPlan }),
  reviewWeekOpen: false,
  setReviewWeek: (reviewWeekOpen) => set({ reviewWeekOpen }),
  closeDayOpen: false,
  setCloseDay: (closeDayOpen) => set({ closeDayOpen }),
  toast: null,
  showToast: (message, opts) => set({ toast: { id: Date.now(), message, ...opts } }),
  hideToast: () => set({ toast: null }),
  missTarget: null,
  reviewOpen: false,
  editingHabit: null,
  setTab: (tab) => set({ tab }),
  openMiss: (missTarget) => set({ missTarget }),
  setReview: (reviewOpen) => set({ reviewOpen }),
  editHabit: (editingHabit) => set({ editingHabit }),
}));
