// Cards persist through a gear swap (player request, 2026-09-06): Unequip keeps the
// slotted cards and the next item inherits them. The exception is left_hand crossing
// between shield and weapon — the card universe changes, so unfitting cards drop.
import { chromium } from "playwright-core";

const URL = process.argv[2] || "http://localhost:5173/";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const state = (over) => ({
  build: {
    name: "e2e", job_id: 12, job_name: "Assassin", base_level: 99, job_level: 50,
    base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 50, luk: 1 },
    bonus_stats: {}, equipped: {}, refine: {}, forge: {}, mastery_levels: {},
    target_mob_id: 1002, server: "payon_stories", consumable_buffs: {},
    active_buffs: {}, song_state: {}, wildcard_slots: {}, ...over,
  },
  skill: { id: 0, level: 1, label: "Normal Attack", max_level: 10 },
  targetMode: "monster", customTarget: {}, targetMods: {},
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });

const load = async (s) => {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate((st) => sessionStorage.setItem("opscalc.draft", JSON.stringify({ state: st, sourceParam: null })), s);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
};

const slotBox = (label) => page.locator(".field", { has: page.locator("label", { hasText: label }) }).first();
const equipInto = async (label, query) => {
  const box = slotBox(label);
  await box.locator("input[placeholder^='Search ']").fill(query);
  await page.waitForTimeout(700);
  const results = page.locator(".search-results .search-result-item:not(.disabled)");
  if (await results.count()) await results.first().click();
  await page.waitForTimeout(900);
};

// 1) Weapon swap keeps the card: Knife + Hydra -> unequip -> Stiletto, Hydra stays.
await load(state({ equipped: { right_hand: 1201, right_hand_card1: 4035 } }));
const rh = slotBox("Right hand");
if (!(await rh.locator(".selected-pill", { hasText: "Hydra" }).count())) fail("setup: Hydra Card not shown on the Knife");
await rh.locator("button", { hasText: "Unequip" }).first().click();
await page.waitForTimeout(500);
if (await rh.locator(".selected-pill", { hasText: "Hydra" }).count()) fail("card UI should be hidden while the slot is empty");
await equipInto("Right hand", "Stiletto");
if (await rh.locator(".selected-pill", { hasText: "Hydra" }).count()) {
  console.log("weapon swap: Hydra Card survived the swap");
} else fail("Hydra Card should still be slotted after equipping the Stiletto");

// 2) left_hand shield -> weapon drops the shield card (Thara cannot sit in a dagger).
await load(state({ equipped: { right_hand: 1201, left_hand: 2104, left_hand_card1: 4058 } }));
const lh = slotBox("Left hand");
if (!(await lh.locator(".selected-pill", { hasText: "Thara" }).count())) fail("setup: Thara Frog not shown on the Buckler");
await lh.locator("button", { hasText: "Unequip" }).first().click();
await page.waitForTimeout(500);
await equipInto("Left hand", "Main Gauche");
await page.waitForTimeout(900);
if (await lh.locator(".selected-pill", { hasText: "Thara" }).count()) {
  fail("Thara Frog must be dropped when the off-hand becomes a weapon");
} else console.log("cross-type swap: Thara Frog dropped as it no longer fits");

console.log(process.exitCode ? "see failures above" : "PASS");
await browser.close();
process.exit(process.exitCode || 0);
