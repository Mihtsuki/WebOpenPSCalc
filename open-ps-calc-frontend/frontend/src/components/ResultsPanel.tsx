import { forwardRef } from "react";
import DamageSummary from "./DamageSummary";
import CompareView, { summaryMetrics, type ComparePin } from "./CompareView";
import SurvivabilityView from "./SurvivabilityView";
import { statsApi } from "../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  calcResult: any;
  calculating: boolean;
  error: string;
  forceProcs: boolean;
  onToggleForceProcs: () => void;
  pins: ComparePin[];
  onPin: () => void;
  onRemovePin: (id: string) => void;
  onLoadPin: (pin: ComparePin) => void;
  onClearPins: () => void;
  onOpenTip: () => void;
}

const ResultsPanel = forwardRef<HTMLDivElement, Props>(
  ({ open, onClose, calcResult, calculating, error, forceProcs, onToggleForceProcs, pins, onPin, onRemovePin, onLoadPin, onClearPins, onOpenTip }, ref) => {
    if (!open) return null;
    const live = summaryMetrics(calcResult);
    return (
      <div ref={ref} className="results-panel">
        <div className="results-panel-header">
          <h2>Damage breakdown</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="results-panel-body">
          {(live || pins.length > 0) && (
            <CompareView live={live} pins={pins} canPin={!!live} onPin={onPin} onRemove={onRemovePin} onLoad={onLoadPin} onClear={onClearPins} />
          )}
          {live && (
            <div className="results-section-head">
              <span className="results-section-title">Current build — full breakdown</span>
            </div>
          )}
          <DamageSummary
            calcResult={calcResult}
            calculating={calculating}
            error={error}
            forceProcs={forceProcs}
            onToggleForceProcs={onToggleForceProcs}
          />
          {calcResult?.incoming && !calculating && !error && (
            <SurvivabilityView incoming={calcResult.incoming} />
          )}
          {calcResult && !calculating && !error && (
            <div className="support-card">
              <span className="support-card-emoji">🍵</span>
              <div className="support-card-msg">
                <span className="support-card-head">Enjoying the calc?</span>
                <span className="support-card-sub">A fan project for the Payon Stories community — a $3 milk tea keeps it brewing.</span>
              </div>
              <button
                className="support-card-cta"
                onClick={() => { statsApi.trackDonateClick("results"); onOpenTip(); }}
              >
                Tip $3
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ResultsPanel.displayName = "ResultsPanel";
export default ResultsPanel;
