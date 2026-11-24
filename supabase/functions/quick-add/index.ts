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
import { detectIntent, habitScore, isSpendTalk, parseBankSms, parseSpends, sortAnswer } from './intent.ts';
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

/** Same ids/names as DEFAULT_CATEGORIES in src/lib/money.ts (used until the person edits their own). */
const DEFAULT_CATS = [
  ['rent', 'Rent'], ['groceries', 'Groceries'], ['eating', 'Eating Out'], ['transport', 'Transport & Fuel'], ['bills', 'Bills/Utilities'],
  ['medical', 'Medical'], ['shopping', 'Shopping'], ['subscriptions', 'Subscriptions'], ['drinks', 'Drinks/Alcohol'], ['trips', 'Trips & Experiences'],
  ['entertainment', 'Entertainment'], ['grooming', 'Grooming'], ['laundry', 'Laundry'], ['investments', 'Investments'], ['other', 'Other'],
].map(([id, name]) => ({ id, name }));

const rupees = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
/** Same as merchantKey in src/lib/money.ts */
const merchantKey = (note?: string | null) =>
  (note ?? '').toLowerCase().replace(/@.*$/, '').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ');

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
  const { data: profile } = await db.from('profiles').select('user_id,timezone,wake_time,money').eq('shortcut_key_hash', await sha256(key)).maybeSingle();
  if (!profile) return say("That Sky key isn't valid any more. Make a new one in Sky → Me → Settings → Siri.", 401);

  let text = '';
  let source = '';
  try {
    const body = await req.json();
    text = String(body?.text ?? '').trim();
    source = String(body?.source ?? '');
  } catch {
    text = (await req.text().catch(() => '')).trim();
  }
  if (!text) return say("I didn't catch that. Try: Gym tomorrow at 7.");
  const user = profile.user_id as string;
  const today = todayIn(profile.timezone || 'UTC');

  // ---------- Money ----------
  type Money = { categories?: { id: string; name: string }[]; merchants?: Record<string, string> } | null;
  const money = (profile.money ?? null) as Money;
  const categories = money?.categories?.length ? money.categories.map((c) => ({ id: c.id, name: c.name })) : DEFAULT_CATS;
  const merchants = money?.merchants ?? {};
  const catName = (id?: string | null) => categories.find((c) => c.id === id)?.name ?? 'Other';
  const learn = async (note: string | null | undefined, category: string | null | undefined) => {
    const key = merchantKey(note);
    if (!key || !category || merchants[key] === category) return;
    merchants[key] = category;
    await db.from('profiles').update({ money: { ...(money ?? {}), merchants } }).eq('user_id', user);
  };

  const HOURS_12 = 12 * 3600 * 1000;
  type Row = { id: string; amount: number | string; category: string | null; note: string | null; payee: string | null; mode: string | null; source: string; at: string; linked: boolean; excluded: boolean };
  const recent = async (amount: number) => {
    const { data } = await db.from('expenses').select('id,amount,category,note,payee,mode,source,at,linked,excluded').eq('user_id', user).eq('amount', amount).gte('at', new Date(Date.now() - HOURS_12).toISOString());
    return ((data ?? []) as Row[]).filter((r) => !r.excluded).sort((a, b) => (a.at < b.at ? 1 : -1));
  };

  // A bank / UPI SMS forwarded by an iPhone automation. It never picks a category itself — it asks.
  const sms = source === 'sms' || /\b(a\/c|acct|account|upi ref|ref no|avl bal|avl lmt)\b/i.test(text) ? parseBankSms(text) : null;
  if (source === 'sms' && !sms) return say('Not a debit — nothing logged.');
  if (sms) {
    const ref = await sha256(text);
    const { data: seen } = await db.from('expenses').select('id').eq('user_id', user).eq('sms_ref', ref).maybeSingle();
    if (seen) return say('Already logged.');
    const day = sms.date && sms.date <= today && sms.date >= addDays(today, -7) ? sms.date : today;
    const to = sms.merchant ? ` to ${sms.merchant}` : '';
    // You may have logged it yourself already (Siri or the app): same amount, last 12 hours → ask, don't assume.
    const mine = (await recent(sms.amount)).find((r) => r.source !== 'sms' && !r.linked);
    const { error } = await db.from('expenses').insert({
      id: crypto.randomUUID(),
      user_id: user,
      day,
      amount: sms.amount,
      category: null,
      mode: sms.mode ?? 'UPI',
      note: null,
      payee: sms.merchant ?? null,
      source: 'sms',
      sms_ref: ref,
      at: new Date().toISOString(),
    });
    if (error?.code === '23505') return say('Already logged.');
    if (error) return say("Sorry, I couldn't log that payment.", 500);
    if (mine)
      return say(`${rupees(sms.amount)}${to} — has this been recorded already as your ${rupees(sms.amount)} ${catName(mine.category)} entry? Say yes if it's the same, otherwise what was it?`);
    const hint = merchants[merchantKey(sms.merchant)];
    return say(`${rupees(sms.amount)}${to} — what was it?${hint ? ` Last time: ${catName(hint)}.` : ''}`);
  }

  // Your answer to "what was it?" (sent by the SMS shortcut): files the latest bank payment waiting to be sorted.
  if (source === 'sort') {
    const { data } = await db.from('expenses').select('id,amount,payee,mode,sms_ref,at,excluded').eq('user_id', user).eq('source', 'sms').is('category', null);
    const r = ((data ?? []) as unknown as (Row & { sms_ref: string | null })[]).filter((x) => !x.excluded).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (!r) return say('Nothing is waiting to be sorted.');
    const amount = rupees(Number(r.amount));
    const ans = sortAnswer(text, categories, merchants);
    if (ans?.kind === 'drop') {
      await db.from('expenses').update({ excluded: true }).eq('user_id', user).eq('id', r.id);
      return say(`Okay — ${amount} won't be counted.`);
    }
    // "Yes" when you'd already logged the same amount → it's one payment: keep yours, drop the bank copy.
    const mine = ans?.kind === 'same' ? (await recent(Number(r.amount))).find((x) => x.source !== 'sms' && !x.linked) : undefined;
    if (mine) {
      await db.from('expenses').delete().eq('user_id', user).eq('id', r.id);
      await db.from('expenses').update({ linked: true, sms_ref: r.sms_ref, payee: r.payee, mode: mine.mode ?? r.mode }).eq('user_id', user).eq('id', mine.id);
      return say(`Got it — same payment, kept once as ${catName(mine.category)} ✓`);
    }
    const hint = merchants[merchantKey(r.payee)];
    const category = ans?.kind === 'category' ? ans.id : ans?.kind === 'same' ? hint : undefined;
    if (!category) return say(`I didn't catch a category — ${amount} is waiting in To sort in Sky.`);
    await db.from('expenses').update({ category }).eq('user_id', user).eq('id', r.id);
    await learn(r.payee, category);
    return say(`Filed ${amount} as ${catName(category)}.${r.payee ? ` I'll remember ${r.payee}.` : ''}`);
  }

  const wake = profile.wake_time ? String(profile.wake_time).slice(0, 5) : '08:00';
  const tz = profile.timezone || 'UTC';
  const [{ data: habitRows }, { data: planRows }] = await Promise.all([
    db.from('habits').select('id,name,parts').eq('user_id', user).is('archived_day', null),
    db.from('plans').select('id,title,day').eq('user_id', user).eq('status', 'pending').lte('day', addDays(today, 1)).gte('day', addDays(today, -14)),
  ]);
  type Part = { id: string; name: string; weight: number };
  const habits = (habitRows ?? []) as { id: string; name: string; parts: Part[] | null }[];
  // The AI sees combo parts too: "Workout + Stretch (parts: Workout, Stretch)".
  const forAi = habits.map((h) => ({ id: h.id, name: h.parts?.length ? `${h.name} (parts: ${h.parts.map((p) => p.name).join(', ')})` : h.name }));
  const plans = planRows ?? [];

  // 1) AI (Groq free tier or Claude, whichever secret is set) understands free speech, several things at once.
  // 2) Otherwise, or if it fails, the rules in intent.ts.
  let actions = await understand(text, { habits: forAi, plans, categories, now: nowIn(tz), wake });
  if (actions === null)
    actions = isSpendTalk(text, categories, merchants)
      ? parseSpends(text, categories, merchants).map((x) => ({ type: 'expense' as const, amount: x.amount, category: x.category ?? null, note: x.note ?? null, mode: x.mode ?? null, day: x.day }))
      : fromRules(text, forAi, Number(wake.slice(0, 2)));
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
      if (h.parts && h.parts.length >= 2) {
        // Combo habit: tick the parts that were mentioned ("did my stretches" → Stretch); none named or "both" → all.
        const named = /\b(both|all|everything|whole)\b/i.test(text) ? [] : h.parts.filter((p) => habitScore(text, p.name) > 0);
        const ticked = (named.length ? named : h.parts).map((p) => p.id);
        const { data: cur } = await db.from('habit_logs').select('status,parts').eq('user_id', user).eq('habit_id', h.id).eq('day', today).maybeSingle();
        const had = cur?.status === 'done' ? ((cur.parts as string[] | null) ?? h.parts.map((p) => p.id)) : [];
        const now = [...new Set([...had, ...ticked])];
        await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'done', at, miss: null, parts: now }, { onConflict: 'user_id,day,habit_id' });
        const pct = h.parts.filter((p) => now.includes(p.id)).reduce((n, p) => n + p.weight, 0);
        const names = h.parts.filter((p) => ticked.includes(p.id)).map((p) => p.name).join(' and ');
        return pct >= 100 ? `${h.name} fully done.` : `${names} ticked — ${h.name} is at ${pct} percent, streak kept.`;
      }
      await db.from('habit_logs').upsert({ user_id: user, day: today, habit_id: h.id, status: 'done', at, miss: null }, { onConflict: 'user_id,day,habit_id' });
      return `${h.name} ticked.`;
    }
    if (a.type === 'expense') {
      // Learned shop beats a guess; nothing known → saved as "to sort".
      const category = (a.note && merchants[merchantKey(a.note)]) || a.category || null;
      const { error } = await db.from('expenses').insert({
        id: crypto.randomUUID(),
        user_id: user,
        day: a.day === 'yesterday' ? addDays(today, -1) : today,
        amount: a.amount,
        category,
        mode: a.mode,
        note: a.note,
        source: 'voice',
        at,
      });
      if (error) return `Sorry, I couldn't save ${rupees(a.amount)}.`;
      if (!category) return `${rupees(a.amount)}${a.note ? ` for ${a.note}` : ''} saved — pick a category in Sky.`;
      await learn(a.note, category);
      return `Added ${rupees(a.amount)} to ${catName(category)}${a.day === 'yesterday' ? ' for yesterday' : ''}.`;
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
