import { animate, motion, useAnimationControls, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CheckIcon, XIcon } from './icons';
import { haptic } from '../lib/feedback';

export type RowStatus = 'pending' | 'done' | 'missed' | 'carried';

interface ItemRowProps {
  title: string;
  subtitle?: ReactNode;
  status: RowStatus;
  accent: 'habit' | 'plan';
  leading?: ReactNode;
  trailing?: ReactNode;
  onDone: () => void;
  onMiss: () => void;
  onUndo: () => void;
  /** Tap on the text opens details */
  onOpen?: () => void;
  /** Small chip under the subtitle that must never be truncated (e.g. "Moved 2×") */
  badge?: ReactNode;
  /** Dense layout for the two-column Today view */
  compact?: boolean;
  /** Play the one-time swipe tutorial on this row */
  hint?: boolean;
  onHintDone?: () => void;
}

const SWIPE = 84;

/**
 * A trackable item. Tap the circle to complete, swipe right to complete,
 * swipe left (or tap ×) to log a miss. Tap a resolved circle to undo.
 */
export function ItemRow({ title, subtitle, status, accent, leading, trailing, onDone, onMiss, onUndo, onOpen, compact, hint, onHintDone, badge }: ItemRowProps) {
  const x = useMotionValue(0);
  const dragged = useRef(false);

  // Visual "haptic": iPhone web apps can't vibrate, so resolved rows flash + pop.
  const [flash, setFlash] = useState(0);
  const pop = useAnimationControls();
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === 'pending' && status !== 'pending') {
      setFlash((f) => f + 1);
      void pop.start({ scale: [1, 1.03, 1], transition: { duration: 0.35, ease: 'easeOut' } });
    }
    prevStatus.current = status;
  }, [status, pop]);

  // One-time swipe tutorial: nudge right (done), then left (didn't).
  useEffect(() => {
    if (!hint || status !== 'pending') return;
    let cancelled = false;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 900));
      for (const to of [56, 0, -56, 0]) {
        if (cancelled) return;
        await animate(x, to, { type: 'spring', stiffness: 260, damping: 22 });
        await new Promise((r) => setTimeout(r, to === 0 ? 150 : 450));
      }
      if (!cancelled) onHintDone?.();
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint]);
  const doneOpacity = useTransform(x, [12, SWIPE], [0, 1]);
  const missOpacity = useTransform(x, [-SWIPE, -12], [1, 0]);
  const pending = status === 'pending';
  const accentVar = `var(--${accent})`;

  const done = () => {
    haptic(12);
    onDone();
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className="relative list-none"
      style={{ '--accent': accentVar } as CSSProperties}
    >
      {pending && (
        <>
          <motion.div
            style={{ opacity: doneOpacity, background: accentVar }}
            className={`absolute inset-0 flex items-center text-black/80 ${compact ? 'rounded-2xl pl-3' : 'rounded-[20px] pl-5'}`}
          >
            <CheckIcon size={compact ? 18 : 22} strokeWidth={2.6} />
          </motion.div>
          <motion.div
            style={{ opacity: missOpacity }}
            className={`absolute inset-0 flex items-center justify-end bg-miss text-white ${compact ? 'rounded-2xl pr-3' : 'rounded-[20px] pr-5'}`}
          >
            <XIcon size={compact ? 18 : 22} strokeWidth={2.6} />
          </motion.div>
        </>
      )}

      <motion.div
        drag={pending ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        dragSnapToOrigin
        animate={pop}
        style={{ x, touchAction: 'pan-y' }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          setTimeout(() => (dragged.current = false), 50);
          if (info.offset.x > SWIPE) done();
          else if (info.offset.x < -SWIPE) {
            haptic(8);
            onMiss();
          }
        }}
        className={`relative flex border border-line bg-surface ${
          compact ? 'min-h-[54px] items-start gap-2 rounded-2xl py-2.5 pr-6 pl-2.5' : 'min-h-[64px] items-center gap-3.5 rounded-[20px] px-4 py-3'
        }`}
      >
        {flash > 0 && (
          <motion.span
            key={flash}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: status === 'missed' ? 'var(--miss)' : accentVar }}
            initial={{ opacity: 0.32 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
        <StatusButton status={status} onClick={pending ? done : onUndo} compact={compact} />
        <div
          className={`min-w-0 flex-1 ${onOpen ? 'cursor-pointer' : ''}`}
          onClick={() => {
            if (!dragged.current) onOpen?.();
          }}
        >
          <div className={`flex gap-1.5 ${compact ? 'items-start' : 'items-center gap-2'}`}>
            {leading && <span className={compact ? 'mt-[3px]' : ''}>{leading}</span>}
            <motion.span
              animate={{ opacity: pending ? 1 : 0.55 }}
              className={`font-medium tracking-[-0.01em] ${compact ? 'line-clamp-3 text-[13.5px] leading-[1.25]' : 'truncate text-[15.5px]'} ${
                status === 'done' ? 'line-through decoration-[1.5px] decoration-(--accent)/60' : ''
              }`}
            >
              {title}
            </motion.span>
          </div>
          {subtitle && <div className={`truncate text-muted ${compact ? 'mt-1 text-[12px]' : 'mt-0.5 text-[13px]'}`}>{subtitle}</div>}
          {badge && <div className="mt-1">{badge}</div>}
        </div>
        {trailing}
        {pending && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => {
              haptic(8);
              onMiss();
            }}
            aria-label={`I didn't do ${title}`}
            className={`grid shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-miss ${
              compact ? "absolute top-1 right-0.5 size-7 before:absolute before:content-[''] before:-inset-2" : "relative size-9 before:absolute before:content-[''] before:-inset-1"
            }`}
          >
            <XIcon size={compact ? 13 : 18} />
          </motion.button>
        )}
      </motion.div>
    </motion.li>
  );
}

function StatusButton({ status, onClick, compact }: { status: RowStatus; onClick: () => void; compact?: boolean }) {
  const fill =
    status === 'done'
      ? 'var(--accent)'
      : status === 'missed'
        ? 'var(--miss)'
        : status === 'carried'
          ? 'var(--surface-3)'
          : 'transparent';
  return (
    <motion.button
      whileTap={{ scale: 0.8 }}
      onClick={onClick}
      aria-label={status === 'pending' ? 'Mark done' : 'Undo'}
      className={`relative grid shrink-0 place-items-center before:absolute before:content-[''] ${compact ? 'size-7 before:-inset-2' : 'size-8 before:-inset-1.5'}`}
    >
      <motion.span
        className="absolute inset-0 rounded-full border-2"
        animate={{
          backgroundColor: fill,
          borderColor: status === 'pending' ? 'var(--line-strong)' : 'rgba(0,0,0,0)',
          scale: status === 'pending' ? 1 : [1, 1.18, 1],
        }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
      <svg width="20" height="20" viewBox="0 0 24 24" className="relative" fill="none" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
        {status === 'done' && (
          <motion.path
            d="M6 12.5l4 4L18 8.5"
            stroke="rgba(0,0,0,0.78)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, delay: 0.08, ease: 'easeOut' }}
          />
        )}
        {status === 'missed' && (
          <motion.path
            d="M8 8l8 8M16 8l-8 8"
            stroke="white"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3 }}
          />
        )}
        {status === 'carried' && (
          <motion.path
            d="M6 12h11M13 8l4 4-4 4"
            stroke="var(--muted)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </svg>
    </motion.button>
  );
}
