/**
 * Cloud sync (Supabase).
 *
 * The zustand store stays the source of truth for the UI and works offline.
 * Every local change is diffed into row operations and queued in a persisted
 * outbox, which is flushed to Supabase whenever we're online. Remote data is
 * pulled on sign-in, when the app regains focus, and every minute while open.
 */
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { useStore } from './store';
import {
  diff,
  rowToHabit,
  rowToPlan,
  rowsToLogs,
  type HabitRow,
  type LogRow,
  type Op,
  type PlanRow,
  type ProfileRow,
} from './lib/mapping';
import { mergeSnapshots, type Snapshot } from './lib/merge';

type Status = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  session: Session | null;
  /** Initial auth + data load finished */
  ready: boolean;
  status: Status;
  pending: number;
  lastSynced?: number;
}

export const useSync = create<SyncState>(() => ({
  session: null,
  ready: !supabase,
  status: 'idle',
  pending: 0,
}));

const OUTBOX_KEY = 'keep-outbox';
const USER_KEY = 'keep-user';
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

// ---------- Outbox ----------

const outbox = new Map<string, Op>();
try {
  for (const op of JSON.parse(read(OUTBOX_KEY) ?? '[]') as Op[]) outbox.set(op.key, op);
} catch {
  /* corrupt outbox — start fresh */
}

const saveOutbox = () => {
  write(OUTBOX_KEY, JSON.stringify([...outbox.values()]));
  useSync.setState({ pending: outbox.size });
};

let flushTimer: ReturnType<typeof setTimeout> | undefined;
const enqueue = (ops: Op[]) => {
  if (!ops.length) return;
  for (const op of ops) {
    outbox.delete(op.key); // keep latest op, move to the end
    outbox.set(op.key, op);
  }
  saveOutbox();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 500);
};

// ---------- Local changes → outbox ----------

let userId: string | null = null;
let applyingRemote = false;

const snap = (s: Snapshot): Snapshot => ({
  habits: s.habits,
  plans: s.plans,
  logs: s.logs,
  startDay: s.startDay,
  onboarded: s.onboarded,
});

useStore.subscribe((next, prev) => {
  if (applyingRemote || !userId) return;
  enqueue(diff(snap(prev), snap(next), userId, timezone()));
});

const applyRemote = (s: Snapshot) => {
  applyingRemote = true;
  try {
    useStore.getState().replaceData(s);
  } finally {
    applyingRemote = false;
  }
};

// ---------- Flush outbox → Supabase ----------

const ORDER: [Op['table'], Op['kind']][] = [
  ['profiles', 'upsert'],
  ['habits', 'upsert'],
  ['plans', 'upsert'],
  ['habit_logs', 'upsert'],
  ['habit_logs', 'delete'],
  ['plans', 'delete'],
  ['habits', 'delete'],
];

const CONFLICT: Record<Op['table'], string> = {
  profiles: 'user_id',
  habits: 'id',
  plans: 'id',
  habit_logs: 'user_id,day,habit_id',
};

type Result = 'ok' | 'retry' | 'drop';

const classify = (error: { message?: string; code?: string } | null, status: number): Result => {
  if (!error) return 'ok';
  // Network failures, auth refresh races and server errors are retried later.
  if (!status || status === 401 || status === 408 || status === 429 || status >= 500) return 'retry';
  console.warn('[sync] dropping operation after permanent error', error);
  return 'drop';
};

async function run(table: Op['table'], kind: Op['kind'], ops: Op[]): Promise<Result> {
  const sb = supabase!;
  if (kind === 'upsert') {
    const rows = ops.map((o) => (o as Extract<Op, { kind: 'upsert' }>).row);
    const { error, status } = await sb.from(table).upsert(rows, { onConflict: CONFLICT[table] });
    return classify(error, status);
  }
  if (table === 'habit_logs') {
    for (const o of ops as Extract<Op, { table: 'habit_logs'; kind: 'delete' }>[]) {
      const { error, status } = await sb.from('habit_logs').delete().eq('day', o.day).eq('habit_id', o.habit_id);
      const r = classify(error, status);
      if (r === 'retry') return r;
    }
    return 'ok';
  }
  const ids = (ops as { id: string }[]).map((o) => o.id);
  const { error, status } = await sb.from(table).delete().in('id', ids);
  return classify(error, status);
}

let flushing: Promise<void> | null = null;

export function flush(): Promise<void> {
  if (!supabase || !userId) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    let rounds = 0;
    while (outbox.size && rounds++ < 5) {
      useSync.setState({ status: 'syncing' });
      const batch = [...outbox.values()];
      for (const [table, kind] of ORDER) {
        const ops = batch.filter((o) => o.table === table && o.kind === kind);
        if (!ops.length) continue;
        let result: Result;
        try {
          result = await run(table, kind, ops);
        } catch {
          result = 'retry';
        }
        if (result === 'retry') {
          useSync.setState({ status: navigator.onLine ? 'error' : 'offline' });
          return;
        }
        // Remove ops that weren't replaced by a newer change while in flight.
        for (const o of ops) if (outbox.get(o.key) === o) outbox.delete(o.key);
        saveOutbox();
      }
    }
    useSync.setState({ status: 'idle', lastSynced: Date.now() });
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ---------- Pull Supabase → local ----------

async function fetchAll<T>(table: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase!.from(table).select('*').range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < page) return out;
  }
}

async function fetchRemote(): Promise<Snapshot> {
  const [profile, habits, plans, logs] = await Promise.all([
    supabase!.from('profiles').select('*').eq('user_id', userId!).maybeSingle(),
    fetchAll<HabitRow>('habits'),
    fetchAll<PlanRow>('plans'),
    fetchAll<LogRow>('habit_logs'),
  ]);
  if (profile.error) throw profile.error;
  const p = profile.data as ProfileRow | null;
  return {
    habits: habits.map(rowToHabit),
    plans: plans.map(rowToPlan),
    logs: rowsToLogs(logs),
    startDay: p?.start_day ?? undefined,
    onboarded: p?.onboarded ?? false,
  };
}

/** Refresh local data from the cloud (after pushing any pending changes). */
export async function pull(): Promise<void> {
  if (!supabase || !userId) return;
  if (!initialDone) return initialSync();
  await flush();
  if (outbox.size) return; // still offline — keep local data
  try {
    useSync.setState({ status: 'syncing' });
    const remote = await fetchRemote();
    if (outbox.size) return; // user changed something mid-fetch; next pull picks it up
    applyRemote(remote);
    useSync.setState({ status: 'idle', lastSynced: Date.now() });
  } catch {
    useSync.setState({ status: navigator.onLine ? 'error' : 'offline' });
  }
}

// ---------- Sign-in / sign-out ----------

/** True once this device's data has been reconciled with the account. */
let initialDone = false;

async function onSignedIn(session: Session) {
  const id = session.user.id;
  if (userId === id) return;
  userId = id;
  initialDone = false;

  // Local data belongs to another account → wipe it rather than mixing.
  const previous = read(USER_KEY);
  if (previous && previous !== id) {
    write(USER_KEY, null);
    applyRemote({ habits: [], plans: [], logs: {}, startDay: undefined, onboarded: false });
    outbox.clear();
    saveOutbox();
  }
  await initialSync();
  useSync.setState({ ready: true });
}

async function initialSync() {
  const id = userId!;
  const known = read(USER_KEY) === id;
  try {
    if (known) await flush(); // push edits made offline last time
    useSync.setState({ status: 'syncing' });
    const remote = await fetchRemote();
    // First sign-in on this device: merge anything created locally into the account.
    const target = known ? remote : mergeSnapshots(snap(useStore.getState()), remote);
    if (known && outbox.size) return; // still can't push — keep local for now
    applyRemote(target);
    enqueue(diff(remote, target, id, timezone()));
    // Refresh the profile so the server knows this device's timezone.
    enqueue([
      {
        table: 'profiles',
        kind: 'upsert',
        key: 'profiles',
        row: { user_id: id, start_day: target.startDay ?? null, onboarded: target.onboarded, timezone: timezone() },
      },
    ]);
    write(USER_KEY, id);
    initialDone = true;
    useSync.setState({ status: 'idle', lastSynced: Date.now() });
  } catch {
    // Offline: carry on with local data; we'll reconcile on the next pull.
    useSync.setState({ status: navigator.onLine ? 'error' : 'offline' });
  }
}

export async function signOut() {
  await flush().catch(() => {});
  await supabase?.auth.signOut();
  userId = null;
  initialDone = false;
  outbox.clear();
  saveOutbox();
  write(USER_KEY, null);
  applyRemote({ habits: [], plans: [], logs: {}, startDay: undefined, onboarded: false });
  useStore.getState().reset();
}

let started = false;

export function initSync() {
  if (!supabase || started) return;
  started = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    useSync.setState({ session });
    // Defer: calling Supabase inside this callback can deadlock the auth lock.
    if (session) setTimeout(() => void onSignedIn(session), 0);
    else {
      userId = null;
      useSync.setState({ ready: true });
    }
  });

  // Never leave the user on a spinner: after 5 s show local data and keep syncing in the background.
  setTimeout(() => useSync.setState({ ready: true }), 5000);

  const refresh = () => {
    if (document.visibilityState === 'visible') void pull();
  };
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', () => void pull());
  setInterval(refresh, 60_000);
}
