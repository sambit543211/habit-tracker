/**
 * Quick-add parsing: "Gym 7pm 1h", "Call mom at 18:30 for 20 min",
 * "Report 10-12", "Read at 9 30m". Pulls out a start time and duration and
 * returns the remaining words as the title.
 */
export interface ParsedPlan {
  title: string;
  start?: string; // "HH:MM"
  duration?: number; // minutes (>= 15)
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Resolve an hour without am/pm to the next sensible time inside the waking day. */
function resolveHour(h: number, m: number, meridiem: string | undefined, wakeHour: number) {
  let hour = h;
  if (meridiem) {
    const pm = meridiem.toLowerCase().startsWith('p');
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  } else if (hour <= 12 && hour < wakeHour && hour !== 0) {
    // "at 7" when you wake at 8 almost certainly means 7 pm.
    hour += 12;
  }
  if (hour > 23 || m > 59) return undefined;
  return `${pad(hour)}:${pad(m)}`;
}

export function parsePlan(input: string, wakeHour = 8): ParsedPlan {
  let text = ` ${input} `;
  let start: string | undefined;
  let duration: number | undefined;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean) => {
    const m = text.match(re);
    if (m && fn(m)) text = text.replace(m[0], ' ');
  };

  // Range: "10-12", "10am-12pm", "7:30-8:15pm"
  take(/\s(?:from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?=\s)/i, (m) => {
    const endMer = m[6];
    const s = resolveHour(+m[1], +(m[2] ?? 0), m[3] ?? endMer, wakeHour);
    const e = resolveHour(+m[4], +(m[5] ?? 0), endMer ?? m[3], wakeHour);
    if (!s || !e) return false;
    const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
    const d = (toMin(e) - toMin(s) + 1440) % 1440;
    if (d < 15 || d > 12 * 60) return false;
    start = s;
    duration = d;
    return true;
  });

  // Duration: "1h", "1.5h", "1h30", "90m", "30 min", "for 2 hrs"
  if (duration === undefined) {
    take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?:\s*(\d{1,2})\s*(?:m|min|mins)?)?(?=\s)/i, (m) => {
      duration = Math.round(parseFloat(m[1]) * 60 + (m[3] ? +m[3] : 0));
      return duration > 0;
    });
  }
  if (duration === undefined) {
    take(/\s(?:for\s+)?(\d{1,3})\s*(m|min|mins|minute|minutes)(?=\s)/i, (m) => {
      duration = +m[1];
      return duration > 0;
    });
  }

  // Time with am/pm: "7pm", "7:30 pm", "at 7.30am"
  if (!start) {
    take(/\s(?:at\s+|@\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i, (m) => {
      start = resolveHour(+m[1], +(m[2] ?? 0), m[3], wakeHour);
      return !!start;
    });
  }
  // 24h time: "18:30", "at 9:15"
  if (!start) {
    take(/\s(?:at\s+|@\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s)/i, (m) => {
      start = resolveHour(+m[1], +m[2], +m[1] > 12 ? undefined : undefined, +m[1] > 12 ? 0 : wakeHour);
      return !!start;
    });
  }
  // Bare hour only after "at": "at 7"
  if (!start) {
    take(/\s(?:at|@)\s*(\d{1,2})(?=\s)/i, (m) => {
      start = resolveHour(+m[1], 0, undefined, wakeHour);
      return !!start;
    });
  }

  const title = text.replace(/\s+/g, ' ').trim();
  if (!title) return { title: input.trim() };
  return {
    title,
    start,
    duration: start ? Math.max(15, duration ?? 30) : undefined,
  };
}
