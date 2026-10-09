import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Modal focus discipline: move focus into the dialog, keep Tab cycling inside
 * it, and hand focus back to whatever opened it.
 *
 * Escape is deliberately NOT handled here. Each dialog owns that, because the
 * day sheet has to commit the draft before it closes.
 *
 * ponytail: handles the one modal pattern this app has. If a drawer or popover
 * ever needs the same, widen FOCUSABLE then, not before.
 */
export function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;

    const restore = document.activeElement as HTMLElement | null;
    root.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // only if the trigger is still on screen; otherwise focus lands on body
      if (restore && restore.isConnected) restore.focus();
    };
  }, [open]);

  return ref;
}
