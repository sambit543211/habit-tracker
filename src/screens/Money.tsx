import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { formatDay } from '../lib/date';
import { CAT_COLORS, byCategory, inr, merchantKey, monthLabel, monthOf, moneyOf, shiftMonth, spentByDay, sum } from '../lib/money';
import type { Expense, MoneyCategory } from '../types';
import { Sheet } from '../components/Sheet';
import { haptic } from '../lib/feedback';
import { PlusIcon } from '../components/icons';

const useMoney = () => moneyOf(useStore((s) => s.profile.money));

function MonthSwitch({ month, setMonth, today }: { month: string; setMonth: (m: string) => void; today: string }) {
  const isNow = month === monthOf(today);
  return (
    <div className="flex items-center justify-between">
      <button onClick={() => setMonth(shiftMonth(month, -1))} className="grid size-11 place-items-center rounded-full text-[22px] text-muted" aria-label="Previous month">
        ‹
      </button>
      <span className="text-[16px] font-semibold">{monthLabel(month)}</span>
      <button
        onClick={() => setMonth(shiftMonth(month, 1))}
        disabled={isNow}
        className="grid size-11 place-items-center rounded-full text-[22px] text-muted disabled:opacity-20"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}

/** "₹2,140 more than this point last month" */
function Pace({ expenses, month, today }: { expenses: Expense[]; month: string; today: string }) {
  if (month !== monthOf(today)) return null;
  const d = Number(today.slice(8));
  const now = spentByDay(expenses, month, d);
  const before = spentByDay(expenses, shiftMonth(month, -1), d);
  if (!before) return null;
  const diff = Math.round(now - before);
  return (
    <p className="mt-1 text-[13px] text-muted">
      {diff > 0 ? (
        <span className="text-miss">↑ {inr(diff)} more</span>
      ) : (
        <span className="text-habit">↓ {inr(-diff)} less</span>
      )}{' '}
      than this point last month ({inr(before)})
    </p>
  );
}

// ---------- Daily ----------

export function MoneyDaily({ today }: { today: string }) {
  const expenses = useStore((s) => s.expenses);
  const money = useMoney();
  const { updateExpense, removeExpense, setMoney } = useStore();
  const openExpense = useUI((s) => s.openExpense);
  const [month, setMonth] = useState(monthOf(today));
  const cat = (id?: string) => money.categories.find((c) => c.id === id);

  const inMonth = expenses.filter((e) => monthOf(e.day) === month && e.category);
  const toSort = expenses.filter((e) => !e.category).sort((a, b) => b.at - a.at);
  const days = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of [...inMonth].sort((a, b) => b.at - a.at)) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [inMonth]);
  const todaySpent = sum(expenses.filter((e) => e.day === today));
  // Quick picks for sorting: the categories you use most.
  const top = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of expenses) if (e.category) n.set(e.category, (n.get(e.category) ?? 0) + 1);
    return [...money.categories].sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0));
  }, [expenses, money.categories]);

  const sortInto = (e: Expense, c: MoneyCategory) => {
    haptic(10);
    updateExpense(e.id, { category: c.id });
    const key = merchantKey(e.note);
    if (key) setMoney({ merchants: { ...money.merchants, [key]: c.id } });
  };

  return (
    <div className="flex flex-col gap-3">
      <MonthSwitch month={month} setMonth={setMonth} today={today} />
      <section className="card px-4 py-4">
        <div className="text-[13px] font-semibold tracking-wide text-muted uppercase">Spent in {monthLabel(month)}</div>
        <div className="mt-1 text-[34px] leading-none font-bold tracking-[-0.02em] tabular">{inr(sum(inMonth))}</div>
        <Pace expenses={expenses.filter((e) => e.category)} month={month} today={today} />
        {month === monthOf(today) && <p className="mt-1 text-[13px] text-faint">Today: {inr(todaySpent)}</p>}
      </section>

      {toSort.length > 0 && (
        <section className="card border-gold/40 px-4 py-3">
          <div className="text-[13px] font-semibold tracking-wide text-gold uppercase">To sort · {toSort.length}</div>
          <ul className="mt-2 flex flex-col gap-3">
            {toSort.map((e) => (
              <li key={e.id} className="list-none">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-semibold tabular">{inr(e.amount)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted">
                    {e.note ?? 'Bank debit'} · {formatDay(e.day, { day: 'numeric', month: 'short' })}
                    {e.source === 'sms' && ' · 📩 SMS'}
                  </span>
                  <button onClick={() => removeExpense(e.id)} className="grid size-8 place-items-center text-faint" aria-label="Not an expense — remove">
                    ✕
                  </button>
                </div>
                <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {top.slice(0, 10).map((c) => (
                    <button key={c.id} onClick={() => sortInto(e, c)} className="min-h-9 shrink-0 rounded-full bg-surface-2 px-3 text-[13px] font-medium">
                      {c.emoji} {c.name}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-faint">What was it? Sky remembers the shop next time.</p>
        </section>
      )}

      {days.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-line-strong/50 px-5 py-8 text-center">
          <div className="text-[15px] font-medium">No spends logged{month === monthOf(today) ? ' yet' : ''}</div>
          <p className="mt-1 text-[13.5px] text-muted">Tap + or say “Hey Siri, Sky — 25 rupees groceries”.</p>
        </div>
      ) : (
        days.map(([day, list]) => (
          <section key={day} className="card px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">
                {day === today ? 'Today' : formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <span className="text-[14px] font-semibold text-miss tabular">{inr(sum(list))}</span>
            </div>
            <ul className="mt-1.5 flex flex-col">
              {list.map((e) => {
                const c = cat(e.category);
                return (
                  <li key={e.id} className="list-none">
                    <button onClick={() => openExpense(e.id)} className="flex min-h-12 w-full items-center gap-3 text-left">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px]" aria-hidden>
                        {c?.emoji ?? '❓'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium">{c?.name ?? 'Other'}</span>
                        <span className="block truncate text-[12.5px] text-faint">
                          {[e.note, e.mode, e.source === 'voice' ? '🎙' : e.source === 'sms' ? '📩' : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular">{inr(e.amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => openExpense('new')}
        className="fixed right-5 bottom-[calc(max(env(safe-area-inset-bottom),10px)+84px)] z-30 grid size-14 place-items-center rounded-full bg-plan text-white shadow-lg shadow-plan/30"
        aria-label="Add expense"
      >
        <PlusIcon size={26} strokeWidth={2.4} />
      </motion.button>
    </div>
  );
}

// ---------- Stats ----------

function Donut({ parts }: { parts: { value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const r = 70;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 180 180" className="mx-auto size-44" aria-hidden>
      <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="26" />
      {total > 0 &&
        parts.map((p, i) => {
          const len = (p.value / total) * C;
          const el = (
            <motion.circle
              key={i}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth="26"
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 90 90)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
            />
          );
          offset += len;
          return el;
        })}
    </svg>
  );
}

export function MoneyStats({ today }: { today: string }) {
  const expenses = useStore((s) => s.expenses).filter((e) => e.category);
  const money = useMoney();
  const openExpense = useUI((s) => s.openExpense);
  const [month, setMonth] = useState(monthOf(today));
  const [open, setOpen] = useState<string | null>(null);
  const rows = byCategory(expenses, month);
  const last = new Map(byCategory(expenses, shiftMonth(month, -1)).map((r) => [r.id, r.amount]));
  const total = sum(expenses.filter((e) => monthOf(e.day) === month));
  const colorOf = (id: string) => CAT_COLORS[Math.max(0, money.categories.findIndex((c) => c.id === id)) % CAT_COLORS.length];

  return (
    <div className="flex flex-col gap-3">
      <MonthSwitch month={month} setMonth={setMonth} today={today} />
      <section className="card px-4 py-4">
        <div className="relative">
          <Donut parts={rows.map((r) => ({ value: r.amount, color: colorOf(r.id) }))} />
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-[12px] text-muted">Spent</div>
              <div className="text-[20px] font-bold tabular">{inr(Math.round(total))}</div>
            </div>
          </div>
        </div>
        <Pace expenses={expenses} month={month} today={today} />
      </section>

      {rows.length > 0 && (
        <section className="card px-2 py-2">
          <ul className="flex flex-col">
            {rows.map((r) => {
              const c = money.categories.find((x) => x.id === r.id);
              const pct = total ? Math.round((r.amount / total) * 100) : 0;
              const prev = last.get(r.id) ?? 0;
              const list = expenses.filter((e) => e.category === r.id && monthOf(e.day) === month).sort((a, b) => b.at - a.at);
              return (
                <li key={r.id} className="list-none">
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex min-h-13 w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left">
                    <span className="w-11 shrink-0 rounded-md py-0.5 text-center text-[12.5px] font-bold text-black/80 tabular" style={{ background: colorOf(r.id) }}>
                      {pct}%
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">
                        {c?.emoji} {c?.name ?? 'Other'}
                      </span>
                      {prev > 0 && (
                        <span className={`block text-[12px] ${r.amount > prev ? 'text-miss' : 'text-habit'}`}>
                          {r.amount > prev ? '↑' : '↓'} {inr(Math.abs(Math.round(r.amount - prev)))} vs last month
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular">{inr(r.amount)}</span>
                  </button>
                  {open === r.id && (
                    <ul className="mb-2 ml-14 flex flex-col">
                      {list.map((e) => (
                        <li key={e.id} className="list-none">
                          <button onClick={() => openExpense(e.id)} className="flex min-h-10 w-full items-center gap-2 pr-2 text-left text-[13.5px]">
                            <span className="w-14 shrink-0 text-faint">{formatDay(e.day, { day: 'numeric', month: 'short' })}</span>
                            <span className="min-w-0 flex-1 truncate text-muted">{e.note ?? e.mode ?? ''}</span>
                            <span className="shrink-0 tabular">{inr(e.amount)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------- Budget ----------

const barColor = (p: number) => (p > 1 ? 'var(--miss)' : p >= 0.8 ? 'var(--part)' : 'var(--habit)');

function Gauge({ spent, limit }: { spent: number; limit: number }) {
  const p = Math.min(1, spent / limit);
  const over = spent > limit;
  const L = Math.PI * 80;
  return (
    <div className="relative mx-auto w-56">
      <svg viewBox="0 0 200 110" className="w-full" aria-hidden>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--surface-2)" strokeWidth="16" strokeLinecap="round" />
        <motion.path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={barColor(spent / limit)}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={L}
          initial={{ strokeDashoffset: L }}
          animate={{ strokeDashoffset: L * (1 - p) }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className={`text-[12px] font-semibold uppercase ${over ? 'text-miss' : 'text-muted'}`}>{over ? '⚠ Over by' : 'Left'}</div>
        <div className="text-[24px] font-bold tabular">{inr(Math.abs(Math.round(limit - spent)))}</div>
      </div>
    </div>
  );
}

export function MoneyBudget({ today }: { today: string }) {
  const expenses = useStore((s) => s.expenses).filter((e) => e.category);
  const money = useMoney();
  const setMoney = useStore((s) => s.setMoney);
  const [month, setMonth] = useState(monthOf(today));
  const [editing, setEditing] = useState<MoneyCategory | 'new' | null>(null);
  const spent = new Map(byCategory(expenses, month).map((r) => [r.id, r.amount]));
  const budgeted = money.categories.filter((c) => c.budget);
  const limit = budgeted.reduce((n, c) => n + (c.budget ?? 0), 0);
  const used = budgeted.reduce((n, c) => n + (spent.get(c.id) ?? 0), 0);
  const isNow = month === monthOf(today);
  const daysIn = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const dayNo = isNow ? Number(today.slice(8)) : daysIn;
  // Sorted: budgets first (most used first), then the rest by spend.
  const rows = [...money.categories].sort((a, b) => {
    if (!!a.budget !== !!b.budget) return a.budget ? -1 : 1;
    if (a.budget && b.budget) return (spent.get(b.id) ?? 0) / b.budget - (spent.get(a.id) ?? 0) / a.budget;
    return (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0);
  });

  return (
    <div className="flex flex-col gap-3">
      <MonthSwitch month={month} setMonth={setMonth} today={today} />
      <section className="card px-4 py-4">
        {limit > 0 ? (
          <>
            <Gauge spent={used} limit={limit} />
            <div className="mt-2 flex justify-between text-[13px] text-muted tabular">
              <span>Spent {inr(Math.round(used))}</span>
              <span>Budget {inr(limit)}</span>
            </div>
            {isNow && (
              <p className="mt-2 text-[13px] text-muted">
                Day {dayNo} of {daysIn}:{' '}
                {used / limit > dayNo / daysIn + 0.1 ? (
                  <span className="text-part">spending faster than the month — slow down on extras.</span>
                ) : (
                  <span className="text-habit">on track.</span>
                )}
              </p>
            )}
          </>
        ) : (
          <div className="py-2 text-center">
            <div className="text-[16px] font-semibold">Set a budget per category</div>
            <p className="mt-1 text-[13.5px] text-muted">Tap a category below and give it a monthly limit. Sky shows how much you've used.</p>
          </div>
        )}
      </section>

      <section className="card px-2 py-2">
        <ul className="flex flex-col">
          {rows.map((c) => {
            const s = spent.get(c.id) ?? 0;
            const p = c.budget ? s / c.budget : 0;
            return (
              <li key={c.id} className="list-none">
                <button onClick={() => setEditing(c)} className="w-full rounded-2xl px-2 py-2.5 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[18px]" aria-hidden>
                      {c.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{c.name}</span>
                    {c.budget ? (
                      <span className="shrink-0 text-[13px] tabular">
                        <span className="font-semibold" style={{ color: barColor(p) }}>
                          {inr(Math.round(s))}
                        </span>
                        <span className="text-faint"> / {inr(c.budget)}</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-[13px] text-faint tabular">
                        {s ? inr(Math.round(s)) : ''} <span className="text-plan">Set budget</span>
                      </span>
                    )}
                  </div>
                  {c.budget ? (
                    <>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                        <motion.div className="h-full rounded-full" style={{ background: barColor(p) }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, p * 100)}%` }} />
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-faint tabular">
                        {p > 1 ? `Over by ${inr(Math.round(s - c.budget))}` : `${Math.round(p * 100)}% used · ${inr(Math.round(c.budget - s))} left`}
                      </div>
                    </>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <button onClick={() => setEditing('new')} className="mt-1 min-h-11 w-full rounded-2xl border border-dashed border-line-strong/60 text-[14px] font-medium text-muted">
          + New category
        </button>
      </section>

      <ModesCard modes={money.modes} onChange={(modes) => setMoney({ modes })} />

      <CategorySheet
        target={editing}
        onClose={() => setEditing(null)}
        onSave={(c) => {
          const exists = money.categories.some((x) => x.id === c.id);
          setMoney({ categories: exists ? money.categories.map((x) => (x.id === c.id ? c : x)) : [...money.categories, c] });
          setEditing(null);
        }}
        onDelete={(id) => {
          setMoney({ categories: money.categories.filter((x) => x.id !== id) });
          setEditing(null);
        }}
      />
    </div>
  );
}

function ModesCard({ modes, onChange }: { modes: string[]; onChange: (m: string[]) => void }) {
  const [adding, setAdding] = useState('');
  return (
    <section className="card px-4 py-3">
      <div className="text-[13px] font-semibold tracking-wide text-muted uppercase">Paid with</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {modes.map((m) => (
          <span key={m} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-surface-2 pr-1 pl-3 text-[13.5px]">
            {m}
            {modes.length > 1 && (
              <button onClick={() => onChange(modes.filter((x) => x !== m))} className="grid size-7 place-items-center text-faint" aria-label={`Remove ${m}`}>
                ✕
              </button>
            )}
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = adding.trim();
            if (v && !modes.includes(v)) onChange([...modes, v]);
            setAdding('');
          }}
        >
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Add (e.g. HDFC card)" className="min-h-9 w-40 rounded-full bg-surface-2 px-3 text-[13.5px] outline-none placeholder:text-faint" />
        </form>
      </div>
    </section>
  );
}

function CategorySheet({
  target,
  onClose,
  onSave,
  onDelete,
}: {
  target: MoneyCategory | 'new' | null;
  onClose: () => void;
  onSave: (c: MoneyCategory) => void;
  onDelete: (id: string) => void;
}) {
  const c = target && target !== 'new' ? target : null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [budget, setBudget] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const id = c?.id ?? 'new';
  if (target && key !== id) {
    setKey(id);
    setName(c?.name ?? '');
    setEmoji(c?.emoji ?? '🏷️');
    setBudget(c?.budget ? String(c.budget) : '');
  }
  if (!target && key) setKey(null);
  const b = Math.round(Number(budget.replace(/,/g, '')));
  const field = 'mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint';
  return (
    <Sheet open={!!target} onClose={onClose}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{c ? `${c.emoji} ${c.name}` : 'New category'}</h2>
      <label className="mt-4 block text-[13px] font-medium text-muted">Monthly budget</label>
      <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-4">
        <span className="text-[18px] text-muted">₹</span>
        <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d,]/g, ''))} inputMode="numeric" placeholder="No budget" className="w-full bg-transparent py-3.5 text-[18px] font-semibold tabular outline-none placeholder:text-faint placeholder:font-normal" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[1000, 2000, 5000, 10000].map((v) => (
          <button key={v} onClick={() => setBudget(String(v))} className="min-h-9 rounded-full bg-surface-2 px-3 text-[13px] font-medium tabular">
            {inr(v)}
          </button>
        ))}
        {budget && (
          <button onClick={() => setBudget('')} className="min-h-9 rounded-full px-3 text-[13px] font-medium text-faint">
            Remove budget
          </button>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <div className="w-20">
          <label className="block text-[13px] font-medium text-muted">Emoji</label>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} className={`${field} text-center text-[20px]`} aria-label="Emoji" />
        </div>
        <div className="flex-1">
          <label className="block text-[13px] font-medium text-muted">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pets" className={field} />
        </div>
      </div>
      <button
        onClick={() => name.trim() && onSave({ id: c?.id ?? crypto.randomUUID().slice(0, 8), name: name.trim(), emoji: emoji.trim() || '🏷️', budget: b > 0 ? b : undefined })}
        disabled={!name.trim()}
        className="mt-6 w-full rounded-2xl bg-plan py-4 text-[16px] font-semibold text-white disabled:opacity-30"
      >
        Save
      </button>
      {c && c.id !== 'other' && (
        <button onClick={() => onDelete(c.id)} className="mt-2 w-full py-3 text-[14px] font-medium text-faint">
          Remove category (past spends move to Other)
        </button>
      )}
    </Sheet>
  );
}
