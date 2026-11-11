import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUI } from '../store';
import { haptic } from '../lib/feedback';

/** Bottom toast with an Undo action — lowers the fear of mis-taps. */
export function Toast() {
  const toast = useUI((s) => s.toast);
  const hide = useUI((s) => s.hideToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, 4000);
    return () => clearTimeout(t);
  }, [toast, hide]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),12px)+84px)] z-[65] flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="pointer-events-auto relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-2xl bg-text py-2.5 pr-2 pl-4 text-bg shadow-2xl"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: `var(--${toast.tone ?? 'habit'})` }}
            />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  haptic(8);
                  toast.undo?.();
                  hide();
                }}
                className="shrink-0 rounded-xl bg-plan px-3.5 py-1.5 text-[14px] font-bold text-white"
              >
                Undo
              </button>
            )}
            <motion.span
              className="absolute bottom-0 left-0 h-[2px] bg-plan/60"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 4, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
