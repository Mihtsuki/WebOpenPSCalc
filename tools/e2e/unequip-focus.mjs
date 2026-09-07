// After Unequip, the slot's search input must hold focus (and open its browse list)
// so a replacement can be typed immediately.
import { chromium } from "playwright-core";

const state = {
  build: {
    name: "e2e", job_id: 17, job_name: "Rogue", base_level: 99, job_level: 50,
    base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 50, luk: 1 },
    bonus_stats: {}, equipped: { right_hand: 1224 }, refine: {}, forge: {},
    mastery_levels: {}, target_mob_id: 1002, server: "payon_stories",
    consumable_buffs: {}, active_buffs: {}, song_state: {}, wildcard_slots: {},
  },
  skill: { id: 0, level: 1, label: "Normal Attack", max_level: 10 },
  targetMode: "monster", customTarget: {}, targetMods: {},
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const URL = process.argv[2] || "http://localhost:5173/";
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate((s) => sessionStorage.setItem("opscalc.draft", JSON.stringify({ state: s, sourceParam: null })), state);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1600);

const pill = page.locator(".selected-pill", { hasText: /Damascus|Item #1224|#1224/ }).first();
const anyPill = (await pill.count()) ? pill : page.locator(".selected-pill").first();
await anyPill.locator("button", { hasText: "Unequip" }).click();
await page.waitForTimeout(600);

const focus = await page.evaluate(() => {
  const el = document.activeElement;
  return { tag: el?.tagName, placeholder: el?.getAttribute?.("placeholder") || "" };
});
const listOpen = await page.locator(".search-results").first().isVisible().catch(() => false);
console.log("focused:", JSON.stringify(focus), "| browse list open:", listOpen);

const ok = focus.tag === "INPUT" && /^Search /.test(focus.placeholder);
console.log(ok ? "PASS" : "FAIL: search input not focused after Unequip");
process.exit(ok ? 0 : 1);
