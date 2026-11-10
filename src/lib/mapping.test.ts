import { describe, expect, it } from 'vitest';
import { diff, rowToHabit, habitToRow, planToRow, rowToPlan, rowsToLogs, logToRow } from './mapping';
import { mergeSnapshots, type Snapshot } from './merge';
import type { Habit, Plan } from '../types';

const U = 'user-1';
const habit: Habit = { id: 'h1', name: 'Read', cue: 'coffee', createdDay: '2026-11-01' };
const plan: Plan = { id: 'p1', title: 'Call bank', day: '2026-11-02', must: true, status: 'pending', carryCount: 0, createdAt: 1_700_000_000_000 };
const empty: Snapshot = { habits: [], plans: [], logs: {}, startDay: undefined, onboarded: false };

describe('row mapping', () => {
  it('round-trips habits and plans', () => {
    expect(rowToHabit(habitToRow(habit, U))).toEqual({ ...habit, tiny: undefined, archivedDay: undefined });
    expect(rowToPlan(planToRow(plan, U))).toEqual({ ...plan, miss: undefined, carriedTo: undefined });
  });
  it('rebuilds logs by day', () => {
    const row = logToRow('2026-11-02', 'h1', { status: 'missed', miss: { reason: 'distracted' }, at: 5 }, U);
    expect(rowsToLogs([row])['2026-11-02'].h1).toEqual({ status: 'missed', miss: { reason: 'distracted' }, at: 5 });
  });
});

describe('diff', () => {
  it('uploads everything from empty and nothing when unchanged', () => {
    const s: Snapshot = { habits: [habit], plans: [plan], logs: { '2026-11-02': { h1: { status: 'done', at: 1 } } }, startDay: '2026-11-01', onboarded: true };
    const ops = diff(empty, s, U, 'Asia/Kolkata');
    expect(ops.map((o) => o.key).sort()).toEqual(['habit_logs:2026-11-02:h1', 'habits:h1', 'plans:p1', 'profiles']);
    expect(diff(s, s, U, 'UTC')).toEqual([]);
  });
  it('detects edits and deletions by reference', () => {
    const a: Snapshot = { ...empty, habits: [habit], plans: [plan], logs: { d: { h1: { status: 'done', at: 1 } } } };
    const b: Snapshot = { ...a, habits: [{ ...habit, name: 'Read 20' }], plans: [], logs: { d: {} } };
    const ops = diff(a, b, U, 'UTC');
    expect(ops).toContainEqual(expect.objectContaining({ table: 'habits', kind: 'upsert' }));
    expect(ops).toContainEqual(expect.objectContaining({ table: 'plans', kind: 'delete', id: 'p1' }));
    expect(ops).toContainEqual(expect.objectContaining({ table: 'habit_logs', kind: 'delete', day: 'd', habit_id: 'h1' }));
  });
});

describe('merge on first sign-in', () => {
  it('keeps local-only items, remote wins on conflicts, and uploads only the local extras', () => {
    const remoteHabit = { ...habit, name: 'Read (remote)' };
    const local: Snapshot = { habits: [habit, { ...habit, id: 'h2', name: 'Walk' }], plans: [plan], logs: { d: { h1: { status: 'missed', at: 1 }, h2: { status: 'done', at: 1 } } }, startDay: '2026-10-01', onboarded: true };
    const remote: Snapshot = { habits: [remoteHabit], plans: [], logs: { d: { h1: { status: 'done', at: 2 } } }, startDay: '2026-11-01', onboarded: false };
    const m = mergeSnapshots(local, remote);
    expect(m.habits.map((h) => h.name)).toEqual(['Read (remote)', 'Walk']);
    expect(m.logs.d.h1.status).toBe('done');
    expect(m.startDay).toBe('2026-10-01');
    expect(m.onboarded).toBe(true);
    const keys = diff(remote, m, U, 'UTC').map((o) => o.key).sort();
    expect(keys).toEqual(['habit_logs:d:h2', 'habits:h2', 'plans:p1', 'profiles']);
  });
});
