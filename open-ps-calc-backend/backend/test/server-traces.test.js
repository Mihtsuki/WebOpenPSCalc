/**
 * server-traces.test.js — compare our pipeline against real SERVER output, stage by stage.
 *
 * WHY THIS EXISTS, and why it is not the golden suite:
 *
 * goldens.json records what this engine produced last time. It proves we have not
 * changed; it can never prove we are right, because it is generated from the very
 * code it checks. Every wrong number this project has shipped was, at the time, a
 * perfectly green golden.
 *
 * Worse, a golden only pins the FINAL number. The first trace here is the argument
 * for this file: our total lands within 4.5% of the server's while the intermediate
 * stages are ~46% apart in opposite directions — an inflated base damage cancelling
 * a multiplier we do not model at all. A final-number check sails straight through
 * that, and did, until a player noticed their damage was wrong.
 *
 * So: stage-level, against numbers the SERVER produced.
 *
 * Reading a failure:
 *   - a "match" stage drifted        -> we broke something that was right
 *   - a pinned value moved           -> our behaviour changed; re-check the trace
 *   - a "diverges" stage now MATCHES -> good news, flip it to "match" in the fixture
 *
 * A known-divergent stage is NOT an excuse. It is pinned to its current wrong value
 * so the gap stays visible and any further drift still fails. Do not delete stages
 * to get green; fix the engine or record why you cannot.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runScenarioRaw } = require("./engineRunner");

const TRACES = JSON.parse(fs.readFileSync(path.join(__dirname, "server-traces.json"), "utf8"));
const TOLERANCE = 0.01; // 1% — enough for rounding, far too tight to hide a real gap

test("the trace fixture is well formed and not vacuous", () => {
  assert.ok(Array.isArray(TRACES.traces) && TRACES.traces.length > 0, "no traces recorded");
  for (const t of TRACES.traces) {
    assert.ok(t.id && t.source, `trace ${t.id || "?"} must say where it came from`);
    assert.ok(Array.isArray(t.stages) && t.stages.length > 0, `${t.id}: no stages`);
    for (const s of t.stages) {
      assert.ok(["match", "diverges"].includes(s.expect), `${t.id}/${s.label}: bad expect`);
      assert.equal(typeof s.server, "number", `${t.id}/${s.label}: server value must be a number`);
      assert.equal(typeof s.ours_now, "number", `${t.id}/${s.label}: ours_now must be pinned`);
      // A divergence has to be explained, or it is just a number nobody understands.
      if (s.expect === "diverges") {
        assert.ok(s.reason && s.reason.length > 40,
          `${t.id}/${s.label}: a divergence needs a reason saying what is wrong`);
      }
    }
  }
});

for (const t of TRACES.traces) {
  test(`server trace: ${t.id}`, () => {
    const out = runScenarioRaw(t.scenario);
    assert.ok(out.raw && out.raw.normal, `${t.id}: the scenario produced no damage result`);
    const steps = out.raw.normal.steps;

    const report = [];
    for (const st of t.stages) {
      const step = steps.find((x) => x.name === st.ours_step);
      assert.ok(step, `${t.id}: pipeline step "${st.ours_step}" no longer exists — the trace ` +
        "mapping is stale; re-map it rather than dropping the stage");

      const ours = step.value;
      const off = (ours - st.server) / st.server;
      report.push(`    ${st.label.padEnd(26)} server ${String(st.server).padStart(7)}   ` +
        `ours ${String(ours).padStart(7)}   ${(off * 100 >= 0 ? "+" : "")}${(off * 100).toFixed(1)}%`);

      // Every stage is pinned, divergent or not, so drift always fails.
      assert.equal(ours, st.ours_now,
        `${t.id}/${st.label}: our value moved (${st.ours_now} -> ${ours}). If that was a ` +
        "deliberate fix, update ours_now — and if it now matches the server, set expect: \"match\".");

      if (st.expect === "match") {
        assert.ok(Math.abs(off) <= TOLERANCE,
          `${t.id}/${st.label}: expected to match the server but is ${(off * 100).toFixed(1)}% off`);
      } else {
        // Catch the happy case: a gap that quietly closed should be promoted, not
        // left recorded as broken forever.
        assert.ok(Math.abs(off) > TOLERANCE,
          `${t.id}/${st.label}: recorded as diverging but now matches the server — ` +
          "flip expect to \"match\" and delete the reason");
      }
    }

    const bad = t.stages.filter((s) => s.expect === "diverges").length;
    if (bad) {
      console.log(`\n  ${t.id}: ${bad}/${t.stages.length} stages still disagree with the server`);
      report.forEach((l) => console.log(l));
      console.log("");
    }
  });
}
