// Supabase Edge Function: "Hey Siri, Sky …" quick-add, called by an Apple Shortcut.
// Auth: the person's own key (header x-sky-key), stored only as a SHA-256 hash in profiles.shortcut_key_hash.
// Understanding lives in intent.ts (a copy of src/lib/intent.ts, which has the tests):
//   "drank 1 litre", "two glasses of water"         → adds water (ticks it at the target)
//   "I meditated", "went to the gym", "done reading" → ticks the matching habit
//   "skip gym today"                                 → skips it, streak safe
//   anything else, e.g. "Gym tomorrow at 7pm 1h"     → adds a plan
// Replies with one short sentence for Siri to read out.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parsePlan } from './parsePlan.ts';
import { detectIntent } from './intent.ts';

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

  const { data: habitRows } = await db.from('habits').select('id,name').eq('user_id', user).is('archived_day', null);
  const habits = habitRows ?? [];
  const intent = detectIntent(text, habits);

  // Water: "drank 1 litre", "two glasses", "half a litre", "water 300"
  if (intent.kind === 'water') {
    const ml = Math.min(5000, intent.ml);
    const h = habits.find((x) => waterTarget(x.name));
    if (!h) return say("You don't have a water habit yet — add one like “Drink 3L water”.");
    const target = waterTarget(h.name)!;
    const { data: cur, error } = await db.from('habit_amounts').select('amount').eq('user_id', user).eq('habit_id', h.id).eq('day', today).maybeSingle();
    if (error) return say("Sorry, I couldn't log water right now.");
    const total = (cur?.amount ?? 0) + ml;
    await db.from('habit_amounts').upsert({ user_id: user, day: today, habit_id: h.id, amount: total, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day,habit_id' });
    if (total >= target) await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'done', at: new Date().toISOString() }, { onConflict: 'user_id,day,habit_id' });
    const L = (n: number) => String(+(n / 1000).toFixed(1));
    return say(total >= target ? `Added ${ml} ml — water done for today! 💧` : `Added ${ml} ml. ${L(total)} of ${L(target)} litres, ${Math.round((total / target) * 100)} percent.`);
  }

  // Habit: "I meditated", "went to the gym", "skip gym today"
  if (intent.kind === 'habit') {
    const h = intent.habit;
    if (intent.action === 'skip') {
      await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'missed', at: new Date().toISOString(), miss: { reason: 'skip' } }, { onConflict: 'user_id,day,habit_id' });
      return say(`Okay, ${h.name} skipped today. Your streak is safe.`);
    }
    await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'done', at: new Date().toISOString(), miss: null }, { onConflict: 'user_id,day,habit_id' });
    const { count } = await db.from('habit_logs').select('habit_id', { count: 'exact', head: true }).eq('user_id', user).eq('day', today).eq('status', 'done');
    return say(`Nice — ${h.name} ticked. ${count ?? 1} of ${habits.length} habits done today.`);
  }

  // Otherwise: a plan.
  const wake = profile.wake_time ? Number(String(profile.wake_time).slice(0, 2)) : 8;
  const p = parsePlan(intent.text, wake);
  const day = p.when === 'tomorrow' ? addDays(today, 1) : today;
  const { error } = await db.from('plans').insert({
    id: crypto.randomUUID(),
    user_id: user,
    title: p.title.charAt(0).toUpperCase() + p.title.slice(1),
    day,
    must: false,
    status: 'pending',
    carry_count: 0,
    created_at: new Date().toISOString(),
    start_time: p.start ?? null,
    duration_min: p.start ? Math.max(15, p.duration ?? 30) : null,
    remind_offset: p.start ? 10 : null,
  });
  if (error) return say("Sorry, I couldn't save that. Try again in a moment.", 500);
  const when = day === today ? 'today' : 'tomorrow';
  return say(`Added ${p.title}, ${when}${p.start ? ` at ${fmt(p.start)}` : ''}.`);
});
