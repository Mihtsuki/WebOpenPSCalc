import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * Shows an item's description on hover (or keyboard focus) of whatever it wraps.
 *
 * SearchPicker already does this for rows in its dropdown, so you could read a
 * card's effect while choosing it but not once it was equipped -- which is when
 * you actually want to check what the thing does. This is that same bubble
 * (`.search-tooltip`, position: fixed, so it escapes the panel's clipping)
 * attached to an already-equipped pill.
 *
 * Descriptions are immutable per item id, so the cache is module-scoped: the same
 * card sitting in four slots, or re-hovered later, costs one request per session.
 * `null` is cached too -- an item with no description shouldn't be re-fetched on
 * every hover.
 */
const descriptionCache = new Map<number, string | null>();

interface Props {
  /** Item id to describe. */
  id: number;
  /** Resolves the display text; falsy result means "no bubble". */
  fetchDescription: (id: number) => Promise<string | null>;
  /** Native tooltip, kept for callers that already had one on the wrapped span. */
  title?: string;
  className?: string;
  children: ReactNode;
}

export default function HoverDescription({ id, fetchDescription, title, className = "", children }: Props) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swapping the equipped item while its bubble is open would otherwise leave the
  // previous item's text on screen next to the new name.
  useEffect(() => setTip(null), [id]);

  // A pill can unmount while the open timer is still pending (Unequip, or a job
  // change that clears the slot) -- don't fire setState afterwards.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function show(el: HTMLElement) {
    if (timer.current) clearTimeout(timer.current);
    const rect = el.getBoundingClientRect();
    // Same 180ms as SearchPicker: long enough that sweeping the cursor across a
    // column of slots doesn't flash a bubble per slot.
    timer.current = setTimeout(() => {
      const cached = descriptionCache.get(id);
      if (cached !== undefined) {
        if (cached) setTip({ text: cached, x: rect.right, y: rect.top });
        return;
      }
      fetchDescription(id).then((text) => {
        descriptionCache.set(id, text);
        if (text) setTip({ text, x: rect.right, y: rect.top });
      }).catch(() => descriptionCache.set(id, null));
    }, 180);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setTip(null);
  }

  return (
    <span
      className={`hover-description ${className}`.trim()}
      title={title}
      tabIndex={0}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={hide}
    >
      {children}
      {tip && (
        <div className="search-tooltip" role="tooltip" style={{ left: tip.x + 10, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </span>
  );
}
