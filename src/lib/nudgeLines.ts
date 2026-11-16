/**
 * Activity-aware words for nudges and cheers. The category comes from the shared
 * goal's name (or the habit's), so "Gym" gets gym lines and "Drink water" gets water lines.
 * Keep in sync with the copy in supabase/functions/send-reminders/index.ts.
 */
export type Activity = 'move' | 'water' | 'read' | 'mind' | 'sleep' | 'food' | 'learn' | 'write' | 'quit' | 'other';

const RULES: [Activity, RegExp][] = [
  ['quit', /smok|cigar|vape|alcohol|nicotine/i],
  ['water', /water|hydrat|\bdrink\b|litre|liter|\b\d+ ?l\b/i],
  ['move', /gym|work ?out|exercis|lift|strength|train|run|jog|cardio|yoga|walk|step|swim|cycl|sport|push.?up|stretch|fitness/i],
  ['read', /read|book|page|kindle|news/i],
  ['mind', /meditat|breath|mindful|pray|calm/i],
  ['sleep', /sleep|bed|phone|screen|scroll/i],
  ['food', /diet|eat|food|junk|sugar|meal|veg|fruit|protein|clean|fast/i],
  ['learn', /learn|study|course|spanish|french|hindi|language|code|coding|practi[cs]e|lesson|duolingo/i],
  ['write', /journal|writ|diary|gratitude|reflect/i],
];

export function activityOf(...names: (string | undefined)[]): Activity {
  const text = names.filter(Boolean).join(' ');
  return RULES.find(([, re]) => re.test(text))?.[0] ?? 'other';
}

/** Quick messages the nudger can pick. */
export const NUDGE_LINES: Record<Activity, string[]> = {
  move: ['Gym time 💪', 'Just 20 minutes — go!', 'Shoes on, door open 👟', "Let's not skip today"],
  water: ['Grab a glass now 💧', 'Sip break!', "Bottle's waiting 🚰", 'Hydrate, then carry on'],
  read: ['10 pages before bed? 📖', 'Book time 📚', 'One chapter, that’s all', 'Phone down, book up'],
  mind: ['5 calm minutes 🧘', 'Breathe first, then the day', 'Quick reset?', 'Sit, breathe, done'],
  sleep: ['Phone down, lights out 🌙', 'Bed by time tonight?', 'Screens off now 📵', 'Sleep wins tomorrow'],
  food: ['Stay on track today 🥗', 'Skip the junk 🍎', 'Clean plate, clean streak', 'You’ve got this meal'],
  learn: ['15 minutes of practice? 📘', 'Quick lesson now?', 'Keep the streak alive', 'Little by little 🧠'],
  write: ['A few lines tonight ✍️', 'Journal before bed?', 'Write one thing you noticed', 'Pen, paper, 5 minutes'],
  quit: ['Stay strong today 💪', 'Ride out the craving', 'Proud of you — keep going', 'One more clean day'],
  other: ['You got this 💪', "Don't break the streak 🔥", 'Still time today!', 'Do it now, feel good later'],
};

/** Shown under "Amit cheered your Gym". */
export const CHEER_LINES: Record<Activity, string[]> = {
  move: ['Strong work today 💪', 'That workout counts!'],
  water: ['Well hydrated 💧', 'Water goal done!'],
  read: ['Pages turned 📚', 'Good read today'],
  mind: ['Calm and done 🧘', 'Mind first — nice'],
  sleep: ['Good night routine 🌙', 'Early night, nice'],
  food: ['Clean eating win 🥗', 'On track today'],
  learn: ['Brain gains 🧠', 'Practice done!'],
  write: ['Words on the page ✍️', 'Nice reflection'],
  quit: ['Another clean day 🌱', 'So proud of you'],
  other: ['Nice work today 👏', 'Done and dusted!'],
};

/** Default notification text when a nudge comes without a message. */
export const NUDGE_BODY: Record<Activity, string> = {
  move: 'Your workout is still open today. Even 15 minutes counts.',
  water: 'Water check — have a glass now.',
  read: 'Reading is still open. A few pages count.',
  mind: 'A few calm minutes are still waiting.',
  sleep: 'Wind down — phone away, lights low.',
  food: 'Stay on track with food today.',
  learn: 'A quick practice keeps the streak alive.',
  write: 'A few lines before bed?',
  quit: "Stay strong — today's still a clean day.",
  other: "It's still open today. You've got this.",
};

/** Stable pick for a given seed (same line for the same day + person). */
export const pickLine = (lines: string[], seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return lines[h % lines.length];
};
