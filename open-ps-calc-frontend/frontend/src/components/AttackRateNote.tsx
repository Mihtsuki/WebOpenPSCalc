interface Props {
  /** The attack/cast cycle in ms — period_ms from the result, or the ASPD attack delay. */
  periodMs: number;
  /** The ASPD-derived attack delay, 2 × (2000 − ASPD×10) ms — the floor a swing imposes. */
  adelayMs: number;
  /** A skill's cadence rather than a plain swing: changes what binds it, and the wording. */
  isSkill?: boolean;
  /** A magic cast: its period never floors at the swing, whatever the two values are. */
  isMagic?: boolean;
}

/**
 * The attack/cast rate explainer, shared by the damage panel's ASPD metric and the
 * Combat stats ASPD card so the two can never drift apart.
 *
 * A normal attack lands every attack-delay = 2 × (2000 − ASPD×10) ms, i.e.
 * 50 ÷ (200 − ASPD) per second. The damage panel passes the result's period_ms and
 * Combat stats the ASPD-derived delay; for an auto-attack they are the same number.
 *
 * For a skill, battlePipeline uses max(cast + after-cast delay, adelay) — so ASPD is
 * the limiter whenever the skill's own delay is shorter than a swing (Bash runs at
 * exactly adelay), and magic is the one case that ignores the swing floor entirely.
 * Which of the three binds is the useful thing to say, because it answers "will more
 * ASPD speed this up?".
 */
export default function AttackRateNote({ periodMs, adelayMs, isSkill = false, isMagic = false }: Props) {
  const perSec = 1000 / periodMs;
  // A magic cast never floors at the swing, so it is bound by its own timing even when
  // it happens to be the slower of the two — saying "longer than a swing" there would
  // give the right answer for the wrong reason.
  const ignoresSwing = isMagic || periodMs < adelayMs - 1;
  const aspdBound = !ignoresSwing && Math.abs(periodMs - adelayMs) <= 1;

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
        <span>{Math.round(periodMs)} ms</span>
      </div>
      {isSkill ? (
        <div className="tooltip-row">
          <span>Limited by</span>
          <span>
            {ignoresSwing ? "cast + after-cast delay"
              : aspdBound ? `your attack speed (${Math.round(adelayMs)} ms swing)`
              : `the skill's delay (swing: ${Math.round(adelayMs)} ms)`}
          </span>
        </div>
      ) : (
        <div className="tooltip-row"><span>Formula</span><span>50 ÷ (200 − ASPD)</span></div>
      )}
      <div className="tooltip-note">
        {isSkill
          ? (ignoresSwing
              ? "A cast isn't gated by the attack animation, so ASPD doesn't change this."
              : aspdBound
                ? "This skill's delay is shorter than a swing, so your attack speed sets the pace — more ASPD casts it more often."
                : "More ASPD won't speed this up: the skill's own delay is already longer than a swing.")
          : "Attack cycles, not hits — a katar's second hit, dual-wield's third hit and multi-hit skills all land inside one cycle."}
      </div>
    </>
  );
}
