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
  return { kind: 'plan', text: tidyPlan(text) };
}

/** Drop the filler people say before the actual task: "So, okay, make a plan for to meet …" → "meet …". */
export function tidyPlan(text: string) {
  let t = text.trim();
  for (let i = 0; i < 4; i++) {
    const before = t;
    t = t
      .replace(/^(?:so|ok|okay|um+|uh+|like|hey|and|then|also|please|sky|siri)\b[\s,.]*/i, '')
      .replace(/^(?:can you|could you|i want to|i'd like to|i would like to|let's|lets)\s+/i, '')
      .replace(/^(?:add|make|create|put|set|schedule|plan)(?:\s+(?:a|an|the|me|in))?(?:\s+(?:plan|task|reminder|todo|to-do|note))?(?:\s+(?:to|for|of|about))*\s+/i, '')
      .replace(/^(?:remind me(?:\s+to)?|i need to|i have to|need to|have to|i've got to|i got to|gotta)\s+/i, '')
      .trim();
    if (t === before) break;
  }
  return t || text.trim();
}

// ---------- money ----------

export interface SpendCategory {
  id: string;
  name: string;
}
export interface ParsedSpend {
  amount: number;
  /** Category id, or undefined when it couldn't be told (→ "to sort") */
  category?: string;
  note?: string;
  mode?: string;
  day: 'today' | 'yesterday';
}

/** Words that point to the default categories (ids from src/lib/money.ts). */
const SPEND_WORDS: Record<string, string[]> = {
  rent: ['rent', 'landlord', 'house owner', 'pg'],
  groceries: ['grocery', 'groceries', 'vegetables', 'veggies', 'sabzi', 'fruits', 'milk', 'blinkit', 'zepto', 'bigbasket', 'instamart', 'dmart', 'kirana', 'eggs', 'bread'],
  eating: ['food', 'lunch', 'dinner', 'breakfast', 'snack', 'snacks', 'chai', 'tea', 'coffee', 'restaurant', 'swiggy', 'zomato', 'eating out', 'cafe', 'pizza', 'biryani'],
  transport: ['auto', 'cab', 'uber', 'ola', 'rapido', 'taxi', 'metro', 'bus', 'train', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'transport'],
  bills: ['bill', 'bills', 'electricity', 'wifi', 'internet', 'recharge', 'mobile', 'gas', 'water bill', 'broadband', 'utilities', 'maintenance'],
  medical: ['medicine', 'medicines', 'doctor', 'pharmacy', 'chemist', 'hospital', 'medical', 'physio', 'tablets', 'test', 'clinic'],
  shopping: ['shopping', 'clothes', 'shoes', 'amazon', 'flipkart', 'myntra', 'shirt', 'gift'],
  subscriptions: ['subscription', 'netflix', 'spotify', 'prime', 'hotstar', 'youtube premium', 'icloud'],
  drinks: ['beer', 'drinks', 'alcohol', 'wine', 'whisky', 'bar', 'pub'],
  trips: ['trip', 'hotel', 'flight', 'travel', 'holiday', 'airbnb'],
  entertainment: ['movie', 'movies', 'cinema', 'concert', 'game', 'games', 'show'],
  grooming: ['haircut', 'salon', 'grooming', 'barber', 'spa', 'shave'],
  laundry: ['laundry', 'ironing', 'dry clean', 'dhobi'],
  investments: ['sip', 'mutual fund', 'stocks', 'investment', 'invest', 'fd'],
};
/** Shop / app names: always worth keeping as the note, even though they also pick the category. */
const SHOPS = new Set(['blinkit', 'zepto', 'bigbasket', 'instamart', 'dmart', 'swiggy', 'zomato', 'uber', 'ola', 'rapido', 'amazon', 'flipkart', 'myntra', 'netflix', 'spotify', 'prime', 'hotstar', 'airbnb', 'icloud']);
const MODES: [RegExp, string][] = [
  [/\b(gpay|google pay|g pay|upi|phonepe|phone pe|paytm|bhim)\b/i, 'UPI'],
  [/\bamazon pay\b/i, 'Amazon Pay'],
  [/\b(card|credit card|debit card)\b/i, 'Card'],
  [/\bcash\b/i, 'Cash'],
];
const MONEY_CUE = /₹|\brs\.?\s?\d|\b\d[\d,.]*\s*(rs|rupees?|rupay|bucks|inr)\b|\b(rupees?|inr|spent|spend|paid|pay|bought|expense|cost)\b/i;

const has = (text: string, w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(text);

/** Which category the words point to: your own category names, learned shops, then common words. */
export function guessCategory(text: string, categories: SpendCategory[], merchants: Record<string, string> = {}) {
  const t = text.toLowerCase();
  for (const [shop, id] of Object.entries(merchants)) if (shop && has(t, shop) && categories.some((c) => c.id === id)) return id;
  for (const c of categories) if (has(t, c.name.toLowerCase()) || has(t, c.name.toLowerCase().split(/[ /&]/)[0])) return c.id;
  for (const [id, words] of Object.entries(SPEND_WORDS)) if (categories.some((c) => c.id === id) && words.some((w) => has(t, w))) return id;
  return undefined;
}

/** "1.5k" → 1500, "2,450" → 2450 */
const toAmount = (s: string) => {
  const m = s.toLowerCase().replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|l)?\b/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return Math.round(n * (m[2] === 'k' || m[2] === 'thousand' ? 1000 : m[2] === 'lakh' || m[2] === 'l' ? 100000 : 1) * 100) / 100;
};

/** Is this about money? ("25 rupees groceries", "paid 475 on blinkit", "200 auto") */
export function isSpendTalk(text: string, categories: SpendCategory[], merchants: Record<string, string> = {}) {
  if (!/\d/.test(text)) return false;
  if (/\b\d+\s*(ml|l|ltr|litres?|liters?|glass|glasses|bottles?)\b/i.test(text)) return false; // water
  if (MONEY_CUE.test(text)) return true;
  // "200 auto", "50 chai" — a number next to a spending word, with no time words
  if (/\b(at|am|pm|tomorrow|tonight|min|mins|minutes|hour|hours|pages?)\b/i.test(text)) return false;
  return !!guessCategory(text, categories, merchants);
}

/** One or more spends from what was said: "50 chai and 200 auto by cash yesterday". */
export function parseSpends(text: string, categories: SpendCategory[], merchants: Record<string, string> = {}): ParsedSpend[] {
  const day: ParsedSpend['day'] = /\byesterday\b|\bkal\b/i.test(text) ? 'yesterday' : 'today';
  const modeAll = MODES.find(([re]) => re.test(text))?.[1];
  const parts = text.split(/\s*(?:,\s+|\band\b|\bplus\b|&)\s*(?=[^,]*\d)/i).filter((p) => /\d/.test(p));
  const out: ParsedSpend[] = [];
  for (const part of parts.length ? parts : [text]) {
    const amount = toAmount(part.replace(/₹/g, ' '));
    if (!(amount > 0) || amount > 10_000_000) continue;
    const category = guessCategory(part, categories, merchants) ?? guessCategory(text, categories, merchants);
    // Note: what's left after removing amounts, money words, modes, days and filler.
    let note = part;
    for (const [re] of MODES) note = note.replace(new RegExp(re.source, 'gi'), ' ');
    note = note
      .replace(/₹|\b(rs\.?|rupees?|rupay|inr|bucks)\b/gi, ' ')
      .replace(/\d[\d,.]*\s*(k|thousand|lakh)?\b/gi, ' ')
      .replace(/\b(i|i've|ive|just|spent|spend|paid|pay|bought|expense|cost|for|on|at|in|to|via|using|with|by|from|of|the|a|an|today|yesterday|kal|add|log|so|okay|ok|rupee)\b/gi, ' ');
    note = note.replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();
    const catName = categories.find((c) => c.id === category)?.name.toLowerCase();
    const isJustCategory = !note || (!SHOPS.has(note.toLowerCase()) && (category && (SPEND_WORDS[category] ?? []).concat(catName ? [catName] : []).some((w) => note.toLowerCase() === w || note.toLowerCase() === `${w}s`)));
    out.push({ amount, category, note: isJustCategory ? undefined : note.charAt(0).toUpperCase() + note.slice(1), mode: MODES.find(([re]) => re.test(part))?.[1] ?? modeAll, day });
  }
  return out;
}

/**
 * A bank / UPI SMS: "Rs.475.00 debited from A/c XX1234 on 24-11-26 to VPA blinkit@ybl (UPI Ref 1234)".
 * Returns null for credits, OTPs and anything that isn't a debit.
 */
export function parseBankSms(sms: string): { amount: number; merchant?: string; mode?: string } | null {
  const t = sms.replace(/\s+/g, ' ');
  if (!/\b(debited|spent|paid|sent|withdrawn|purchase|debit|txn of|transaction of)\b/i.test(t)) return null;
  if (/\bcredited\b/i.test(t) && !/\bdebited\b/i.test(t)) return null;
  if (/\b(otp|one time password)\b/i.test(t)) return null;
  const m = t.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const amount = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) / 100;
  if (!(amount > 0)) return null;
  const merchant =
    t.match(/\bvpa\s+([a-z0-9._-]+)@/i)?.[1] ??
    t.match(/\bto\s+([a-z0-9._-]+)@[a-z]+/i)?.[1] ??
    t.match(/\b(?:at|to|towards)\s+([A-Za-z][A-Za-z0-9 &.'-]{1,40}?)(?=\s+(?:on|via|ref|upi|avl|avail|a\/c|from|\.|txn|for)\b|[.(]|$)/i)?.[1] ??
    t.match(/upi\/[^/]*\/[^/]*\/([^/ ]+)/i)?.[1];
  const clean = merchant
    ?.replace(/\b(a\/c|ac|account|xx\d+)\b/gi, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\d{4,}/g, '')
    .trim();
  return { amount, merchant: clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : undefined, mode: /\b(upi|vpa)\b/i.test(t) ? 'UPI' : /\bcard\b/i.test(t) ? 'Card' : undefined };
}
