import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useStore, useUI } from '../store';
import { addDays, formatDay, range } from '../lib/date';
import {
  HEALTH_MILESTONES,
  INSTEAD,
  LIFE_MIN_PER_CIG,
  TRIGGER_LABEL,
  fmtElapsed,
  fmtLife,
  limitOn,
  quitStats,
  smokedOn,
  todayWin,
  triggerStats,
  triggersToday,
} from '../lib/quit';
import { Switch } from '../components/Switch';
import { useCircle } from '../lib/circle';
import { useToday } from '../lib/useToday';
import { SMOKE_TRIGGERS, type QuitSettings, type SmokeTrigger } from '../types';
import { Sheet } from '../components/Sheet';
import { Ring } from '../components/Ring';
import { haptic } from '../lib/feedback';
import { APP_NAME } from '../config';

const defaultCurrency = () => (/Calcutta|Kolkata/.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? '₹' : '$');
const money = (n: number, cur: string) => `${cur}${Math.round(n).toLocaleString()}`;

/** Quit-smoking mode: one screen to log, ride out cravings and see progress. */
export function Quit({ today }: { today: string }) {
  const quit = useStore((s) => s.profile.quit);
  const [editing, setEditing] = useState(false);
  if (!quit || editing) return <QuitSetup today={today} existing={quit} onDone={() => setEditing(false)} />;
  return <QuitDashboard today={today} q={quit} onEdit={() => setEditing(true)} />;
}

function QuitDashboard({ today, q, onEdit }: { today: string; q: QuitSettings; onEdit: () => void }) {
  const smokes = useStore((s) => s.smokes);
  const { logSmoke, removeSmoke } = useStore();
  const showToast = useUI((s) => s.showToast);
  const [now, setNow] = useState(Date.now());
  const [picking, setPicking] = useState(false);
  const [craving, setCraving] = useState(false);
  const [allMilestones, setAllMilestones] = useState(false);
  const cur = q.currency ?? defaultCurrency();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const s = useMemo(() => quitStats(q, smokes, today, now), [q, smokes, today, now]);
  const win = todayWin(q, smokes, today);
  const last14 = range(addDays(today, -13), today);
  const maxBar = Math.max(q.baseline, ...last14.map((d) => smokedOn(smokes, d)), 1);
  const hours = s.smokeFreeMs / 3_600_000;
  const reached = HEALTH_MILESTONES.filter((m) => hours >= m.hours).length;
  const over = s.today > s.limit;
  const zeroDay = s.limit === 0;
  const lifeTotal = (s.avoided + win.avoided) * LIFE_MIN_PER_CIG;

  const smoke = (trigger?: SmokeTrigger) => {
    haptic(10);
    const id = logSmoke('smoked', trigger);
    setPicking(false);
    showToast(zeroDay ? 'Logged. A slip is data, not the end.' : 'Logged', { tone: 'miss', undo: () => removeSmoke(id) });
  };

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-end justify-between pt-1">
        <div>
          <div className="text-[12px] font-semibold tracking-[0.08em] text-habit uppercase">
            {s.quitReached ? 'Smoke-free' : q.mode === 'cold' ? `Quit day in ${s.daysToQuit} day${s.daysToQuit === 1 ? '' : 's'}` : `Cutting down · ${s.daysToQuit} days to zero`}
          </div>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">Quit smoking</h1>
        </div>
        <button onClick={onEdit} className="min-h-11 rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-muted">
          Settings
        </button>
      </header>

      {/* Today against your old normal — the number that should feel good */}
      <section className="card hero px-4 py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">Won back today</div>
            <div className={`mt-1 tabular text-[32px] leading-none font-bold tracking-[-0.03em] ${win.avoided > 0 ? 'text-habit' : ''}`}>
              {win.avoided > 0 ? `+${fmtLife(win.minutes)}` : '0 min'}
            </div>
            <p className="mt-1.5 text-[13.5px] text-muted">
              {s.today} smoked today · you used to smoke {q.baseline} a day
            </p>
          </div>
          <Ring
            value={zeroDay ? (s.today === 0 ? 1 : 0) : Math.min(1, s.today / Math.max(1, s.limit))}
            color={over || (zeroDay && s.today > 0) ? 'var(--miss)' : zeroDay ? 'var(--habit)' : 'var(--gold)'}
            size={76}
            stroke={8}
            label={`Today: ${s.today} smoked${zeroDay ? '' : ` of a limit of ${s.limit}`}`}
          >
            <div className="text-center leading-none">
              <div className="tabular text-[18px] font-bold">{s.today}</div>
              <div className="mt-0.5 text-[11.5px] text-muted">{zeroDay ? 'goal 0' : `of ${s.limit}`}</div>
            </div>
          </Ring>
        </div>
        {/* One dot per cigarette you used to smoke: green = not smoked today */}
        <div className="mt-3 flex flex-wrap gap-1.5" role="img" aria-label={`${win.avoided} of your usual ${q.baseline} not smoked today`}>
          {Array.from({ length: Math.min(40, Math.max(q.baseline, s.today)) }, (_, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.03 }}
              className="size-3.5 rounded-full"
              style={{ background: i < s.today ? (i < s.limit ? 'var(--gold)' : 'var(--miss)') : 'var(--habit)' }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[13px] text-muted">
          <span>Since your last one</span>
          <span className="tabular font-semibold text-text">{fmtElapsed(s.smokeFreeMs)}</span>
        </div>
      </section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setCraving(true)}
          className="min-h-14 rounded-2xl bg-habit px-3 text-[15px] font-semibold text-black/85 shadow-[0_6px_20px_color-mix(in_srgb,var(--habit)_35%,transparent)]"
        >
          🌊 I have a craving
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setPicking(true)}
          className="min-h-14 rounded-2xl border border-line-strong/50 bg-surface px-3 text-[15px] font-semibold"
        >
          🚬 I smoked one
        </motion.button>
      </div>
      {over && !zeroDay && <p className="-mt-1 px-1 text-[13px] text-gold">{s.today - s.limit} over today's limit. Next craving, try the game first.</p>}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Life won back" value={`+${fmtLife(lifeTotal, true)}`} />
        <Stat label="Saved" value={money(s.saved + win.avoided * q.price, cur)} />
        <Stat label="Cravings beaten" value={String(s.cravingsBeaten)} />
      </div>

      <TriggersCard q={q} today={today} onEdit={onEdit} />

      <section className="card px-4 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Last 14 days</h2>
          <span className="text-[12.5px] text-faint">{s.avoided} not smoked in all</span>
        </div>
        <div className="flex h-20 items-end gap-1.5" role="img" aria-label="Cigarettes per day for the last 14 days">
          {last14.map((d) => {
            const n = d >= q.startDay ? smokedOn(smokes, d) : null;
            const lim = limitOn(q, d);
            return (
              <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <motion.div
                  className="w-full rounded-md"
                  initial={{ height: 0 }}
                  animate={{ height: n === null ? 3 : n === 0 ? 6 : `${(n / maxBar) * 100}%` }}
                  style={{ background: n === null ? 'var(--track)' : n === 0 ? 'var(--habit)' : n > lim ? 'var(--miss)' : 'var(--gold)' }}
                />
                <span className={`text-[12px] ${d === today ? 'font-bold text-text' : 'text-faint'}`}>{formatDay(d, { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-faint">Green = smoke-free · amber = within limit · red = over</p>
      </section>

      <TogetherCard q={q} />

      <section className="card px-4 py-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">What your body is doing</h2>
          <span className="text-[12.5px] text-faint">
            {reached}/{HEALTH_MILESTONES.length}
          </span>
        </div>
        <ul className="flex flex-col">
          {HEALTH_MILESTONES.filter((_, i) => allMilestones || (i >= reached - 1 && i <= reached)).map((m) => {
            const done = hours >= m.hours;
            return (
              <li key={m.title} className="flex list-none items-start gap-3 py-2">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${done ? 'bg-habit text-black/80' : 'bg-surface-3 text-faint'}`}
                  aria-hidden
                >
                  {done ? '✓' : ''}
                </span>
                <span className={done ? '' : 'text-muted'}>
                  <span className="block text-[14px] font-semibold">{m.title}</span>
                  <span className="block text-[13px] text-muted">{m.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <button onClick={() => setAllMilestones((v) => !v)} className="min-h-10 text-[13px] font-medium text-plan">
          {allMilestones ? 'Show less' : 'All milestones'}
        </button>
      </section>

      <p className="px-1 pb-2 text-[12.5px] leading-relaxed text-faint">
        Life won back uses a UCL study's average of about 20 minutes per cigarette. {APP_NAME} is a tracker, not treatment — nicotine replacement or a
        doctor's support makes quitting more likely to stick.
      </p>

      {/* Trigger picker */}
      <Sheet open={picking} onClose={() => setPicking(false)}>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">What set it off?</h2>
        <p className="mt-1 text-[14px] text-muted">No judgment — knowing your triggers is how you beat them.</p>
        <TriggerGrid q={q} onPick={smoke} />
        <button onClick={() => smoke()} className="mt-2 min-h-11 w-full text-[14px] font-medium text-muted">
          Skip — just log it
        </button>
      </Sheet>

      <CravingRoom
        open={craving}
        q={q}
        onClose={() => setCraving(false)}
        onPassed={(trigger) => {
          logSmoke('craving_passed', trigger);
          setCraving(false);
          showToast(`Craving beaten 💪 +${LIFE_MIN_PER_CIG} min`, { tone: 'habit' });
        }}
        onSmoked={() => {
          setCraving(false);
          setPicking(true);
        }}
      />
    </div>
  );
}

/** Your triggers first, then the rest. */
const orderedTriggers = (q: QuitSettings) => {
  const mine = (q.triggers ?? []).map((t) => t.id);
  return [...mine, ...SMOKE_TRIGGERS.filter((t) => !mine.includes(t))];
};

function TriggerGrid({ q, onPick }: { q: QuitSettings; onPick: (t: SmokeTrigger) => void }) {
  const mine = new Set((q.triggers ?? []).map((t) => t.id));
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {orderedTriggers(q).map((t) => (
        <motion.button
          key={t}
          whileTap={{ scale: 0.95 }}
          onClick={() => onPick(t)}
          className={`flex min-h-12 items-center gap-2.5 rounded-2xl border px-3.5 text-left text-[14px] font-medium ${mine.has(t) ? 'border-gold/50 bg-gold/10' : 'border-line bg-surface-2'}`}
        >
          <span className="text-[18px]">{TRIGGER_LABEL[t].emoji}</span>
          {TRIGGER_LABEL[t].label}
        </motion.button>
      ))}
    </div>
  );
}

/** Your triggers, how often they came up this week, and your plan for each. */
function TriggersCard({ q, today, onEdit }: { q: QuitSettings; today: string; onEdit: () => void }) {
  const smokes = useStore((s) => s.smokes);
  const stats = triggerStats(smokes, addDays(today, -6));
  const todayN = triggersToday(smokes, today);
  const mine = q.triggers ?? [];
  // Triggers you didn't pick but that keep showing up.
  const extra = [...stats.entries()].filter(([t]) => !mine.some((m) => m.id === t)).sort((a, b) => b[1].smoked + b[1].beaten - (a[1].smoked + a[1].beaten));
  if (!mine.length && !extra.length)
    return (
      <button onClick={onEdit} className="card px-4 py-3.5 text-left">
        <div className="text-[15px] font-semibold">What makes you smoke?</div>
        <div className="text-[13px] text-muted">Pick your triggers and a plan for each — 30 seconds.</div>
      </button>
    );
  return (
    <section className="card px-4 py-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Your triggers · this week</h2>
        <span className="text-[12.5px] text-faint">{todayN} today</span>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {[...mine.map((m) => [m.id, m.instead] as const), ...extra.slice(0, 2).map(([t]) => [t, undefined] as const)].map(([t, instead]) => {
          const st = stats.get(t) ?? { smoked: 0, beaten: 0 };
          return (
            <li key={t} className="flex list-none items-center gap-3 py-2.5">
              <span className="text-[20px]" aria-hidden>
                {TRIGGER_LABEL[t].emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium">{TRIGGER_LABEL[t].label}</span>
                <span className="block truncate text-[12.5px] text-muted">{instead ? `Instead: ${instead}` : 'No plan yet — add one in Settings'}</span>
              </span>
              <span className="shrink-0 text-right text-[12.5px] tabular leading-tight">
                {st.beaten > 0 && <span className="block font-semibold text-habit">{st.beaten} beaten</span>}
                {st.smoked > 0 && <span className="block text-muted">{st.smoked} smoked</span>}
                {!st.beaten && !st.smoked && <span className="text-faint">—</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Quit with friends: share your counts with your circles and see theirs. */
function TogetherCard({ q }: { q: QuitSettings }) {
  const setProfile = useStore((s) => s.setProfile);
  const circleOn = useStore((s) => !!s.profile.circle);
  const setTab = useUI((s) => s.setTab);
  const data = useCircle((s) => s.data);
  const refresh = useCircle((s) => s.refresh);
  const { today } = useToday();
  useEffect(() => {
    if (circleOn && q.share && !data) void refresh(today);
  }, [circleOn, q.share, data, refresh, today]);
  const me = data?.me;
  const names = new Map((data?.circles ?? []).flatMap((c) => c.members.map((m) => [m.user_id, m.name.trim().split(/\s+/)[0]] as const)));
  const buddies = [...new Map((data?.circles ?? []).flatMap((c) => c.quit ?? []).filter((x) => x.user_id !== me).map((x) => [x.user_id, x])).values()];
  return (
    <section className="card px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Quit together</h2>
          <p className="text-[13px] text-muted">{q.share ? 'Your circles see how many you smoke each day — nothing else.' : 'People who quit with a friend stick with it longer.'}</p>
        </div>
        <Switch
          on={!!q.share}
          label="Share my quit progress with my circles"
          onChange={(v) => {
            setProfile({ quit: { ...q, share: v }, ...(v ? { circle: true } : {}) });
            if (v) void refresh(today);
          }}
        />
      </div>
      {q.share && buddies.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
          {buddies.map((b) => {
            const free = [...b.days].reverse().findIndex((c) => c !== 'd');
            return (
              <li key={b.user_id} className="flex list-none items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-bold">{(names.get(b.user_id) ?? '?').slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium">{names.get(b.user_id) ?? 'Friend'}</span>
                  <span className="block text-[12.5px] text-muted">
                    {b.today} today · used to be {b.baseline}
                    {b.cravings ? ` · ${b.cravings} cravings beaten` : ''}
                    {free > 1 ? ` · 🔥 ${free} smoke-free days` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 gap-0.5" aria-hidden>
                  {[...b.days.slice(-7)].map((c, i) => (
                    <span key={i} className="h-5 w-1.5 rounded-full" style={{ background: c === 'd' ? 'var(--habit)' : c === 'p' ? 'var(--gold)' : c === 'm' ? 'var(--miss)' : 'var(--track)' }} />
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {q.share && buddies.length === 0 && (
        <button onClick={() => setTab('circle')} className="mt-3 min-h-11 w-full rounded-2xl bg-surface-2 text-[14px] font-semibold text-plan">
          Invite a friend to quit with you →
        </button>
      )}
    </section>
  );
}

/**
 * Craving room: say what set it off (see your plan for it), then keep your hands
 * and head busy for 3 minutes — popping bubbles or breathing. Cravings peak and fade within minutes.
 */
function CravingRoom({ open, q, onClose, onPassed, onSmoked }: { open: boolean; q: QuitSettings; onClose: () => void; onPassed: (t?: SmokeTrigger) => void; onSmoked: () => void }) {
  const TOTAL = 180;
  const [trigger, setTrigger] = useState<SmokeTrigger | null | undefined>(undefined); // undefined = not asked yet
  const [left, setLeft] = useState(TOTAL);
  const [mode, setMode] = useState<'pop' | 'breathe'>('pop');
  const [popped, setPopped] = useState(0);
  useEffect(() => {
    if (!open) return;
    setTrigger(undefined);
    setLeft(TOTAL);
    setPopped(0);
  }, [open]);
  const playing = open && trigger !== undefined;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [playing]);
  const plan = trigger ? (q.triggers?.find((t) => t.id === trigger)?.instead ?? INSTEAD[trigger]) : null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Craving"
          className="fixed inset-0 z-[75] flex flex-col bg-bg px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),16px)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold tracking-[0.1em] text-habit uppercase">Ride it out</div>
            <button onClick={onClose} className="min-h-11 px-2 text-[14px] text-faint">
              Close
            </button>
          </div>
          {trigger === undefined ? (
            <div className="flex flex-1 flex-col justify-center">
              <h2 className="text-[26px] leading-tight font-bold tracking-[-0.02em]">What's pulling you right now?</h2>
              <p className="mt-1 text-[14.5px] text-muted">Name it. Naming an urge takes some of its power away.</p>
              <TriggerGrid q={q} onPick={(t) => setTrigger(t)} />
              <button onClick={() => setTrigger(null)} className="mt-2 min-h-11 text-[14px] font-medium text-muted">
                Not sure — just help me
              </button>
            </div>
          ) : (
            <>
              <div className="mt-2 text-center">
                <div className="tabular text-[44px] leading-none font-bold tracking-[-0.03em]">
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                </div>
                <p className="mt-1.5 min-h-10 text-[14.5px] font-medium">
                  {left === 0 ? 'Three minutes. The wave has passed its peak.' : plan ? `Your plan: ${plan}` : 'It rises, peaks and fades. Stay with it.'}
                </p>
              </div>
              <div className="mx-auto mt-2 flex rounded-full bg-surface-2 p-0.5" role="radiogroup" aria-label="Activity">
                {(
                  [
                    ['pop', '🫧 Pop'],
                    ['breathe', '🌬 Breathe'],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={mode === k}
                    onClick={() => setMode(k)}
                    className={`min-h-9 rounded-full px-4 text-[13.5px] font-semibold ${mode === k ? 'bg-surface text-text shadow-sm' : 'text-muted'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="my-3 min-h-0 flex-1">{mode === 'pop' ? <PopGame onPop={() => setPopped((n) => n + 1)} popped={popped} /> : <Breathe />}</div>
              <div className="flex flex-col gap-2">
                <button onClick={() => onPassed(trigger ?? undefined)} className="min-h-14 rounded-2xl bg-habit text-[16px] font-semibold text-black/85">
                  It passed 💪
                </button>
                <button onClick={onSmoked} className="min-h-11 text-[14px] font-medium text-faint">
                  I smoked
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const BUBBLES = 16;
/** Bubble wrap: tap to pop, every bubble gives a little buzz. A full sheet refills itself. */
function PopGame({ popped, onPop }: { popped: number; onPop: () => void }) {
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [round, setRound] = useState(0);
  const hues = useMemo(() => Array.from({ length: BUBBLES }, () => Math.floor(Math.random() * 4)), [round]);
  const colors = ['var(--habit)', 'var(--plan)', 'var(--gold)', 'var(--part)'];
  const pop = (i: number) => {
    if (gone.has(i)) return;
    haptic(8);
    onPop();
    const next = new Set(gone).add(i);
    if (next.size === BUBBLES) {
      setTimeout(() => {
        setGone(new Set());
        setRound((r) => r + 1);
      }, 350);
    }
    setGone(next);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 grid-cols-4 place-items-center gap-2">
        {Array.from({ length: BUBBLES }, (_, i) => (
          <motion.button
            key={`${round}-${i}`}
            aria-label={gone.has(i) ? 'Popped' : 'Pop'}
            onPointerDown={() => pop(i)}
            initial={{ scale: 0 }}
            animate={gone.has(i) ? { scale: 0.35, opacity: 0.25 } : { scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="aspect-square w-full max-w-14 rounded-full"
            style={{
              background: `radial-gradient(circle at 35% 30%, white 0 8%, color-mix(in srgb, ${colors[hues[i]]} 75%, transparent) 30%, color-mix(in srgb, ${colors[hues[i]]} 35%, transparent) 75%)`,
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-center text-[12.5px] text-faint tabular">{popped} popped</p>
    </div>
  );
}

/** Paced breathing: in 4 s, out 6 s. */
function Breathe() {
  return (
    <div className="grid h-full place-items-center">
      <div className="relative grid size-56 place-items-center">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--habit) 45%, transparent), transparent 70%)' }}
          animate={{ scale: [0.6, 1, 0.6] }}
          transition={{ duration: 10, times: [0, 0.4, 1], repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="relative text-[16px] font-semibold"
          animate={{ opacity: [1, 1, 0, 0, 1] }}
          transition={{ duration: 10, times: [0, 0.38, 0.4, 0.98, 1], repeat: Infinity }}
        >
          Breathe in…
        </motion.span>
        <motion.span
          className="absolute text-[16px] font-semibold"
          animate={{ opacity: [0, 0, 1, 1, 0] }}
          transition={{ duration: 10, times: [0, 0.38, 0.4, 0.98, 1], repeat: Infinity }}
        >
          …and out
        </motion.span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-3">
      <div className="tabular truncate text-[18px] leading-tight font-bold tracking-[-0.02em]">{value}</div>
      <div className="mt-1 text-[11.5px] font-medium tracking-wide text-muted uppercase">{label}</div>
    </div>
  );
}

function QuitSetup({ today, existing, onDone }: { today: string; existing?: QuitSettings; onDone: () => void }) {
  const setProfile = useStore((s) => s.setProfile);
  const setTab = useUI((s) => s.setTab);
  const ex = existing;
  const [mode, setMode] = useState<QuitSettings['mode']>(ex?.mode ?? 'reduce');
  const [baseline, setBaseline] = useState(String(ex?.baseline ?? ''));
  const [price, setPrice] = useState(String(ex?.price ?? ''));
  const [currency, setCurrency] = useState(ex?.currency ?? defaultCurrency());
  const [quitDate, setQuitDate] = useState(ex?.quitDate ?? addDays(today, 28));
  const [touchedDate, setTouchedDate] = useState(!!ex);
  const [triggers, setTriggers] = useState<{ id: SmokeTrigger; instead?: string }[]>(ex?.triggers ?? []);
  const toggleTrigger = (t: SmokeTrigger) =>
    setTriggers((xs) => (xs.some((x) => x.id === t) ? xs.filter((x) => x.id !== t) : [...xs, { id: t, instead: INSTEAD[t] }]));

  const pickMode = (m: QuitSettings['mode']) => {
    setMode(m);
    if (!touchedDate) setQuitDate(addDays(today, m === 'cold' ? 3 : 28));
  };
  const b = Number(baseline);
  const p = Number(price);
  const valid = b > 0 && b <= 100 && p >= 0 && price !== '' && quitDate >= (ex?.startDay ?? today);
  const field = 'mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint';

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-1">
        <div className="text-[12px] font-semibold tracking-[0.08em] text-habit uppercase">{ex ? 'Settings' : 'Set up'}</div>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">Quit smoking</h1>
        {!ex && <p className="mt-1 text-[14.5px] text-muted">Two minutes to set up. You can change any of this later.</p>}
      </header>

      <section className="card px-4 py-4">
        <h2 className="text-[15px] font-semibold">How do you want to quit?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quit method">
          {(
            [
              ['reduce', 'Cut down', 'A daily limit that drops every week until zero.'],
              ['cold', 'Cold turkey', 'Pick a day and stop completely.'],
            ] as const
          ).map(([m, title, text]) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => pickMode(m)}
              className={`rounded-2xl border p-3 text-left ${mode === m ? 'border-habit bg-habit/10' : 'border-line bg-surface-2'}`}
            >
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{text}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card px-4 py-4">
        <label className="block text-[13px] font-medium text-muted">Cigarettes per day right now</label>
        <input inputMode="numeric" value={baseline} onChange={(e) => setBaseline(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 10" className={`${field} tabular`} />

        <label className="mt-4 block text-[13px] font-medium text-muted">Price of one cigarette</label>
        <div className="mt-1.5 flex gap-2">
          <input value={currency} onChange={(e) => setCurrency(e.target.value.slice(0, 3))} aria-label="Currency symbol" className={`${field} mt-0 w-16 text-center`} />
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 18" className={`${field} mt-0 tabular flex-1`} />
        </div>

        <label className="mt-4 block text-[13px] font-medium text-muted">{mode === 'cold' ? 'Quit day' : 'Zero by'}</label>
        <input
          type="date"
          min={today}
          value={quitDate}
          onChange={(e) => {
            if (e.target.value) {
              setQuitDate(e.target.value);
              setTouchedDate(true);
            }
          }}
          className={`${field} tabular`}
        />
        {mode === 'reduce' && b > 0 && (
          <p className="mt-2 text-[12.5px] text-muted">
            Your limit starts at {b} a day and steps down weekly until {formatDay(quitDate, { day: 'numeric', month: 'short' })}.
          </p>
        )}
      </section>

      <section className="card px-4 py-4">
        <h2 className="text-[15px] font-semibold">What makes you smoke?</h2>
        <p className="mt-0.5 text-[13px] text-muted">Pick your usual triggers. For each, Sky suggests what to do instead — change it to anything that works for you.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SMOKE_TRIGGERS.filter((t) => t !== 'other').map((t) => {
            const on = triggers.some((x) => x.id === t);
            return (
              <button
                key={t}
                onClick={() => toggleTrigger(t)}
                aria-pressed={on}
                className={`min-h-10 rounded-full border px-3 text-[13.5px] font-medium ${on ? 'border-gold bg-gold/15 text-text' : 'border-line bg-surface-2 text-muted'}`}
              >
                {TRIGGER_LABEL[t].emoji} {TRIGGER_LABEL[t].label}
              </button>
            );
          })}
        </div>
        {triggers.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {triggers.map((t) => (
              <label key={t.id} className="block">
                <span className="text-[12.5px] text-muted">
                  {TRIGGER_LABEL[t.id].emoji} When it's {TRIGGER_LABEL[t.id].label.toLowerCase()}, instead I'll…
                </span>
                <input
                  value={t.instead ?? ''}
                  onChange={(e) => setTriggers((xs) => xs.map((x) => (x.id === t.id ? { ...x, instead: e.target.value.slice(0, 60) } : x)))}
                  className={`${field} mt-1 py-3`}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      <motion.button
        whileTap={{ scale: 0.98 }}
        disabled={!valid}
        onClick={() => {
          setProfile({
            quit: {
              enabled: true,
              mode,
              baseline: b,
              price: p,
              startDay: ex?.startDay ?? today,
              quitDate,
              currency,
              triggers: triggers.map((t) => ({ id: t.id, instead: t.instead?.trim() || undefined })),
              share: ex?.share,
            },
          });
          onDone();
        }}
        className="min-h-14 w-full rounded-2xl bg-text text-[16px] font-semibold text-bg disabled:opacity-30"
      >
        {ex ? 'Save' : 'Start'}
      </motion.button>
      {ex ? (
        <>
          <button onClick={onDone} className="min-h-11 text-[14px] font-medium text-muted">
            Cancel
          </button>
          <button
            onClick={() => {
              setProfile({ quit: { ...ex, enabled: false } });
              setTab('profile');
            }}
            className="min-h-11 text-[14px] font-medium text-miss/80"
          >
            Turn off quit mode (your history is kept)
          </button>
        </>
      ) : (
        <button onClick={() => setTab('profile')} className="min-h-11 text-[14px] font-medium text-muted">
          Not now
        </button>
      )}
    </div>
  );
}
