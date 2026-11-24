import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { Sheet } from './Sheet';
import { addDays } from '../lib/date';
import { inr, merchantKey, moneyOf } from '../lib/money';
import { haptic } from '../lib/feedback';

/** Add or edit an expense: amount → category → (mode, note, day). Two taps for the usual case. */
export function ExpenseSheet({ today }: { today: string }) {
  const target = useUI((s) => s.expense);
  const close = () => useUI.getState().openExpense(null);
  const expenses = useStore((s) => s.expenses);
  const money = moneyOf(useStore((s) => s.profile.money));
  const { addExpense, updateExpense, removeExpense, setMoney } = useStore();
  const showToast = useUI((s) => s.showToast);
  const editing = target && target !== 'new' ? expenses.find((e) => e.id === target) : undefined;

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [picked, setPicked] = useState(false); // category chosen by hand (don't auto-guess over it)
  const [mode, setMode] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [day, setDay] = useState(today);
  const [all, setAll] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Most-used categories first (last 60 days), so the usual one is a tap away.
  const ordered = useMemo(() => {
    const since = addDays(today, -60);
    const n = new Map<string, number>();
    for (const e of expenses) if (e.day >= since && e.category) n.set(e.category, (n.get(e.category) ?? 0) + 1);
    return [...money.categories].sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0));
  }, [expenses, money.categories, today]);
  const lastMode = useMemo(() => [...expenses].sort((a, b) => b.at - a.at).find((e) => e.mode)?.mode, [expenses]);

  useEffect(() => {
    if (!target) return;
    setAmount(editing ? String(editing.amount) : '');
    setCategory(editing?.category);
    setPicked(!!editing?.category);
    setMode(editing?.mode ?? lastMode ?? money.modes[0]);
    setNote(editing?.note ?? '');
    setDay(editing?.day ?? today);
    setAll(false);
    setConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const amountRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (target === 'new') amountRef.current?.focus({ preventScroll: true });
  }, [target]);

  // Typing a shop you've used before picks its category.
  const learned = money.merchants[merchantKey(note)];
  useEffect(() => {
    if (!picked && learned) setCategory(learned);
  }, [learned, picked]);

  const value = Math.round(parseFloat(amount.replace(/,/g, '')) * 100) / 100;
  const ok = value > 0 && value < 10_000_000 && !!category;
  const cat = money.categories.find((c) => c.id === category);

  const save = () => {
    if (!ok) return;
    const data = { amount: value, category, mode, note: note.trim() || undefined, day };
    if (editing) updateExpense(editing.id, data);
    else addExpense({ ...data, source: 'app' });
    const key = merchantKey(note);
    if (key && money.merchants[key] !== category) setMoney({ merchants: { ...money.merchants, [key]: category! } });
    haptic(12);
    showToast(`${inr(value)} · ${cat?.emoji} ${cat?.name}`, { tone: 'plan' });
    close();
  };

  const chip = (on: boolean) => `min-h-10 rounded-full border px-3 text-[13.5px] font-medium ${on ? 'border-plan bg-plan/15 text-text' : 'border-line bg-surface-2 text-muted'}`;
  const shown = all ? ordered : ordered.slice(0, 8);

  return (
    <Sheet open={!!target} onClose={close}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{editing ? 'Edit expense' : 'New expense'}</h2>

      <div className="mt-4 flex items-baseline gap-1 border-b-2 border-plan pb-1">
        <span className="text-[34px] font-bold text-muted">₹</span>
        <input
          ref={amountRef}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          inputMode="decimal"
          enterKeyHint="done"
          placeholder="0"
          aria-label="Amount in rupees"
          className="w-full bg-transparent text-[40px] font-bold tabular outline-none placeholder:text-faint"
        />
      </div>

      <div className="mt-4 text-[13px] font-medium text-muted">Category</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shown.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setCategory(c.id);
              setPicked(true);
            }}
            aria-pressed={category === c.id}
            className={chip(category === c.id)}
          >
            {c.emoji} {c.name}
          </button>
        ))}
        {!all && ordered.length > 8 && (
          <button onClick={() => setAll(true)} className="min-h-10 rounded-full px-3 text-[13.5px] font-medium text-plan">
            More…
          </button>
        )}
      </div>
      {learned && !picked && <p className="mt-1.5 text-[12.5px] text-faint">Guessed from “{note.trim()}” — tap another to change.</p>}

      <div className="mt-4 text-[13px] font-medium text-muted">Paid with</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {money.modes.map((m) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={chip(mode === m)}>
            {m}
          </button>
        ))}
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note or shop (e.g. Blinkit)"
        aria-label="Note"
        className="mt-4 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint"
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setDay(today)} aria-pressed={day === today} className={chip(day === today)}>
          Today
        </button>
        <button onClick={() => setDay(addDays(today, -1))} aria-pressed={day === addDays(today, -1)} className={chip(day === addDays(today, -1))}>
          Yesterday
        </button>
        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          aria-label="Date"
          className="min-h-10 rounded-full border border-line bg-surface-2 px-3 text-[13.5px] text-muted"
        />
      </div>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={save}
        disabled={!ok}
        className="mt-6 w-full rounded-2xl bg-plan py-4 text-[16px] font-semibold text-white disabled:opacity-30"
      >
        {value > 0 ? `Save ${inr(value)}${cat ? ` · ${cat.name}` : ''}` : 'Save'}
      </motion.button>
      {editing && (
        <button
          onClick={() => {
            if (!confirm) return setConfirm(true);
            removeExpense(editing.id);
            close();
          }}
          className={`mt-2 w-full py-3 text-[14px] font-medium ${confirm ? 'text-miss' : 'text-faint'}`}
        >
          {confirm ? 'Tap again to delete' : 'Delete expense'}
        </button>
      )}
    </Sheet>
  );
}
