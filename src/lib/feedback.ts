import confetti from 'canvas-confetti';

export const haptic = (pattern: number | number[] = 10) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
};

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const colors = () => {
  const s = getComputedStyle(document.documentElement);
  return ['--habit', '--plan', '--gold'].map((v) => s.getPropertyValue(v).trim() || '#ffffff');
};

/** Small burst — all habits done. */
export const celebrateSmall = () => {
  if (reduced()) return;
  confetti({ particleCount: 60, spread: 70, startVelocity: 32, origin: { y: 0.3 }, colors: colors(), scalar: 0.9, disableForReducedMotion: true });
};

/** Big celebration — perfect day. */
export const celebrateBig = () => {
  if (reduced()) return;
  const c = colors();
  const fire = (x: number, angle: number) =>
    confetti({ particleCount: 80, angle, spread: 60, startVelocity: 55, origin: { x, y: 0.7 }, colors: c, disableForReducedMotion: true });
  fire(0, 60);
  fire(1, 120);
  setTimeout(() => confetti({ particleCount: 120, spread: 100, origin: { y: 0.35 }, colors: c, disableForReducedMotion: true }), 250);
};
