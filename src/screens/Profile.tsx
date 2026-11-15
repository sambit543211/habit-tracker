import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, streakFor } from '../lib/score';
import { HabitList } from '../components/HabitList';
import { useData } from '../lib/useData';
import { addDays, formatDay, range } from '../lib/date';
import { RemindersCard } from '../components/RemindersCard';
import { AccountCard } from '../components/AccountCard';
import { StartFreshCard } from '../components/StartFreshCard';
import { FlameIcon, PlusIcon } from '../components/icons';
import { fmtDuration, weekStart, windowLength } from '../lib/time';
import { achievements, levelFor, weekSummary, weeklyQuest } from '../lib/game';
import { Switch } from '../components/Switch';

/** Share text via the iOS share sheet, falling back to the clipboard. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return (e as Error)?.name === 'AbortError' ? 'shared' : 'failed';
  }
}

export const initials = (name?: string) =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '·';

export function Profile({ today }: { today: string }) {
  const data = useData();
  const { startDay } = data;
  const profile = useStore((s) => s.profile);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const setProfile = useStore((s) => s.setProfile);
  const setReviewWeek = useUI((s) => s.setReviewWeek);
  const editHabit = useUI((s) => s.editHabit);
  const showToast = useUI((s) => s.showToast);
  const theme = useStore((s) => s.theme ?? 'system');
  const setTheme = useStore((s) => s.setTheme);
  const reviewCount = Object.keys(weeklyReviews).length;
  const game = useMemo(() => {
    const a = achievements(data, today, reviewCount);
    return { ...a, level: levelFor(a.kept), quest: weeklyQuest(data, today) };
  }, [data, today, reviewCount]);
  const earned = game.badges.filter((b) => b.earned);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name ?? '');
  const [allBadges, setAllBadges] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (editing) nameRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const stats = useMemo(() => {
    if (!startDay) return { days: 0, best: 0, avg: null as number | null };
    let days = 0;
    let sum = 0;
    for (const d of range(startDay, addDays(today, -1))) {
      const s = dayStats(data, d);
      if (s.score !== null) {
        days++;
        sum += s.score;
      }
    }
    return { days, best: streakFor(data, today, profile).best, avg: days ? sum / days : null };
  }, [data, startDay, today, profile]);

  const thisWeek = weeklyReviews[weekStart(today)];
  const lastWeek = weeklyReviews[weekStart(addDays(today, -7))];
  const experiment = thisWeek?.experiment || lastWeek?.experiment;
  const active = data.habits.filter((h) => !h.archivedDay);
  const rule = profile.streakRule ?? 'all';

  const saveName = () => {
    const n = draft.trim();
    if (n) setProfile({ name: n });
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center pt-6 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="relative grid size-20 place-items-center rounded-full text-[30px] font-bold text-white shadow-[0_12px_40px_color-mix(in_srgb,var(--plan)_35%,transparent)]"
          style={{ background: 'linear-gradient(135deg, var(--habit), var(--plan))' }}
        >
          {initials(profile.name)}
        </motion.div>
        {editing ? (
          <form
            className="mt-4 flex w-full max-w-xs gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              ref={nameRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              enterKeyHint="done"
              className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-center text-[18px] font-semibold outline-none focus:border-line-strong"
              aria-label="Your name"
            />
            <button type="submit" className="rounded-2xl bg-text px-4 font-semibold text-bg">Save</button>
          </form>
        ) : (
          <button onClick={() => { setDraft(profile.name ?? ''); setEditing(true); }} className="mt-3">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">{profile.name || 'Add your name'}</h1>
            <span className="text-[12.5px] text-faint">Tap to edit</span>
          </button>
        )}
        {startDay && (
          <p className="mt-1 text-[14px] text-muted">Keeping promises since {formatDay(startDay, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        )}
      </header>

      {/* Habits: add, edit, remove — right here */}
      <section className="card px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Your habits · {active.length}</h2>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => editHabit('new')}
            className="flex min-h-9 items-center gap-1 rounded-full bg-habit/15 px-3 text-[13px] font-semibold text-habit"
          >
            <PlusIcon size={15} strokeWidth={2.6} /> Add
          </motion.button>
        </div>
        {active.length === 0 ? (
          <button onClick={() => editHabit('new')} className="mt-3 w-full rounded-2xl border border-dashed border-line-strong/60 py-6 text-[14px] text-muted">
            Add your first habit
          </button>
        ) : (
          <>
            <HabitList />
            {active.length > 1 && <p className="mt-1.5 text-[12px] text-faint">Drag ≡ to reorder. Today shows them in this order.</p>}
          </>
        )}
        {active.length > 6 && rule === 'all' && (
          <p className="mt-2 text-[12.5px] text-muted">
            <span className="font-semibold text-gold">That's a lot for a strict streak.</span> Consider the “most habits” streak rule in Settings, or moving some to Plans.
          </p>
        )}
      </section>

      {/* Progress: level, quest, numbers, badges — one card */}
      <section className="card hero px-4 py-4" aria-label={`Level ${game.level.level}, ${game.level.name}`}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">Progress</div>
            <div className="mt-1 text-[21px] leading-tight font-bold tracking-[-0.02em]">
              <span className="text-plan">Lv {game.level.level}</span> · {game.level.name}
            </div>
          </div>
          <div className="tabular text-right text-[13px] text-muted">{game.level.xp} kept</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--habit), var(--plan))' }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(3, game.level.progress * 100)}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 18 }}
          />
        </div>
        <div className="mt-1.5 text-[12px] text-muted">
          {game.level.next === null ? 'Top level reached.' : `${game.level.toNext} more to “${game.level.nextName}”`}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Num label="Days tracked" value={String(stats.days)} />
          <Num label="Best streak" value={String(stats.best)} icon={<FlameIcon size={14} className="text-gold" />} />
          <Num label="Avg score" value={stats.avg === null ? '–' : `${Math.round(stats.avg * 100)}%`} />
        </div>

        {game.quest && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5" aria-label={`Weekly quest: ${game.quest.title}. ${game.quest.progress} of ${game.quest.target}`}>
            <span className="text-[18px]" aria-hidden>{game.quest.done ? '🏅' : '🎯'}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">This week's quest{game.quest.done ? ' · done' : ''}</div>
              <div className="text-[13.5px] leading-snug font-medium">{game.quest.title}</div>
            </div>
            <div className="flex shrink-0 gap-1" aria-hidden>
              {Array.from({ length: game.quest.target }, (_, i) => (
                <span key={i} className="size-2.5 rounded-full" style={{ background: i < game.quest!.progress ? 'var(--habit)' : 'var(--surface-3)' }} />
              ))}
            </div>
          </div>
        )}

        {experiment && (
          <button onClick={() => setReviewWeek(true)} className="mt-2 w-full rounded-2xl bg-surface-2 px-3 py-2.5 text-left">
            <div className="text-[11.5px] font-semibold tracking-[0.08em] text-plan uppercase">This week's experiment</div>
            <div className="text-[13.5px] font-medium">{experiment}</div>
          </button>
        )}

        <button
          onClick={() => setAllBadges((v) => !v)}
          aria-expanded={allBadges}
          className="mt-4 flex min-h-11 w-full items-center justify-between border-t border-line pt-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[13px] font-semibold">Badges {earned.length}/{game.badges.length}</span>
            <span className="truncate text-[18px] leading-none">{earned.map((b) => b.emoji).join(' ')}</span>
          </span>
          <motion.span animate={{ rotate: allBadges ? 90 : 0 }} className="text-[18px] text-muted" aria-hidden>›</motion.span>
        </button>
        {allBadges && (
          <>
            <ul className="mt-2 grid grid-cols-5 gap-x-1 gap-y-3">
              {game.badges.map((b) => (
                <li key={b.id} className="list-none">
                  <button
                    onClick={() => showToast(`${b.emoji} ${b.title} — ${b.text}${b.earned ? ' ✓' : ''}`, { tone: b.earned ? 'habit' : 'plan' })}
                    aria-label={`${b.title}: ${b.text}. ${b.earned ? 'Earned' : 'Locked'}`}
                    className="flex w-full flex-col items-center gap-1"
                  >
                    <span className={`grid size-11 place-items-center rounded-full text-[20px] ${b.earned ? 'bg-gold/15' : 'bg-surface-2 opacity-40 grayscale'}`}>{b.emoji}</span>
                    <span className={`line-clamp-2 text-center text-[11.5px] leading-tight ${b.earned ? 'text-text' : 'text-faint'}`}>{b.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Num label="Most in a day" value={String(game.bests.mostInADay)} />
              <Num label="Best week" value={game.bests.bestWeek === null ? '–' : `${Math.round(game.bests.bestWeek * 100)}%`} />
              <Num label="Perfect days" value={String(game.bests.perfectDays)} />
            </div>
          </>
        )}

        <button
          onClick={async () => {
            const r = await shareText(weekSummary(data, today, profile.name, experiment));
            if (r === 'copied') showToast('Summary copied — paste it in a message', { tone: 'plan' });
            if (r === 'failed') showToast("Couldn't share from this browser", { tone: 'miss' });
          }}
          className="mt-3 min-h-11 w-full rounded-2xl bg-surface-2 text-[14px] font-semibold"
        >
          Share my week
        </button>
      </section>

      <Group title="Settings" hint="Streak rule, modes, reminders, your day, appearance">
        <section className="card px-4 py-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Streak</h2>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Streak rule">
            {(['all', 'most'] as const).map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={rule === r}
                onClick={() => setProfile({ streakRule: r })}
                className={`relative min-h-11 rounded-xl text-[14px] font-medium ${rule === r ? 'text-text' : 'text-muted'}`}
              >
                {rule === r && <motion.span layoutId="streak-rule" className="absolute inset-0 rounded-xl bg-surface shadow-sm" />}
                <span className="relative">{r === 'all' ? 'Every habit' : 'Most habits (80%)'}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-faint">
            {rule === 'all' ? 'Strict: a day counts only when every habit is done.' : 'A day counts when at least 80% of your habits are done.'}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <div>
              <div className="text-[15px] font-semibold">🛡 Streak shields</div>
              <p className="mt-0.5 text-[12.5px] text-faint">Every 7 streak days earns a shield (max 2). A missed day spends one instead of resetting.</p>
            </div>
            <Switch on={profile.shields !== false} onChange={(v) => setProfile({ shields: v })} label="Streak shields" />
          </div>
        </section>

        <section className="card px-4 py-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Optional modes</h2>
          <div className="mt-3 flex items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <div className="text-[15px] font-semibold">👥 Circle</div>
              <p className="mt-0.5 text-[12.5px] text-faint">Share chosen habits with up to 5 friends: shared goals, group streaks, cheers and nudges. Scored separately.</p>
            </div>
            <Switch
              on={!!profile.circle}
              onChange={(v) => {
                setProfile({ circle: v });
                if (v) useUI.getState().setTab('circle');
              }}
              label="Circle mode"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold">🚭 Quit smoking</div>
              <p className="mt-0.5 text-[12.5px] text-faint">Adds a Quit tab: log cigarettes, ride out cravings, see money saved. Scored separately.</p>
            </div>
            <Switch
              on={!!profile.quit?.enabled}
              onChange={(v) => {
                if (profile.quit) setProfile({ quit: { ...profile.quit, enabled: v } });
                if (v) useUI.getState().setTab('quit');
              }}
              label="Quit smoking mode"
            />
          </div>
        </section>

        <section className="card px-4 py-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Your day</h2>
          <p className="mt-1 text-[12.5px] text-faint">Used for your calendar and free-time count · {fmtDuration(windowLength(profile))} awake</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TimeField label="Wake up" value={profile.wake} onChange={(wake) => setProfile({ wake })} />
            <TimeField label="Sleep" value={profile.sleep} onChange={(sleep) => setProfile({ sleep })} />
          </div>
        </section>

        <RemindersCard />
        <section className="card px-4 py-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Appearance</h2>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={theme === t}
                onClick={() => setTheme(t)}
                className={`relative min-h-11 rounded-xl text-[14px] font-medium ${theme === t ? 'text-text' : 'text-muted'}`}
              >
                {theme === t && <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-xl bg-surface shadow-sm" />}
                <span className="relative">{t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-faint">Auto follows your phone's light/dark setting.</p>
        </section>
      </Group>
      <Group title="Account">
        <AccountCard />
        <StartFreshCard />
      </Group>
    </div>
  );
}

/** Collapsible section on Me. */
function Group({ title, hint, defaultOpen, children }: { title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 items-center justify-between rounded-2xl px-1 text-left"
      >
        <span>
          <span className="block text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">{title}</span>
          {hint && !open && <span className="block text-[12.5px] text-faint">{hint}</span>}
        </span>
        <motion.span animate={{ rotate: open ? 90 : 0 }} className="text-[18px] text-muted" aria-hidden>
          ›
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Num({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-1 py-2.5">
      <div className="tabular flex items-center justify-center gap-1 text-[18px] font-bold">
        {icon}
        {value}
      </div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="tabular mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[16px] outline-none focus:border-line-strong"
      />
    </label>
  );
}
