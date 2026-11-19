// Supabase Edge Function: "Hey Siri, Sky …" quick-add, called by an Apple Shortcut.
// Auth: the person's own key (header x-sky-key), stored only as a SHA-256 hash in profiles.shortcut_key_hash.
// Understanding: AI (ai.ts) when GROQ_API_KEY (free) or ANTHROPIC_API_KEY is set — free speech, several things at once,
// "paid the gas bill" ticks that plan. Without it, or if it fails, the rules in intent.ts
// (a copy of src/lib/intent.ts, which has the tests):
//   "drank 1 litre", "two glasses of water"         → adds water (ticks it at the target)
//   "I meditated", "went to the gym", "done reading" → ticks the matching habit
//   "skip gym today"                                 → skips it, streak safe
//   anything else, e.g. "Gym tomorrow at 7pm 1h"     → adds a plan
// Replies with one short sentence for Siri to read out.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parsePlan } from './parsePlan.ts';
import { detectIntent } from './intent.ts';
import { understand, type Action } from './ai.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CUTOFF_HOUR = 2;

const say = (text: string, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Today's habit day in the person's time zone (the day ends at 2 am). */
function todayIn(tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  } catch {
    return todayIn('UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return Number(get('hour')) < CUTOFF_HOUR ? addDays(date, -1) : date;
}

const fmt = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};

/** Water target in ml from the habit's name (same rule as the app). */
const waterTarget = (name: string) => {
  const n = name.toLowerCase();
  if (!/water|hydrat|\bdrink\b/.test(n)) return null;
  const l = n.match(/(\d+(?:[.,]\d+)?)\s*(?:l|ltr|litres?|liters?)\b/);
  if (l) return Math.round(parseFloat(l[1].replace(',', '.')) * 1000);
  const ml = n.match(/(\d{3,4})\s*ml\b/);
  if (ml) return +ml[1];
  const g = n.match(/(\d+)\s*glass/);
  return g ? +g[1] * 250 : 2000;
};

/** "Thursday 2026-11-19 10:13" in the person's time zone, for the AI. */
function nowIn(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

/** The rule-based understanding, as actions. */
function fromRules(text: string, habits: { id: string; name: string }[], wakeHour: number): Action[] {
  const i = detectIntent(text, habits);
  if (i.kind === 'water') return [{ type: 'water', ml: Math.min(5000, i.ml) }];
  if (i.kind === 'habit') return [{ type: i.action === 'skip' ? 'habit_skip' : 'habit_done', habit_id: i.habit.id }];
  const p = parsePlan(i.text, wakeHour);
  return [{ type: 'plan', title: p.title, day: p.when === 'tomorrow' ? 'tomorrow' : 'today', start: p.start ?? null, duration_min: p.duration ?? null }];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return say('Send a POST with {"text": "…"}', 405);
  const key = req.headers.get('x-sky-key')?.trim();
  if (!key || key.length < 20) return say('Sky key missing. Set it up in Sky → Me → Settings → Siri.', 401);
  const { data: profile } = await db.from('profiles').select('user_id,timezone,wake_time').eq('shortcut_key_hash', await sha256(key)).maybeSingle();
  if (!profile) return say("That Sky key isn't valid any more. Make a new one in Sky → Me → Settings → Siri.", 401);

  let text = '';
  try {
    const body = await req.json();
    text = String(body?.text ?? '').trim();
  } catch {
    text = (await req.text().catch(() => '')).trim();
  }
  if (!text) return say("I didn't catch that. Try: Gym tomorrow at 7.");
  const user = profile.user_id as string;
  const today = todayIn(profile.timezone || 'UTC');

  const wake = profile.wake_time ? String(profile.wake_time).slice(0, 5) : '08:00';
  const tz = profile.timezone || 'UTC';
  const [{ data: habitRows }, { data: planRows }] = await Promise.all([
    db.from('habits').select('id,name').eq('user_id', user).is('archived_day', null),
    db.from('plans').select('id,title,day').eq('user_id', user).eq('status', 'pending').lte('day', addDays(today, 1)).gte('day', addDays(today, -14)),
  ]);
  const habits = habitRows ?? [];
  const plans = planRows ?? [];

  // 1) AI (Groq free tier or Claude, whichever secret is set) understands free speech, several things at once.
  // 2) Otherwise, or if it fails, the rules in intent.ts.
  let actions = await understand(text, { habits, plans, now: nowIn(tz), wake });
  if (actions === null) actions = fromRules(text, habits, Number(wake.slice(0, 2)));
  if (!actions.length) return say("I didn't catch anything to add. Try: Gym tomorrow at 7, or I drank a litre of water.");

  const said: string[] = [];
  for (const a of actions) said.push(await run(a));
  return say(said.filter(Boolean).join(' '));

  async function run(a: Action): Promise<string> {
    const at = new Date().toISOString();
    if (a.type === 'water') {
      const h = habits.find((x) => waterTarget(x.name));
      if (!h) return "You don't have a water habit yet — add one like Drink 3L water.";
      const target = waterTarget(h.name)!;
      const { data: cur, error } = await db.from('habit_amounts').select('amount').eq('user_id', user).eq('habit_id', h.id).eq('day', today).maybeSingle();
      if (error) return "Sorry, I couldn't log water right now.";
      const total = (cur?.amount ?? 0) + a.ml;
      await db.from('habit_amounts').upsert({ user_id: user, day: today, habit_id: h.id, amount: total, updated_at: at }, { onConflict: 'user_id,day,habit_id' });
      if (total >= target) await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'done', at }, { onConflict: 'user_id,day,habit_id' });
      const L = (n: number) => String(+(n / 1000).toFixed(1));
      return total >= target ? `Added ${a.ml} ml — water done for today!` : `Added ${a.ml} ml, ${L(total)} of ${L(target)} litres.`;
    }
    if (a.type === 'habit_done' || a.type === 'habit_skip') {
      const h = habits.find((x) => x.id === a.habit_id)!;
      if (a.type === 'habit_skip') {
        await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'missed', at, miss: { reason: 'skip' } }, { onConflict: 'user_id,day,habit_id' });
        return `${h.name} skipped today, streak safe.`;
      }
      await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'done', at, miss: null }, { onConflict: 'user_id,day,habit_id' });
      return `${h.name} ticked.`;
    }
    if (a.type === 'plan_done') {
      const p = plans.find((x) => x.id === a.plan_id)!;
      await db.from('plans').update({ status: 'done' }).eq('user_id', user).eq('id', p.id);
      return `${p.title} marked done.`;
    }
    const day = a.day === 'tomorrow' ? addDays(today, 1) : today;
    const title = a.title.charAt(0).toUpperCase() + a.title.slice(1);
    const { error } = await db.from('plans').insert({
      id: crypto.randomUUID(),
      user_id: user,
      title,
      day,
      must: false,
      status: 'pending',
      carry_count: 0,
      created_at: at,
      start_time: a.start,
      duration_min: a.start ? Math.max(15, a.duration_min ?? 30) : null,
      remind_offset: a.start ? 10 : null,
    });
    if (error) return `Sorry, I couldn't save ${title}.`;
    return `Added ${title}, ${a.day}${a.start ? ` at ${fmt(a.start)}` : ''}.`;
  }
});
