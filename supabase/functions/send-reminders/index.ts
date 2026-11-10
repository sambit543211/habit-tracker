// Supabase Edge Function: send due reminder notifications.
// Called every 5 minutes by pg_cron (see supabase/reminders.sql).
// Each nudge is conditional — nothing is sent when you're on track — and is
// logged in notification_log so it goes out at most once per day.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to Edge Functions.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://habit-tracker-inky-pi.vercel.app/';

const CUTOFF_HOUR = 2;
const WINDOW_MIN = 15; // send if the reminder time passed within the last 15 minutes

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

    const [{ data: habits }, { data: logs }, { data: plans }] = await Promise.all([
      db.from('habits').select('*').eq('user_id', p.user_id),
      db.from('habit_logs').select('day,habit_id,status').eq('user_id', p.user_id).gte('day', addDays(today, -60)),
      db.from('plans').select('*').eq('user_id', p.user_id).in('day', [yesterday, today, tomorrow]),
    ]);
    const logSet = new Map<string, string>();
    for (const l of logs ?? []) logSet.set(`${l.day}:${l.habit_id}`, l.status);
    const hs = habits ?? [];
    const ps = plans ?? [];
    const started = (d: string) => !p.start_day || d >= p.start_day;

    const candidates: { kind: string; title: string; body: string }[] = [];

    // Morning: close the loop on yesterday.
    if (isDue(p.morning_reminder, now.minutes) && started(yesterday)) {
      const open =
        hs.filter((h) => activeOn(h, yesterday) && !logSet.has(`${yesterday}:${h.id}`)).length +
        ps.filter((x) => x.day === yesterday && x.status === 'pending').length;
      if (open > 0)
        candidates.push({ kind: 'morning', title: 'Close the loop', body: `${open} thing${open > 1 ? 's' : ''} from yesterday need${open > 1 ? '' : 's'} a ✓ or ✗.` });
    }

    // Evening: plan tomorrow (only if nothing planned yet).
    if (isDue(p.evening_reminder, now.minutes) && !ps.some((x) => x.day === tomorrow)) {
      candidates.push({ kind: 'evening', title: 'Plan tomorrow 🌙', body: 'Two minutes now — then let your brain switch off.' });
    }

    // Late evening: streak at risk.
    const todayHabits = hs.filter((h) => activeOn(h, today));
    const left = todayHabits.filter((h) => logSet.get(`${today}:${h.id}`) !== 'done' && logSet.get(`${today}:${h.id}`) !== 'missed').length;
    if (isDue(p.streak_reminder, now.minutes) && left > 0) {
      let streak = 0;
      for (let d = yesterday; started(d) && streak < 60; d = addDays(d, -1)) {
        const active = hs.filter((h) => activeOn(h, d));
        if (!active.length || !active.every((h) => logSet.get(`${d}:${h.id}`) === 'done')) break;
        streak++;
      }
      candidates.push({
        kind: 'streak',
        title: streak > 0 ? `🔥 ${streak}-day streak at risk` : 'Habits still open',
        body: `${left} habit${left > 1 ? 's' : ''} left — your day ends at 2 am.`,
      });
    }

    // Per-habit reminders at their trigger time.
    for (const h of todayHabits) {
      if (!isDue(h.remind_at, now.minutes) || logSet.has(`${today}:${h.id}`)) continue;
      candidates.push({
        kind: `habit:${h.id}`,
        title: h.cue ? `After you ${h.cue}…` : 'Habit time',
        body: h.tiny ? `${h.name} — or just: ${h.tiny}` : h.name,
      });
    }

    // Plan reminders: N minutes before a time block, or at a chosen time.
    for (const pl of ps.filter((x) => x.day === today && x.status === 'pending')) {
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
      // Claim the (user, kind, day) slot first so a nudge is never sent twice.
      const { data: claimed } = await db
        .from('notification_log')
        .upsert({ user_id: p.user_id, kind: c.kind, day: today }, { onConflict: 'user_id,kind,day', ignoreDuplicates: true })
        .select();
      if (!claimed?.length) continue;

      const payload = JSON.stringify({ title: c.title, body: c.body, tag: c.kind, url: APP_URL });
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
