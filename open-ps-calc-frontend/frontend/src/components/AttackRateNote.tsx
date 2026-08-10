interface Props {
  /** The attack/cast cycle in ms — period_ms from the result, or the ASPD attack delay. */
  periodMs: number;
  /** Animation delay: 2 × (2000 − ASPD×10) ms. The time one swing occupies. */
  adelayMs: number;
  /** A skill's cadence rather than a plain swing: changes what binds it, and the wording. */
  isSkill?: boolean;
  /** A magic cast — the engine does not floor those at the animation delay (see below). */
  isMagic?: boolean;
}

/** "0.57 s (566 ms)" — the two units players actually quote these timings in. */
function fmtTime(ms: number) {
  return `${(ms / 1000).toFixed(2)} s (${Math.round(ms)} ms)`;
}

/**
 * The attack/cast rate explainer, shared by the damage panel's ASPD metric and the
 * Combat stats ASPD card so the two can never drift apart.
 *
 * Two representations, because those are the two players look for: attacks per second,
 * and the time between attacks (2 atk/s = 0.5 s). The second is what skill users line
 * up against a skill's after-cast delay: you fire on whichever is SLOWER, so a 0.5 s
 * after-cast delay under a 1 s animation still only casts once a second.
 *
 * That is exactly battlePipeline's max(cast + after-cast delay, adelay) for a physical
 * skill. Magic is the exception in the engine — its period is max(cast + delay, spam
 * cap), with no animation floor — so no verdict is printed for a cast: the panel shows
 * both timings and leaves the comparison to the reader rather than asserting a winner
 * the engine can't stand behind.
 */
export default function AttackRateNote({ periodMs, adelayMs, isSkill = false, isMagic = false }: Props) {
  const perSec = 1000 / periodMs;
  const aspdBound = !isMagic && Math.abs(periodMs - adelayMs) <= 1;
  const delayBound = !isMagic && periodMs > adelayMs + 1;

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
        // The two timings side by side, with no verdict on which one won: the engine
        // can't back that claim for magic, and putting the numbers next to each other
        // is what players do with them anyway.
        <div className="tooltip-row">
          <span>Animation delay</span>
          <span>{fmtTime(adelayMs)}</span>
        </div>
      ) : (
        <div className="tooltip-row"><span>Formula</span><span>50 ÷ (200 − ASPD)</span></div>
      )}
      <div className="tooltip-note">
        {!isSkill
          ? "Attack cycles, not hits — a katar's second hit, dual-wield's third hit and multi-hit skills all land inside one cycle."
          : isMagic
            ? ""
            : aspdBound
              ? "The after-cast delay is shorter than your animation, so ASPD sets the pace — AGI, Increase AGI, a Dancer's song or speed potions all cast it more often."
              : delayBound
                ? "The after-cast delay is longer than your animation, so more ASPD won't speed this up."
                : ""}
      </div>
    </>
  );
}
