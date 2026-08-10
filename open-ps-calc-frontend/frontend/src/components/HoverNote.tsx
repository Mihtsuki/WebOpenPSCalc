import { ReactNode } from "react";

interface Props {
  /** Bubble content — same shape as InfoTooltip: a <strong> title, prose, then .tooltip-row pairs. */
  note: ReactNode;
  /** Classes for the trigger itself, so it can BE the card it explains (metric, sec-stat-card…). */
  className?: string;
  children: ReactNode;
}

/**
 * A hover/focus explainer attached to an existing element instead of to an "i" icon.
 *
 * Renders the same bubble as InfoTooltip (shared `.info-tooltip-bubble` styling) so
 * every explained figure in the app looks and behaves alike — a native `title` looked
 * nothing like the rest of the UI and couldn't carry the label/value rows.
 * Focusable, so the note is reachable without a mouse.
 */
export default function HoverNote({ note, className = "", children }: Props) {
  return (
    <div className={`hover-note ${className}`.trim()} tabIndex={0}>
      {children}
      <span className="info-tooltip-bubble" role="tooltip">{note}</span>
    </div>
  );
}
