import type { Data, Profile, Reminders } from '../types';

export interface Snapshot extends Data {
  onboarded: boolean;
  /** undefined = not set on this side yet */
  reminders?: Reminders;
  profile?: Profile;
}

/**
 * Union of local and remote data, used the first time a device signs in.
 * Remote wins wherever both have the same item; local-only items are kept
 * (and then uploaded).
 */
export function mergeSnapshots(local: Snapshot, remote: Snapshot): Snapshot {
  const habitIds = new Set(remote.habits.map((h) => h.id));
  const planIds = new Set(remote.plans.map((p) => p.id));
  const habits = [...remote.habits, ...local.habits.filter((h) => !habitIds.has(h.id))];
  const plans = [...remote.plans, ...local.plans.filter((p) => !planIds.has(p.id))];

  const logs: Data['logs'] = {};
  for (const [day, entries] of Object.entries(local.logs)) logs[day] = { ...entries };
  for (const [day, entries] of Object.entries(remote.logs)) logs[day] = { ...logs[day], ...entries };

  const days = [local.startDay, remote.startDay].filter(Boolean) as string[];
  return {
    habits,
    plans,
    logs,
    startDay: days.length ? days.sort()[0] : undefined,
    onboarded: local.onboarded || remote.onboarded,
    reminders: remote.reminders ?? local.reminders,
    profile: remote.profile ? { ...remote.profile, name: remote.profile.name ?? local.profile?.name } : local.profile,
    reflections: { ...local.reflections, ...remote.reflections },
    weeklyReviews: { ...local.weeklyReviews, ...remote.weeklyReviews },
  };
}
