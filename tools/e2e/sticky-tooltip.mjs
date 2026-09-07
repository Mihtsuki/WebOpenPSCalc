// Sticky tooltip regression (player screenshot showed TWO stuck at once): the first
// hover of an item fetches its description; leaving during the fetch must not open
// the bubble afterwards. Reproduced by throttling the item endpoint and darting the
// cursor away mid-fetch — before the fix the bubble appeared anyway and never closed.
import { chromium } from "playwright-core";

const URL = process.argv[2] || "http://localhost:5173/";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const state = {
  build: {
    name: "e2e", job_id: 8, job_name: "Priest", base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 1, vit: 30, int: 99, dex: 60, luk: 30 },
    bonus_stats: {}, equipped: { right_hand: 1601, garment: 2502 }, refine: {}, forge: {},
    mastery_levels: {}, target_mob_id: 1002, server: "payon_stories",
    consumable_buffs: {}, active_buffs: {}, song_state: {}, wildcard_slots: {},
  },
  skill: { id: 0, level: 1, label: "Normal Attack", max_level: 10 },
  targetMode: "monster", customTarget: {}, targetMods: {},
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
// Slow every item-info response so a quick hover always leaves mid-fetch.
await page.route("**/api/data/items/*", async (route) => {
  await new Promise((r) => setTimeout(r, 900));
  await route.continue();
});
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate((s) => sessionStorage.setItem("opscalc.draft", JSON.stringify({ state: s, sourceParam: null })), state);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const anyTooltip = () => page.locator(".search-tooltip").count();

// Positive control: hover and STAY on the Rod pill — the bubble must appear,
// proving the throttled fetch path actually drives these tooltips.
const rod = page.locator(".selected-pill .hover-description", { hasText: "Rod" }).first();
await rod.hover();
await page.waitForTimeout(2600);
if (!(await anyTooltip())) fail("control: tooltip should appear when hovering and staying");
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
if (await anyTooltip()) fail("control: tooltip should close on leave");

// The race: brush the garment pill (cold cache), leave while the fetch is in
// flight, then give the late resolve every chance to misfire.
const garment = page.locator(".selected-pill .hover-description", { hasText: "Muffler" }).first();
const target = (await garment.count()) ? garment : page.locator(".selected-pill .hover-description").nth(1);
await target.hover();
await page.waitForTimeout(300);
await page.mouse.move(5, 5);
await page.waitForTimeout(2600);
if (await anyTooltip()) fail("STICKY: bubble opened after the cursor had already left the pill");
else console.log("pill race: no bubble after a brushed hover");

// Dropdown rows: hover one, close the list with Escape mid-fetch — the rows
// unmount with no mouseleave, and the bubble must not outlive the list.
const search = page.locator("input[placeholder^='Search headgear']").first();
await search.click();
await page.waitForTimeout(1500);
const row = page.locator(".search-result-item").first();
if (await row.count()) {
  await row.hover();
  await page.waitForTimeout(250);
  await search.press("Escape");
  await page.waitForTimeout(2600);
  if (await anyTooltip()) fail("STICKY: dropdown bubble survived Escape closing the list");
  else console.log("dropdown race: no bubble after Escape mid-fetch");
} else {
  fail("no dropdown rows appeared for the headgear search");
}

console.log(process.exitCode ? "see failures above" : "PASS");
await browser.close();
process.exit(process.exitCode || 0);
