// Supabase Edge Function: send due reminder notifications.
// Called every 5 minutes by pg_cron (see supabase/reminders.sql).
//
// Design rules (so nudges keep working instead of being tuned out):
// - Conditional: nothing is sent when you're on track.
// - At most once per kind per day (claimed in notification_log).
// - Wording rotates day to day and uses your name. Duolingo's research on
//   recurring notifications found rotating/resting templates keeps people
//   responding (Yancey & Settles, KDD 2020).
// - Back-off: a reminder ignored 3 times in a row pauses itself; the app
//   then offers a different time.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to Edge Functions.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://habit-tracker-inky-pi.vercel.app/';

const CUTOFF_HOUR = 2;
const WINDOW_MIN = 15; // send if the reminder time passed within the last 15 minutes
const PAUSABLE = ['brief', 'morning', 'evening', 'streak', 'lastcall'];
const SHIELD_EVERY = 7;
const SHIELD_MAX = 2;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Local clock (date + minutes since midnight) in an IANA time zone. */
function localNow(tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    return localNow('UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour'));
  const minutes = hour * 60 + Number(get('minute'));
  return { date, minutes, habitDay: hour < CUTOFF_HOUR ? addDays(date, -1) : date };
}

const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
const dueAt = (m: number | null, nowMin: number) => m !== null && (nowMin - m + 2880) % 1440 < WINDOW_MIN;
const isDue = (t: string | null, nowMin: number) => dueAt(toMin(t), nowMin);
const fmt = (t: string) => {
  const m = toMin(t)!;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Deterministic rotation: a different variant each day, stable within the day. */
const pick = <T>(variants: T[], seed: string): T => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return variants[h % variants.length];
};

// ---------- activity-aware wording (keep in sync with src/lib/nudgeLines.ts) ----------
const ACTIVITY: [string, RegExp][] = [
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
const activityOf = (...names: (string | null | undefined)[]) => {
  const text = names.filter(Boolean).join(' ');
  return ACTIVITY.find(([, re]) => re.test(text))?.[0] ?? 'other';
};
const NUDGE_BODY: Record<string, string> = {
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
const CHEER_BODY: Record<string, string> = {
  move: 'Strong work today 💪', water: 'Well hydrated 💧', read: 'Pages turned 📚', mind: 'Calm and done 🧘',
  sleep: 'Good night routine 🌙', food: 'Clean eating win 🥗', learn: 'Brain gains 🧠', write: 'Words on the page ✍️',
  quit: 'Another clean day 🌱', other: 'Nice work today 👏',
};
const names = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? 'A friend' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const inRange = (m: number, a: number, b: number) => (a <= b ? m >= a && m < b : m >= a || m < b);
const NUDGE_CAP = 4;

const activeOn = (h: Row, day: string) => h.created_day <= day && (!h.archived_day || day < h.archived_day);

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/**
 * Secrets live in public.app_secrets (RLS on, no policies → only the service
 * role can read). The VAPID key pair is generated here on first run, so the
 * private key never leaves the server.
 */
async function loadSecrets(db: ReturnType<typeof createClient>) {
  const read = async () => {
    const { data } = await db.from('app_secrets').select('name,value');
    return Object.fromEntries((data ?? []).map((r: Row) => [r.name, r.value])) as Record<string, string>;
  };
  let s = await read();
  if (!s.vapid_private || !s.vapid_public) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const pub = new Uint8Array([4, ...fromB64url(jwk.x!), ...fromB64url(jwk.y!)]);
    await db.from('app_secrets').upsert(
      [
        { name: 'vapid_public', value: b64url(pub) },
        { name: 'vapid_private', value: jwk.d! },
      ],
      { onConflict: 'name', ignoreDuplicates: true },
    );
    s = await read();
  }
  return s;
}

Deno.serve(async (req) => {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const secrets = await loadSecrets(db);
  if (!secrets.cron_secret || req.headers.get('x-cron-secret') !== secrets.cron_secret) {
    return new Response('unauthorized', { status: 401 });
  }
  webpush.setVapidDetails(APP_URL, secrets.vapid_public, secrets.vapid_private);
  // Called by a database trigger the moment someone nudges / cheers / accepts: only do the social part.
  const socialOnly = ((await req.json().catch(() => ({}))) as { only?: string })?.only === 'social';

  const { data: subs, error: subErr } = await db.from('push_subscriptions').select('*');
  if (subErr) return new Response(subErr.message, { status: 500 });
  if (!subs?.length) return Response.json({ sent: 0 });

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const { data: profiles } = await db.from('profiles').select('*').in('user_id', userIds).eq('reminders_enabled', true);

  let sent = 0;
  for (const p of profiles ?? []) {
    const now = localNow(p.timezone || 'UTC');
    const today = now.habitDay;
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const name = (p.display_name ?? '').trim().split(/\s+/)[0] || '';
    const paused: string[] = p.paused_reminders ?? [];

    const [{ data: habits }, { data: logs }, { data: plans }] = await Promise.all([
      db.from('habits').select('*').eq('user_id', p.user_id),
      db.from('habit_logs').select('day,habit_id,status').eq('user_id', p.user_id).gte('day', addDays(today, -120)),
      db.from('plans').select('*').eq('user_id', p.user_id).in('day', [yesterday, today, tomorrow]),
    ]);
    const logSet = new Map<string, string>();
    for (const l of logs ?? []) logSet.set(`${l.day}:${l.habit_id}`, l.status);
    const hs = habits ?? [];
    const ps = plans ?? [];
    // A day counts toward the streak by the user's rule: every habit ('all') or at least 80% ('most').
    const most = p.streak_rule === 'most';
    const kept = (d: string) => {
      const active = hs.filter((h) => activeOn(h, d));
      const done = active.filter((h) => logSet.get(`${d}:${h.id}`) === 'done').length;
      return active.length > 0 && (most ? done / active.length >= 0.8 : done === active.length);
    };

    const todayHabits = hs.filter((h) => activeOn(h, today));
    const left = todayHabits.filter((h) => !logSet.has(`${today}:${h.id}`)).length;
    const todayPlans = ps.filter((x) => x.day === today);
    const pendingPlans = todayPlans.filter((x) => x.status === 'pending');
    const badge = left + pendingPlans.length;

    // Streak up to yesterday (same rules as the app, including optional shields).
    let streak = 0;
    let shields = 0;
    let sinceEarn = 0;
    const useShields = p.streak_shields !== false;
    const first = [addDays(today, -120), p.start_day ?? today].sort()[1];
    for (let d = first; d <= yesterday; d = addDays(d, 1)) {
      if (kept(d)) {
        streak++;
        if (useShields && shields < SHIELD_MAX && ++sinceEarn >= SHIELD_EVERY) {
          shields++;
          sinceEarn = 0;
        }
      } else if (useShields && shields > 0 && streak > 0) shields--;
      else {
        streak = 0;
        sinceEarn = 0;
      }
    }

    const candidates: { kind: string; title: string; body: string }[] = [];
    const seed = (kind: string) => `${p.user_id}:${kind}:${today}`;
    const withName = (s: string) => {
      const out = name ? s.replaceAll('{N}', name) : s.replace(/,? ?\{N\}[,:]? ?/g, '').trim();
      return out.charAt(0).toUpperCase() + out.slice(1);
    };

    // Morning brief at wake-up: must-dos and the first time block.
    if (p.brief_reminder !== false && isDue(p.wake_time, now.minutes)) {
      const musts = pendingPlans.filter((x) => x.must).length;
      const firstBlock = pendingPlans.filter((x) => x.start_time).sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
      const parts = [];
      if (musts > 0) parts.push(`${plural(musts, 'must-do')} today.`);
      else if (!todayPlans.length) parts.push('No plans yet — pick your 3 must-dos.');
      if (firstBlock) parts.push(`First: ${firstBlock.title} at ${fmt(firstBlock.start_time)}.`);
      if (todayHabits.length) parts.push(`${plural(todayHabits.length, 'habit')} waiting.`);
      if (parts.length)
        candidates.push({
          kind: 'brief',
          title: withName(pick(['Good morning, {N}', "{N}, today's promises", 'Your day, {N}'], seed('brief'))) || 'Good morning',
          body: parts.join(' '),
        });
    }

    // Morning: unfinished plans from earlier days roll onto today.
    if (isDue(p.morning_reminder, now.minutes)) {
      const late = ps.filter((x) => x.day === yesterday && x.status === 'pending').length + pendingPlans.filter((x) => x.origin_day && x.origin_day < today).length;
      if (late > 0)
        candidates.push({
          kind: 'morning',
          title: withName(pick(['Carried over', 'Unfinished business', '{N}, finish these first'], seed('morning'))),
          body: `${plural(late, 'plan')} from earlier ${late > 1 ? 'are' : 'is'} on today's list. Clear ${late > 1 ? 'them' : 'it'} first.`,
        });
    }

    // Evening: plan tomorrow (only if nothing planned yet).
    if (isDue(p.evening_reminder, now.minutes) && !ps.some((x) => x.day === tomorrow)) {
      candidates.push({
        kind: 'evening',
        title: withName(pick(['Plan tomorrow 🌙', 'Tomorrow starts tonight', '{N}, 2 minutes for tomorrow'], seed('evening'))),
        body: pick(
          ['Two minutes now — then let your brain switch off.', 'Pick your 3 must-dos and sleep easier.', 'Decide tonight so morning-you just starts.'],
          seed('evening-body'),
        ),
      });
    }

    // Late evening: streak at risk.
    if (isDue(p.streak_reminder, now.minutes) && left > 0) {
      const bed = p.sleep_time ? fmt(p.sleep_time) : '2 am';
      candidates.push({
        kind: 'streak',
        title:
          streak > 0 && !kept(today)
            ? withName(pick([`🔥 ${streak}-day streak at risk`, `{N}, your ${streak}-day streak needs you`, `Don't let day ${streak + 1} slip`], seed('streak')))
            : 'Habits still open',
        body: `${plural(left, 'habit')} left — your day ends at ${bed}.${shields > 0 ? ` (🛡 ${shields} shield ready — save it.)` : ''}`,
      });
    }

    // Last call: one hour before bed.
    const sleepMin = toMin(p.sleep_time);
    if (p.lastcall_reminder !== false && sleepMin !== null && dueAt((sleepMin - 60 + 1440) % 1440, now.minutes) && left > 0) {
      candidates.push({
        kind: 'lastcall',
        title: withName(pick(['Last call, {N}', 'One hour to bed', 'Still time, {N}'], seed('lastcall'))),
        body: `${plural(left, 'habit')} open. Even the tiny version counts.`,
      });
    }

    // Per-habit reminders at their trigger time.
    for (const h of todayHabits) {
      if (!isDue(h.remind_at, now.minutes) || logSet.has(`${today}:${h.id}`)) continue;
      candidates.push({
        kind: `habit:${h.id}`,
        title: withName(pick(h.cue ? [`After you ${h.cue}…`, `{N}: after you ${h.cue}`] : ['Habit time', '{N}, habit time'], seed(`habit:${h.id}`))),
        body: [h.name, h.tiny ? `or just: ${h.tiny}` : null, h.pair_with ? `🎧 with ${h.pair_with}` : null].filter(Boolean).join(' — '),
      });
    }

    // Plan reminders: N minutes before a time block, or at a chosen time.
    for (const pl of pendingPlans) {
      if (pl.start_time && pl.remind_offset !== null && pl.remind_offset !== undefined) {
        const start = toMin(pl.start_time)!;
        if (!dueAt(start - pl.remind_offset, now.minutes)) continue;
        candidates.push({
          kind: `plan:${pl.id}`,
          title: pl.remind_offset === 0 ? `Starting now: ${pl.title}` : `In ${pl.remind_offset} min: ${pl.title}`,
          body: pl.note || `${fmt(pl.start_time)} · ${pl.duration_min ?? 15} min`,
        });
      } else if (!pl.start_time && pl.remind_at && isDue(pl.remind_at, now.minutes)) {
        candidates.push({
          kind: `plan:${pl.id}`,
          title: `${pl.must ? '⭐ ' : ''}${pl.title}`,
          body: pl.note || 'You planned this for today.',
        });
      }
    }

    // Regular reminders only on the 5-minute schedule.
    if (socialOnly) candidates.length = 0;

    // ---------- Social: circle events, nudges, cheers ----------
    const wakeM = toMin(p.wake_time) ?? 480;
    const sleepM = toMin(p.sleep_time) ?? 120;
    const asleep = inRange(now.minutes, sleepM, wakeM);
    const weekday = new Date(`${now.date}T12:00:00Z`).getUTCDay();
    const atWork =
      p.office_hours !== false && weekday >= 1 && weekday <= 5 && inRange(now.minutes, toMin(p.office_start) ?? 600, toMin(p.office_end) ?? 1020);
    const muted: string[] = p.muted_circles ?? [];
    const firstName = async (id: string) => {
      const { data: who } = await db.from('profiles').select('display_name').eq('user_id', id).maybeSingle();
      return (who?.display_name ?? '').trim().split(/\s+/)[0] || 'A friend';
    };

    // Circle events: invites, accepted / declined, "your nudge worked". Held while you sleep.
    if (!asleep) {
      const { data: evs } = await db
        .from('circle_events')
        .select('id,kind,actor,circle_id,goal_id')
        .eq('to_user', p.user_id)
        .eq('pushed', false)
        .gte('created_at', new Date(Date.now() - 86400_000).toISOString());
      if (evs?.length) {
        await db.from('circle_events').update({ pushed: true }).in('id', evs.map((e) => e.id));
        for (const e of evs) {
          if (e.circle_id && muted.includes(e.circle_id) && e.kind !== 'invited') continue;
          const actor = await firstName(e.actor);
          let goalName = 'it';
          if (e.goal_id) {
            const { data: g } = await db.from('circle_goals').select('name').eq('id', e.goal_id).maybeSingle();
            goalName = g?.name ?? 'it';
          }
          candidates.push({
            kind: `circle:${e.id}`,
            title:
              e.kind === 'invited' ? `👥 ${actor} invited you to their Circle`
              : e.kind === 'accepted' ? `🎉 ${actor} joined your Circle`
              : e.kind === 'nudge_worked' ? `✅ ${actor} did ${goalName} after your nudge`
              : `${actor} declined your Circle invite`,
            body:
              e.kind === 'invited' ? 'Open Keep to accept and share habits together.'
              : e.kind === 'accepted' ? 'Your invite was accepted. Add a shared goal to start a group streak.'
              : e.kind === 'nudge_worked' ? 'Your nudge worked 🎉 Keep looking out for each other.'
              : 'You can invite someone else any time.',
          });
        }
      }
    }

    // Nudges and cheers sent to me.
    const { data: reacts } = await db
      .from('circle_reactions')
      .select('id,circle_id,goal_id,from_user,kind,message,day,created_at')
      .eq('to_user', p.user_id)
      .eq('notified', false)
      .gte('day', yesterday)
      .order('created_at');
    if (reacts?.length) {
      const done: string[] = []; // mark as handled (sent, merged or dropped)
      const goalIds = [...new Set(reacts.map((r) => r.goal_id))];
      const [{ data: goals }, { data: myLinks }] = await Promise.all([
        db.from('circle_goals').select('id,name').in('id', goalIds),
        db.from('circle_links').select('goal_id,habit_id').eq('user_id', p.user_id).in('goal_id', goalIds),
      ]);
      const goalName = (id: string) => goals?.find((g) => g.id === id)?.name ?? 'your habit';
      const myHabit = (goal: string) => hs.find((h) => h.id === myLinks?.find((l) => l.goal_id === goal)?.habit_id);
      const { count: sentToday } = await db
        .from('notification_log')
        .select('kind', { count: 'exact', head: true })
        .eq('user_id', p.user_id)
        .eq('day', today)
        .like('kind', 'nudge:%');
      const { count: cheersToday } = await db
        .from('notification_log')
        .select('kind', { count: 'exact', head: true })
        .eq('user_id', p.user_id)
        .eq('day', today)
        .like('kind', 'cheer:%');
      let nudgesLeft = Math.max(0, NUDGE_CAP - (sentToday ?? 0));
      let cheerLeft = (cheersToday ?? 0) === 0;

      // Nudges, one notification per goal (several friends are merged).
      const byGoal = new Map<string, Row[]>();
      for (const r of reacts.filter((x) => x.kind === 'nudge')) {
        const h = myHabit(r.goal_id);
        const stale = r.day !== today || (h && logSet.get(`${today}:${h.id}`) === 'done');
        if (stale || p.nudges_enabled === false || muted.includes(r.circle_id)) {
          done.push(r.id);
          continue;
        }
        if (asleep || atWork) continue; // held: delivered after wake-up / after office hours
        byGoal.set(r.goal_id, [...(byGoal.get(r.goal_id) ?? []), r]);
      }
      for (const [goal, rs] of byGoal) {
        done.push(...rs.map((r) => r.id));
        if (nudgesLeft <= 0) continue; // daily cap reached: still visible in the app
        nudgesLeft--;
        const who = [...new Set<string>(await Promise.all(rs.map((r) => firstName(r.from_user as string))))];
        const msg = [...rs].reverse().find((r) => r.message)?.message;
        const h = myHabit(goal);
        const act = activityOf(goalName(goal), h?.name);
        candidates.push({
          kind: `nudge:${rs[0].id}`,
          title: `👋 ${names(who)} nudged you · ${goalName(goal)}`,
          body: msg ? `“${msg}” — ${h?.name ?? goalName(goal)} is still open.` : NUDGE_BODY[act],
        });
      }

      // Cheers: at most one notification a day; the rest show in the app.
      for (const r of reacts.filter((x) => x.kind === 'cheer')) {
        if (r.day !== today || p.cheers_enabled === false || muted.includes(r.circle_id) || !cheerLeft) {
          done.push(r.id);
          continue;
        }
        if (asleep) continue;
        done.push(r.id);
        cheerLeft = false;
        const who = await firstName(r.from_user);
        const act = activityOf(goalName(r.goal_id), myHabit(r.goal_id)?.name);
        candidates.push({
          kind: `cheer:${r.id}`,
          title: `👏 ${who} cheered your ${goalName(r.goal_id)}`,
          body: r.message ? `“${r.message}”` : CHEER_BODY[act],
        });
      }
      if (done.length) await db.from('circle_reactions').update({ notified: true }).in('id', done);
    }

    // Evening social proof: an hour and a half before bed, if friends already did a shared habit you haven't.
    if (!socialOnly && p.nudges_enabled !== false && dueAt((sleepM - 90 + 1440) % 1440, now.minutes)) {
      const { data: links } = await db.from('circle_links').select('goal_id,habit_id').eq('user_id', p.user_id);
      for (const l of links ?? []) {
        if (logSet.get(`${today}:${l.habit_id}`) === 'done') continue;
        const { data: g } = await db.from('circle_goals').select('id,name,circle_id').eq('id', l.goal_id).maybeSingle();
        if (!g || muted.includes(g.circle_id)) continue;
        const { data: others } = await db.from('circle_links').select('user_id,habit_id').eq('goal_id', g.id).neq('user_id', p.user_id);
        const doneBy: string[] = [];
        for (const o of others ?? []) {
          const { data: log } = await db.from('habit_logs').select('status').eq('user_id', o.user_id).eq('habit_id', o.habit_id).eq('day', today).maybeSingle();
          if (log?.status === 'done') doneBy.push(await firstName(o.user_id));
        }
        if (!doneBy.length) continue;
        const h = hs.find((x) => x.id === l.habit_id);
        candidates.push({
          kind: 'together',
          title: `${names(doneBy)} already did ${g.name} today`,
          body: `Your turn — ${NUDGE_BODY[activityOf(g.name, h?.name)]}`,
        });
        break; // one a day
      }
    }

    const userSubs = subs.filter((s) => s.user_id === p.user_id);
    for (const c of candidates) {
      if (PAUSABLE.includes(c.kind)) {
        if (paused.includes(c.kind)) continue;
        // Back-off: the last 3 sends of this kind were all ignored → pause it.
        const { data: recent } = await db
          .from('notification_log')
          .select('acted,sent_at')
          .eq('user_id', p.user_id)
          .eq('kind', c.kind)
          .lt('day', today)
          .order('sent_at', { ascending: false })
          .limit(3);
        const weekAgo = Date.now() - 7 * 86400_000;
        if (recent?.length === 3 && recent.every((r) => !r.acted && new Date(r.sent_at).getTime() > weekAgo)) {
          paused.push(c.kind);
          await db.from('profiles').update({ paused_reminders: paused }).eq('user_id', p.user_id);
          continue;
        }
      }

      // Claim the (user, kind, day) slot first so a nudge is never sent twice.
      const { data: claimed } = await db
        .from('notification_log')
        .upsert({ user_id: p.user_id, kind: c.kind, day: today }, { onConflict: 'user_id,kind,day', ignoreDuplicates: true })
        .select();
      if (!claimed?.length) continue;

      // Icon number only if the user turned it on; 0 clears it.
      const payload = JSON.stringify({ title: c.title, body: c.body, tag: c.kind, url: APP_URL, badge: p.icon_badge ? badge : 0 });
      for (const s of userSubs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          else console.error('push failed', status, (e as Error).message);
        }
      }
    }
  }
  return Response.json({ sent });
});
