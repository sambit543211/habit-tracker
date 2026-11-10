import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

interface RingProps {
  value: number | null;
  color: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}

export function Ring({ value, color, size = 96, stroke = 9, children }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c, opacity: 0 }}
          animate={{ strokeDashoffset: c * (1 - v), opacity: v > 0 ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 55, damping: 15, mass: 0.9 }}
          style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 45%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={className}>{rounded}</motion.span>;
}
