interface Props {
  /** The attack/cast cycle in ms — period_ms from the result, or the ASPD attack delay. */
  periodMs: number;
  /** Animation delay: 2 × (2000 − ASPD×10) ms. The time one swing occupies. */
  adelayMs: number;
  /** A skill's cadence rather than a plain swing: changes the wording and the last row. */
  isSkill?: boolean;
}

/** "0.57 s (566 ms)" — the two units players actually quote these timings in. */
function fmtTime(ms: number) {
  return `${(ms / 1000).toFixed(2)} s (${Math.round(ms)} ms)`;
}

/**
 * The attack/cast rate readout, shared by the damage panel's ASPD metric and the
 * Combat stats ASPD card so the two can never drift apart.
 *
 * Two representations, because those are the two players look for: attacks per second,
 * and the time between attacks (2 atk/s = 0.5 s). For a skill the animation delay is
 * printed beside its cast cadence, since lining those two up is what the numbers are
 * for — but the panel states no rule about which one wins. Explaining the mechanic is
 * the wiki's job; this is a readout.
 *
 * The only note kept is the one that qualifies the number itself: a cycle can carry
 * more than one hit, so this is not hits per second.
 */
export default function AttackRateNote({ periodMs, adelayMs, isSkill = false }: Props) {
  const perSec = 1000 / periodMs;

  return (
    <>
      <strong>{isSkill ? "Cast rate" : "Attack rate"}</strong>
      {isSkill
        ? "How often this skill comes round again."
        : "What your ASPD actually buys you, for a normal attack."}
      <div className="tooltip-row">
        <span>Per second</span>
        <span>{perSec.toFixed(2)} {isSkill ? "casts/s" : "atk/s"}</span>
      </div>
      <div className="tooltip-row">
        <span>Between {isSkill ? "casts" : "attacks"}</span>
        <span>{fmtTime(periodMs)}</span>
      </div>
      {isSkill ? (
        <div className="tooltip-row">
          <span>Animation delay</span>
          <span>{fmtTime(adelayMs)}</span>
        </div>
      ) : (
        <div className="tooltip-row"><span>Formula</span><span>50 ÷ (200 − ASPD)</span></div>
      )}
      {!isSkill && (
        <div className="tooltip-note">
          Attack cycles, not hits — a katar's second hit, dual-wield's third hit and multi-hit
          skills all land inside one cycle.
        </div>
      )}
    </>
  );
}
