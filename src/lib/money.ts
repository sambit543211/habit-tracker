import type { Expense, MoneyCategory, MoneySettings } from '../types';

/** Starting categories (from a typical Indian money manager). Editable in Budget. */
export const DEFAULT_CATEGORIES: MoneyCategory[] = [
  { id: 'rent', name: 'Rent', emoji: '🏠' },
  { id: 'groceries', name: 'Groceries', emoji: '🥒' },
  { id: 'eating', name: 'Eating Out', emoji: '🍜' },
  { id: 'transport', name: 'Transport & Fuel', emoji: '🚕' },
  { id: 'bills', name: 'Bills/Utilities', emoji: '🧾' },
  { id: 'medical', name: 'Medical', emoji: '💊' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️' },
  { id: 'subscriptions', name: 'Subscriptions', emoji: '📺' },
  { id: 'drinks', name: 'Drinks/Alcohol', emoji: '🍺' },
  { id: 'trips', name: 'Trips & Experiences', emoji: '🏝️' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬' },
  { id: 'grooming', name: 'Grooming', emoji: '💈' },
  { id: 'laundry', name: 'Laundry', emoji: '🧺' },
  { id: 'investments', name: 'Investments', emoji: '📈' },
  { id: 'other', name: 'Other', emoji: '❓' },
];

export const DEFAULT_MODES = ['UPI', 'Cash', 'Card', 'Amazon Pay'];

export const DEFAULT_MONEY: MoneySettings = { categories: DEFAULT_CATEGORIES, modes: DEFAULT_MODES, merchants: {} };

export const moneyOf = (m?: MoneySettings): MoneySettings => ({
  categories: m?.categories?.length ? m.categories : DEFAULT_CATEGORIES,
  modes: m?.modes?.length ? m.modes : DEFAULT_MODES,
  merchants: m?.merchants ?? {},
});

/** ₹1,23,456 (Indian grouping); paise only when there are any. */
export const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** "2026-11" from "2026-11-24" */
export const monthOf = (day: string) => day.slice(0, 7);

export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export const sum = (xs: Expense[]) => Math.round(xs.reduce((n, e) => n + e.amount, 0) * 100) / 100;

/** Spending per category for a month, biggest first. `null` key = still to sort. */
export function byCategory(expenses: Expense[], month: string) {
  const out = new Map<string, number>();
  for (const e of expenses) if (monthOf(e.day) === month) out.set(e.category ?? '', (out.get(e.category ?? '') ?? 0) + e.amount);
  return [...out.entries()].map(([id, amount]) => ({ id, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}

/** Spent in `month` up to and including the same day-of-month as `upTo` ("this point last month"). */
export const spentByDay = (expenses: Expense[], month: string, dayOfMonth: number) =>
  sum(expenses.filter((e) => monthOf(e.day) === month && Number(e.day.slice(8)) <= dayOfMonth));

/** A shop name to remember: lower-case, no punctuation, first two words ("Blinkit Commerce Pvt" → "blinkit commerce"). */
export const merchantKey = (note?: string) =>
  (note ?? '')
    .toLowerCase()
    .replace(/@.*$/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');

/** Colours for the donut, in category order. */
export const CAT_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#a9e34b', '#69db7c', '#38d9a9', '#3bc9db', '#4dabf7', '#748ffc', '#9775fa', '#da77f2', '#f783ac', '#e599f7', '#94d82d', '#868e96'];

/** What counts toward totals, stats and budgets: sorted and not marked "don't count". */
export const counted = (xs: Expense[]) => xs.filter((e) => e.category && !e.excluded);

/** Where an entry came from, for the little badge. */
export const sourceLabel = (e: Expense) =>
  e.source === 'sms' ? (e.linked ? '📩 Bank SMS · matched ✓' : '📩 Bank SMS') : e.source === 'voice' ? (e.linked ? '🎙 Voice · bank ✓' : '🎙 Voice') : e.linked ? '✍️ You · bank ✓' : '✍️ You';

const H12 = 12 * 3600 * 1000;
/** A bank-SMS payment still waiting for a category that this new entry is probably the same as. */
export const waitingBankMatch = (xs: Expense[], amount: number, now = Date.now()) =>
  xs
    .filter((e) => e.source === 'sms' && !e.category && !e.excluded && !e.linked && e.amount === amount && Math.abs(now - e.at) <= H12)
    .sort((a, b) => b.at - a.at)[0];

/** Likely the same payment logged twice (yours + the bank's), close in time and amount. */
export function samePaymentPairs(xs: Expense[]) {
  const bank = xs.filter((e) => e.source === 'sms' && !e.linked && !e.excluded);
  const mine = xs.filter((e) => e.source !== 'sms' && !e.linked && !e.excluded);
  const used = new Set<string>();
  const pairs: { mine: Expense; bank: Expense }[] = [];
  for (const b of bank)
    for (const m of mine) {
      if (used.has(m.id) || used.has(b.id)) continue;
      const close = Math.abs(m.at - b.at) <= H12 || m.day === b.day;
      const near = Math.abs(m.amount - b.amount) <= Math.max(20, b.amount * 0.1);
      if (close && near) {
        pairs.push({ mine: m, bank: b });
        used.add(m.id).add(b.id);
      }
    }
  return pairs;
}
