/**
 * Day boundaries. A "day" ends at CUTOFF_HOUR (2 am), so ticking things off
 * at 1:30 am still counts towards the day you were living.
 */
export const CUTOFF_HOUR = 2;

const pad = (n: number) => String(n).padStart(2, '0');

export const toKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse a YYYY-MM-DD key as local noon (noon avoids DST edge cases). */
export const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

/** The habit-day that `now` belongs to, honouring the 2 am cutoff. */
export const dayKeyAt = (now: Date = new Date()) => {
  const d = new Date(now);
  d.setHours(d.getHours() - CUTOFF_HOUR);
  return toKey(d);
};

export const addDays = (key: string, n: number) => {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
};

/** Inclusive list of day keys from `from` to `to`. */
export const range = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
};

/** 0 = Sunday … 6 = Saturday */
export const weekday = (key: string) => fromKey(key).getDay();

export const formatDay = (key: string, opts: Intl.DateTimeFormatOptions) =>
  fromKey(key).toLocaleDateString(undefined, opts);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
