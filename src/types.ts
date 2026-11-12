export type ReasonCode =
  | 'forgot'
  | 'no_time'
  | 'low_energy'
  | 'distracted'
  | 'other_priority'
  | 'overplanned'
  | 'blocked'
  | 'chose_not';

export interface Miss {
  reason: ReasonCode;
  note?: string;
  /** Coping plan: "Next time, I will…" */
  nextTime?: string;
}

export interface Habit {
  id: string;
  name: string;
  /** Implementation intention cue: "After I …" */
  cue?: string;
  /** Tiny fallback version for hard days */
  tiny?: string;
  createdDay: string;
  /** First day the habit no longer counts */
  archivedDay?: string;
  /** Daily reminder time, "HH:MM" local */
  remindAt?: string;
  /** Temptation bundling: something enjoyable you only allow while doing it */
  pairWith?: string;
}

/** Name + day shape, shown on Profile and used for the calendar. */
export interface Profile {
  name?: string;
  /** "HH:MM" — start of your day */
  wake: string;
  /** "HH:MM" — when you go to sleep (may be after midnight) */
  sleep: string;
  /** Streak shields on (earned every 7 perfect days) */
  shields?: boolean;
  /** Accountability partner's name */
  partner?: string;
  /** Quit-smoking mode (optional) */
  quit?: QuitSettings;
  /** Circle (habit sharing) switched on */
  circle?: boolean;
}

export interface QuitSettings {
  enabled: boolean;
  /** 'cold' = stop on the quit date; 'reduce' = daily limit steps down to zero by the quit date */
  mode: 'cold' | 'reduce';
  /** Cigarettes per day before starting */
  baseline: number;
  /** Price of one cigarette */
  price: number;
  /** Day tracking started */
  startDay: string;
  /** Day you stop completely */
  quitDate: string;
  /** Currency symbol for savings */
  currency?: string;
}

export const SMOKE_TRIGGERS = ['stress', 'after_meal', 'coffee', 'alcohol', 'boredom', 'social', 'habit', 'other'] as const;
export type SmokeTrigger = (typeof SMOKE_TRIGGERS)[number];

export interface SmokeEvent {
  id: string;
  day: string;
  at: number;
  kind: 'smoked' | 'craving_passed';
  trigger?: SmokeTrigger;
}

export const DEFAULT_PROFILE: Profile = { wake: '08:00', sleep: '02:00', shields: true };

export interface WeeklyReview {
  wentWell?: string;
  change?: string;
  experiment?: string;
}

/** Nudge settings. Times are "HH:MM" local; null = off. */
export interface Reminders {
  enabled: boolean;
  morning: string | null;
  evening: string | null;
  streak: string | null;
  /** Morning brief at wake-up time */
  brief: boolean;
  /** Last call one hour before bed */
  lastCall: boolean;
  /** Reminder kinds the server paused after being ignored 3 days running */
  paused: string[];
}

export const DEFAULT_REMINDERS: Reminders = {
  enabled: true,
  morning: '08:30',
  evening: '21:00',
  streak: '22:30',
  brief: true,
  lastCall: true,
  paused: [],
};

export interface HabitLog {
  status: 'done' | 'missed';
  miss?: Miss;
  at: number;
}

export type PlanStatus = 'pending' | 'done' | 'missed' | 'carried';

export interface Plan {
  id: string;
  title: string;
  day: string;
  must: boolean;
  status: PlanStatus;
  miss?: Miss;
  /** How many times this plan has been moved forward */
  carryCount: number;
  /** Id of the copy created when this plan was carried forward */
  carriedTo?: string;
  createdAt: number;
  note?: string;
  /** "HH:MM" start time — puts the plan on the calendar */
  start?: string;
  /** Minutes, at least 15 */
  duration?: number;
  /** Remind N minutes before `start` */
  remindOffset?: number;
  /** Remind at a fixed time (for plans without a start time) */
  remindAt?: string;
  /** WOOP: what might get in the way */
  obstacle?: string;
  /** WOOP: "If that happens, I will…" */
  ifThen?: string;
}

export interface Data {
  habits: Habit[];
  /** logs[day][habitId] */
  logs: Record<string, Record<string, HabitLog>>;
  plans: Plan[];
  /** First day the user started tracking */
  startDay?: string;
  /** reflections[day] = one line before bed */
  reflections?: Record<string, string>;
  /** weeklyReviews[weekStart (Monday)] */
  weeklyReviews?: Record<string, WeeklyReview>;
  /** Quit-smoking log */
  smokes?: SmokeEvent[];
}

/** Anything a "missed" sheet can be opened for. */
export type MissTarget =
  | { kind: 'habit'; id: string; day: string }
  | { kind: 'plan'; id: string };
