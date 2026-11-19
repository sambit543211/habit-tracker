import { describe, expect, it } from 'vitest';
import { detectIntent, waterAmount } from './intent';

const habits = [
  { id: '1', name: 'Daily Curiosity' },
  { id: '2', name: 'News/Markets' },
  { id: '3', name: 'Workout 60 min' },
  { id: '4', name: 'Stretch joints' },
  { id: '5', name: 'Drink 3L water' },
  { id: '6', name: 'Play Music/Guitar' },
  { id: '7', name: 'Protein Intake' },
  { id: '8', name: 'Read 10 pages' },
  { id: '9', name: 'Meditate 5 min' },
];
const k = (t: string) => {
  const i = detectIntent(t, habits);
  return i.kind === 'water' ? `water ${i.ml}` : i.kind === 'habit' ? `${i.action} ${i.habit.name}` : `plan ${i.text}`;
};

describe('water amounts', () => {
  it.each([
    ['drank 1 L of water', 1000],
    ['Drank 1 litre water', 1000],
    ['had 1.5 liters', 1500],
    ['half a litre of water', 500],
    ['one and a half litres', 1500],
    ['500 ml', 500],
    ['2 glasses of water', 500],
    ['a glass of water', 250],
    ['a bottle of water', 500],
    ['water 300', 300],
  ])('%s → %i', (t, ml) => expect(waterAmount(t)).toBe(ml));
});

describe('what Siri heard', () => {
  it.each([
    ['Drank 1 L of water', 'water 1000'],
    ['I just drank two glasses of water', 'water 500'],
    ['I had water', 'water 250'],
    ['done reading', 'done Read 10 pages'],
    ['I meditated', 'done Meditate 5 min'],
    ['went to the gym', 'done Workout 60 min'],
    ['finished my workout', 'done Workout 60 min'],
    ['I worked out', 'done Workout 60 min'],
    ['did my stretches', 'done Stretch joints'],
    ['practised guitar', 'done Play Music/Guitar'],
    ['had my protein shake', 'done Protein Intake'],
    ['checked the markets', 'done News/Markets'],
    ['meditation', 'done Meditate 5 min'],
    ['skip gym today', 'skip Workout 60 min'],
    ['Gym tomorrow at 7', 'plan Gym tomorrow at 7'],
    ['Remind me to pay the gas bill', 'plan pay the gas bill'],
    ['Add music class at 7 pm', 'plan music class at 7 pm'],
    ['Drink water at 5pm', 'plan Drink water at 5pm'],
    ['Call mom', 'plan Call mom'],
    ['So make a plan for to meet my house owner at 7pm', 'plan meet my house owner at 7pm'],
    ['Okay add a reminder to call the bank tomorrow', 'plan call the bank tomorrow'],
    ['Can you add gym at 6', 'plan gym at 6'],
    ['I need to buy groceries', 'plan buy groceries'],
  ])('%s → %s', (t, want) => expect(k(t)).toBe(want));
});

import appCopy from './intent.ts?raw';
import fnCopy from '../../supabase/functions/quick-add/intent.ts?raw';
it('the Siri function uses the same file as the app', () => expect(fnCopy).toBe(appCopy));
