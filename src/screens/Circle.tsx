import { AnimatePresence, motion } from 'framer-motion';
import { fmtWater, fmtWaterPair, waterTarget } from '../lib/water';
import { useEffect, useState } from 'react';
import { useStore, useUI } from '../store';
import { habitsOn } from '../lib/score';
import {
  INVITE_MESSAGES,
  circleApi,
  groupStreak,
  initialsOf,
  linkStreak,
  todayStatus,
  useCircle,
  type CircleGoal,
  type CircleMember,
} from '../lib/circle';
import { Sheet, focusNoScroll } from '../components/Sheet';
import { FlameIcon, PlusIcon } from '../components/icons';
import { haptic } from '../lib/feedback';
import { Switch } from '../components/Switch';
import { enablePush, pushState, type PushState } from '../lib/push';
import { shareText } from './Profile';
import { NUDGE_LINES, activityOf } from '../lib/nudgeLines';
import { APP_NAME } from '../config';

const QUICK_GOALS: [string, string][] = [
  ['💧', 'Water'],
  ['🏋️', 'Gym'],
  ['📚', 'Read'],
  ['🚶', 'Walk'],
  ['😴', 'Sleep early'],
];
const GOAL_EMOJI = ['🏋️', '🏃', '💧', '🥗', '📚', '🧘', '😴', '🚭', '💻', '✍️', '🎯'];
/** Suggested icon for a goal name ("Water" → 💧). */
const EMOJI_FOR: Record<string, string> = { move: '🏋️', water: '💧', read: '📚', mind: '🧘', sleep: '😴', food: '🥗', learn: '💻', write: '✍️', quit: '🚭', other: '🎯' };
const AVATAR = ['#3ddc97', '#8b7cff', '#ffb547', '#ff5c6c', '#38bdf8', '#f472b6'];

/** Circle: shared goals with up to 6 friends. Only linked habits are visible to them. */
export function Circle({ today }: { today: string }) {
  const { data, loading, error, refresh, select } = useCircle();
  const habits = useStore((s) => s.habits);
  const logs = useStore((s) => s.logs[today]);
  const showToast = useUI((s) => s.showToast);
  const [adding, setAdding] = useState(false);
  const [goalSheet, setGoalSheet] = useState(false);
  const [linking, setLinking] = useState<CircleGoal | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [newCircle, setNewCircle] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => {
    void pushState().then(setPush);
  }, []);
  const [nudging, setNudging] = useState<{ to: string | null; name: string; goal: CircleGoal; habit?: string; count?: number; notify?: boolean } | null>(null);
  const reminders = useStore((s) => s.reminders);
  const setReminders = useStore((s) => s.setReminders);

  // Refresh on open, when my own ticks change (after sync has had a moment), and every 30 s.
  useEffect(() => {
    const t = setTimeout(() => void refresh(today), 1200);
    return () => clearTimeout(t);
  }, [today, logs, refresh]);
  useEffect(() => {
    void refresh(today);
    const id = setInterval(() => document.visibilityState === 'visible' && void refresh(today), 30_000);
    return () => clearInterval(id);
  }, [today, refresh]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      const r = await fn();
      if (ok) showToast(ok, { tone: 'habit' });
      await refresh(today);
      return r;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong', { tone: 'miss' });
    }
  };

  const circle = data?.circle;
  const circles = data?.circles ?? [];
  const invites = data?.invites ?? [];
  const me = data?.me;
  const members = circle?.members ?? [];
  const active = members.filter((m) => m.status === 'active');
  const colorOf = (id: string) => AVATAR[Math.max(0, members.findIndex((m) => m.user_id === id)) % AVATAR.length];
  const nameOf = (id: string) => (id === me ? 'You' : (members.find((m) => m.user_id === id)?.name.split(/\s+/)[0] ?? 'Friend'));
  const myHabits = habitsOn({ habits, logs: {}, plans: [] }, today);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between pt-1">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tracking-[0.08em] text-plan uppercase">Better together</div>
          <h1 className="truncate text-[28px] leading-tight font-bold tracking-[-0.03em]">{circle?.name ?? 'Circle'}</h1>
        </div>
        {circle && members.length < 6 && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setAdding(true)}
            aria-label="Add a friend"
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-plan text-white shadow-[0_6px_20px_color-mix(in_srgb,var(--plan)_35%,transparent)]"
          >
            <PlusIcon size={22} strokeWidth={2.4} />
          </motion.button>
        )}
      </header>

      {/* Switch between circles, or start another */}
      {circles.length > 0 && (
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar" aria-label="Your circles">
          {circles.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                haptic(6);
                select(c.id);
                setConfirmLeave(false);
              }}
              aria-current={c.id === circle?.id}
              className={`min-h-10 shrink-0 rounded-full border px-3.5 text-[13.5px] font-semibold ${
                c.id === circle?.id ? 'border-plan bg-plan/15 text-text' : 'border-line bg-surface text-muted'
              }`}
            >
              {c.name}
              <span className="ml-1.5 text-[12px] font-medium text-faint">{c.members.filter((m) => m.status === 'active').length}</span>
            </button>
          ))}
          {circles.length < 5 && (
            <button onClick={() => setNewCircle(true)} className="min-h-10 shrink-0 rounded-full border border-dashed border-line-strong/60 px-3.5 text-[13.5px] font-semibold text-muted">
              + New circle
            </button>
          )}
        </nav>
      )}

      {error && <p className="rounded-2xl border border-miss/30 bg-miss/10 px-4 py-3 text-[13.5px]">Couldn't load your circle. Check your connection.</p>}

      {/* Pending requests for me — one card each */}
      {invites.map((inv) => (
        <section key={inv.circle_id} className="card hero px-4 py-4">
          <div className="text-[12px] font-semibold tracking-[0.1em] text-plan uppercase">Circle request</div>
          <p className="mt-1 text-[16px] font-semibold">
            {inv.from} invited you to “{inv.circle}”
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {inv.size} {inv.size === 1 ? 'person' : 'people'} inside. They'll only see the habits you choose to link — never your plans or reasons.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                void act(async () => {
                  const r = await circleApi.respond(inv.circle_id, true);
                  if (r === 'too_many') throw new Error("You're already in 5 circles — leave one first");
                  select(inv.circle_id);
                  useStore.getState().setProfile({ circle: true });
                }, `You joined “${inv.circle}”`)
              }
              className="min-h-12 rounded-2xl bg-text text-[15px] font-semibold text-bg"
            >
              Accept
            </button>
            <button onClick={() => void act(() => circleApi.respond(inv.circle_id, false))} className="min-h-12 rounded-2xl border border-line text-[15px] font-medium text-muted">
              Decline
            </button>
          </div>
        </section>
      ))}

      {/* Empty state */}
      {data && !circle && invites.length === 0 && (
        <section className="card px-5 py-8 text-center">
          <div className="text-[40px]">👥</div>
          <h2 className="mt-2 text-[20px] font-bold tracking-[-0.02em]">Start your circle</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-[14px] text-muted">
            Add up to 5 friends who use {APP_NAME}. Pick a shared goal like “Gym”, link your own habit to it, and keep each other going. You can be in up to 5 circles.
          </p>
          <button onClick={() => setNewCircle(true)} className="mt-5 min-h-12 w-full rounded-2xl bg-plan text-[15px] font-semibold text-white">
            Start a circle
          </button>
        </section>
      )}
      {!data && loading && <p className="py-10 text-center text-[14px] text-muted">Loading your circle…</p>}

      {circle && (
        <>
          {/* Members */}
          <section className="flex items-center gap-2 overflow-x-auto no-scrollbar" aria-label="Members">
            {members.map((m) => (
              <div key={m.user_id} className={`flex shrink-0 flex-col items-center gap-1 ${m.status === 'invited' ? 'opacity-50' : ''}`}>
                <div className="relative flex">
                  <Avatar name={m.name} color={colorOf(m.user_id)} size={44} />
                  {m.status === 'active' && m.user_id !== me && m.notify === false && (
                    <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-surface-2 text-[11px] ring-2 ring-bg" title="Notifications off">
                      🔕
                    </span>
                  )}
                </div>
                <span className="max-w-14 truncate text-[12px] text-muted">{m.user_id === me ? 'You' : m.name.split(/\s+/)[0]}</span>
                {m.status === 'invited' && <span className="-mt-1 text-[12px] text-gold">waiting…</span>}
              </div>
            ))}
          </section>
          {active.some((m) => m.user_id !== me && m.notify === false) && (
            <p className="-mt-2 text-[12.5px] text-faint">
              🔕 {active.filter((m) => m.user_id !== me && m.notify === false).map((m) => m.name.split(/\s+/)[0]).join(', ')} hasn't turned on notifications — nudges show in the app until they do.
            </p>
          )}
          {members.some((m) => m.status === 'invited') && (
            <p className="-mt-2 text-[13px] text-muted">
              ⏳ Waiting for {members.filter((m) => m.status === 'invited').map((m) => m.name.split(/\s+/)[0]).join(', ')} to accept. You'll get a notification when they do.
            </p>
          )}

          {push === 'off' && (
            <section className="flex items-center gap-3 rounded-2xl border border-plan/40 bg-plan/10 px-4 py-3">
              <span className="text-[22px]" aria-hidden>🔔</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold">Turn on notifications</div>
                <div className="text-[12.5px] text-muted">So your friends' nudges actually reach you.</div>
              </div>
              <button
                onClick={async () => {
                  try {
                    setPush(await enablePush());
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : "Couldn't turn on notifications", { tone: 'miss' });
                  }
                }}
                className="min-h-11 shrink-0 rounded-full bg-plan px-4 text-[14px] font-semibold text-white"
              >
                Turn on
              </button>
            </section>
          )}
          {push === 'needs-install' && (
            <p className="rounded-2xl border border-line px-4 py-3 text-[13px] text-muted">
              🔔 To get nudges as notifications, add {APP_NAME} to your Home Screen (Share → Add to Home Screen) and open it from there.
            </p>
          )}

          {/* First step: nothing shared yet → pick a goal together */}
          {circle.goals.length === 0 && (
            <section className="card px-4 py-4">
              <h2 className="text-[17px] font-semibold">What will you do together?</h2>
              <p className="mt-1 text-[13px] text-muted">Pick a shared goal — then each of you links your own habit to it.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_GOALS.map(([emoji, name]) => (
                  <button
                    key={name}
                    onClick={() => void act(() => circleApi.addGoal(circle.id, name, emoji), `Added “${name}” — now link your habit`)}
                    className="min-h-11 rounded-full border border-line bg-surface-2 px-3.5 text-[14px] font-medium"
                  >
                    {emoji} {name}
                  </button>
                ))}
                <button onClick={() => setGoalSheet(true)} className="min-h-11 rounded-full border border-dashed border-line-strong/60 px-3.5 text-[14px] font-medium text-muted">
                  Something else…
                </button>
              </div>
            </section>
          )}

          {/* Shared goals */}
          {circle.goals.map((g) => {
            const mine = g.links.find((l) => l.user_id === me);
            const gs = groupStreak(g, active.length);
            const unlinked = active.filter((m) => !g.links.some((l) => l.user_id === m.user_id));
            return (
              <section key={g.id} className="card px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold">
                    <span aria-hidden>{g.emoji}</span>
                    <span className="truncate">{g.name}</span>
                  </h2>
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${gs > 0 ? 'bg-gold/15 text-gold' : 'bg-surface-2 text-muted'}`}
                    title="Days in a row everyone did it"
                  >
                    <FlameIcon size={12} /> {gs} together
                  </span>
                </div>

                <ul className="mt-3 flex flex-col gap-2.5">
                  {g.links.map((l) => {
                    const st = todayStatus(l);
                    const isMe = l.user_id === me;
                    const reacted = (kind: 'cheer' | 'nudge') => circle.reactions.some((r) => r.from === me && r.to === l.user_id && r.goal === g.id && r.kind === kind);
                    const nudgedTimes = (to: string) =>
                      circle.reactions.find((r) => r.from === me && r.to === to && r.goal === g.id && r.kind === 'nudge')?.times ?? (reacted('nudge') ? 1 : 0);
                    const nudgedMe = isMe && circle.reactions.filter((r) => r.to === me && r.goal === g.id && r.kind === 'nudge');
                    const cheeredMe = isMe && circle.reactions.filter((r) => r.to === me && r.goal === g.id && r.kind === 'cheer');
                    return (
                      <li key={l.user_id} className="flex list-none items-center gap-3">
                        <Avatar name={nameOf(l.user_id) === 'You' ? (members.find((m) => m.user_id === me)?.name ?? 'You') : (members.find((m) => m.user_id === l.user_id)?.name ?? '?')} color={colorOf(l.user_id)} size={36} status={st} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[14.5px] font-medium">
                            <span className="truncate">{nameOf(l.user_id)}</span>
                            <span className="flex shrink-0 items-center gap-0.5 text-[12px] text-gold">
                              <FlameIcon size={11} />
                              {linkStreak(l.days)}
                            </span>
                          </div>
                          <div className="truncate text-[12.5px] text-muted">
                            {isMe ? (
                              <button onClick={() => setLinking(g)} className="underline decoration-dotted underline-offset-2">
                                {l.habit}
                              </button>
                            ) : (
                              l.habit
                            )}
                            {isMe && nudgedMe && nudgedMe.length > 0 && <span className="text-gold"> · 👋 {nudgedMe.map((r) => nameOf(r.from)).join(', ')} nudged you</span>}
                            {isMe && cheeredMe && cheeredMe.length > 0 && <span className="text-habit"> · 👏 from {cheeredMe.map((r) => nameOf(r.from)).join(', ')}</span>}
                          </div>
                          {(() => {
                            const goal = waterTarget({ name: l.habit });
                            return goal ? <WaterBar ml={st === 'done' ? Math.max(l.amount ?? 0, goal) : (l.amount ?? 0)} goal={goal} /> : <Week days={l.days} />;
                          })()}
                        </div>
                        {!isMe &&
                          (st === 'done' ? (
                            <ReactButton label="👏" done={reacted('cheer')} aria={`Cheer ${nameOf(l.user_id)}`} onClick={() => void act(() => circleApi.react(l.user_id, g.id, today, 'cheer'))} />
                          ) : st === 'open' ? (
                            <ReactButton
                              label={nudgedTimes(l.user_id) > 0 ? `👋${nudgedTimes(l.user_id)}` : '👋'}
                              done={false}
                              aria={`Nudge ${nameOf(l.user_id)}${nudgedTimes(l.user_id) ? ` again (sent ${nudgedTimes(l.user_id)} today)` : ''}`}
                              onClick={() =>
                                setNudging({
                                  to: l.user_id,
                                  name: nameOf(l.user_id),
                                  goal: g,
                                  habit: l.habit,
                                  notify: members.find((m) => m.user_id === l.user_id)?.notify,
                                })
                              }
                            />
                          ) : null)}
                        {isMe && st === 'open' && (
                          <button onClick={() => useUI.getState().setTab('today')} className="min-h-11 shrink-0 rounded-full bg-habit/15 px-3 text-[13px] font-semibold text-habit">
                            Do it →
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {(() => {
                  const open = g.links.filter((l) => l.user_id !== me && todayStatus(l) === 'open');
                  const notYet = open;
                  return notYet.length >= 2 ? (
                    <button
                      onClick={() => setNudging({ to: null, name: 'everyone', goal: g, count: notYet.length })}
                      className="mt-3 min-h-11 w-full rounded-2xl bg-gold/15 text-[14px] font-semibold text-gold"
                    >
                      👋 Nudge everyone who hasn't done it ({notYet.length})
                    </button>
                  ) : null;
                })()}
                {!mine && (
                  <button onClick={() => setLinking(g)} className="mt-3 min-h-11 w-full rounded-2xl border border-dashed border-plan/50 text-[14px] font-semibold text-plan">
                    Link one of your habits to “{g.name}”
                  </button>
                )}
                {unlinked.filter((m) => m.user_id !== me).length > 0 && (
                  <p className="mt-2.5 text-[12.5px] text-faint">
                    Waiting for {unlinked.filter((m) => m.user_id !== me).map((m) => m.name.split(/\s+/)[0]).join(', ')} to link a habit.
                  </p>
                )}
                {(g.created_by === me || circle.owner === me) && (
                  <button
                    onClick={() => {
                      if (deleting !== g.id) return setDeleting(g.id);
                      setDeleting(null);
                      void act(() => circleApi.deleteGoal(g.id), 'Goal removed');
                    }}
                    className={`mt-2 min-h-9 text-[12.5px] font-medium ${deleting === g.id ? 'text-miss' : 'text-faint'}`}
                  >
                    {deleting === g.id ? `Tap again to delete “${g.name}” for everyone` : 'Delete goal'}
                  </button>
                )}
              </section>
            );
          })}

          {circle.goals.length < 8 && (
            <button onClick={() => setGoalSheet(true)} className="min-h-12 rounded-2xl border border-dashed border-line-strong/60 text-[14px] font-semibold text-muted">
              + Add a shared goal{circle.goals.length === 0 ? ' (e.g. Gym)' : ''}
            </button>
          )}

          <p className="px-1 text-[12.5px] leading-relaxed text-faint">
            Friends see only the habits you link here: done, missed or not yet, and the streak. Your plans, notes and reasons stay private.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-[14.5px] font-medium">Notifications from this circle</div>
              <div className="text-[12.5px] text-faint">Nudges, cheers and “your nudge worked”</div>
            </div>
            <Switch
              on={!(reminders.mutedCircles ?? []).includes(circle.id)}
              onChange={(on) =>
                setReminders({
                  mutedCircles: on ? (reminders.mutedCircles ?? []).filter((id) => id !== circle.id) : [...(reminders.mutedCircles ?? []), circle.id],
                })
              }
              label="Notifications from this circle"
            />
          </div>
          <button
            onClick={() => {
              if (!confirmLeave) return setConfirmLeave(true);
              void act(() => circleApi.remove(circle.id, null), `You left “${circle.name}”`);
              setConfirmLeave(false);
            }}
            className={`min-h-11 text-[14px] font-medium ${confirmLeave ? 'text-miss' : 'text-faint'}`}
          >
            {confirmLeave ? `Tap again to leave “${circle.name}”` : 'Leave this circle'}
          </button>
        </>
      )}

      <AddFriendSheet
        open={adding}
        onClose={() => setAdding(false)}
        members={members}
        onInvite={async (id) => {
          const r = (await act(() => circleApi.invite(circle?.id ?? null, id))) as string | undefined;
          if (r) showToast(INVITE_MESSAGES[r] ?? r, { tone: r === 'invited' ? 'habit' : 'miss' });
          if (r === 'invited') setAdding(false);
        }}
      />

      <GoalSheet open={goalSheet} onClose={() => setGoalSheet(false)} onAdd={async (name, emoji) => { if (circle) await act(() => circleApi.addGoal(circle.id, name, emoji), 'Goal added'); setGoalSheet(false); }} />

      <NudgeSheet
        target={nudging}
        onClose={() => setNudging(null)}
        onSend={async (msg) => {
          const t = nudging!;
          setNudging(null);
          haptic([10, 30, 10]);
          if (t.to === null) {
            const n = (await act(() => circleApi.nudgeAll(t.goal.id, today, msg))) as number | undefined;
            if (n !== undefined) showToast(n ? `👋 Nudged ${n} ${n === 1 ? 'friend' : 'friends'}` : 'Already nudged in the last 10 minutes (or everyone did it 🎉)', { tone: 'plan' });
            return;
          }
          const r = (await act(() => circleApi.react(t.to!, t.goal.id, today, 'nudge', msg))) as string | undefined;
          if (r === 'ok') showToast(t.notify === false ? `👋 Nudged ${t.name} — they'll see it when they open ${APP_NAME}` : `👋 Nudged ${t.name} — they'll get a notification`, { tone: 'plan' });
          else if (r === 'already_done') showToast(`${t.name} already did it — send a 👏 instead`, { tone: 'habit' });
          else if (r === 'already_sent' || r === 'too_soon') showToast(`You just nudged ${t.name} — you can nudge again in 10 minutes`, { tone: 'plan' });
        }}
      />

      <NewCircleSheet
        open={newCircle}
        onClose={() => setNewCircle(false)}
        onCreate={async (name) => {
          setNewCircle(false);
          const id = (await act(() => circleApi.create(name), `Created “${name}”`)) as string | undefined;
          if (id) {
            select(id);
            setAdding(true);
          }
        }}
      />

      {/* Link picker */}
      <Sheet open={!!linking} onClose={() => setLinking(null)}>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
          Which habit counts as “{linking?.name}”?
        </h2>
        <p className="mt-1 text-[14px] text-muted">Yours can have a different name — your circle will see it under “{linking?.name}”.</p>
        <div className="mt-4 flex flex-col gap-2">
          {myHabits.map((h) => (
            <button
              key={h.id}
              onClick={async () => {
                haptic(8);
                const g = linking!;
                setLinking(null);
                await act(() => circleApi.link(g.id, h.id), `Linked “${h.name}”`);
              }}
              className="min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-left text-[15px] font-medium"
            >
              {h.name}
            </button>
          ))}
          {myHabits.length === 0 && <p className="text-[14px] text-muted">Add a habit first (Me → Your habits).</p>}
        </div>
        {linking?.links.some((l) => l.user_id === me) && (
          <button
            onClick={async () => {
              const g = linking!;
              setLinking(null);
              await act(() => circleApi.link(g.id, null), 'Unlinked');
            }}
            className="mt-3 min-h-11 w-full text-[14px] font-medium text-miss/80"
          >
            Stop sharing this habit
          </button>
        )}
      </Sheet>
    </div>
  );
}

function Avatar({ name, color, size, status }: { name: string; color: string; size: number; status?: 'done' | 'missed' | 'open' }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid size-full place-items-center rounded-full font-bold text-black/80"
        style={{ background: color, fontSize: size * 0.36, opacity: status === 'open' ? 0.45 : 1 }}
        aria-hidden
      >
        {initialsOf(name)}
      </span>
      {status && status !== 'open' && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full text-[10px] font-bold ring-2 ring-surface ${status === 'done' ? 'bg-habit text-black/80' : 'bg-miss text-white'}`}
          aria-label={status}
        >
          {status === 'done' ? '✓' : '×'}
        </span>
      )}
    </span>
  );
}

/** Last 7 days as dots. */
/** Friend's water today: a little glass that fills up + a bar with "0.6 of 3 L". */
function WaterBar({ ml, goal }: { ml: number; goal: number }) {
  const pct = Math.min(1, ml / goal);
  const h = 22 * pct;
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-label={`${fmtWater(ml)} of ${fmtWater(goal)} water today`}>
      <svg width="16" height="24" viewBox="0 0 16 24" aria-hidden className="shrink-0">
        <defs>
          <clipPath id="cw-glass">
            <path d="M1.5 1h13l-1.6 21.2a1.2 1.2 0 0 1-1.2 1.1H4.3a1.2 1.2 0 0 1-1.2-1.1z" />
          </clipPath>
        </defs>
        <rect x="0" y={23 - h} width="16" height={h + 1} fill="#38bdf8" clipPath="url(#cw-glass)" style={{ transition: 'y .6s, height .6s' }} />
        <path d="M1.5 1h13l-1.6 21.2a1.2 1.2 0 0 1-1.2 1.1H4.3a1.2 1.2 0 0 1-1.2-1.1z" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-sky-400 transition-[width] duration-700" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="mt-0.5 tabular text-[11.5px] font-medium text-sky-400">
          {pct >= 1 ? `💧 ${fmtWater(ml)} — goal hit` : `${fmtWaterPair(ml, goal)} · ${Math.round(pct * 100)}%`}
        </div>
      </div>
    </div>
  );
}

function Week({ days }: { days: string }) {
  return (
    <div className="mt-1.5 flex gap-1" aria-hidden>
      {days
        .slice(-7)
        .split('')
        .map((c, i) => (
          <span key={i} className="h-1.5 w-4 rounded-full" style={{ background: c === 'd' ? 'var(--habit)' : c === 'p' ? 'var(--part)' : c === 'm' ? 'var(--miss)' : 'var(--surface-3)' }} />
        ))}
    </div>
  );
}

function ReactButton({ label, done, aria, onClick }: { label: string; done: boolean; aria: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      disabled={done}
      onClick={() => {
        haptic(8);
        onClick();
      }}
      aria-label={done ? `${aria} (sent)` : aria}
      className={`grid size-11 shrink-0 place-items-center rounded-full border text-[18px] ${done ? 'border-transparent bg-surface-2 opacity-50' : 'border-line bg-surface-2'}`}
    >
      {label}
    </motion.button>
  );
}

function AddFriendSheet({ open, onClose, members, onInvite }: { open: boolean; onClose: () => void; members: CircleMember[]; onInvite: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ user_id: string; name: string; email_hint: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setQ('');
      setResults(null);
    }
  }, [open]);
  useEffect(() => {
    if (q.trim().length < 3) return setResults(null);
    setBusy(true);
    const t = setTimeout(() => {
      circleApi
        .search(q)
        .then(setResults, () => setResults([]))
        .finally(() => setBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Add a friend</h2>
      <p className="mt-1 text-[14px] text-muted">Search people who use {APP_NAME} by name, or type their full email.</p>
      <input
        ref={focusNoScroll}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name or email"
        autoCapitalize="none"
        autoCorrect="off"
        className="mt-4 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none placeholder:text-faint focus:border-line-strong"
      />
      <div className="mt-3 flex min-h-24 flex-col gap-2">
        {q.trim().length < 3 && <p className="text-[13px] text-faint">Type at least 3 letters.</p>}
        {busy && <p className="text-[13px] text-faint">Searching…</p>}
        {results?.length === 0 && !busy && <p className="text-[13px] text-muted">No one found. They need to create a {APP_NAME} account first.</p>}
        <AnimatePresence>
          {results?.map((r) => {
            const already = members.some((m) => m.user_id === r.user_id);
            return (
              <motion.div key={r.user_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5">
                <Avatar name={r.name} color="#8b7cff" size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{r.name}</div>
                  <div className="truncate text-[12.5px] text-muted">{r.email_hint}</div>
                </div>
                <button disabled={already} onClick={() => onInvite(r.user_id)} className="min-h-11 shrink-0 rounded-full bg-plan px-4 text-[14px] font-semibold text-white disabled:opacity-40">
                  {already ? 'Added' : 'Request'}
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <p className="mt-2 text-[12.5px] text-faint">Check the email matches before sending — names can repeat.</p>
      <button
        onClick={async () => {
          const me = useStore.getState().profile.name?.trim().split(/\s+/)[0] ?? 'me';
          const r = await shareText(
            `Join me on ${APP_NAME} — we can keep each other going on our daily habits 💪\n${location.origin}/\nSign up, then search “${me}” in Circle (or I'll add you).`,
          );
          if (r === 'copied') useUI.getState().showToast('Invite copied — paste it in WhatsApp', { tone: 'plan' });
        }}
        className="mt-3 min-h-12 w-full rounded-2xl border border-line bg-surface-2 text-[14.5px] font-semibold"
      >
        Not on {APP_NAME} yet? Send them an invite
      </button>
    </Sheet>
  );
}

function NudgeSheet({
  target,
  onClose,
  onSend,
}: {
  target: { to: string | null; name: string; goal: CircleGoal; habit?: string; count?: number; notify?: boolean } | null;
  onClose: () => void;
  onSend: (msg: string | null) => void;
}) {
  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (target) setCustom('');
  }, [target]);
  const lines = target ? NUDGE_LINES[activityOf(target.goal.name, target.habit)] : [];
  return (
    <Sheet open={!!target} onClose={onClose}>
      {target && (
        <>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
            👋 Nudge {target.to === null ? `everyone (${target.count})` : target.name}
          </h2>
          <p className="mt-1 text-[14px] text-muted">
            {target.goal.emoji} {target.goal.name}
            {target.habit ? ` · ${target.habit}` : ''} —{' '}
            {target.notify === false
              ? `${target.name} hasn't turned on notifications yet, so they'll see it next time they open ${APP_NAME}.`
              : "they'll get a notification now (or at 8 am if it's past midnight for them)."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {lines.map((l) => (
              <motion.button
                key={l}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSend(l)}
                className="min-h-14 rounded-2xl border border-line bg-surface-2 px-3 text-left text-[14px] leading-snug font-medium"
              >
                {l}
              </motion.button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) onSend(custom.trim());
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Or write your own…"
              maxLength={80}
              enterKeyHint="send"
              className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[15px] outline-none placeholder:text-faint focus:border-line-strong"
            />
            <button type="submit" disabled={!custom.trim()} className="shrink-0 rounded-2xl bg-plan px-4 text-[14px] font-semibold text-white disabled:opacity-30">
              Send
            </button>
          </form>
          <button onClick={() => onSend(null)} className="mt-2 min-h-11 w-full text-[14px] font-medium text-muted">
            Just nudge, no message
          </button>
        </>
      )}
    </Sheet>
  );
}

function NewCircleSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const first = useStore((s) => s.profile.name?.trim().split(/\s+/)[0]);
  useEffect(() => {
    if (open) setName('');
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">New circle</h2>
      <p className="mt-1 text-[14px] text-muted">A separate group — e.g. gym friends, family, a book club. Each has its own people and shared goals.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <input
          ref={focusNoScroll}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={first ? `e.g. Gym buddies, Family, ${first}'s crew` : 'e.g. Gym buddies'}
          maxLength={40}
          enterKeyHint="done"
          className="mt-4 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button type="submit" disabled={!name.trim()} className="mt-4 min-h-12 w-full rounded-2xl bg-text text-[16px] font-semibold text-bg disabled:opacity-30">
          Create and add friends
        </button>
      </form>
    </Sheet>
  );
}

function GoalSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, emoji: string) => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setEmoji('🎯');
      setPicked(false);
    }
  }, [open]);
  // Until you pick an icon yourself, it follows the name: "Water" → 💧, "Gym" → 🏋️.
  useEffect(() => {
    if (!picked) setEmoji(EMOJI_FOR[activityOf(name)] ?? '🎯');
  }, [name, picked]);
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">New shared goal</h2>
      <p className="mt-1 text-[14px] text-muted">A common name everyone links their own habit to — so “Workout” and “Gym” count as the same thing.</p>
      <input
        ref={focusNoScroll}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Gym"
        maxLength={40}
        className="mt-4 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none placeholder:text-faint focus:border-line-strong"
      />
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Icon">
        {GOAL_EMOJI.map((e) => (
          <button key={e} role="radio" aria-checked={emoji === e} onClick={() => { setEmoji(e); setPicked(true); }} className={`grid size-11 place-items-center rounded-full border text-[20px] ${emoji === e ? 'border-plan bg-plan/15' : 'border-line bg-surface-2'}`}>
            {e}
          </button>
        ))}
      </div>
      <button disabled={!name.trim()} onClick={() => onAdd(name.trim(), emoji)} className="mt-5 min-h-12 w-full rounded-2xl bg-text text-[16px] font-semibold text-bg disabled:opacity-30">
        Add goal
      </button>
    </Sheet>
  );
}
