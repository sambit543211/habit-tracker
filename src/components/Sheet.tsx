import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Lock the page behind the sheet (stops iOS from scrolling it under your finger).
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow };
    Object.assign(b, { position: 'fixed', top: `-${y}px`, width: '100%', overflow: 'hidden' });
    return () => {
      Object.assign(b, prev);
      window.scrollTo(0, y);
    };
  }, [open]);
  // iOS keyboard: lift the sheet above it and keep the focused field in view.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // Keep the focused field visible by scrolling the sheet itself — never the page behind it.
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      const panel = panelRef.current;
      if (!el || !panel || !panel.contains(el) || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        const pr = panel.getBoundingClientRect();
        if (r.bottom > pr.bottom - 16 || r.top < pr.top + 56) panel.scrollBy({ top: r.top - pr.top - pr.height / 3, behavior: 'smooth' });
      }, 350);
    };
    document.addEventListener('focusin', onFocus);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.removeEventListener('focusin', onFocus);
      setKb(0);
    };
  }, [open]);
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
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            style={kb > 60 ? { bottom: kb, maxHeight: `calc(100dvh - ${kb}px - 24px)` } : undefined}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-line bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl no-scrollbar"
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
              className="sticky -top-3 z-10 -mx-5 -mt-3 mb-1 flex h-12 cursor-grab touch-none justify-center bg-surface pt-3"
              onPointerDown={(e) => controls.start(e)}
            >
              <div className="h-1.5 w-10 rounded-full bg-surface-3" />
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                aria-label="Close"
                className="absolute top-1.5 right-2 grid size-11 place-items-center rounded-full bg-surface-2 text-muted transition-colors active:bg-surface-3"
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
