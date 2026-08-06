import { useEffect, useRef } from "react";

const KOFI_PAGE = "I7A322JOTP";
// The Ko-fi *donation form* (amount buttons + PayPal/card, guest checkout) — not
// the full profile page. Rendered inline so tipping never leaves the calc.
const KOFI_EMBED = `https://ko-fi.com/${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KofiModal({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

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
              A free fan project — chipping in helps cover hosting costs and keeps new reworks coming. Thank you!
            </span>
          </div>
          <button ref={closeRef} className="kofi-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="kofi-modal-frame">
          <iframe
            title="Support Open PS Calc on Ko-fi"
            src={KOFI_EMBED}
            style={{ border: "none", width: "100%", height: "680px", display: "block" }}
          />
        </div>
      </div>
    </div>
  );
}
