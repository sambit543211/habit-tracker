/**
 * Circle: share chosen habits with up to 6 friends.
 * The server only ever returns names, linked habit names and done / missed /
 * open per day — never plans, notes or miss reasons.
 */
import { create } from 'zustand';
import { supabase } from './supabase';
import { useUI } from '../store';

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
export interface CircleInfo {
  id: string;
  name: string;
  owner: string;
  members: CircleMember[];
  goals: CircleGoal[];
  reactions: CircleReaction[];
}
export interface CircleInvite {
  circle_id: string;
  circle: string;
  from: string;
  size: number;
}
/** You can be in up to 5 circles. `circle` is the one being viewed; `circles` is all of them. */
export interface CircleData {
  me: string;
  invites: CircleInvite[];
  circles: CircleInfo[];
  circle: CircleInfo | null;
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

const allCircles = (data: CircleData | null) => (data?.circles?.length ? data.circles : data?.circle ? [data.circle] : []);

/** My circle score today, across all my circles: linked habits done / linked habits. Null when nothing is linked. */
export function circleScore(data: CircleData | null) {
  const links = allCircles(data)
    .flatMap((c) => c.goals)
    .map((g) => g.links.find((l) => l.user_id === data!.me))
    .filter((l): l is CircleLink => !!l);
  // The same habit linked in two circles counts once.
  const mine = [...new Map(links.map((l) => [l.habit_id, l])).values()];
  if (!mine.length) return null;
  const done = mine.filter((l) => todayStatus(l) === 'done').length;
  return { done, total: mine.length, score: done / mine.length };
}

/** Best "together" streak in any of my circles. */
export const bestGroupStreak = (data: CircleData | null) =>
  Math.max(
    0,
    ...allCircles(data).flatMap((c) => {
      const active = c.members.filter((m) => m.status === 'active').length;
      return c.goals.map((g) => groupStreak(g, active));
    }),
  );

/** Nudges sent to me today, across circles. */
export const nudgesForMe = (data: CircleData | null) =>
  allCircles(data).reduce((n, c) => n + c.reactions.filter((r) => r.to === data!.me && r.kind === 'nudge').length, 0);

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
  /** Which circle the Circle tab is showing */
  selected: string | null;
  select: (id: string) => void;
  refresh: (day: string) => Promise<void>;
}

const SELECTED_KEY = 'keep-circle';
const readSelected = () => {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
};
const withSelection = (d: Omit<CircleData, 'circle'>, selected: string | null): CircleData => ({
  ...d,
  circle: d.circles.find((c) => c.id === selected) ?? d.circles[0] ?? null,
});

/** Sample circle for the cloud-free test build only (VITE_LOCAL_ONLY). */
const DEMO_CIRCLE: CircleInfo = {
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
};

const DEMO: Omit<CircleData, 'circle'> = {
  me: 'me',
  invites: [{ circle_id: 'demo3', circle: "Hima's circle", from: 'Hima', size: 1 }],
  circles: [
    DEMO_CIRCLE,
    {
      id: 'demo2',
      name: 'Book club',
      owner: 'a',
      members: [
        { user_id: 'a', name: 'Ananya', status: 'active' },
        { user_id: 'me', name: 'Sambit', status: 'active' },
      ],
      goals: [
        {
          id: 'g3', name: 'Read', emoji: '📚', created_by: 'a',
          links: [
            { user_id: 'a', habit_id: 'y3', habit: 'Read 20 pages', days: 'ddddddddddddddddddddddddddddd-' },
            { user_id: 'me', habit_id: 'h2', habit: 'Read 10 pages', days: 'dddddddddddddddddddddddddddddd' },
          ],
        },
      ],
      reactions: [],
    },
  ],
};

export const useCircle = create<CircleStore>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  selected: readSelected(),
  select: (id) => {
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* storage unavailable */
    }
    const d = get().data;
    set({ selected: id, data: d ? withSelection(d, id) : d });
  },
  refresh: async (day) => {
    if (!supabase) return set({ data: withSelection(DEMO, get().selected) });
    set({ loading: true });
    const { data, error } = await supabase.rpc('circle_state_all', { on_day: day });
    set({
      loading: false,
      data: error || !data ? null : withSelection(data as Omit<CircleData, 'circle'>, get().selected),
      error: error ? error.message : null,
    });
    // "Rahul accepted your invite" etc. — shown once, then marked seen on the server.
    const { data: inbox } = await supabase.rpc('circle_inbox');
    const events = (inbox ?? []) as { kind: 'accepted' | 'declined'; name: string; circle?: string | null }[];
    events.forEach((e, i) =>
      setTimeout(
        () =>
          useUI
            .getState()
            .showToast(e.kind === 'accepted' ? `🎉 ${e.name} joined ${e.circle ? `“${e.circle}”` : 'your circle'}` : `${e.name} declined your invite${e.circle ? ` to “${e.circle}”` : ''}`, {
              tone: e.kind === 'accepted' ? 'habit' : 'miss',
            }),
        i * 3500,
      ),
    );
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
  /** Create a new circle and return its id */
  create: (name: string) => rpc<string>('circle_create', { circle_name: name }),
  /** circle null = start a new circle with this friend */
  invite: (circle: string | null, target: string) => rpc<string>('circle_invite_to', { c: circle, target }),
  respond: (circle: string, accept: boolean) => rpc<string>('circle_answer', { c: circle, accept }),
  /** target null = leave the circle yourself */
  remove: (circle: string, target: string | null) => rpc<string>('circle_leave', { c: circle, target }),
  addGoal: (circle: string, name: string, emoji: string) => rpc<string>('circle_new_goal', { c: circle, goal_name: name, goal_emoji: emoji }),
  deleteGoal: (goal: string) => rpc<string>('circle_delete_goal', { goal }),
  link: (goal: string, habit: string | null) => rpc<string>('circle_link', { goal, habit }),
  react: (to: string, goal: string, day: string, kind: 'cheer' | 'nudge') =>
    rpc<string>('circle_react', { to_whom: to, goal, on_day: day, reaction: kind }),
};

export const INVITE_MESSAGES: Record<string, string> = {
  invited: "Request sent — you'll be notified when they accept",
  self: "That's you",
  not_found: 'No such person',
  already_member: "They're already in this circle",
  already_invited: 'Already invited — waiting for them to accept',
  full: 'This circle is full (6 people)',
  they_have_too_many: "They're already in 5 circles",
  not_member: "You're not in that circle any more",
};
