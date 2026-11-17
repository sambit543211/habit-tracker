import { beforeEach, describe, expect, it } from 'vitest';
import { fmtWater, waterTarget } from './water';
import { useStore } from '../store';

describe('waterTarget', () => {
  it('reads the target from the name', () => {
    expect(waterTarget({ name: 'Drink 3L water' })).toBe(3000);
    expect(waterTarget({ name: 'Drink 2.5 litres of water' })).toBe(2500);
    expect(waterTarget({ name: 'Water 1500ml' })).toBe(1500);
    expect(waterTarget({ name: '8 glasses of water' })).toBe(2000);
    expect(waterTarget({ name: 'Drink water' })).toBe(2000);
    expect(waterTarget({ name: 'Read 10 pages' })).toBeNull();
    expect(fmtWater(1200)).toBe('1.2 L');
    expect(fmtWater(3000)).toBe('3 L');
    expect(fmtWater(400)).toBe('400 ml');
  });
});

describe('addWater', () => {
  beforeEach(() => useStore.getState().reset());
  it('ticks the habit at the target and un-ticks below it', () => {
    useStore.getState().addHabit({ name: 'Drink 1L water' });
    const id = useStore.getState().habits[0].id;
    const d = '2026-11-17';
    for (let i = 0; i < 4; i++) useStore.getState().addWater(d, id, 200);
    expect(useStore.getState().logs[d]?.[id]).toBeUndefined();
    useStore.getState().addWater(d, id, 200);
    expect(useStore.getState().amounts[d][id]).toBe(1000);
    expect(useStore.getState().logs[d][id].status).toBe('done');
    useStore.getState().addWater(d, id, -200);
    expect(useStore.getState().logs[d]?.[id]).toBeUndefined();
  });
});
