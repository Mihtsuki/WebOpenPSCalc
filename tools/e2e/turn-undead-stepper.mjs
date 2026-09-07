// Turn Undead success-chance card + failed-cast stepper (requested by a CC), and
// offensive Resurrection running through the same branch. The stepper's whole point
// is visible: each "cast fails" click knocks the fail damage off the target's HP bar
// and the next attempt's chance rises through the remaining-HP term.
import { chromium } from "playwright-core";

const URL = process.argv[2] || "http://localhost:5173/";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const state = (skill) => ({
  build: {
    name: "TU", job_id: 8, job_name: "Priest", base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 1, vit: 30, int: 99, dex: 60, luk: 30 },
    bonus_stats: {}, equipped: { right_hand: 1601 }, refine: {}, forge: {},
    mastery_levels: {}, target_mob_id: 1297, server: "payon_stories",
    consumable_buffs: {}, active_buffs: {}, song_state: {}, wildcard_slots: {},
  },
  skill, targetMode: "monster", customTarget: {}, targetMods: {},
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; page.on("pageerror", (e) => errs.push(e.message));

const load = async (s) => {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate((st) => sessionStorage.setItem("opscalc.draft", JSON.stringify({ state: st, sourceParam: null })), s);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Calculate damage" }).click();
  await page.waitForTimeout(4500);
};

const card = () => page.locator(".metric", { hasText: "Success chance" }).first();
const chancePct = async () => parseFloat(((await card().innerText()).match(/(\d+(?:\.\d+)?)%/) || [])[1]);

// --- Turn Undead Lv10 vs Ancient Mummy (1297): step, verify rise, undo, reset ---
await load(state({ id: 77, level: 10, label: "Turn Undead", max_level: 10 }));
if (!(await card().count())) fail("no success-chance card for Turn Undead");
const p1 = await chancePct();
if (!(p1 > 0 && p1 < 100)) fail(`attempt 1 chance unreadable: ${p1}`);

await page.locator("button.tu-btn", { hasText: "cast fails" }).click();
await page.waitForTimeout(3200);
const p2 = await chancePct();
const text2 = (await card().innerText()).replace(/\s+/g, " ");
if (!(p2 > p1)) fail(`chance should rise after a failed cast (${p1}% -> ${p2}%)`);
if (!/ATTEMPT 2/i.test(text2)) fail(`card should read attempt 2, got "${text2.slice(0, 80)}"`);
if (!/target HP [\d,]+ \/ [\d,]+/.test(text2)) fail("HP readout missing after a failed cast");

await page.locator("button.tu-btn", { hasText: "undo" }).click();
await page.waitForTimeout(3200);
const p1b = await chancePct();
if (Math.abs(p1b - p1) > 0.05) fail(`undo should restore attempt 1's chance (${p1}% vs ${p1b}%)`);

await page.locator("button.tu-btn", { hasText: "cast fails" }).click(); await page.waitForTimeout(2600);
await page.locator("button.tu-btn", { hasText: "cast fails" }).click(); await page.waitForTimeout(2600);
await page.locator("button.tu-btn", { hasText: "reset" }).click(); await page.waitForTimeout(3200);
const p1c = await chancePct();
if (Math.abs(p1c - p1) > 0.05) fail(`reset should restore attempt 1's chance (${p1}% vs ${p1c}%)`);
console.log(`Turn Undead: ${p1}% -> fail -> ${p2}% -> undo/reset -> ${p1c}%`);

// --- Offensive Resurrection Lv4 runs the same branch with its own chance ---
await load(state({ id: 54, level: 4, label: "Resurrection", max_level: 4 }));
if (!(await card().count())) fail("no success-chance card for Resurrection");
const pr = await chancePct();
if (!(pr > 0 && pr < p1)) fail(`Res lv4 chance should be positive and below TU lv10's (got ${pr}% vs ${p1}%)`);
if (!(await page.locator("button.tu-btn", { hasText: "cast fails" }).count())) fail("Resurrection should have the stepper too");
console.log(`Resurrection lv4: ${pr}%`);

if (errs.length) fail("page errors: " + errs.join(" | "));
console.log(process.exitCode ? "see failures above" : "PASS");
await browser.close();
process.exit(process.exitCode || 0);
