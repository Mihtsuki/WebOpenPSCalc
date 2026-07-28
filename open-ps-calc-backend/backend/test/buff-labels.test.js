/**
 * buff-labels.test.js — guards the frontend buff-picker labels against drift
 * from the skill database display names.
 *
 * WHY THIS EXISTS: the buff picker in the frontend (BuildEditor.tsx) hardcodes
 * a display label per buff, keyed by STATUS-CHANGE constant (SC_*). Those labels
 * are NOT derived from the skill DB, so they can silently drift from a skill's
 * real name — this is exactly how "Ki" ended up shown for Ninja Aura (NJ_NEN),
 * and how "Increase AGI" / "Overthrust" / "Poem of Bragi" diverged from the DB's
 * "Increase Agility" / "Over Thrust" / "A Poem of Bragi".
 *
 * The test parses the buff arrays straight out of BuildEditor.tsx and asserts,
 * for every buff we can map to a skill, that the label CONTAINS the skill's DB
 * display name (after normalizing punctuation/case). "Contains" — not equals —
 * so intentional descriptive suffixes still pass, e.g.
 *   "Critical Explosion (chant, +50% crit)"  ⊇  "Critical Explosion"
 *   "Auto Berserk (self Provoke 10)"          ⊇  "Auto Berserk"
 *   "A Whistle (Flee)"                        ⊇  "A Whistle"
 * but a wholesale rename ("Ki" for "Ninja Aura") fails.
 *
 * Maintenance: when you add a buff to SELF_BUFFS/PARTY_BUFFS/SONG_BUFFS, add its
 * SC → skill-constant to BUFF_SKILL below (or to INTENTIONAL_LABELS if PS renames
 * it away from the DB name, like Double Bolt). Unmapped buffs are reported so the
 * gap is visible rather than silently uncovered.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { loader } = require("../src/engine/dataLoader");
const { getProfile } = require("../src/engine/serverProfiles");
const PROFILE = getProfile("payon_stories");
loader.setProfile(PROFILE);

const BUILD_EDITOR = path.join(
  __dirname, "..", "..", "..",
  "open-ps-calc-frontend", "frontend", "src", "pages", "BuildEditor.tsx"
);

// Each buff SC → the skill constant whose DB display name the label must contain.
const BUFF_SKILL = {
  // --- SELF_BUFFS ---
  SC_CONCENTRATION: "AC_CONCENTRATION",       // Improve Concentration
  SC_EXPLOSIONSPIRITS: "MO_EXPLOSIONSPIRITS", // Critical Explosion (two entries: SN + Monk)
  SC_AUTOBERSERK: "SM_AUTOBERSERK",           // Auto Berserk
  SC_TWOHANDQUICKEN: "KN_TWOHANDQUICKEN",     // Sword Quickening (PS rename, in DB)
  SC_ONEHANDQUICKEN: "KN_ONEHAND",            // One-Hand Quicken
  SC_SPEARQUICKEN: "CR_SPEARQUICKEN",         // Spear Quicken
  SC_PROVIDENCE: "CR_PROVIDENCE",             // Providence
  SC_MAXIMIZEPOWER: "BS_MAXIMIZE",            // Maximize Power
  SC_GS_MADNESSCANCEL: "GS_MADNESSCANCEL",    // Barrage (PS rename, in DB)
  SC_GS_ADJUSTMENT: "GS_ADJUSTMENT",          // Run and Gun (PS rename, in DB)
  SC_NJ_NEN: "NJ_NEN",                        // Ninja Aura  <-- the "Ki" regression guard
  SC_AMPLIFYMAGICPOWER: "HW_MAGICPOWER",      // Amplify Magic Power
  // --- PARTY_BUFFS ---
  SC_IMPOSITIO: "PR_IMPOSITIO",               // Impositio Manus
  SC_BLESSING: "AL_BLESSING",                 // Blessing
  SC_INC_AGI: "AL_INCAGI",                    // Increase Agility
  SC_GLORIA: "PR_GLORIA",                     // Gloria
  SC_ANGELUS: "AL_ANGELUS",                   // Angelus
  SC_OVERTHRUST: "BS_OVERTHRUST",             // Over Thrust
  SC_OVERTHRUSTMAX: "WS_OVERTHRUSTMAX",       // Maximum Over Thrust
  SC_ADRENALINE: "BS_ADRENALINE",             // Adrenaline Rush
  // --- SONG_BUFFS ---
  SC_ASSNCROS: "BA_ASSASSINCROSS",            // Assassin Cross of Sunset
  SC_HUMMING: "DC_HUMMING",                   // Humming
  SC_FORTUNE: "DC_FORTUNEKISS",               // Fortune's Kiss
  SC_POEMBRAGI: "BA_POEMBRAGI",               // A Poem of Bragi
  SC_WHISTLE: "BA_WHISTLE",                   // A Whistle
  SC_APPLEIDUN: "BA_APPLEIDUN",               // The Apple of Idun
};

// Buffs whose label is DELIBERATELY not the DB name (PS wiki uses a different
// term than the underlying vanilla skill constant). Verified by hand — do NOT
// add here just to silence a failure.
const INTENTIONAL_LABELS = {
  // PS wiki calls PF_DOUBLECASTING ("Double Casting") "Double Bolt".
  SC_DOUBLECASTING: "Double Bolt",
};

// Buffs with no confirmable skill constant (ambiguous / PS-specific status with
// no matching skill DB entry). Documented so the coverage check doesn't flag them.
const NO_SKILL_MAPPING = new Set([
  "SC_SHOUT",        // +4 STR status; DB skill name is ambiguous (Crazy Uproar vs Loud Exclamation)
  "SC_GS_ACCURACY",  // removed on PS (folded into Single Action); hidden in UI
  "SC_DRUMBATTLE",   // ensemble song; no single confirmed skill constant
  "SC_NIBELUNGEN",   // ensemble song; no single confirmed skill constant
]);

// Normalize for comparison: lowercase, drop apostrophes/hyphens, collapse spaces.
const norm = (s) =>
  s.toLowerCase().replace(/['’\-]/g, "").replace(/\s+/g, " ").trim();

// Parse { key: "SC_...", label: "..." } pairs out of the buff arrays.
function parseBuffLabels() {
  const src = fs.readFileSync(BUILD_EDITOR, "utf8");
  const re = /\{\s*key:\s*"(SC_[A-Z0-9_]+)"\s*,\s*label:\s*"([^"]*)"/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push({ key: m[1], label: m[2] });
  return out;
}

const dbName = (skillConst) =>
  loader.getSkillIdByName(skillConst)
    ? loader.getSkillDisplayName(skillConst, PROFILE)
    : null;

test("buff-picker labels are parseable from BuildEditor.tsx", () => {
  const parsed = parseBuffLabels();
  assert.ok(parsed.length >= 25, `expected to parse the buff arrays, got ${parsed.length} entries`);
});

test("every mapped skill constant resolves in the DB", () => {
  for (const [sc, skillConst] of Object.entries(BUFF_SKILL)) {
    assert.ok(dbName(skillConst), `BUFF_SKILL[${sc}] = ${skillConst} does not resolve in the skill DB`);
  }
});

test("every buff label contains its skill's DB display name", () => {
  const parsed = parseBuffLabels();
  const failures = [];
  for (const { key, label } of parsed) {
    const skillConst = BUFF_SKILL[key];
    if (!skillConst) continue; // covered by the coverage test below
    const expected = dbName(skillConst);
    if (!norm(label).includes(norm(expected))) {
      failures.push(`  ${key}: label "${label}" does not contain DB name "${expected}" (${skillConst})`);
    }
  }
  assert.equal(failures.length, 0, `buff label drift detected:\n${failures.join("\n")}`);
});

test("intentional-rename labels still match their documented value", () => {
  const parsed = parseBuffLabels();
  const byKey = new Map(parsed.map((b) => [b.key, b.label]));
  for (const [sc, label] of Object.entries(INTENTIONAL_LABELS)) {
    assert.equal(byKey.get(sc), label,
      `intentional label for ${sc} changed to "${byKey.get(sc)}"; update INTENTIONAL_LABELS if this is deliberate`);
  }
});

test("every buff is either mapped, intentional, or explicitly excluded", () => {
  const parsed = parseBuffLabels();
  const seen = new Set();
  const uncovered = [];
  for (const { key } of parsed) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (BUFF_SKILL[key] || INTENTIONAL_LABELS[key] || NO_SKILL_MAPPING.has(key)) continue;
    uncovered.push(key);
  }
  assert.equal(uncovered.length, 0,
    `buff(s) with no coverage — add to BUFF_SKILL, INTENTIONAL_LABELS, or NO_SKILL_MAPPING:\n  ${uncovered.join("\n  ")}`);
});
