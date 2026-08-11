interface Props {
  /** The attack/cast cycle in ms — period_ms from the result, or the ASPD attack delay. */
  periodMs: number;
  /** Animation delay: 2 × (2000 − ASPD×10) ms. The time one swing occupies. */
  adelayMs: number;
  /** A skill's cadence rather than a plain swing: changes the wording and the rows. */
  isSkill?: boolean;
  /** Cast time in ms, after DEX / Bragi / gear reductions. Skills only. */
  castMs?: number;
  /** After-cast delay in ms, after reductions. Skills only. */
  afterCastMs?: number;
  /** Fixed cooldown in ms, if the skill has one. Not reducible the way a delay is. */
  cooldownMs?: number;
}

/** "0.57 s (566 ms)" — the two units players actually quote these timings in. */
function fmtTime(ms: number) {
  return `${(ms / 1000).toFixed(2)} s (${Math.round(ms)} ms)`;
}

/**
 * The attack/cast rate readout, shared by the damage panel's ASPD metric and the
 * Combat stats ASPD card so the two can never drift apart.
 *
 * Shows the BASE timings and two derivatives, per gibz: cast time, after-cast delay
 * and animation delay are the three independent numbers a caster works with —
 * expressed separately because you tune the animation delay AGAINST the after-cast
 * delay — and "between casts" is the combined figure that per-second comes from.
 * Which of the timings wins is left to the reader; explaining the mechanic is the
 * wiki's job.
 *
 * A plain attack has no cast or after-cast delay, so its animation delay IS the
 * cycle, and the ASPD formula is shown in place of the missing rows.
 */
export default function AttackRateNote({ periodMs, adelayMs, isSkill = false, castMs, afterCastMs, cooldownMs }: Props) {
  const perSec = 1000 / periodMs;
  // A cycle shorter than one swing can only mean the animation floor wasn't applied
  // to this branch — the physical path takes max(cast + after-cast, animation), while
  // magic, traps and the skills with their own period don't (yet).
  const ignoresAnimation = periodMs < adelayMs - 1;

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
      {isSkill && castMs != null && (
        <div className="tooltip-row">
          <span>Cast time</span>
          <span>{castMs > 0 ? fmtTime(castMs) : "instant"}</span>
        </div>
      )}
      {isSkill && afterCastMs != null && (
        <div className="tooltip-row">
          <span>After-cast delay</span>
          <span>{fmtTime(afterCastMs)}</span>
        </div>
      )}
      {isSkill && cooldownMs != null && cooldownMs > 0 && (
        // Its own row, never folded into the delay above: a cooldown is fixed, so
        // Bragi and delayrate gear move one and not the other.
        <div className="tooltip-row">
          <span>Cooldown</span>
          <span>{fmtTime(cooldownMs)}</span>
        </div>
      )}
      <div className="tooltip-row">
        <span>Animation delay</span>
        <span>{fmtTime(adelayMs)}</span>
      </div>
      {isSkill && (
        // The cycle the three above resolve to, and what Per second is derived from.
        // Usually cast + after-cast; when a swing is slower it equals the animation
        // delay instead, and seeing the two rows match is the explanation.
        <div className="tooltip-row tooltip-row--total">
          <span>Between casts</span>
          <span>{fmtTime(periodMs)}</span>
        </div>
      )}
      {!isSkill && (
        <>
          <div className="tooltip-row"><span>Formula</span><span>50 ÷ (200 − ASPD)</span></div>
          <div className="tooltip-note">
            Attack cycles, not hits — a katar's second hit, dual-wield's third hit and multi-hit
            skills all land inside one cycle.
          </div>
        </>
      )}
      {isSkill && ignoresAnimation && (
        // Only when the cycle actually undercuts a swing: that is the case where the
        // figures above are optimistic, because those branches (magic, traps, and the
        // skills with their own period) don't floor at the animation delay yet. Where
        // the floor is applied — every plain physical skill — this would be noise.
        <div className="tooltip-note">
          Animation delay is not factored into Per second and Between casts yet.
        </div>
      )}
    </>
  );
}
