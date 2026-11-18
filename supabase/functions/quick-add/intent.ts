/**
 * What did the person mean? Used by "Hey Siri, Sky …" (copied into supabase/functions/quick-add).
 * Self-contained on purpose: no imports, so the same file runs in the browser tests and in Deno.
 *
 *   "drank 1 litre of water", "had 2 glasses", "half a litre", "water 300"  → water
 *   "done reading", "I meditated", "went to the gym", "finished my workout"  → habit done
 *   "skip gym today", "not doing stretch today"                             → habit skipped
 *   anything else ("Gym tomorrow at 7", "pay gas bill")                     → a plan
 */
export interface IntentHabit {
  id: string;
  name: string;
}
export type Intent =
  | { kind: 'water'; ml: number }
  | { kind: 'habit'; action: 'done' | 'skip'; habit: IntentHabit }
  | { kind: 'plan'; text: string };

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, quarter: 0.25, couple: 2,
};
const num = (s: string) => (s in NUM_WORDS ? NUM_WORDS[s] : parseFloat(s.replace(',', '.')));

export const isWaterHabit = (name: string) => /water|hydrat|\bdrink\b|\bh2o\b/i.test(name);

/** Amount of water in ml mentioned in the text, or null. */
export function waterAmount(text: string): number | null {
  const t = ` ${text.toLowerCase().replace(/(\d)\s*,\s*(\d)/g, '$1.$2')} `;
  const n = String.raw`(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|couple)`;
  // "1.5 litres", "1 L", "half a litre", "one and a half litres"
  let m = t.match(new RegExp(String.raw`\s${n}(?:\s+and\s+a\s+half)?\s*(?:of\s+)?(?:a\s+)?(?:l|ltr|ltrs|litres?|liters?)\b`));
  if (m) return Math.round((num(m[1]) + (/and a half/.test(m[0]) ? 0.5 : 0)) * 1000);
  m = t.match(/(\d{2,4})\s*(?:ml|millilit(?:re|er)s?|mils?)\b/);
  if (m) return +m[1];
  m = t.match(new RegExp(String.raw`\s${n}\s*(?:of\s+)?(?:glass|glasses|cups?|mugs?)\b`));
  if (m) return Math.round(num(m[1]) * 250);
  m = t.match(new RegExp(String.raw`\s${n}\s*(?:of\s+)?(?:bottles?)\b`));
  if (m) return Math.round(num(m[1]) * 500);
  if (/\b(?:a\s+)?sip\b/.test(t)) return 100;
  // "water 300", "300 water"
  m = t.match(/\bwater\s+(\d{2,4})\b|\b(\d{2,4})\s+(?:of\s+)?water\b/);
  if (m) return +(m[1] ?? m[2]);
  return null;
}

// ---------- habits ----------

/** Words that mean the same activity, so "went to the gym" finds "Workout 60 min". */
const SYNONYMS: string[][] = [
  ['gym', 'workout', 'work', 'exercise', 'train', 'training', 'lift', 'lifting', 'weights', 'fitness'],
  ['read', 'reading', 'book', 'books', 'pages', 'page'],
  ['meditate', 'meditation', 'mindful', 'mindfulness', 'breathe', 'breathing'],
  ['stretch', 'stretching', 'yoga', 'mobility', 'joints', 'physio'],
  ['walk', 'walking', 'steps', 'stroll'],
  ['run', 'running', 'jog', 'jogging'],
  ['music', 'guitar', 'piano', 'practice', 'practise', 'sing', 'singing', 'play'],
  ['news', 'markets', 'market', 'stocks'],
  ['protein', 'shake'],
  ['sleep', 'bed', 'bedtime'],
  ['journal', 'journaling', 'diary', 'write', 'writing'],
  ['study', 'studying', 'learn', 'learning', 'course', 'curiosity'],
  ['vitamin', 'vitamins', 'supplement', 'supplements', 'pill', 'pills', 'medicine', 'meds'],
  ['water', 'drink', 'hydrate'],
];
const STOP = new Set(['the', 'and', 'for', 'with', 'my', 'min', 'mins', 'minutes', 'daily', 'today', 'just', 'some', 'have', 'had', 'did', 'done', 'was', 'went', 'got', 'i', 'a', 'to', 'of', 'in', 'on', 'it', 'is', 'am', 'at', 'out', 'up', 'ive', 'im']);

/** "meditated" → "meditat", "stretching" → "stretch", "joints" → "joint" */
const stem = (w: string) => w.replace(/(?:ing|ed|es|s)$/, '').replace(/e$/, '');
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
const groupOf = (w: string) => SYNONYMS.findIndex((g) => g.some((x) => stem(x) === stem(w)));

/** How well the spoken words fit a habit name (0 = not at all). */
export function habitScore(said: string, habitName: string) {
  const want = tokens(said);
  const have = tokens(habitName);
  let score = 0;
  for (const h of have) {
    if (want.some((w) => stem(w) === stem(h) || (stem(w).length > 3 && stem(h).startsWith(stem(w))) || (stem(h).length > 3 && stem(w).startsWith(stem(h))))) score += 2;
    else {
      const g = groupOf(h);
      if (g >= 0 && want.some((w) => groupOf(w) === g)) score += 1;
    }
  }
  return score;
}

export function bestHabit(said: string, habits: IntentHabit[]) {
  const ranked = habits.map((h) => ({ h, s: habitScore(said, h.name) })).sort((a, b) => b.s - a.s);
  return ranked[0] && ranked[0].s > 0 ? ranked[0].h : null;
}

const DONE_CUE =
  /\b(done|did|finished|finish|completed|complete|tick|ticked|check|checked|mark|marked|went|had|took|taken|just|i've|ive)\b|\b\w{3,}ed\b|\bworked out\b|\bread\b/i;
const SKIP_CUE = /\b(skip|skipping|skipped|not today|no .+ today|not doing|rest day|day off)\b/i;
/** Words that say "this is in the future" → a plan, not a check-in. */
const FUTURE_CUE =
  /\b(tomorrow|tmrw|tonight|later|remind|reminder|need to|have to|has to|got to|gotta|must|should|will|going to|gonna|plan|schedule|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at \d|\d\s*(?:am|pm))\b/i;

export function detectIntent(raw: string, habits: IntentHabit[]): Intent {
  const text = raw.trim().replace(/[.!?]+$/, '');
  const lower = text.toLowerCase();
  const future = FUTURE_CUE.test(lower);

  // 1) Water: an amount + a water word or a drinking verb.
  const ml = waterAmount(lower);
  const watery = /\b(water|drank|drink|drunk|drinking|hydrat\w*|sip|glass|glasses|bottle|litres?|liters?|ml)\b/.test(lower);
  if (!future && ml && watery && ml <= 5000) return { kind: 'water', ml };
  if (!future && /\b(drank|had|finished)\b.*\bwater\b/.test(lower)) return { kind: 'water', ml: 250 };

  // 2) Skip: "skip gym today"
  if (SKIP_CUE.test(lower)) {
    const h = bestHabit(lower.replace(SKIP_CUE, ' '), habits);
    if (h) return { kind: 'habit', action: 'skip', habit: h };
  }

  // 3) Check-in: a "done" word and a habit it matches, with nothing pointing to the future.
  if (!future && DONE_CUE.test(lower)) {
    const h = bestHabit(lower, habits.filter((x) => !isWaterHabit(x.name)));
    if (h) return { kind: 'habit', action: 'done', habit: h };
  }
  // Just the habit's name ("reading", "meditation") with no time → tick it.
  if (!future && tokens(lower).length <= 3) {
    const h = bestHabit(lower, habits.filter((x) => !isWaterHabit(x.name)));
    if (h && habitScore(lower, h.name) >= 2) return { kind: 'habit', action: 'done', habit: h };
  }

  // 4) Everything else is a plan. Drop lead-ins Siri users say.
  const cleaned = text.replace(/^(?:please\s+)?(?:add|plan|create|schedule|put|remind me to|remind me|i need to|i have to|need to|have to)\s+(?:a\s+plan\s+(?:to|for)\s+)?/i, '');
  return { kind: 'plan', text: cleaned || text };
}
