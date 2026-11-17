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
import { waterTarget } from './lib/water';

/** RFC 4122 v4 UUID (the database stores ids as uuid). */
/** Copies of a repeating plan get a stable id per day, so two devices never make it twice. */
export const repeatId = (templateId: string, day: string) => templateId.slice(0, 24) + `cafe${day.replace(/-/g, '')}`;
export const isRepeatCopy = (id: string) => id.length === 36 && id.slice(24, 28) === 'cafe' && /^\d{8}$/.test(id.slice(28));
// Copies already made on this device (so deleting one doesn't bring it back).
const REPEATS_KEY = 'keep-repeats-made';
const repeatsMade = new Set<string>((() => {
  try {
    return JSON.parse(localStorage.getItem(REPEATS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
})());
const saveRepeatsMade = () => {
  try {
    localStorage.setItem(REPEATS_KEY, JSON.stringify([...repeatsMade].slice(-500)));
  } catch {
    /* storage unavailable */
  }
};

/** After 8 pm (or before the 2 am cutoff) a brand-new day 1 starts tomorrow. */
export const lateStart = (d = new Date()) => d.getHours() >= 20 || d.getHours() < 2;

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
  Pick<Plan, 'title' | 'must' | 'note' | 'start' | 'duration' | 'remindOffset' | 'remindAt' | 'repeat'>
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
  amounts: Record<string, Record<string, number>>;
  /** Log water (ml, negative to undo). Reaching the target ticks the habit; dropping below un-ticks it. */
  addWater: (day: string, habitId: string, ml: number) => void;
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
  /** Start fresh on `day`: wipes history on this device (the cloud is wiped by the start_fresh RPC). */
  startFreshLocal: (day: string, dataToo: boolean) => void;
  addHabit: (h: { name: string; cue?: string; tiny?: string; remindAt?: string; pairWith?: string; perWeek?: number }) => void;
  updateHabit: (id: string, patch: Partial<Pick<Habit, 'name' | 'cue' | 'tiny' | 'remindAt' | 'pairWith' | 'perWeek'>>) => void;
  archiveHabit: (id: string) => void;
  /** Save a new order: ids top to bottom */
  reorderHabits: (ids: string[]) => void;

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
  /** Create today's / tomorrow's copies of repeating plans (once each). */
  makeRepeats: (days: string[]) => void;

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
      amounts: {},
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
      addWater: (day, habitId, ml) => {
        const habit = get().habits.find((h) => h.id === habitId);
        if (!habit) return;
        const target = waterTarget(habit) ?? 2000;
        set((s) => {
          const now = Math.max(0, (s.amounts[day]?.[habitId] ?? 0) + ml);
          const log = s.logs[day]?.[habitId];
          let dayLogs = s.logs[day] ?? {};
          if (now >= target && log?.status !== 'done') dayLogs = { ...dayLogs, [habitId]: { status: 'done', at: Date.now() } };
          if (now < target && log?.status === 'done') {
            const { [habitId]: _, ...rest } = dayLogs; // eslint-disable-line @typescript-eslint/no-unused-vars
            dayLogs = rest;
          }
          return {
            amounts: { ...s.amounts, [day]: { ...s.amounts[day], [habitId]: now } },
            logs: dayLogs === s.logs[day] ? s.logs : { ...s.logs, [day]: dayLogs },
          };
        });
      },

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
        // Joining late in the evening (or after midnight)? Day 1 is tomorrow, so it can't start as a failed day.
        const day1 = lateStart() ? addDays(dayKeyAt(), 1) : dayKeyAt();
        set((s) => ({
          onboarded: true,
          startDay: s.startDay ?? day1,
          habits: [
            ...s.habits,
            ...habits.map((h, i) => ({ id: uid(), name: h.name, cue: h.cue, createdDay: day1, position: s.habits.length + i + 1 })),
          ],
        }));
      },

      addHabit: ({ name, cue, tiny, remindAt, pairWith, perWeek }) => {
        const today = dayKeyAt();
        set((s) => ({
          startDay: s.startDay ?? today,
          habits: [
            ...s.habits,
            { id: uid(), name, cue, tiny, remindAt, pairWith, perWeek, createdDay: today, position: Math.max(0, ...s.habits.map((h) => h.position ?? 0)) + 1 },
          ],
        }));
      },

      reorderHabits: (ids) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            const i = ids.indexOf(h.id);
            return i === -1 || h.position === i + 1 ? h : { ...h, position: i + 1 };
          }),
        })),

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
          // A new day isn't the same schedule: the moved plan drops its old time slot.
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

      makeRepeats: (days) => {
        const plans = get().plans;
        const ids = new Set(plans.map((p) => p.id));
        const add: Plan[] = [];
        for (const t of plans.filter((p) => p.repeat?.length)) {
          for (const day of days) {
            if (day <= t.day || !t.repeat!.includes(new Date(`${day}T12:00:00`).getDay())) continue;
            const id = repeatId(t.id, day);
            if (ids.has(id) || repeatsMade.has(id)) continue;
            repeatsMade.add(id);
            add.push({
              id,
              title: t.title,
              day,
              must: t.must,
              status: 'pending',
              carryCount: 0,
              createdAt: Date.now(),
              note: t.note,
              start: t.start,
              duration: t.duration,
              remindOffset: t.remindOffset,
              remindAt: t.remindAt,
            });
          }
        }
        saveRepeatsMade();
        if (add.length) set((s) => ({ plans: [...s.plans, ...add] }));
      },

      rollOverPlans: (today) => {
        // A missed repeating plan doesn't pile up — the next one is already coming.
        const missedRepeats = get().plans.filter((p) => p.day < today && p.status === 'pending' && (p.repeat?.length || isRepeatCopy(p.id)));
        if (missedRepeats.length) {
          const ids = new Set(missedRepeats.map((p) => p.id));
          set((s) => ({ plans: s.plans.map((p) => (ids.has(p.id) ? { ...p, status: 'missed' as const } : p)) }));
        }
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
            // Carried plans lose their old time slot — you'll pick a new time (or none) for the new day.
            copies.push({
              ...p,
              id,
              day: today,
              status: 'pending',
              miss: undefined,
              carriedTo: undefined,
              carryCount: p.carryCount + 1,
              originDay: p.originDay ?? p.day,
              start: undefined,
              duration: undefined,
              remindOffset: undefined,
              remindAt: undefined,
            });
          }
          return {
            plans: [...s.plans.map((p) => (stale.has(p.id) ? { ...p, status: 'carried' as const, carriedTo: rollId(p.id) } : p)), ...copies],
          };
        });
        return past.length;
      },

      dismissFreshStart: (day) => set({ freshStartSeen: day }),

      startFreshLocal: (day, dataToo) =>
        set((s) => ({
          ...(dataToo
            ? {
                logs: {},
                plans: s.plans.filter((p) => p.day >= day),
                reflections: {},
                amounts: {},
                weeklyReviews: {},
                smokes: [],
                habits: s.habits.filter((h) => !h.archivedDay).map((h) => ({ ...h, createdDay: day })),
                startDay: day,
              }
            : {}),
          // Progress moments start over too.
          levelSeen: 0,
          badgesSeen: [],
          questsSeen: [],
          milestonesSeen: [],
          shieldSeen: undefined,
          dayClosedSeen: undefined,
          freshStartSeen: day,
        })),

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
          amounts: data.amounts ?? {},
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
          amounts: {},
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
  tab: 'today' | 'plan' | 'insights' | 'profile' | 'quit' | 'circle';
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
  /** Water sheet: which habit/day is open */
  water: { id: string; day: string } | null;
  openWater: (w: { id: string; day: string } | null) => void;
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
  water: null,
  openWater: (water) => set({ water }),
  reviewOpen: false,
  editingHabit: null,
  setTab: (tab) => set({ tab }),
  openMiss: (missTarget) => set({ missTarget }),
  setReview: (reviewOpen) => set({ reviewOpen }),
  editHabit: (editingHabit) => set({ editingHabit }),
}));
