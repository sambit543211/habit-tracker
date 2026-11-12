import { AnimatePresence, motion } from 'framer-motion';
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
import { Sheet } from '../components/Sheet';
import { FlameIcon, PlusIcon } from '../components/icons';
import { haptic } from '../lib/feedback';

const GOAL_EMOJI = ['🏋️', '🏃', '🥗', '📚', '🧘', '💧', '😴', '🚭', '💻', '🎯'];
const AVATAR = ['#3ddc97', '#8b7cff', '#ffb547', '#ff5c6c', '#38bdf8', '#f472b6'];

/** Circle: shared goals with up to 6 friends. Only linked habits are visible to them. */
export function Circle({ today }: { today: string }) {
  const { data, loading, error, refresh } = useCircle();
  const habits = useStore((s) => s.habits);
  const logs = useStore((s) => s.logs[today]);
  const showToast = useUI((s) => s.showToast);
  const [adding, setAdding] = useState(false);
  const [goalSheet, setGoalSheet] = useState(false);
  const [linking, setLinking] = useState<CircleGoal | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

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

      {error && <p className="rounded-2xl border border-miss/30 bg-miss/10 px-4 py-3 text-[13.5px]">Couldn't load your circle. Check your connection.</p>}

      {/* Pending request for me */}
      {data?.invite && (
        <section className="card hero px-4 py-4">
          <div className="text-[12px] font-semibold tracking-[0.1em] text-plan uppercase">Request</div>
          <p className="mt-1 text-[16px] font-semibold">
            {data.invite.from} invited you to “{data.invite.circle}”
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {data.invite.size} {data.invite.size === 1 ? 'person' : 'people'} inside. They'll only see the habits you choose to link — never your plans or reasons.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => void act(() => circleApi.respond(true), 'You joined the circle')} className="min-h-12 rounded-2xl bg-text text-[15px] font-semibold text-bg">
              Accept
            </button>
            <button onClick={() => void act(() => circleApi.respond(false))} className="min-h-12 rounded-2xl border border-line text-[15px] font-medium text-muted">
              Decline
            </button>
          </div>
        </section>
      )}

      {/* Empty state */}
      {data && !circle && !data.invite && (
        <section className="card px-5 py-8 text-center">
          <div className="text-[40px]">👥</div>
          <h2 className="mt-2 text-[20px] font-bold tracking-[-0.02em]">Start your circle</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-[14px] text-muted">
            Add up to 5 friends who use Keep. Pick a shared goal like “Gym”, link your own habit to it, and keep each other going.
          </p>
          <button onClick={() => setAdding(true)} className="mt-5 min-h-12 w-full rounded-2xl bg-plan text-[15px] font-semibold text-white">
            Find a friend
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
                <Avatar name={m.name} color={colorOf(m.user_id)} size={44} />
                <span className="max-w-14 truncate text-[12px] text-muted">{m.user_id === me ? 'You' : m.name.split(/\s+/)[0]}</span>
                {m.status === 'invited' && <span className="-mt-1 text-[12px] text-faint">pending</span>}
              </div>
            ))}
          </section>

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
                          <Week days={l.days} />
                        </div>
                        {!isMe &&
                          (st === 'done' ? (
                            <ReactButton label="👏" done={reacted('cheer')} aria={`Cheer ${nameOf(l.user_id)}`} onClick={() => void act(() => circleApi.react(l.user_id, g.id, today, 'cheer'))} />
                          ) : st === 'open' ? (
                            <ReactButton label="👋" done={reacted('nudge')} aria={`Nudge ${nameOf(l.user_id)}`} onClick={() => void act(() => circleApi.react(l.user_id, g.id, today, 'nudge'), `Nudged ${nameOf(l.user_id)}`)} />
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
          <button
            onClick={() => {
              if (!confirmLeave) return setConfirmLeave(true);
              void act(() => circleApi.remove(null), 'You left the circle');
              setConfirmLeave(false);
            }}
            className={`min-h-11 text-[14px] font-medium ${confirmLeave ? 'text-miss' : 'text-faint'}`}
          >
            {confirmLeave ? 'Tap again to leave the circle' : 'Leave circle'}
          </button>
        </>
      )}

      <AddFriendSheet
        open={adding}
        onClose={() => setAdding(false)}
        members={members}
        onInvite={async (id) => {
          const r = (await act(() => circleApi.invite(id))) as string | undefined;
          if (r) showToast(INVITE_MESSAGES[r] ?? r, { tone: r === 'invited' ? 'habit' : 'miss' });
          if (r === 'invited') setAdding(false);
        }}
      />

      <GoalSheet open={goalSheet} onClose={() => setGoalSheet(false)} onAdd={async (name, emoji) => { await act(() => circleApi.addGoal(name, emoji), 'Goal added'); setGoalSheet(false); }} />

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
        {linking && (linking.created_by === me || circle?.owner === me) && (
          <button
            onClick={async () => {
              const g = linking!;
              setLinking(null);
              await act(() => circleApi.deleteGoal(g.id), 'Goal removed');
            }}
            className="min-h-11 w-full text-[14px] font-medium text-faint"
          >
            Delete this goal for everyone
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
function Week({ days }: { days: string }) {
  return (
    <div className="mt-1.5 flex gap-1" aria-hidden>
      {days
        .slice(-7)
        .split('')
        .map((c, i) => (
          <span key={i} className="h-1.5 w-4 rounded-full" style={{ background: c === 'd' ? 'var(--habit)' : c === 'm' ? 'var(--miss)' : 'var(--surface-3)' }} />
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
      <p className="mt-1 text-[14px] text-muted">Search people who use Keep by name, or type their full email.</p>
      <input
        autoFocus
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
        {results?.length === 0 && !busy && <p className="text-[13px] text-muted">No one found. They need to create a Keep account first.</p>}
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
    </Sheet>
  );
}

function GoalSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, emoji: string) => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(GOAL_EMOJI[0]);
  useEffect(() => {
    if (open) setName('');
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">New shared goal</h2>
      <p className="mt-1 text-[14px] text-muted">A common name everyone links their own habit to — so “Workout” and “Gym” count as the same thing.</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Gym"
        maxLength={40}
        className="mt-4 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none placeholder:text-faint focus:border-line-strong"
      />
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Icon">
        {GOAL_EMOJI.map((e) => (
          <button key={e} role="radio" aria-checked={emoji === e} onClick={() => setEmoji(e)} className={`grid size-11 place-items-center rounded-full border text-[20px] ${emoji === e ? 'border-plan bg-plan/15' : 'border-line bg-surface-2'}`}>
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
