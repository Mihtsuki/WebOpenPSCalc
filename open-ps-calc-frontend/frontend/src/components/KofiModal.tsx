import { useEffect, useRef, useState } from "react";
import { statsApi } from "../api/client";

const KOFI_PAGE = "I7A322JOTP";
// The Ko-fi *donation form* (amount buttons + PayPal/card, guest checkout) — not
// the full profile page. Rendered inline so tipping never leaves the calc.
const KOFI_EMBED = `https://ko-fi.com/${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;
// Where to send anyone the embed fails for. Ko-fi's own page works everywhere the
// iframe doesn't, which is the whole point of offering it.
const KOFI_DIRECT = `https://ko-fi.com/${KOFI_PAGE}`;

// How long to wait before assuming the embed isn't coming. It is a THIRD-PARTY
// iframe: uBlock Origin, Brave shields, Firefox strict mode and Safari's storage
// partitioning can all stop it loading, and 35% of visitors are on mobile (23% of
// them iOS/Safari, the least forgiving of the lot). Before this, a blocked embed
// showed an empty white pane with no way out — the likeliest reason 50 donate
// clicks produced one donation.
const STALL_MS = 6000;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KofiModal({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const loggedLoad = useRef(false);
  // "loading" → "ready" once the iframe reports load, or → "stalled" on timeout.
  const [state, setState] = useState<"loading" | "ready" | "stalled">("loading");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Reset per opening, and start the stall timer. Recorded as FEATURE events, not
  // donate ones: donate_click is the intent metric on the stats page and must keep
  // meaning "someone asked to donate" — burying it under embed telemetry would
  // destroy the number this is meant to diagnose.
  useEffect(() => {
    if (!open) { setState("loading"); loggedLoad.current = false; return; }
    const t = setTimeout(() => {
      setState((s) => (s === "ready" ? s : "stalled"));
      statsApi.trackFeature("kofi_embed_stalled");
    }, STALL_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  // A slow embed that arrives after the timeout should still replace the fallback —
  // a working form beats an apology. The stall was already recorded either way, so
  // the diagnostic survives even when the outcome is fine.
  const onFrameLoad = () => {
    setState("ready");
    // The iframe can fire load again as the visitor moves through Ko-fi's own
    // steps; count the embed as delivered once per opening, not once per step.
    if (!loggedLoad.current) {
      loggedLoad.current = true;
      statsApi.trackFeature("kofi_embed_loaded");
    }
  };

  return (
    <div className="kofi-overlay" onClick={onClose} role="presentation">
      <div
        className="kofi-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Support Open PS Calc on Ko-fi"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kofi-modal-head">
          <div className="kofi-modal-msg">
            <span className="kofi-modal-title">🍵 Enjoying the calc?</span>
            <span className="kofi-modal-sub">
              A free fan project — chipping in helps cover hosting costs and keeps new reworks coming. Thank you!
            </span>
          </div>
          <button ref={closeRef} className="kofi-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="kofi-modal-frame">
          {state === "stalled" && (
            <div className="kofi-fallback">
              <p className="kofi-fallback-title">The Ko-fi form didn't load.</p>
              <p className="kofi-fallback-sub">
                A browser extension or privacy setting is usually the cause — it blocks the embedded
                form, not the page itself.
              </p>
              <a
                className="kofi-fallback-cta"
                href={KOFI_DIRECT}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => statsApi.trackFeature("kofi_fallback_click")}
              >
                Open Ko-fi in a new tab →
              </a>
            </div>
          )}
          <iframe
            title="Support Open PS Calc on Ko-fi"
            src={KOFI_EMBED}
            onLoad={onFrameLoad}
            // Height comes from the flex pane, not a fixed 680px. The old value was
            // taller than a phone viewport, so a third of visitors got a cramped
            // double-scrolling box inside an already-scrolling modal.
            className="kofi-iframe"
            style={{ display: state === "stalled" ? "none" : "block" }}
          />
        </div>

        {/* Always available, not only on failure: some browsers render a partial
            form that never errors, and a visible escape hatch costs nothing. */}
        <div className="kofi-modal-foot">
          <a
            href={KOFI_DIRECT}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => statsApi.trackFeature("kofi_direct_link")}
          >
            Having trouble? Open Ko-fi in a new tab
          </a>
        </div>
      </div>
    </div>
  );
}
