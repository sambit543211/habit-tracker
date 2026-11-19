import { useState } from 'react';
import type { Habit } from '../types';
import { PART_COLORS, evenSplit, nudgeWeight } from '../lib/parts';

export interface DraftPart {
  id: string;
  name: string;
  weight: number;
  /** Set when this part is an existing habit being folded in */
  from?: string;
}

const PRESETS_2 = [
  [50, 50],
  [60, 40],
  [70, 30],
  [80, 20],
];
const PRESETS_3 = [
  [34, 33, 33],
  [40, 40, 20],
  [50, 25, 25],
  [60, 20, 20],
];
export const partId = () => crypto.randomUUID().slice(0, 8);

/** "Parts" section of the habit editor: 2–3 parts, how the credit is split, and folding in existing habits. */
export function PartsEditor({ parts, setParts, others }: { parts: DraftPart[]; setParts: (p: DraftPart[]) => void; others: Habit[] }) {
  const [picking, setPicking] = useState(false);
  const weights = parts.map((p) => p.weight);
  const setWeights = (w: number[]) => setParts(parts.map((p, i) => ({ ...p, weight: w[i] })));
  const rename = (i: number, name: string) => setParts(parts.map((p, k) => (k === i ? { ...p, name } : p)));
  const remove = (i: number) => {
    const rest = parts.filter((_, k) => k !== i);
    setParts(rest.length < 2 ? [] : rest.map((p, k) => ({ ...p, weight: evenSplit(rest.length)[k] })));
  };
  const add = (from?: Habit) => {
    const next = [...parts, { id: partId(), name: from?.name ?? '', weight: 0, from: from?.id }];
    setParts(next.map((p, k) => ({ ...p, weight: evenSplit(next.length)[k] })));
    setPicking(false);
  };
  const usable = others.filter((h) => !parts.some((p) => p.from === h.id) && !(h.parts?.length));
  const presets = parts.length === 2 ? PRESETS_2 : PRESETS_3;

  return (
    <div className="mt-1.5 rounded-2xl border border-line bg-surface-2 p-3">
      {/* The split, as a bar */}
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
        {parts.map((p, i) => (
          <div key={p.id} className="h-full transition-[width] duration-300" style={{ width: `${p.weight}%`, background: PART_COLORS[i] }} />
        ))}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {parts.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full" style={{ background: PART_COLORS[i] }} aria-hidden />
            <input
              value={p.name}
              onChange={(e) => rename(i, e.target.value)}
              placeholder={i === 0 ? 'Workout' : i === 1 ? 'Stretch' : 'Third part'}
              aria-label={`Part ${i + 1} name`}
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-line-strong placeholder:text-faint"
            />
            <div className="flex shrink-0 items-center rounded-xl bg-bg" role="group" aria-label={`Part ${i + 1} share`}>
              <button onClick={() => setWeights(nudgeWeight(weights, i, -5))} className="grid size-9 place-items-center text-[18px] text-muted" aria-label="Less">
                −
              </button>
              <span className="w-10 text-center text-[14px] font-semibold tabular">{p.weight}%</span>
              <button onClick={() => setWeights(nudgeWeight(weights, i, 5))} className="grid size-9 place-items-center text-[18px] text-muted" aria-label="More">
                +
              </button>
            </div>
            <button onClick={() => remove(i)} className="grid size-8 shrink-0 place-items-center text-faint" aria-label={`Remove ${p.name || `part ${i + 1}`}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {parts.some((p) => p.from) && (
        <p className="mt-2 text-[12px] text-faint">↪ Habits folded in stop showing on Today. Their past days stay in your history.</p>
      )}

      {parts.length === 2 && (
        <input
          type="range"
          min={5}
          max={95}
          step={5}
          value={parts[0].weight}
          onChange={(e) => setWeights([+e.target.value, 100 - +e.target.value])}
          aria-label="Split between the two parts"
          className="mt-3 w-full accent-[var(--habit)]"
        />
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((w) => (
          <button
            key={w.join('/')}
            onClick={() => setWeights(w)}
            className={`min-h-9 rounded-full border px-3 text-[13px] font-medium tabular ${w.join() === weights.join() ? 'border-habit bg-habit/15 text-text' : 'border-line bg-bg text-muted'}`}
          >
            {w.join(' / ')}
          </button>
        ))}
      </div>

      {parts.length < 3 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => add()} className="min-h-10 rounded-full border border-dashed border-line-strong/60 px-3 text-[13.5px] font-medium text-muted">
            + Add a part
          </button>
          {usable.length > 0 && (
            <button onClick={() => setPicking((v) => !v)} aria-expanded={picking} className="min-h-10 rounded-full border border-dashed border-line-strong/60 px-3 text-[13.5px] font-medium text-muted">
              ↪ Combine with an existing habit
            </button>
          )}
        </div>
      )}
      {picking && parts.length < 3 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {usable.map((h) => (
            <button key={h.id} onClick={() => add(h)} className="min-h-10 rounded-full bg-bg px-3 text-[13.5px] font-medium">
              {h.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
