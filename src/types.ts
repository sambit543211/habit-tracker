export type ReasonCode =
  | 'forgot'
  | 'no_time'
  | 'low_energy'
  | 'distracted'
  | 'other_priority'
  | 'overplanned'
  | 'blocked'
  | 'chose_not'
  /** Sick / travelling / rest day: not counted, doesn't break the streak */
  | 'skip';

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
  /** Your order in lists (lower = higher up) */
  position?: number;
  /** Weekly habit: this many times a week instead of every day (1–6) */
  perWeek?: number;
  /** Combo habit: 2–3 parts sharing the credit, weights add up to 100 ("Workout 70 + Stretch 30") */
  parts?: HabitPart[];
}

export interface HabitPart {
  id: string;
  name: string;
  /** Share of the habit's credit, 1–99; all parts add up to 100 */
  weight: number;
  /** The old habit this part replaced (its history stays visible, read-only) */
  from?: string;
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
  /** Streak rule: 'all' habits (strict) or 'most' (at least 80%) */
  streakRule?: 'all' | 'most';
  /** Accountability partner's name */
  partner?: string;
  /** Quit-smoking mode (optional) */
  quit?: QuitSettings;
  /** Circle (habit sharing) switched on */
  circle?: boolean;
  /** Money: categories, budgets, payment modes, learned shops */
  money?: MoneySettings;
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
  /** Show the number of open promises on the app icon */
  badge?: boolean;
  /** Circle: get a notification when a friend nudges / cheers you */
  nudges?: boolean;
  cheers?: boolean;
  /** Hold nudges during office hours (weekdays) and deliver them after */
  officeHours?: boolean;
  officeStart?: string;
  officeEnd?: string;
  /** Circles you don't want notifications from */
  mutedCircles?: string[];
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
  /** Combo habits: ids of the parts done. Any part done = 'done' (streak kept); credit = their weights. */
  parts?: string[];
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
  /** First day this plan was meant for (set when it rolls over) */
  originDay?: string;
  /** Repeating plan: weekdays it comes back on (0 = Sunday … 6 = Saturday) */
  repeat?: number[];
}

export interface Data {
  habits: Habit[];
  /** logs[day][habitId] */
  logs: Record<string, Record<string, HabitLog>>;
  plans: Plan[];
  /** First day the user started tracking */
  startDay?: string;
  /** amounts[day][habitId] = ml logged so far (water habits) */
  amounts?: Record<string, Record<string, number>>;
  /** reflections[day] = one line before bed */
  reflections?: Record<string, string>;
  /** weeklyReviews[weekStart (Monday)] */
  weeklyReviews?: Record<string, WeeklyReview>;
  /** Quit-smoking log */
  smokes?: SmokeEvent[];
  /** Money: what you spent */
  expenses?: Expense[];
}

export interface Expense {
  id: string;
  day: string;
  /** Rupees */
  amount: number;
  /** Category id; undefined = still to sort (e.g. logged from a bank SMS) */
  category?: string;
  /** Cash, UPI, Card… */
  mode?: string;
  note?: string;
  source?: 'app' | 'voice' | 'sms';
  /** Who the bank says you paid (bank SMS) */
  payee?: string;
  /** Your entry and the bank SMS were matched as one payment */
  linked?: boolean;
  /** "Don't count": own-account transfer, money lent… kept but left out of totals */
  excluded?: boolean;
  at: number;
}

export interface MoneyCategory {
  id: string;
  name: string;
  emoji: string;
  /** Monthly budget in rupees (optional) */
  budget?: number;
}

export interface MoneySettings {
  categories: MoneyCategory[];
  modes: string[];
  /** Learned shop → category, e.g. { blinkit: 'groceries' } */
  merchants: Record<string, string>;
}

/** Anything a "missed" sheet can be opened for. */
export type MissTarget =
  | { kind: 'habit'; id: string; day: string }
  | { kind: 'plan'; id: string };
