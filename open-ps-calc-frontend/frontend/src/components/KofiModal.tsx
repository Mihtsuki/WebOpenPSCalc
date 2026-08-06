import { useEffect, useRef } from "react";

const KOFI_PAGE = "I7A322JOTP";
// The Ko-fi *donation form* (amount buttons + PayPal/card, guest checkout) — not
// the full profile page. Rendered inline so tipping never leaves the calc.
const KOFI_EMBED = `https://ko-fi.com/${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;
const KOFI_LINK = `https://ko-fi.com/${KOFI_PAGE}`;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * In-app Ko-fi tip panel. The existing "Support the calc" CTAs open this instead
 * of a new tab, dropping the user straight onto the payment form. Ko-fi's iframe
 * is cross-origin, so we can't detect a completed tip — that still comes from the
 * Ko-fi dashboard; the click that opens this is tracked as intent.
 */
export default function KofiModal({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while the modal is up.
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
        <div className="kofi-modal-frame">
          <iframe
            title="Support Open PS Calc on Ko-fi"
            src={KOFI_EMBED}
            style={{ border: "none", width: "100%", height: "100%", display: "block" }}
          />
        </div>
        <a className="kofi-modal-fallback" href={KOFI_LINK} target="_blank" rel="noreferrer">
          Form not loading? Open Ko-fi in a new tab →
        </a>
      </div>
    </div>
  );
}
