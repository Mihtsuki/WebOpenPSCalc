/**
 * The ASPD → attack-rate explainer, shared by the damage panel's ASPD metric and the
 * Combat stats ASPD card so the two can never drift apart.
 *
 * A normal attack lands every attack-delay = 2 × (2000 − ASPD×10) ms, i.e.
 * 50 ÷ (200 − ASPD) per second. The damage panel derives its figure from the result's
 * period_ms and Combat stats from ASPD directly; both land on the same number.
 *
 * NB: that attack delay is also a FLOOR for skills — battlePipeline uses
 * max(cast + after-cast delay, adelay) — so ASPD is the limiter for any skill whose
 * delay is shorter than a swing (Bash runs at exactly adelay). Don't claim a skill's
 * rate is independent of ASPD.
 */
export default function AttackRateNote({ perSec }: { perSec: number }) {
  return (
    <>
      <strong>Attack rate</strong>
      What your ASPD actually buys you, for a normal attack.
      <div className="tooltip-row"><span>Per second</span><span>{perSec.toFixed(2)} atk/s</span></div>
      <div className="tooltip-row"><span>Between attacks</span><span>{Math.round(1000 / perSec)} ms</span></div>
      <div className="tooltip-row"><span>Formula</span><span>50 ÷ (200 − ASPD)</span></div>
      <div className="tooltip-note">
        Attack cycles, not hits — a katar's second hit, dual-wield's third hit and multi-hit
        skills all land inside one cycle.
      </div>
    </>
  );
}
