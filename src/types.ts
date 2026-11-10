export type ReasonCode =
  | 'forgot'
  | 'no_time'
  | 'low_energy'
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
}

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
}

export interface Data {
  habits: Habit[];
  /** logs[day][habitId] */
  logs: Record<string, Record<string, HabitLog>>;
  plans: Plan[];
  /** First day the user started tracking */
  startDay?: string;
}

/** Anything a "missed" sheet can be opened for. */
export type MissTarget =
  | { kind: 'habit'; id: string; day: string }
  | { kind: 'plan'; id: string };
