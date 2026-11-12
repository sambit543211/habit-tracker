/**
 * Circle: share chosen habits with up to 6 friends.
 * The server only ever returns names, linked habit names and done / missed /
 * open per day — never plans, notes or miss reasons.
 */
import { create } from 'zustand';
import { supabase } from './supabase';

export interface CircleLink {
  user_id: string;
  habit_id: string;
  habit: string;
  /** Last 30 days, oldest first: d = done, m = missed, - = open */
  days: string;
}
export interface CircleGoal {
  id: string;
  name: string;
  emoji: string;
  created_by: string | null;
  links: CircleLink[];
}
export interface CircleMember {
  user_id: string;
  name: string;
  status: 'invited' | 'active';
}
export interface CircleReaction {
  from: string;
  to: string;
  goal: string;
  kind: 'cheer' | 'nudge';
}
export interface CircleData {
  me: string;
  invite: { circle: string; from: string; size: number } | null;
  circle: {
    id: string;
    name: string;
    owner: string;
    members: CircleMember[];
    goals: CircleGoal[];
    reactions: CircleReaction[];
  } | null;
}

// ---------- pure helpers ----------

export const todayStatus = (l: CircleLink) => {
  const c = l.days[l.days.length - 1];
  return c === 'd' ? 'done' : c === 'm' ? 'missed' : 'open';
};

/** Consecutive done days; an open today doesn't break it. */
export function linkStreak(days: string) {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i] === 'd') n++;
    else if (i === days.length - 1 && days[i] === '-') continue;
    else break;
  }
  return n;
}

/** Days in a row on which EVERY active member with a link did it. */
export function groupStreak(goal: CircleGoal, activeCount: number) {
  if (goal.links.length < 2 || goal.links.length < activeCount) return 0;
  const len = Math.min(...goal.links.map((l) => l.days.length));
  let n = 0;
  for (let back = 0; back < len; back++) {
    const all = goal.links.every((l) => l.days[l.days.length - 1 - back] === 'd');
    if (all) n++;
    else if (back === 0 && goal.links.every((l) => l.days[l.days.length - 1] !== 'm')) continue; // today still open
    else break;
  }
  return n;
}

/** My circle score today: linked goals done / linked goals. Null when nothing is linked. */
export function circleScore(data: CircleData | null) {
  const goals = data?.circle?.goals ?? [];
  const mine = goals.map((g) => g.links.find((l) => l.user_id === data!.me)).filter((l): l is CircleLink => !!l);
  if (!mine.length) return null;
  const done = mine.filter((l) => todayStatus(l) === 'done').length;
  return { done, total: mine.length, score: done / mine.length };
}

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '·';

// ---------- store + API ----------

interface CircleStore {
  data: CircleData | null;
  loading: boolean;
  error: string | null;
  refresh: (day: string) => Promise<void>;
}

/** Sample circle for the cloud-free test build only (VITE_LOCAL_ONLY). */
const DEMO: CircleData = {
  me: 'me',
  invite: null,
  circle: {
    id: 'demo',
    name: "Sambit's circle",
    owner: 'me',
    members: [
      { user_id: 'me', name: 'Sambit', status: 'active' },
      { user_id: 'r', name: 'Rahul Verma', status: 'active' },
      { user_id: 'a', name: 'Ananya', status: 'active' },
      { user_id: 'k', name: 'Kabir', status: 'invited' },
    ],
    goals: [
      {
        id: 'g1', name: 'Gym', emoji: '🏋️', created_by: 'me',
        links: [
          { user_id: 'me', habit_id: 'h1', habit: 'Workout 30 min', days: 'ddddddmdddddddddddddddddddddd-' },
          { user_id: 'r', habit_id: 'x', habit: 'Gym', days: 'dddmdddddddddddddddddddddddddd' },
          { user_id: 'a', habit_id: 'y', habit: 'Strength training', days: 'ddddddddddddmddddddddddddddddd-' },
        ],
      },
      {
        id: 'g2', name: 'Clean eating', emoji: '🥗', created_by: 'r',
        links: [
          { user_id: 'r', habit_id: 'x2', habit: 'No junk food', days: 'ddddddddddddddddddddddddmdddd-' },
          { user_id: 'a', habit_id: 'y2', habit: 'Diet', days: 'dddddddddddddddddddddddddddddm' },
        ],
      },
    ],
    reactions: [{ from: 'r', to: 'me', goal: 'g1', kind: 'nudge' }],
  },
};

export const useCircle = create<CircleStore>((set) => ({
  data: null,
  loading: false,
  error: null,
  refresh: async (day) => {
    if (!supabase) return set({ data: DEMO });
    set({ loading: true });
    const { data, error } = await supabase.rpc('circle_state', { on_day: day });
    set({ loading: false, data: error ? null : (data as CircleData), error: error ? error.message : null });
  },
}));

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error('Circle needs an internet connection.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const circleApi = {
  search: (q: string) => rpc<{ user_id: string; name: string; email_hint: string }[]>('circle_search', { q }),
  invite: (target: string) => rpc<string>('circle_invite', { target }),
  respond: (accept: boolean) => rpc<string>('circle_respond', { accept }),
  remove: (target: string | null) => rpc<string>('circle_remove', { target }),
  addGoal: (name: string, emoji: string) => rpc<string>('circle_add_goal', { goal_name: name, goal_emoji: emoji }),
  deleteGoal: (goal: string) => rpc<string>('circle_delete_goal', { goal }),
  link: (goal: string, habit: string | null) => rpc<string>('circle_link', { goal, habit }),
  react: (to: string, goal: string, day: string, kind: 'cheer' | 'nudge') =>
    rpc<string>('circle_react', { to_whom: to, goal, on_day: day, reaction: kind }),
};

export const INVITE_MESSAGES: Record<string, string> = {
  invited: 'Request sent',
  self: "That's you",
  not_found: 'No such person',
  already_in_a_circle: "They're already in a circle (or have a pending request)",
  full: 'Your circle is full (6 people)',
  answer_your_invite_first: 'Answer your own pending request first',
};
