import { useEffect, useRef, useState } from "react";
import { statsApi } from "../api/client";

const KOFI_PAGE = "I7A322JOTP";
// The Ko-fi *donation form* (amount buttons + PayPal/card, guest checkout) — not
// the full profile page. Rendered inline so tipping never leaves the calc. Note:
// the form runs client-side inside a cross-site iframe, and some browsers (Safari
// ITP, Chrome with 3p-cookies off) block the storage it needs — so it can render
// only Ko-fi's header. The always-visible CTA below is the guaranteed fallback.
const KOFI_EMBED = `https://ko-fi.com/${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;
const KOFI_LINK = `https://ko-fi.com/${KOFI_PAGE}`;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KofiModal({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [frameError, setFrameError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFrameError(false);
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

  if (!open) return null;

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
              A free fan project — a <strong>$3</strong> milk tea keeps the server paid and new reworks coming. Thank you!
            </span>
          </div>
          <button ref={closeRef} className="kofi-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!frameError && (
          <div className="kofi-modal-frame">
            <iframe
              title="Support Open PS Calc on Ko-fi"
              src={KOFI_EMBED}
              onError={() => setFrameError(true)}
              style={{ border: "none", width: "100%", height: "680px", display: "block" }}
            />
          </div>
        )}

        <a
          className="kofi-modal-cta"
          href={KOFI_LINK}
          target="_blank"
          rel="noreferrer"
          onClick={() => statsApi.trackDonateClick("modal_cta")}
        >
          🍵 Tip $3 on Ko-fi →
        </a>
        <span className="kofi-modal-note">Opens Ko-fi's secure checkout · no account needed</span>
      </div>
    </div>
  );
}
