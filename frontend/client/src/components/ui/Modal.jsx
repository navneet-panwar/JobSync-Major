import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal — the design-system dialog.
 *
 * Uses the card tokens and the same 0.2s scale/fade transition as the rest of
 * the app. Rendered through a portal so a modal opened from inside a table row
 * is never clipped by the row's overflow.
 *
 * Behaviour that matters: Escape closes, clicking the backdrop closes, the
 * panel itself does not, and body scroll is locked while open.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative w-full max-w-lg rounded-[20px] bg-[var(--surface)] border border-[var(--border)] shadow-hover",
              className,
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start justify-between gap-4 p-6 pb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--ink)]">
                  {title}
                </h2>
                {description && (
                  <p className="text-xs text-[var(--ink-muted)] mt-1 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="h-8 w-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-6 pb-6">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border)]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default Modal;
