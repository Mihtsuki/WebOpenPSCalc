/**
 * frontend-source.test.js — regression guards for frontend behaviour that has no
 * other test.
 *
 * WHY THIS EXISTS: there is no frontend test runner in this repo, so a UI bug fixed
 * today can silently return tomorrow. These read the React source and assert the
 * fix is still present. That is a weak form of testing — it checks the code says
 * the right thing, not that it does it — so keep each assertion anchored to a
 * specific reported bug and explain the failure mode, or a future refactor will
 * quite reasonably delete it as noise.
 *
 * The precedent is buff-labels.test.js, which parses BuildEditor.tsx for the same
 * reason. Kept OUT of protected-values.test.js on purpose: that file is about the
 * handful of values that decide where money goes and who the site credits, and it
 * stays readable only if it is not also a general dumping ground.
 *
 * If a real frontend test setup ever lands, these should move into it.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..", "..", "..");
const FRONTEND = path.join(REPO, "open-ps-calc-frontend", "frontend");
const read = (...p) => fs.readFileSync(path.join(FRONTEND, ...p), "utf8");

// ---------------------------------------------------------------------------
// Per-slot state that must not outlive the item it belongs to
// ---------------------------------------------------------------------------
test("changing or removing a weapon clears that slot's forge data", () => {
  // Forge (Star Crumbs / element / ranked) is stored per SLOT but describes a
  // SPECIFIC weapon. Left behind on a swap it makes the next weapon read as forged,
  // which hides its card slots entirely — and if that weapon is not forgeable, the
  // forge controls are hidden too, so there is no way to clear it from the UI.
  // A player hit exactly this: a shared build with a forged Damascus, switched to a
  // Main Gauche, and no card slots ever appeared.
  const src = read("src", "pages", "BuildEditor.tsx");

  const onSelect = src.slice(src.indexOf("onSelect={(r) => {"));
  assert.ok(/delete next\.forge\[slot\.key\]/.test(onSelect.slice(0, 1600)),
    "the item picker must drop the slot's forge data when the equipped item changes");

  const unequip = src.slice(src.indexOf("next.equipped[slot.key] = null;"));
  assert.ok(/delete next\.forge\[slot\.key\]/.test(unequip.slice(0, 700)),
    "Unequip must drop the slot's forge data too, or the next weapon inherits it");
});

test("a saved build keeps its own name, on save and on load", () => {
  // The editor's `currentState` is snapshotted BEFORE `onSave` pushes the new name
  // into `data`, so saving it verbatim stored the previous name inside the state while
  // the list entry got the typed one. A build saved once from a fresh editor then
  // loaded back as "New Build"; re-saving hid it, so only save-once builds broke.
  const src = read("src", "components", "SavedBuildsModal.tsx");

  assert.ok(/saveBuild\(\s*name\s*,\s*\{[^)]*build:\s*\{[^)]*name\s*\}/s.test(src),
    "saveBuild must persist the state with the typed name baked into build.name");

  // Loading must trust the entry's name, which also repairs builds saved before the
  // fix — otherwise those stay wrong forever in the user's browser.
  assert.ok(/onLoad\(\s*\{[^)]*b\.state[^)]*name:\s*b\.name/s.test(src),
    "Load must override build.name with the saved entry's name");
});

// ---------------------------------------------------------------------------
// Picker affordances
// ---------------------------------------------------------------------------
test("the item picker marks forgeable weapons", () => {
  // Whether a weapon can be Blacksmith-forged is otherwise invisible until after you
  // equip it, so the badge saves picking a weapon just to find out. Both weapon
  // searches carry it — the main slot picker and the off-hand one, which lists
  // shields and weapons together (shields are never forgeable and stay unmarked).
  const editor = read("src", "pages", "BuildEditor.tsx");
  const badged = [...editor.matchAll(/FORGEABLE_WEAPON_IDS\.has\(it\.id\)[\s\S]{0,120}?badge:\s*"Forgeable"/g)];
  assert.equal(badged.length, 2,
    "both the main-slot and off-hand weapon searches should badge forgeable weapons");

  // The picker must stay generic — it renders whatever `badge` it is handed and
  // knows nothing about forging, so the same mechanism can mark anything later.
  const picker = read("src", "components", "SearchPicker.tsx");
  assert.ok(/r\.badge/.test(picker), "SearchPicker must render the result's badge");
  assert.ok(!/FORGE/i.test(picker), "SearchPicker must not learn about forging specifically");

  // And it needs a style, or it renders as unstyled text in the middle of the row.
  const css = read("src", "styles.css");
  assert.ok(/\.search-result-badge\s*\{/.test(css), "the badge needs its own style rule");
});

// ---------------------------------------------------------------------------
// The forgeable list is duplicated across the stack and must not drift
// ---------------------------------------------------------------------------
test("the frontend and backend agree on which weapons are forgeable", () => {
  // BuildEditor.tsx carries a copy so the picker can badge without a round-trip, and
  // its own comment says "Keep in sync with FORGEABLE_WEAPON_IDS in backend
  // buildManager.js." Drift would mean the UI offers forging the engine won't price,
  // or badges a weapon that cannot actually be forged.
  const ids = (src) => {
    const m = src.match(/FORGEABLE_WEAPON_IDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(m, "FORGEABLE_WEAPON_IDS must stay a literal Set so both sides can be compared");
    return new Set((m[1].match(/\d+/g) || []).map(Number));
  };
  const fe = ids(read("src", "pages", "BuildEditor.tsx"));
  const be = ids(fs.readFileSync(
    path.join(REPO, "open-ps-calc-backend", "backend", "src", "engine", "buildManager.js"), "utf8"));

  const onlyFe = [...fe].filter((x) => !be.has(x));
  const onlyBe = [...be].filter((x) => !fe.has(x));
  assert.deepEqual(onlyFe, [], "ids the frontend thinks are forgeable but the engine does not");
  assert.deepEqual(onlyBe, [], "ids the engine forges but the picker will not badge");
  assert.ok(fe.size > 0);
});
