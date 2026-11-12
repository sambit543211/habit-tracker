import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore, useUI } from '../store';
import { dayStats, streak } from '../lib/score';
import { addDays, formatDay, range } from '../lib/date';
import { AnimatedNumber } from '../components/Ring';
import { RemindersCard } from '../components/RemindersCard';
import { AccountCard } from '../components/AccountCard';
import { FlameIcon } from '../components/icons';
import { fmtDuration, weekStart, windowLength } from '../lib/time';
import { achievements, levelFor, weekSummary } from '../lib/game';
import { Switch } from '../components/PlanEditor';

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
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const profile = useStore((s) => s.profile);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const setProfile = useStore((s) => s.setProfile);
  const setReviewWeek = useUI((s) => s.setReviewWeek);
  const showToast = useUI((s) => s.showToast);
  const theme = useStore((s) => s.theme ?? 'system');
  const setTheme = useStore((s) => s.setTheme);
  const reviewCount = Object.keys(weeklyReviews).length;
  const game = useMemo(() => {
    const a = achievements({ habits, plans, logs, startDay }, today, reviewCount);
    return { ...a, level: levelFor(a.kept) };
  }, [habits, plans, logs, startDay, today, reviewCount]);
  const earned = game.badges.filter((b) => b.earned).length;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name ?? '');

  const stats = useMemo(() => {
    const data = { habits, plans, logs, startDay };
    if (!startDay) return { days: 0, best: 0, avg: null as number | null, kept: 0 };
    let days = 0;
    let sum = 0;
    let n = 0;
    let kept = 0;
    for (const d of range(startDay, today)) {
      const s = dayStats(data, d);
      kept += s.habitsDone + s.plansDone;
      if (s.score !== null && d < today) {
        days++;
        sum += s.score;
        n++;
      }
    }
    return { days, best: streak(data, today, profile.shields !== false).best, avg: n ? sum / n : null, kept };
  }, [habits, plans, logs, startDay, today, profile.shields]);

  const thisWeek = weeklyReviews[weekStart(today)];
  const lastWeek = weeklyReviews[weekStart(addDays(today, -7))];
  const experiment = thisWeek?.experiment || lastWeek?.experiment;

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
          className="relative grid size-24 place-items-center rounded-full text-[34px] font-bold text-white shadow-[0_12px_40px_color-mix(in_srgb,var(--plan)_35%,transparent)]"
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
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-center text-[18px] font-semibold outline-none focus:border-line-strong"
              aria-label="Your name"
            />
            <button type="submit" className="rounded-2xl bg-text px-4 font-semibold text-bg">Save</button>
          </form>
        ) : (
          <button onClick={() => { setDraft(profile.name ?? ''); setEditing(true); }} className="mt-4">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">{profile.name || 'Add your name'}</h1>
            <span className="text-[12.5px] text-faint">Tap to edit</span>
          </button>
        )}
        {startDay && (
          <p className="mt-1 text-[14px] text-muted">Keeping promises since {formatDay(startDay, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        )}
      </header>

      {/* Reliability level */}
      <section className="card hero px-4 py-4" aria-label={`Level ${game.level.level}, ${game.level.name}`}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">Reliability level</div>
            <div className="mt-1 text-[22px] leading-tight font-bold tracking-[-0.02em]">
              <span className="text-plan">Lv {game.level.level}</span> · {game.level.name}
            </div>
          </div>
          <div className="tabular text-right text-[13px] text-muted">{game.level.xp} kept</div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--habit), var(--plan))' }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(3, game.level.progress * 100)}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 18 }}
          />
        </div>
        <div className="mt-2 text-[12.5px] text-muted">
          {game.level.next === null
            ? 'Top level reached.'
            : `${game.level.toNext} more promise${game.level.toNext === 1 ? '' : 's'} to “${game.level.nextName}”`}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Days tracked" value={stats.days} />
        <Stat label="Best streak" value={stats.best} icon={<FlameIcon size={16} className="text-gold" />} />
        <Stat label="Avg efficacy" value={stats.avg === null ? null : Math.round(stats.avg * 100)} suffix="%" />
        <Stat label="Promises kept" value={stats.kept} />
      </div>

      <button onClick={() => useUI.getState().setTab('habits')} className="card flex min-h-14 items-center justify-between px-4 py-3.5 text-left">
        <span>
          <span className="block text-[15px] font-semibold">Your habits</span>
          <span className="block text-[13px] text-muted">
            {habits.filter((h) => !h.archivedDay).length} daily non-negotiables · add, edit, triggers, reminders
          </span>
        </span>
        <span className="text-[18px] text-muted" aria-hidden>
          →
        </span>
      </button>

      {/* Optional modes */}
      <section className="card px-4 py-4">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Optional modes</h2>
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

      {/* Badges + personal bests */}
      <section className="card px-4 py-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Badges</h2>
          <span className="tabular text-[12.5px] text-muted">
            {earned}/{game.badges.length}
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-5 gap-x-1 gap-y-3">
          {game.badges.map((b) => (
            <li key={b.id} className="list-none">
              <button
                onClick={() => showToast(`${b.emoji} ${b.title} — ${b.text}${b.earned ? ' ✓' : ''}`, { tone: b.earned ? 'habit' : 'plan' })}
                aria-label={`${b.title}: ${b.text}. ${b.earned ? 'Earned' : 'Locked'}`}
                className="flex w-full flex-col items-center gap-1"
              >
                <span
                  className={`grid size-12 place-items-center rounded-full text-[22px] ${b.earned ? 'bg-gold/15' : 'bg-surface-2 opacity-40 grayscale'}`}
                >
                  {b.emoji}
                </span>
                <span className={`line-clamp-2 text-center text-[12px] leading-tight ${b.earned ? 'text-text' : 'text-faint'}`}>{b.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
          <Best label="Most in a day" value={String(game.bests.mostInADay)} />
          <Best label="Best week" value={game.bests.bestWeek === null ? '–' : `${Math.round(game.bests.bestWeek * 100)}%`} />
          <Best label="Perfect days" value={String(game.bests.perfectDays)} />
        </div>
      </section>

      {experiment && (
        <div className="rounded-[20px] border border-plan/30 bg-plan/10 px-4 py-3.5">
          <div className="text-[12px] font-semibold tracking-wide text-plan uppercase">This week's experiment</div>
          <div className="mt-1 text-[15px] font-medium">{experiment}</div>
        </div>
      )}

      <button onClick={() => setReviewWeek(true)} className="card flex items-center justify-between px-4 py-4 text-left">
        <span>
          <span className="block text-[15px] font-semibold">Weekly review</span>
          <span className="block text-[13px] text-muted">{thisWeek ? 'Done for this week — tap to edit' : '3 questions · about 2 minutes'}</span>
        </span>
        <span className="text-[20px]">{thisWeek ? '✅' : '🗓️'}</span>
      </button>

      {/* Accountability partner */}
      <section className="card px-4 py-4">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Accountability partner</h2>
        <p className="mt-1 text-[12.5px] text-faint">Reporting progress to someone makes follow-through more likely (Harkin et al., 2016).</p>
        <input
          value={profile.partner ?? ''}
          onChange={(e) => setProfile({ partner: e.target.value })}
          placeholder="Their name (e.g. Rahul)"
          aria-label="Partner's name"
          className="mt-3 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button
          onClick={async () => {
            const text = weekSummary({ habits, plans, logs, startDay }, today, profile.name, experiment);
            const r = await shareText(profile.partner?.trim() ? `Hi ${profile.partner.trim()},\n${text}` : text);
            if (r === 'copied') showToast('Summary copied — paste it in a message', { tone: 'plan' });
            if (r === 'failed') showToast("Couldn't share from this browser", { tone: 'miss' });
          }}
          className="mt-2.5 min-h-12 w-full rounded-2xl bg-plan text-[15px] font-semibold text-white"
        >
          Share this week{profile.partner?.trim() ? ` with ${profile.partner.trim()}` : ''}
        </button>
      </section>

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
        <p className="mt-2 text-[12.5px] text-faint">Auto follows your iPhone's light/dark setting.</p>
      </section>

      <section className="card px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">🛡 Streak shields</h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              Every 7 perfect days earns a shield (max 2). A missed day spends one instead of resetting your streak. Off = fully strict.
            </p>
          </div>
          <Switch on={profile.shields !== false} onChange={(v) => setProfile({ shields: v })} label="Streak shields" />
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
      <AccountCard />
    </div>
  );
}

function Stat({ label, value, suffix, icon }: { label: string; value: number | null; suffix?: string; icon?: React.ReactNode }) {
  return (
    <div className="card px-4 py-4">
      <div className="flex items-center gap-1 text-[26px] leading-none font-bold tracking-[-0.03em] tabular">
        {icon}
        {value === null ? '–' : <AnimatedNumber value={value} />}
        {value !== null && suffix && <span className="text-[16px] text-muted">{suffix}</span>}
      </div>
      <div className="mt-1.5 text-[12px] font-medium tracking-wide text-muted uppercase">{label}</div>
    </div>
  );
}

function Best({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tabular text-[18px] font-bold">{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
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
