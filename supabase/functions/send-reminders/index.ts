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
    const started = (d: string) => !p.start_day || d >= p.start_day;
    const perfect = (d: string) => {
      const active = hs.filter((h) => activeOn(h, d));
      return active.length > 0 && active.every((h) => logSet.get(`${d}:${h.id}`) === 'done');
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
      if (perfect(d)) {
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

    // Morning: close the loop on yesterday.
    if (isDue(p.morning_reminder, now.minutes) && started(yesterday)) {
      const open =
        hs.filter((h) => activeOn(h, yesterday) && !logSet.has(`${yesterday}:${h.id}`)).length +
        ps.filter((x) => x.day === yesterday && x.status === 'pending').length;
      if (open > 0)
        candidates.push({
          kind: 'morning',
          title: withName(pick(['Close the loop', 'Yesterday needs an ending', '{N}, tie up yesterday'], seed('morning'))),
          body: `${plural(open, 'thing')} from yesterday need${open > 1 ? '' : 's'} a ✓ or ✗.`,
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
          streak > 0
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
          body: pl.if_then ? `If ${pl.obstacle ?? 'something comes up'} → ${pl.if_then}` : pl.note || `${fmt(pl.start_time)} · ${pl.duration_min ?? 15} min`,
        });
      } else if (!pl.start_time && pl.remind_at && isDue(pl.remind_at, now.minutes)) {
        candidates.push({
          kind: `plan:${pl.id}`,
          title: `${pl.must ? '⭐ ' : ''}${pl.title}`,
          body: pl.note || (pl.if_then ? `If ${pl.obstacle ?? 'something comes up'} → ${pl.if_then}` : 'You planned this for today.'),
        });
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

      const payload = JSON.stringify({ title: c.title, body: c.body, tag: c.kind, url: APP_URL, badge });
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
