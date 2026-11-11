import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { XIcon } from './icons';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Stacking order — later sheets sit above earlier ones */
  z?: number;
}

/** Bottom sheet with backdrop, spring entrance and drag-to-dismiss. */
export function Sheet({ open, onClose, children, z = 50 }: SheetProps) {
  const controls = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: z }}>
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-line bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl no-scrollbar"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="sticky -top-3 z-10 -mx-5 -mt-3 mb-1 flex h-12 cursor-grab touch-none justify-center bg-surface/90 pt-3 backdrop-blur"
              onPointerDown={(e) => controls.start(e)}
            >
              <div className="h-1.5 w-10 rounded-full bg-surface-3" />
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                aria-label="Close"
                className="absolute top-2.5 right-3 grid size-9 place-items-center rounded-full bg-surface-2 text-muted transition-colors active:bg-surface-3"
              >
                <XIcon size={17} strokeWidth={2.2} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
