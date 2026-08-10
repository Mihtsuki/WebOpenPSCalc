import { useState } from "react";
import HoverNote from "./HoverNote";
import AttackRateNote from "./AttackRateNote";

interface Step {
  name: string;
  value?: number;
  min_value?: number;
  max_value?: number;
  multiplier?: number;
  note?: string;
  formula?: string;
  info?: boolean;
  track_start?: boolean;  // opens a separate sub-track (Grand Cross' magic half) — no delta badge
}

interface SelfDamageRange { min: number; avg: number; max: number; }
interface SelfDamage {
  part1: SelfDamageRange;      // damage-based recoil, after the caster's own reductions (3 waves)
  part2: number;              // fixed casting cost: 20% of current HP per cast
  total: SelfDamageRange;     // part1 + part2
  per_wave: SelfDamageRange;
  waves: number;
  max_hp: number;
  current_hp: number;
  survives: boolean;          // survives an average-roll cast at current HP
  survives_worst: boolean;    // survives even a worst-case cast
  halved: boolean;            // players take half the recoil (battle.c:3805)
  reductions: {
    holy_resist: number;      // % (bSubEle Ele_Holy — e.g. Faith −50%, Talisman −7%)
    demihuman_resist: number; // % (bSubRace RC_DemiHuman — e.g. Thara Frog)
    def: number;              // caster hard DEF used (already ⅔ of normal), reduces the physical half
    mdef: number;             // caster hard MDEF (gear), reduces the magic half
    mdef_soft: number;        // caster soft MDEF (INT + VIT/2), subtracted from the magic half
    armor_element: string;
  };
}

interface DamageBranch {
  avg_damage: number;
  min_damage: number;
  max_damage: number;
  steps: Step[];
  self_damage?: SelfDamage;   // Grand Cross blowback (self-recoil) — only present for CR_GRANDCROSS
  // Crit lifesteal (bCritHeal — Crescent Scythe). HP returned to you on a crit,
  // not damage: never folded into the damage total or DPS.
  crit_heal?: { permille: number; min: number; max: number; avg: number };
}

interface FalconResult {
  per_hit: number;
  blitz_beat_lv: number;
  steel_crow_lv: number;
  auto_blitz_hits: number;
  auto_blitz_chance: number;
  auto_blitz_total: number;
  blitz_beat_total: number | null;
}

interface SingleResult {
  has_auto_bonuses?: boolean;
  status: { aspd: number };
  result: {
    hit_chance: number;
    crit_chance: number;
    normal: DamageBranch;
    crit?: DamageBranch;
    katar_second?: DamageBranch;
    katar_second_crit?: DamageBranch;
    katar_proc_chance?: number;
    dps_valid: boolean;
    dps: number;
    period_ms?: number;
    success_chance?: number | null; // Turn Undead: instant-kill success chance (%)
    dw_rh_factor?: number | null;
    dw_lh_factor?: number | null;
    dw_lh_normal?: DamageBranch | null;
    dw_lh_crit?: DamageBranch | null;
    dw_ps_bonus_pct?: number | null;
    proc_branches?: Record<string, DamageBranch>;
    proc_chances?: Record<string, number>;
    proc_labels?: Record<string, string>;
  };
  falcon?: FalconResult;
}

interface CalcResult {
  normal_attack: SingleResult;
  skill: SingleResult | null;
  selected_skill: { id: number; level: number; label: string };
  target_hp?: number | null; // monster HP (monster-mode only) for hits-to-kill / time-to-kill
  poison_dot_per_sec?: number | null; // Poison ailment damage-over-time (per second), folded into time-to-kill
}

interface Props {
  calcResult: CalcResult | null;
  calculating: boolean;
  error: string;
  forceProcs: boolean;
  onToggleForceProcs: () => void;
}

type Branch = "skill" | "normal" | "crit" | "falcon" | "katar";
type DwMode = "ps" | "vanilla";

function stepDisplayVal(step: Step): string {
  const hasRange = step.min_value != null && step.max_value != null
    && Math.round(step.min_value) !== Math.round(step.max_value);
  if (hasRange) return `${Math.round(step.min_value!)}–${Math.round(step.max_value!)}`;
  return step.value != null ? String(Math.round(step.value)) : "—";
}


// Compact inline badge showing what this step did to the running total: a ×multiplier
// (boost/reduce) or a +/− flat delta. Empty for pure passthroughs.
//
// The right-hand column is ALWAYS the running total after the step (the engine
// guarantees it), so the delta below is meaningful — except where a step opens a
// separate sub-track (Grand Cross' magic half starts over at Base MATK), which is
// flagged with track_start so we don't badge a jump that isn't a change.
function connectorInfo(step: Step, prev: Step): { badge: string; cls: string } {
  if (step.track_start) return { badge: "", cls: "conn-pass" };
  const m = step.multiplier ?? 1.0;
  if (Math.abs(m - 1.0) > 0.001) {
    return { badge: `×${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2)}`, cls: m >= 1 ? "conn-boost" : "conn-reduce" };
  }
  const delta = Math.round((step.value ?? 0) - (prev.value ?? 0));
  if (delta > 0) return { badge: `+${delta.toLocaleString()}`, cls: "conn-add" };
  if (delta < 0) return { badge: `−${(-delta).toLocaleString()}`, cls: "conn-sub" };
  return { badge: "", cls: "conn-pass" };
}

function PipelineView({ steps, hideFinal = false, legend = true }: { steps: Step[]; hideFinal?: boolean; legend?: boolean }) {
  // Notes are hidden by default (hover reveals, tap pins) to keep the breakdown compact.
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  const chips = steps.filter(s => s.info);
  const visible = steps.filter(s => !s.info);
  // Hide pure no-op passthrough rows — multiplier ≈ 1 AND value unchanged from the
  // previous step (e.g. a bypassed "Card Fix" on Grand Cross) — so a real multiplier
  // connector isn't left visually sitting under a row that did nothing. Always keep
  // the base row and the final total.
  const nodes = visible.filter((s, i) => {
    if (i === 0 || s.name === "Final Damage") return true;
    const m = s.multiplier ?? 1.0;
    const unchanged = Math.round(s.value ?? 0) === Math.round(visible[i - 1].value ?? 0);
    return !(Math.abs(m - 1) < 0.001 && unchanged);
  }).filter((s) => !(hideFinal && s.name === "Final Damage")); // final shown separately as a prominent total
  return (
    <div className="pipeline-view">
      {chips.length > 0 && (
        <div className="pipeline-inputs">
          {chips.map((s, i) => (
            <span key={i} className="pipeline-chip" title={s.note || undefined}>
              <span className="pipeline-chip-label">{s.name}</span>
              <span className="pipeline-chip-val">{stepDisplayVal(s)}</span>
            </span>
          ))}
        </div>
      )}
      <div className="pl-track">
        {/* Column legend — the left badge is what the step CHANGED, the right number
            is the running damage total after it (a range when the roll isn't fixed). */}
        {legend && (
          <div className="pl-legend">
            <span className="pl-badge">change</span>
            <span className="pl-name">step</span>
            <span className="pl-dots" aria-hidden="true" />
            <span className="pl-val">running total</span>
          </div>
        )}
        {nodes.map((step, i) => {
          const prev = nodes[i - 1];
          const conn = prev ? connectorInfo(step, prev) : null;
          const isFinal = step.name === "Final Damage";
          const hasNote = !!step.note && !isFinal;
          const isOpen = open.has(i);
          return (
            <div className="pl-step" key={i}>
              <div
                className={`pl-row${isFinal ? " pl-row--final" : ""}${hasNote ? " pl-row--note" : ""}`}
                onClick={hasNote ? () => toggle(i) : undefined}
                title={hasNote ? step.note : undefined}
              >
                <span className={`pl-badge ${conn ? conn.cls : ""}`}>{conn ? conn.badge : ""}</span>
                <span className="pl-name">{step.name}</span>
                <span className="pl-dots" aria-hidden="true" />
                <span className="pl-val">{stepDisplayVal(step)}</span>
              </div>
              {hasNote && <div className={`pl-note${isOpen ? " open" : ""}`}>{step.note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FalconView({ falcon }: { falcon: FalconResult }) {
  return (
    <div className="falcon-rows">
      {falcon.auto_blitz_hits >= 1 && (
        <div className="falcon-row">
          <span className="falcon-label">Auto-blitz ({falcon.auto_blitz_chance}% chance, {falcon.auto_blitz_hits} hit{falcon.auto_blitz_hits > 1 ? "s" : ""})</span>
          <span className="falcon-value">{falcon.auto_blitz_total}</span>
        </div>
      )}
      {falcon.blitz_beat_total != null && (
        <div className="falcon-row">
          <span className="falcon-label">Blitz Beat Lv {falcon.blitz_beat_lv} ({falcon.blitz_beat_lv} × {falcon.per_hit})</span>
          <span className="falcon-value">{falcon.blitz_beat_total}</span>
        </div>
      )}
      <div className="falcon-note">
        Steel Crow Lv {falcon.steel_crow_lv} · bypasses DEF · neutral element vs target
      </div>
    </div>
  );
}

function SelfDamageView({ sd }: { sd: SelfDamage }) {
  const n = (v: number) => Math.round(v).toLocaleString();
  // Show the min–max range when one exists; fall back to a single value otherwise
  // (no separate average — the range already conveys it).
  const rng = (x: SelfDamageRange) =>
    Math.round(x.min) !== Math.round(x.max) ? `${n(x.min)}–${n(x.max)}` : n(x.avg);
  const r = sd.reductions;
  const hasResist = r.holy_resist > 0 || r.demihuman_resist > 0;
  const lostPct = sd.max_hp > 0 ? Math.round((sd.total.avg / sd.max_hp) * 100) : 0;
  return (
    <div className="self-damage">
      <div className="self-damage-head">
        <span className="self-damage-title">Self-damage per cast</span>
        <span className="self-damage-sub">Grand Cross recoils onto the caster</span>
      </div>

      <div className="self-damage-part">
        <div className="self-damage-part-row">
          <span className="self-damage-part-label">Part 1 — Holy recoil, vs your DEF/MDEF{sd.halved ? " (halved)" : ""}</span>
          <span className="self-damage-part-val">{rng(sd.part1)}</span>
        </div>
        <div className="self-damage-resists">
          {r.holy_resist > 0 && <span className="self-damage-chip good">Holy resist −{r.holy_resist}%</span>}
          {r.demihuman_resist > 0 && <span className="self-damage-chip good">Demi-Human −{r.demihuman_resist}%</span>}
          {!hasResist && <span className="self-damage-chip muted">no Holy / Demi-Human resist</span>}
          <span className="self-damage-chip muted">DEF {n(r.def)}</span>
          <span className="self-damage-chip muted">MDEF {n(r.mdef)} + {n(r.mdef_soft)} soft</span>
          <span className="self-damage-chip muted">{r.armor_element} armor</span>
        </div>
      </div>

      <div className="self-damage-part">
        <div className="self-damage-part-row">
          <span className="self-damage-part-label">Part 2 — 20% current HP, fixed</span>
          <span className="self-damage-part-val">{n(sd.part2)}</span>
        </div>
        <div className="self-damage-resists">
          <span className="self-damage-chip muted">ignores all reductions</span>
        </div>
      </div>

      <div className="self-damage-total">
        <span className="self-damage-total-label">Total HP lost / cast</span>
        <span className="self-damage-total-val">{rng(sd.total)}</span>
        <span className="self-damage-total-pct">{lostPct}% of {n(sd.max_hp)} MaxHP</span>
      </div>

      <div className={`self-damage-survive ${sd.survives_worst ? "ok" : sd.survives ? "warn" : "bad"}`}>
        {sd.survives_worst
          ? `Survivable — even a worst-case cast leaves ${n(sd.current_hp - sd.total.max)} HP.`
          : sd.survives
            ? `Risky — an average cast leaves ${n(sd.current_hp - sd.total.avg)} HP, but a worst-case cast would kill you.`
            : `Fatal — an average cast (${n(sd.total.avg)}) exceeds your ${n(sd.current_hp)} HP.`}
      </div>
    </div>
  );
}

// Sage Auto Spell / "Hindsight" autocast — a magic spell that fires at a flat
// chance on the physical attack shown above. Surfaces the per-proc damage and
// its full pipeline; its expected value is already folded into the DPS estimate.
function AutoSpellView({ branch, chance, label }: { branch: DamageBranch; chance: number; label: string }) {
  const n = (v: number) => Math.round(v).toLocaleString();
  const range = Math.round(branch.min_damage) !== Math.round(branch.max_damage)
    ? `${n(branch.min_damage)}–${n(branch.max_damage)}`
    : n(branch.avg_damage);
  return (
    <div className="breakdown-view">
      <div className="breakdown-head">
        <span className="breakdown-title">Auto Spell (Hindsight)</span>
        <span className="breakdown-sub">{label} · {chance}% per physical attack</span>
      </div>
      <PipelineView steps={branch.steps} hideFinal />
      <div className="breakdown-total">
        <span className="breakdown-total-label">Per-proc damage</span>
        <span className="breakdown-total-val">{range}</span>
      </div>
      <div className="self-damage-resists" style={{ marginTop: "0.5rem" }}>
        <span className="self-damage-chip muted">assumes the spell is learned</span>
        <span className="self-damage-chip muted">expected value folded into DPS</span>
      </div>
    </div>
  );
}

// Auto Blitz Beat — a Falcon Hunter/Sniper's bow auto-attack has a ⌊LUK/3⌋%
// chance to auto-cast Blitz Beat. Fixed damage (no range), bypasses DEF; its
// expected value is already folded into the DPS of the attack shown above. Shown
// inline under the Normal tab so the proc's influence sits next to the DPS.
function AutoBlitzView({ branch, chance, dpsAdded }: { branch: DamageBranch; chance: number; dpsAdded: number | null }) {
  const n = (v: number) => Math.round(v).toLocaleString();
  const note = branch.steps[0]?.note;
  return (
    <div className="breakdown-view">
      <div className="breakdown-head">
        <span className="breakdown-title">Auto Blitz Beat</span>
        <span className="breakdown-sub">falcon proc · {chance}% per bow auto-attack</span>
      </div>
      {note && <div className="pl-note open" style={{ marginBottom: "0.5rem" }}>{note}</div>}
      <div className="breakdown-total">
        <span className="breakdown-total-label">Damage per proc</span>
        <span className="breakdown-total-val">{n(branch.avg_damage)}</span>
      </div>
      {dpsAdded != null && dpsAdded > 0 && (
        <div className="breakdown-total">
          <span className="breakdown-total-label">≈ DPS added</span>
          <span className="breakdown-total-val">+{n(dpsAdded)}</span>
        </div>
      )}
      <div className="self-damage-resists" style={{ marginTop: "0.5rem" }}>
        <span className="self-damage-chip muted">bypasses DEF · neutral element</span>
        <span className="self-damage-chip muted">already folded into the DPS above</span>
      </div>
    </div>
  );
}

// Card autocast on a physical attack (`bonus3 bAutoSpell,...`) — Pirate Skel Card's
// auto-Mammonite, Rekenber Mercenary Card's auto-Bash. The proc rides on the swing
// with no extra attack time, so its expected value is already inside the DPS above;
// this panel shows what one proc actually hits for, and what it contributes.
function CardAutocastView({ branch, chance, label, dpsAdded }: {
  branch: DamageBranch; chance: number; label: string; dpsAdded: number | null;
}) {
  const n = (v: number) => Math.round(v).toLocaleString();
  const range = Math.round(branch.min_damage) !== Math.round(branch.max_damage)
    ? `${n(branch.min_damage)}–${n(branch.max_damage)}`
    : n(branch.avg_damage);
  return (
    <div className="breakdown-view">
      <div className="breakdown-head">
        <span className="breakdown-title">Card autocast — {label}</span>
        <span className="breakdown-sub">{chance}% per physical attack</span>
      </div>
      <PipelineView steps={branch.steps} hideFinal />
      <div className="breakdown-total">
        <span className="breakdown-total-label">Per-proc damage</span>
        <span className="breakdown-total-val">{range}</span>
      </div>
      {dpsAdded != null && dpsAdded > 0 && (
        <div className="breakdown-total">
          <span className="breakdown-total-label">≈ DPS added</span>
          <span className="breakdown-total-val">+{n(dpsAdded)}</span>
        </div>
      )}
      <div className="self-damage-resists" style={{ marginTop: "0.5rem" }}>
        <span className="self-damage-chip muted">auto-attacks only</span>
        <span className="self-damage-chip muted">already folded into the DPS above</span>
      </div>
    </div>
  );
}

function DualWieldStepList({ rh, lh, rhFactor, lhFactor, isCrit, psBonusPct }: {
  rh: DamageBranch; lh: DamageBranch;
  rhFactor: number; lhFactor: number; isCrit: boolean; psBonusPct?: number;
}) {
  const rhPct = (rhFactor * 100).toFixed(0);
  const lhPct = (lhFactor * 100).toFixed(0);
  return (
    <>
      <div className="dw-section-label">Hit 1 &amp; 2 — RH {isCrit ? "crit" : "hit"} × {rhPct}% each</div>
      <PipelineView steps={rh.steps} />
      <div className="dw-section-label" style={{ marginTop: "0.75rem" }}>Hit 3 — LH {isCrit ? "crit" : "hit"} × {lhPct}%</div>
      <PipelineView steps={lh.steps} legend={false} />
      {psBonusPct != null && psBonusPct > 0 && (
        <div className="dw-ps-bonus-row">
          <span className="dw-ps-bonus-label">PS Dual-Wield Bonus</span>
          <span className="dw-ps-bonus-val">×{(1 + psBonusPct / 100).toFixed(2)}</span>
          <span className="dw-ps-bonus-note">applied to combined total (+{psBonusPct}%)</span>
        </div>
      )}
    </>
  );
}

export default function DamageSummary({ calcResult, calculating, error, forceProcs, onToggleForceProcs }: Props) {
  const [branch, setBranch] = useState<Branch>("skill");
  const [dwMode, setDwMode] = useState<DwMode>("ps");

  if (error) return <div className="notice warn">{error}</div>;
  if (calculating) return <p className="spinner-text">Calculating…</p>;
  if (!calcResult) return <p className="hint-text">Set up a build and target, then calculate damage.</p>;

  const { normal_attack, skill: skillResult, selected_skill, target_hp, poison_dot_per_sec } = calcResult;
  const hasAutoBonus = !!normal_attack.has_auto_bonuses;
  const hasSkill = skillResult !== null && selected_skill.id !== 0;
  const primary = hasSkill ? skillResult! : normal_attack;
  const hasCrit = !!primary.result.crit;
  const falcon = (skillResult ?? normal_attack)?.falcon;
  const hasFalcon = !!falcon;
  const hasKatar = !!normal_attack.result.katar_second;

  // Dual-wield (PS Assassin) — auto-attacks only
  const hasDualWield = !hasSkill && normal_attack.result.dw_rh_factor != null;
  const dwRhFactor = normal_attack.result.dw_rh_factor ?? 1;
  const dwLhFactor = normal_attack.result.dw_lh_factor ?? 1;
  const dwLhNormal = normal_attack.result.dw_lh_normal ?? null;
  const dwLhCrit = normal_attack.result.dw_lh_crit ?? null;
  const dwPsBonusPct = normal_attack.result.dw_ps_bonus_pct ?? 0;
  const dwPsBonusMult = 1 + dwPsBonusPct / 100;

  // Vanilla DPS: recompute single-weapon DPS from period_ms
  const periodMs = normal_attack.result.period_ms ?? 0;
  const rawNormalAvg = normal_attack.result.normal.avg_damage;
  const rawCritAvg = normal_attack.result.crit?.avg_damage ?? rawNormalAvg;
  const h = normal_attack.result.hit_chance / 100;
  const ec = normal_attack.result.crit_chance / 100;
  const vanillaDps = periodMs > 0
    ? (rawNormalAvg * (1 - ec) * h + rawCritAvg * ec) / (periodMs / 1000)
    : null;

  // Clamp branch to valid options
  const activeBranch: Branch =
    branch === "skill" && !hasSkill ? "normal"
    : branch === "crit" && !hasCrit ? (hasSkill ? "skill" : "normal")
    : branch === "falcon" && !hasFalcon ? (hasSkill ? "skill" : "normal")
    : branch === "katar" && !hasKatar ? (hasSkill ? "skill" : "normal")
    : branch;

  const activeResult: SingleResult = (activeBranch === "normal" || activeBranch === "katar") ? normal_attack : primary;
  // Auto Spell (Hindsight) proc branch — present only on a physical attack that
  // has Hindsight active. Tied to the attack currently in view (magic skills
  // don't autocast, so it's absent there).
  const autoSpellDamage = activeResult.result.proc_branches?.autospell ?? null;
  const autoSpell = autoSpellDamage
    ? {
        branch: autoSpellDamage,
        chance: activeResult.result.proc_chances?.autospell ?? 30,
        label: activeResult.result.proc_labels?.autospell ?? "",
      }
    : null;
  // Auto Blitz Beat proc — shown inline (not on the Falcon tab) so its DPS
  // influence sits next to the attack it rides on. ≈ DPS = chance × per-proc /
  // attack period (the exact value is already folded into the DPS shown above).
  const autoBlitzDamage = activeResult.result.proc_branches?.auto_blitz ?? null;
  const autoBlitz = autoBlitzDamage && activeBranch !== "falcon"
    ? {
        branch: autoBlitzDamage,
        chance: activeResult.result.proc_chances?.auto_blitz ?? 0,
        dpsAdded: periodMs > 0
          ? (autoBlitzDamage.avg_damage * (activeResult.result.proc_chances?.auto_blitz ?? 0) / 100) / (periodMs / 1000)
          : null,
      }
    : null;
  // Card autocasts on a physical attack (Pirate Skel Card → Mammonite, Rekenber
  // Mercenary Card → Bash). One branch per autocast skill, keyed card_autocast_*.
  const cardAutocasts = Object.entries(activeResult.result.proc_branches ?? {})
    .filter(([key]) => key.startsWith("card_autocast_"))
    .map(([key, branch]) => ({
      key,
      branch,
      chance: activeResult.result.proc_chances?.[key] ?? 0,
      label: activeResult.result.proc_labels?.[key] ?? "",
      dpsAdded: periodMs > 0
        ? (branch.avg_damage * (activeResult.result.proc_chances?.[key] ?? 0) / 100) / (periodMs / 1000)
        : null,
    }));
  const activeDamage: DamageBranch | null = activeBranch === "falcon"
    ? null
    : activeBranch === "katar" ? (normal_attack.result.katar_second ?? null)
    : activeBranch === "crit" ? primary.result.crit!
    : activeResult.result.normal;

  const notImplemented = activeDamage?.steps?.length === 1 && activeDamage.steps[0].name === "Not yet implemented";
  const { result, status } = activeResult;

  // Attack/cast rate beside ASPD. Always taken from period_ms — the very number the
  // DPS divides by — so the two can't disagree; for an auto-attack that equals the
  // ASPD delay, and for a skill it's max(cast + after-cast delay, attack delay). The
  // note names which of those binds, since that answers "will more ASPD speed this
  // up?". Skipped on the falcon tab (a proc, not a cycle) and whenever the branch has
  // no meaningful period (Reflect Shield fires on the enemy's timing, not yours).
  const rateIsSkill = activeResult !== normal_attack;
  const aspdDelayMs = 2 * Math.max(100, Math.round(2000 - status.aspd * 10));
  // A magic cast is priced by max(cast + after-cast delay, min cast period) — it never
  // floors at the swing. The magic branch is the one that rolls MATK, so its presence
  // in the pipeline is what identifies it.
  const rateIsMagic = !!activeDamage?.steps?.some((s) => s.name === "Base MATK");
  const attackRate = activeBranch !== "falcon" && result.dps_valid && (result.period_ms ?? 0) > 0
    ? { perSec: 1000 / result.period_ms!, periodMs: result.period_ms! }
    : null;

  // Grand Cross blowback (self-recoil): lives on the skill's normal branch. GC has
  // no crit/falcon/katar branches, so surface it whenever it's present.
  const selfDamage = (hasSkill ? skillResult! : normal_attack).result.normal.self_damage ?? null;

  // Crit lifesteal (Crescent Scythe): only meaningful on the crit view, since it is
  // paid out per critical hit. Shown under the breakdown, clearly marked as healing.
  const critHeal = activeBranch === "crit" ? (primary.result.crit?.crit_heal ?? null) : null;

  // Combined DW damage range for the headline (PS mode, normal/crit branch)
  const showDwCombined = hasDualWield && dwMode === "ps" && !!dwLhNormal && (activeBranch === "normal" || activeBranch === "crit");
  const dwRhBranch = activeBranch === "crit" ? (normal_attack.result.crit ?? normal_attack.result.normal) : normal_attack.result.normal;
  const dwLhBranch = activeBranch === "crit" ? (dwLhCrit ?? dwLhNormal!) : dwLhNormal!;
  const combinedMin = showDwCombined ? Math.round((2 * dwRhBranch.min_damage * dwRhFactor + dwLhBranch.min_damage * dwLhFactor) * dwPsBonusMult) : null;
  const combinedMax = showDwCombined ? Math.round((2 * dwRhBranch.max_damage * dwRhFactor + dwLhBranch.max_damage * dwLhFactor) * dwPsBonusMult) : null;

  // DPS: combined PS DPS in PS mode, single-weapon recomputed in Vanilla mode
  const displayDps = hasDualWield && dwMode === "vanilla" ? vanillaDps : result.dps;
  const displayDpsValid = hasDualWield && dwMode === "vanilla"
    ? (vanillaDps !== null && isFinite(vanillaDps))
    : result.dps_valid;

  // Hits to kill (min/avg/max) and time to kill vs a monster's HP. Per-hit damage
  // uses the displayed branch (or the combined dual-wield total); time-to-kill uses
  // the estimated DPS, which already folds in ASPD / crit mix / procs (and cast +
  // after-cast delay for skills). Only shown in monster mode, where HP is known.
  const killMin = showDwCombined ? combinedMin : activeDamage?.min_damage ?? null;
  const killAvg = showDwCombined ? Math.round(((combinedMin ?? 0) + (combinedMax ?? 0)) / 2) : activeDamage?.avg_damage ?? null;
  const killMax = showDwCombined ? combinedMax : activeDamage?.max_damage ?? null;
  const hitsToKill = (dmg: number | null | undefined) =>
    target_hp != null && dmg != null && dmg > 0 ? Math.ceil(target_hp / dmg) : null;

  // Turn Undead is an instant-kill skill: each cast has `success_chance` to kill
  // outright, and on failure deals `killAvg` chip damage. Expected casts to kill
  // = E[min(Geom(p), nChip)] = (1 − (1−p)^nChip) / p, where nChip = casts to kill
  // by chip damage alone (handles the p→0 limit, where it degrades to nChip). Time
  // to kill = expected casts × cast period. This is what folds the success chance
  // into the hits/duration metrics.
  const successChance = result.success_chance ?? null;
  const isInstaKill = successChance != null;
  let tuCasts: number | null = null;
  if (isInstaKill && target_hp != null) {
    const p = Math.max(0, Math.min(1, (successChance as number) / 100));
    const nChip = killAvg != null && killAvg > 0 ? Math.ceil(target_hp / killAvg) : Infinity;
    if (p > 0) {
      const survive = Math.pow(1 - p, isFinite(nChip) ? nChip : 1e9);
      tuCasts = (1 - survive) / p;
    } else if (isFinite(nChip)) {
      tuCasts = nChip;
    }
  }
  const tuCastsRounded = tuCasts != null ? Math.max(1, Math.round(tuCasts)) : null;
  const periodS = (result.period_ms ?? 0) / 1000;

  // Poison ailment damage-over-time (per second), added to the attack DPS so the
  // target dies sooner. Constant since it's a fraction of Max HP, so it folds in
  // as a flat +DPS term. Only present in monster mode with the Poison status on.
  const poisonDot = poison_dot_per_sec != null && poison_dot_per_sec > 0 ? poison_dot_per_sec : 0;
  const killDps = (displayDpsValid && displayDps != null ? displayDps : 0) + poisonDot;

  // Hits-to-kill and time-to-kill share ONE basis so they can't disagree: the
  // expected damage per attack cycle = DPS × period, which folds in crit RATE,
  // procs and ASPD exactly as the DPS/time do. (Using the displayed branch's
  // per-hit damage for the hit count assumed 100% of that branch — e.g. all crits —
  // so a big-crit / low-crit-rate build showed FEWER hits yet a SLOWER time.) The
  // min/max envelope applies the displayed branch's roll spread around that value.
  const expPerHit = !isInstaKill && killDps > 0 && periodS > 0 ? killDps * periodS : null;
  const hiRatio = killAvg != null && killAvg > 0 && killMax != null ? killMax / killAvg : 1;
  const loRatio = killAvg != null && killAvg > 0 && killMin != null ? killMin / killAvg : 1;
  const hitsBest = isInstaKill ? null : hitsToKill(expPerHit != null ? expPerHit * hiRatio : null);   // fewest hits — best-case rolls
  const hitsAvg = isInstaKill ? tuCastsRounded : hitsToKill(expPerHit);
  const hitsWorst = isInstaKill ? null : hitsToKill(expPerHit != null ? expPerHit * loRatio : null);  // most hits — worst-case rolls

  const timeToKill = isInstaKill
    ? (tuCasts != null && periodS > 0 ? tuCasts * periodS : null)
    : (target_hp != null && killDps > 0 ? target_hp / killDps : null);
  // For an instant-kill skill, "DPS" as chip-damage throughput is misleading next
  // to the kill metrics (they'd imply far less than the target's HP). Show the
  // effective throughput (HP ÷ expected time) so the panel stays self-consistent;
  // fall back to the raw DPS when the target's HP is unknown (custom target).
  const effectiveDps = isInstaKill && target_hp != null && timeToKill != null && timeToKill > 0
    ? target_hp / timeToKill : displayDps;

  // Header + prominent-total support for the breakdown card.
  const nfmt = (v: number) => Math.round(v).toLocaleString();
  const breakdownLabel =
    activeBranch === "crit" ? "Critical hit"
    : activeBranch === "katar" ? "Katar 2nd hit"
    : activeBranch === "falcon" ? "Falcon"
    : activeBranch === "normal" ? "Normal attack"
    : hasSkill ? `${selected_skill.label} Lv ${selected_skill.level}`
    : "Normal attack";
  const finalRange = killMin != null && killMax != null && Math.round(killMin) !== Math.round(killMax);

  return (
    <div>
      <div className="summary-headline">
        <div className="metric">
          <div className="label">Hit chance</div>
          <div className="value good">{result.hit_chance.toFixed(1)}<span className="unit">%</span></div>
        </div>
        <div className="metric">
          <div className="label">Crit chance</div>
          <div className="value crit">{result.crit_chance.toFixed(1)}<span className="unit">%</span></div>
        </div>
        {isInstaKill && (
          <div className="metric" title="Turn Undead instant-kill chance per cast: [20×SkillLv + 3×LUK + INT + BaseLv + (1−HP/MaxHP)×200] ÷ 10 %, halved if base INT < 40. On a failed roll the skill deals the shown (fail) damage instead.">
            <div className="label">Success chance</div>
            <div className="value good">{(successChance as number).toFixed(1)}<span className="unit">%</span></div>
          </div>
        )}
        {/* The rate rides on the value line rather than its own row: a second line
            inside one metric raises the height of the entire headline row, which
            already carries up to eight cards. */}
        {attackRate ? (
          <HoverNote
            className="metric"
            note={<AttackRateNote periodMs={attackRate.periodMs} adelayMs={aspdDelayMs} isSkill={rateIsSkill} isMagic={rateIsMagic} />}
          >
            <div className="label">ASPD</div>
            <div className="value">
              {status.aspd.toFixed(1)}
              <span className="unit unit-rate">
                · {attackRate.perSec.toFixed(2)} {rateIsSkill ? "casts/s" : "atk/s"}
              </span>
            </div>
          </HoverNote>
        ) : (
          <div className="metric">
            <div className="label">ASPD</div>
            <div className="value">{status.aspd.toFixed(1)}</div>
          </div>
        )}
        {showDwCombined ? (
          <div className="metric metric-range">
            <div className="label">Damage range</div>
            <div className="value range">
              {combinedMin}<span className="unit">min</span>
              {" – "}
              {combinedMax}<span className="unit">max</span>
            </div>
          </div>
        ) : activeDamage && activeDamage.min_damage != null && activeDamage.max_damage != null ? (
          <div className="metric metric-range">
            <div className="label">Damage range</div>
            <div className="value range">
              {Math.round(activeDamage.min_damage)}<span className="unit">min</span>
              {" – "}
              {Math.round(activeDamage.max_damage)}<span className="unit">max</span>
            </div>
          </div>
        ) : null}
        <div className="metric">
          <div className="label">DPS (est.)</div>
          <div className="value">{displayDpsValid && effectiveDps != null ? effectiveDps.toFixed(1) : "—"}</div>
        </div>
        {poisonDot > 0 && (
          <div className="metric" title="Poison ailment damage-over-time: the target loses 2% of its Max HP each second (Payon Stories; 1%/s vanilla). This is added to your DPS in the Time to kill below.">
            <div className="label">Poison DoT</div>
            <div className="value">{poisonDot.toLocaleString()}<span className="unit">/s</span></div>
          </div>
        )}
        {!isInstaKill && hitsAvg != null && (
          <div className="metric metric-range" title={`Expected hits to kill the ${target_hp!.toLocaleString()}-HP target — using your effective per-hit damage (folding in crit rate, procs and ASPD, same as Time to kill), from best-case to worst-case damage rolls.`}>
            <div className="label">Hits to kill</div>
            <div className="value range">
              {hitsBest}<span className="unit">min</span>
              {" – "}
              {hitsWorst}<span className="unit">max</span>
            </div>
          </div>
        )}
        {isInstaKill && hitsAvg != null && (
          <div className="metric" title={`Expected casts to kill the ${target_hp!.toLocaleString()}-HP target, folding in the instant-kill success chance (and chip damage on failed rolls).`}>
            <div className="label">Casts to kill</div>
            <div className="value">{hitsAvg}</div>
          </div>
        )}
        {timeToKill != null && (
          <div className="metric" title={isInstaKill
            ? "Expected time to kill = expected casts (from the success chance) × cast + after-cast delay."
            : `Average time to kill = target HP ÷ estimated DPS (folds in ASPD, crit mix and procs; cast + after-cast delay for skills)${poisonDot > 0 ? ", plus the Poison DoT" : ""}.`}>
            <div className="label">Time to kill</div>
            <div className="value">{timeToKill.toFixed(1)}<span className="unit">s</span></div>
          </div>
        )}
        {activeBranch === "katar" && normal_attack.result.katar_proc_chance != null && (
          <div className="metric">
            <div className="label">2nd hit proc</div>
            <div className="value">{normal_attack.result.katar_proc_chance.toFixed(1)}<span className="unit">%</span></div>
          </div>
        )}
      </div>

      {notImplemented && activeDamage && (
        <div className="notice warn">{activeDamage.steps[0].note}</div>
      )}

      {/* PS / Vanilla calc mode toggle — only for dual-wield Assassin builds */}
      {hasDualWield && (
        <div className="tabs" style={{ marginBottom: "0.5rem" }}>
          <button className={dwMode === "ps" ? "active" : ""} onClick={() => setDwMode("ps")}>
            PS (3-hit) <span className="beta-tag">beta</span>
          </button>
          <button className={dwMode === "vanilla" ? "active" : ""} onClick={() => setDwMode("vanilla")}>
            Vanilla
          </button>
        </div>
      )}

      {/* Cards always proc toggle — shown when equipped cards have autobonus proc effects */}
      {hasAutoBonus && (
        <div className="proc-mode-row">
          <span className="proc-mode-label">Proc cards</span>
          <div className="proc-mode-toggle">
            <button
              className={!forceProcs ? "active" : ""}
              onClick={() => { if (forceProcs) onToggleForceProcs(); }}
              title="Show damage without proc-based card bonuses active"
            >
              Normal
            </button>
            <button
              className={forceProcs ? "active" : ""}
              onClick={() => { if (!forceProcs) onToggleForceProcs(); }}
              title="Show damage as if proc-based card bonuses are always active"
            >
              Always
            </button>
          </div>
        </div>
      )}

      <div className="branch-toggle">
        <button
          className={`branch-skill-pill${activeBranch === "skill" && hasSkill ? " active" : ""}${!hasSkill && activeBranch === "normal" ? " active" : ""}`}
          onClick={() => setBranch(hasSkill ? "skill" : "normal")}
        >
          {hasSkill ? `${selected_skill.label} Lv ${selected_skill.level}` : "Normal Attack"}
        </button>

        {hasSkill && (
          <button
            className={activeBranch === "normal" ? "active" : ""}
            onClick={() => setBranch("normal")}
          >
            Normal hit
          </button>
        )}

        {hasCrit && (
          <button
            className={activeBranch === "crit" ? "active" : ""}
            onClick={() => setBranch("crit")}
          >
            Critical hit
          </button>
        )}

        {hasFalcon && (
          <button
            className={`branch-falcon-pill${activeBranch === "falcon" ? " active" : ""}`}
            onClick={() => setBranch("falcon")}
          >
            Falcon
          </button>
        )}

        {hasKatar && (
          <button
            className={activeBranch === "katar" ? "active" : ""}
            onClick={() => setBranch("katar")}
          >
            Katar 2nd hit
          </button>
        )}
      </div>

      {!notImplemented && (activeDamage || (activeBranch === "falcon" && falcon)) && (
        <div className="breakdown-view">
          <div className="breakdown-head">
            <span className="breakdown-title">Damage breakdown</span>
            <span className="breakdown-sub">{breakdownLabel}</span>
          </div>
          {activeBranch === "falcon" && falcon ? (
            <FalconView falcon={falcon} />
          ) : showDwCombined && dwRhBranch && dwLhBranch ? (
            <DualWieldStepList
              rh={dwRhBranch}
              lh={dwLhBranch}
              rhFactor={dwRhFactor}
              lhFactor={dwLhFactor}
              isCrit={activeBranch === "crit"}
              psBonusPct={dwPsBonusPct}
            />
          ) : activeDamage ? (
            <PipelineView steps={activeDamage.steps} hideFinal />
          ) : null}
          {activeBranch !== "falcon" && killAvg != null && (
            <div className="breakdown-total">
              <span className="breakdown-total-label">Final damage</span>
              <span className="breakdown-total-val">
                {finalRange ? `${nfmt(killMin!)}–${nfmt(killMax!)}` : nfmt(killAvg)}
              </span>
            </div>
          )}
          {critHeal && (
            <>
              <div className="breakdown-total">
                <span className="breakdown-total-label">HP healed on this crit</span>
                <span className="breakdown-total-val">
                  +{critHeal.min !== critHeal.max ? `${nfmt(critHeal.min)}–${nfmt(critHeal.max)}` : nfmt(critHeal.avg)}
                </span>
              </div>
              <div className="self-damage-resists" style={{ marginTop: "0.5rem" }}>
                <span className="self-damage-chip muted">
                  {(critHeal.permille / 10).toFixed(1)}% of the damage dealt (0.1% per refine)
                </span>
                <span className="self-damage-chip muted">healing, not damage — not in the total or DPS</span>
              </div>
            </>
          )}
        </div>
      )}

      {selfDamage && <SelfDamageView sd={selfDamage} />}

      {autoSpell && <AutoSpellView branch={autoSpell.branch} chance={autoSpell.chance} label={autoSpell.label} />}

      {autoBlitz && <AutoBlitzView branch={autoBlitz.branch} chance={autoBlitz.chance} dpsAdded={autoBlitz.dpsAdded} />}

      {cardAutocasts.map((ac) => (
        <CardAutocastView key={ac.key} branch={ac.branch} chance={ac.chance} label={ac.label} dpsAdded={ac.dpsAdded} />
      ))}
    </div>
  );
}
