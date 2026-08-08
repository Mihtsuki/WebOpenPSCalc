// Survivability / "can I tank this?" readout. Uses the backend's incoming-damage
// pipeline (mob → player). A monster damages you with its weapon attacks: Neutral
// basic melee plus any elemental NPC_*ATTACK skills. We show one line per attack
// element (damage taken, hits to down you, effective HP, mitigation), your dodge
// chance, and the monster's cast kit. Each cast skill is CLICKABLE: picking one
// prices what it does to you (magic/physical, element, ratio × hits) on demand.
// Support/summon/ailment skills report "no direct damage". Monster mode only.
import { useState } from "react";
import { api } from "../api/client";

interface IncomingResult {
  status: { max_hp: number; flee: number; luk?: number; [k: string]: any };
  result: { min_damage: number; max_damage: number; avg_damage: number; steps: any[] };
}

interface SkillDamage {
  modeled: boolean;
  skill: { name: string; desc: string; attackType: string; elementInt: number; hits: number; ratio: number; hasNumber: boolean; estimated: boolean; damageType: "damage" | "status" };
  result: { min_damage: number; max_damage: number; avg_damage: number } | null;
}

export interface IncomingData {
  elements: { ele: number; taken: IncomingResult }[];
  kit: { id: number; d: string; lv: number }[];
  mob_name: string | null;
  mob_hit: number | null;     // mob HIT = level + DEX (drives your dodge chance)
  mob_element: number | null; // basic-attack element (Neutral) — tags the basic line
  build: unknown;             // reused for on-demand skill-damage fetches
  mob_id: number | null;
}

const ELEMENTS = ["Neutral", "Water", "Earth", "Fire", "Wind", "Poison", "Holy", "Shadow", "Ghost", "Undead"];
const eleName = (e: number) => ELEMENTS[e] || "Neutral";
const n = (v: number) => Math.round(v).toLocaleString();

// Raw pre-mitigation hit = the first pipeline step ("Mob Base ATK").
function rawHit(r: IncomingResult): number | null {
  const s = r.result.steps?.[0];
  const v = s?.value ?? s?.max_value;
  return typeof v === "number" && v > 0 ? v : null;
}

function EleLine({ ele, taken, maxHp, isBasic }: { ele: number; taken: IncomingResult; maxHp: number; isBasic: boolean }) {
  const { avg_damage: avg, min_damage: min, max_damage: max } = taken.result;
  const range = Math.round(min) !== Math.round(max);
  const hitsToKill = avg > 0 ? Math.ceil(maxHp / avg) : null;
  const raw = rawHit(taken);
  const mitigationPct = raw != null && raw > 0 ? Math.round((1 - avg / raw) * 100) : null;
  const ehp = raw != null && avg > 0 ? Math.round(maxHp * (raw / avg)) : null;
  return (
    <div className="surv-line">
      <div className="surv-line-head">
        <span className="surv-line-label">
          {eleName(ele)} attack{isBasic ? <span className="surv-tag"> basic</span> : <span className="surv-tag surv-tag--skill"> skill</span>}
        </span>
        <span className="surv-line-dmg">
          {range ? `${n(min)}–${n(max)}` : n(avg)}<span className="surv-line-unit"> / hit</span>
        </span>
      </div>
      <div className="surv-line-metrics">
        <span className="surv-chip"><b>{hitsToKill ?? "—"}</b> hits to down you</span>
        {ehp != null && <span className="surv-chip">Effective HP <b>{n(ehp)}</b></span>}
        {mitigationPct != null && <span className="surv-chip surv-chip--muted">{mitigationPct}% mitigated</span>}
      </div>
    </div>
  );
}

// What a picked cast skill does to you. When the skill's ratio is known we price
// it through the incoming pipeline and show the damage (per cast, all hits); NPC_*
// skills use the Hercules-baseline ratio and are flagged as an estimate. Skills we
// can't price as a ratio (flat/special) show element + type only.
function SkillDetail({ label, dmg, maxHp }: { label: string; dmg: SkillDamage; maxHp: number }) {
  const s = dmg.skill;
  const magic = s.attackType === "Magic";
  const r = dmg.result;
  const hasNumber = !!r && s.hasNumber;
  const range = r ? Math.round(r.min_damage) !== Math.round(r.max_damage) : false;
  const hitsToKill = r && r.avg_damage > 0 ? Math.ceil(maxHp / r.avg_damage) : null;
  return (
    <div className="surv-skill-body">
      <div className="surv-line-head">
        <span className="surv-line-label">
          {label}
          <span className="surv-tag surv-tag--skill"> {magic ? "Magic" : "Physical"} · {eleName(s.elementInt)}</span>
          {hasNumber && s.estimated && <span className="surv-tag surv-tag--est"> ≈ est.</span>}
        </span>
        {hasNumber && r ? (
          <span className="surv-line-dmg">
            {range ? `${n(r.min_damage)}–${n(r.max_damage)}` : n(r.avg_damage)}
            <span className="surv-line-unit">{s.hits > 1 ? ` / cast (${s.hits} hits)` : " / hit"}</span>
          </span>
        ) : (
          <span className="surv-line-dmg surv-skill-hits">{s.hits > 1 ? `${s.hits} hits` : "1 hit"}</span>
        )}
      </div>
      <div className="surv-line-metrics">
        {hasNumber && hitsToKill != null && <span className="surv-chip"><b>{hitsToKill}</b> casts to down you</span>}
        <span className="surv-chip">{magic ? "vs your MDEF" : "vs your DEF"}</span>
        <span className="surv-chip good">{eleName(s.elementInt)} resist reduces it</span>
      </div>
      {hasNumber
        ? s.estimated && <p className="surv-skill-note">Estimate — Hercules-baseline ratio; PS may tune this skill's power.</p>
        : <p className="surv-skill-note">Exact damage isn't modelled — PS tunes this skill's power beyond the available data. Use the element to pick resist gear.</p>}
    </div>
  );
}

export default function SurvivabilityView({ incoming }: { incoming: IncomingData }) {
  const { elements, kit } = incoming;
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [dmg, setDmg] = useState<SkillDamage | null>(null);
  const [loading, setLoading] = useState(false);
  if (!elements.length) return null;
  const ref = elements[0].taken;
  const maxHp = ref.status.max_hp;
  const flee = ref.status.flee ?? 0;
  const luk = ref.status.luk ?? 0;

  const pickSkill = async (s: { id: number; d: string; lv: number }) => {
    if (pickedId === s.id) { setPickedId(null); setDmg(null); return; } // toggle off
    setPickedId(s.id); setDmg(null); setLoading(true);
    try {
      if (incoming.mob_id == null) return;
      const r = await api.calculateIncomingSkill(incoming.build, incoming.mob_id, s.id, s.lv);
      setDmg(r as SkillDamage);
    } catch { setDmg(null); } finally { setLoading(false); }
  };
  const pickedSkill = kit.find((s) => s.id === pickedId) || null;

  // Dodge vs this mob. hitrate = clamp(80 + mobHIT − FLEE, 5, 100);
  // FLEE for the 95% dodge ceiling = mobHIT + 75. Perfect Dodge stacks on top.
  const mobHit = incoming.mob_hit;
  let dodgePct: number | null = null, fleeFor95: number | null = null;
  if (mobHit != null) {
    dodgePct = 100 - Math.max(5, Math.min(100, 80 + mobHit - flee));
    fleeFor95 = mobHit + 75;
  }
  const perfectDodge = luk > 0 ? (luk + 10) / 10 : 0;

  return (
    <div className="surv-view">
      <div className="surv-head">
        <span className="surv-title">Survivability{incoming.mob_name ? ` vs ${incoming.mob_name}` : ""}</span>
        <span className="surv-sub">{n(maxHp)} Max HP</span>
      </div>

      {elements.map(({ ele, taken }) => (
        <EleLine key={ele} ele={ele} taken={taken} maxHp={maxHp} isBasic={ele === incoming.mob_element} />
      ))}

      {dodgePct != null && (
        <div className="surv-dodge">
          <div className="surv-dodge-main">
            <span className="surv-dodge-label">Dodge its attacks</span>
            <span className={`surv-dodge-val ${dodgePct >= 95 ? "good" : dodgePct <= 20 ? "bad" : ""}`}>{dodgePct}%</span>
          </div>
          <div className="surv-dodge-detail">
            <span>FLEE {n(flee)}{fleeFor95 != null && flee < fleeFor95 ? ` — need ${n(fleeFor95)} for 95%` : fleeFor95 != null ? " — capped at 95%" : ""}</span>
            {perfectDodge > 0 && <span className="surv-chip--muted"> · Perfect Dodge {perfectDodge.toFixed(1)}%</span>}
          </div>
        </div>
      )}

      {kit.length > 0 && (
        <div className="surv-kit">
          <span className="surv-kit-label">Damage skills it casts — tap for the damage it does to you</span>
          <div className="surv-kit-list">
            {kit.map((s) => (
              <button
                key={s.id}
                className={`surv-kit-chip surv-kit-chip--btn${pickedId === s.id ? " active" : ""}`}
                onClick={() => pickSkill(s)}
              >
                {s.d}{s.lv > 1 ? ` Lv${s.lv}` : ""}
              </button>
            ))}
          </div>
          {pickedSkill && (
            <div className="surv-skill-detail">
              {loading ? (
                <span className="surv-skill-msg">Loading {pickedSkill.d}…</span>
              ) : dmg && dmg.skill.damageType === "status" ? (
                <span className="surv-skill-msg">
                  {pickedSkill.d} — inflicts a status / drain; no direct damage.
                </span>
              ) : dmg ? (
                <SkillDetail label={pickedSkill.d} dmg={dmg} maxHp={maxHp} />
              ) : (
                <span className="surv-skill-msg">Couldn't load {pickedSkill.d}.</span>
              )}
            </div>
          )}
        </div>
      )}

      <p className="surv-note">
        The weapon-attack figures (Neutral basic melee plus any elemental attack skills) vs your DEF and
        reduction gear are accurate. Cast-skill damage: PS-reworked skills a mob casts (Fire Bolt, Bash,
        Lord of Vermilion, …) are priced with their Payon Stories formulas; skills using an unverified
        baseline ratio — monster-native <b>NPC_</b> skills and a few unaudited vanilla skills — are marked
        <b>≈ est.</b> and PS may tune them. A few flat/special skills (e.g. Dark Breath) show element &amp;
        type only. Assumes single-target; Perfect Dodge isn't folded into the dodge %.
      </p>
    </div>
  );
}
