// Generates static, crawlable per-class build guide pages into public/guides/
// (an index hub + one page per class) and regenerates public/sitemap.xml to
// include them. These are standalone content pages (not the SPA) so search
// engines index real HTML; each links into the calculator. Run: node scripts/gen-guides.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const GUIDES = path.join(PUBLIC, "guides");
const SITE = "https://openpscalc.com";

// One entry per class. Stats mirror the in-app "Start from a template" builds;
// `summary` is the guide's unique content. `open` names the template to load.
const GUIDES_DATA = [
  { slug: "knight-hybrid", cls: "Knight", build: "Hybrid", job: "Swordman → Knight", skill: "Bash",
    stats: { str: 90, agi: 60, vit: 60, int: 1, dex: 40, luk: 1 }, wiki: "Knight",
    summary: "A balanced STR/VIT/AGI Knight built around a two-handed sword or spear. High STR drives Bash and auto-attacks, VIT keeps you alive for melee and MvP work, and enough AGI to attack at a reasonable clip. A forgiving, all-round melee build that leans on weapon mastery for flat ATK.",
    gear: "Two-hand sword or spear, weapon mastery maxed, and STR/VIT gear. Race and size cards on your weapon scale damage hardest." },
  { slug: "crusader-grand-cross", cls: "Crusader", build: "Grand Cross (GC)", job: "Swordman → Crusader", skill: "Grand Cross",
    stats: { str: 50, agi: 1, vit: 60, int: 90, dex: 60, luk: 1 }, wiki: "Crusader",
    summary: "The classic VIT tank / Grand Cross Crusader. Grand Cross deals Holy AoE that scales with both ATK and MATK, so you invest in STR, INT, and VIT together. It ignores hard DEF and the weapon-size penalty, but recoils onto you — bring Holy resist and watch the recoil readout.",
    gear: "Spear or sword + shield, INT for the magic half, and Holy/Demi-Human resist gear to survive the Grand Cross recoil." },
  { slug: "wizard-pve-dex", cls: "Wizard", build: "PvE (DEX)", job: "Magician → Wizard", skill: "Storm Gust",
    stats: { str: 1, agi: 1, vit: 9, int: 99, dex: 99, luk: 1 }, wiki: "Wizard",
    summary: "The pure DEX nuker. Wizards get enormous value from DEX because their strongest spells — Storm Gust, Lord of Vermilion, Meteor Storm — have long cast times. Max INT for raw MATK, then stack DEX to cast fast (and hit the instant-cast breakpoint), with some VIT so you aren't one-shot mid-cast.",
    gear: "A MATK staff, INT headgear, and DEX for cast reduction. Check the cast breakpoints for the DEX needed to instant-cast." },
  { slug: "sage-bolter", cls: "Sage", build: "Bolter", job: "Magician → Sage", skill: "Fire Bolt",
    stats: { str: 1, agi: 1, vit: 40, int: 99, dex: 80, luk: 1 }, wiki: "Sage",
    summary: "The Sage bolter weaponizes single-target bolts (Fire / Cold / Lightning), often double-cast, matched to the target's weak element. INT/DEX identical to a Wizard, but the bolt-per-hit model makes element-matching and cast speed the levers that matter most.",
    gear: "A book or MATK staff, INT gear, and elemental-matching (endows/bolt choice) against each target's armor element." },
  { slug: "hunter-double-strafe", cls: "Hunter", build: "Double Strafe (DS)", job: "Archer → Hunter", skill: "Double Strafe",
    stats: { str: 1, agi: 90, vit: 1, int: 30, dex: 99, luk: 1 }, wiki: "Hunter",
    summary: "Single-target Double Strafe Hunter. Bow damage keys off DEX (maxed), with AGI maxed for attack speed and a little INT for the SP to keep spamming. Equip elemental arrows to match each target and you shred single targets from range.",
    gear: "A bow and a full set of elemental arrows in the Ammo slot; AGI/DEX gear. Falcon for Blitz Beat procs." },
  { slug: "bard-musical-strike", cls: "Bard", build: "Musical Strike", job: "Archer → Bard", skill: "Musical Strike",
    stats: { str: 1, agi: 90, vit: 24, int: 40, dex: 90, luk: 1 }, wiki: "Bard",
    summary: "A DEX/AGI performer that attacks with Musical Strike. On Payon Stories the Performing bonus adds ratio to Musical Strike, and the equipped arrow supplies the element — so an instrument plus the right arrows turns songs-class into a real ranged attacker.",
    gear: "An instrument plus elemental arrows; toggle Performing in the Target panel to see the bonus applied." },
  { slug: "dancer-throw-arrow", cls: "Dancer", build: "Throw Arrow", job: "Archer → Dancer", skill: "Throw Arrow",
    stats: { str: 1, agi: 90, vit: 24, int: 40, dex: 90, luk: 1 }, wiki: "Dancer",
    summary: "The Dancer mirror of the Bard attacker, using Throw Arrow. DEX-heavy for damage and hit, AGI for attack speed, and the equipped arrow's element decides your damage type. Performing adds ratio on Payon Stories.",
    gear: "A whip plus elemental arrows; toggle Performing in the Target panel." },
  { slug: "priest-magnus-exorcismus", cls: "Priest", build: "Magnus Exorcismus", job: "Acolyte → Priest", skill: "Magnus Exorcismus",
    stats: { str: 1, agi: 1, vit: 43, int: 99, dex: 80, luk: 1 }, wiki: "Priest",
    summary: "The INT/DEX caster Priest built to farm Undead and Demon. Magnus Exorcismus lays down Holy AoE that hits those races in full, while Turn Undead and Holy Strike round out the anti-undead kit. High INT for damage, DEX for cast speed, VIT for survivability.",
    gear: "A MATK book/staff, INT gear, and Holy-boosting equipment; pair with Turn Undead against tough Undead." },
  { slug: "monk-asura", cls: "Monk", build: "Asura", job: "Acolyte → Monk", skill: "Asura Strike",
    stats: { str: 90, agi: 1, vit: 1, int: 80, dex: 60, luk: 1 }, wiki: "Monk",
    summary: "The burst Monk built around Asura Strike, whose damage is ATK × (8 + SP/10) + 1000 — so both ATK (STR) and Max SP (INT) matter. Spirit spheres add flat, true-neutral damage that stacks per hit. A high-ceiling nuke for MvPs and beefy targets.",
    gear: "A knuckle, STR/INT gear for ATK and SP; add spirit spheres in the Buffs panel to see the full Asura number." },
  { slug: "blacksmith-battle-smith", cls: "Blacksmith", build: "Battle Smith (AGI)", job: "Merchant → Blacksmith", skill: "Mammonite",
    stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 30, luk: 1 }, wiki: "Blacksmith",
    summary: "The AGI Battle Smith swings an axe or mace with Mammonite and fast auto-attacks. STR and weapon mastery drive damage, AGI provides attack speed, and Weapon Research adds hit. A sturdy, self-sufficient farmer.",
    gear: "An axe or mace with weapon mastery maxed; STR/AGI gear and race/size cards." },
  { slug: "alchemist-acid-demonstration", cls: "Alchemist", build: "Acid Demonstration (SAD)", job: "Merchant → Alchemist", skill: "Acid Demonstration",
    stats: { str: 90, agi: 60, vit: 1, int: 1, dex: 80, luk: 1 }, wiki: "Alchemist",
    summary: "The SAD Alchemist — STR/DEX with plant summons and Acid Terror spam that works through DEF, brutal against high-DEF and high-HP targets. STR and DEX drive the throughput, AGI adds flee and plant attack speed, and it shines hardest under a Bard's Bragi.",
    gear: "Bottles as ammo, STR/DEX/AGI gear; excellent against tanky targets that shrug off physical hits, especially with Bragi support." },
  { slug: "assassin-sonic-blow", cls: "Assassin", build: "Sonic Blow (PvE)", job: "Thief → Assassin", skill: "Sonic Blow",
    stats: { str: 90, agi: 30, vit: 1, int: 60, dex: 10, luk: 65 }, wiki: "Assassin",
    summary: "The PvE Sonic Blow Assassin — a STR/LUK/INT crit-hybrid. High STR for burst, LUK for consistent crits (which bypass flee and DEF), and INT for the SP to keep spamming Sonic Blow. Reliable single-target damage that doesn't hinge on hit rate.",
    gear: "A katar with mastery, STR/LUK gear and crit cards; Enchant Poison to add element vs Poison targets." },
  { slug: "rogue-back-stab", cls: "Rogue", build: "Back Stab", job: "Thief → Rogue", skill: "Back Stab",
    stats: { str: 90, agi: 70, vit: 1, int: 60, dex: 30, luk: 1 }, wiki: "Rogue",
    summary: "A STR/AGI Rogue built around Back Stab, which lands a heavy hit from behind (with a further bonus when the target isn't facing you). STR drives the hit, AGI gives speed and flee, and a chunk of INT sustains SP for repeated Back Stabs.",
    gear: "A dagger, STR/AGI/DEX gear; the Back Stab opportunity bonus rewards attacking from behind." },
  { slug: "super-novice-melee", cls: "Super Novice", build: "Melee (Auto-attacker)", job: "Super Novice", skill: "auto-attack",
    stats: { str: 80, agi: 90, vit: 40, int: 1, dex: 40, luk: 1 }, wiki: "Super_Novice",
    summary: "The auto-attacker Super Novice. With borrowed first-class skills, Fury (crit), and the never-died stat bonus, a STR/AGI Super Novice auto-attacks surprisingly hard for a novice. Equip a dagger, one-hand sword, or mace and stack crit.",
    gear: "A dagger / 1H sword / mace; add Fury and the never-died bonus in the Buffs panel." },
  { slug: "gunslinger-desperado", cls: "Gunslinger", build: "Desperado", job: "Gunslinger", skill: "Desperado",
    stats: { str: 1, agi: 1, vit: 70, int: 60, dex: 99, luk: 1 }, wiki: "Gunslinger",
    summary: "The revolver Desperado Gunslinger — a rapid multi-hit AoE that scales primarily with DEX. Max DEX for damage, mid INT for the SP to keep firing, and the rest in VIT for survivability while you burst a gathered mob down.",
    gear: "A revolver for Desperado; DEX/INT/VIT gear. Barrage boosts your damage; cancel it with Run and Gun to recast coins." },
  { slug: "ninja-throwing", cls: "Ninja", build: "Throwing (DEX)", job: "Ninja", skill: "Throw Huuma Shuriken",
    stats: { str: 90, agi: 1, vit: 1, int: 50, dex: 90, luk: 1 }, wiki: "Ninja",
    summary: "The Throwing Ninja, hurling Huuma Shuriken for heavy ranged AoE. Throwing is a physical hit, so STR is the primary damage stat alongside DEX for hit and consistency, with INT feeding the SP for sustained throwing. A strong, mobile ranged nuker.",
    gear: "A huuma shuriken to throw; STR/DEX gear, with INT supporting SP for sustained throwing." },
];

const STAT_ORDER = [["str", "STR"], ["agi", "AGI"], ["vit", "VIT"], ["int", "INT"], ["dex", "DEX"], ["luk", "LUK"]];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Theme-aware: dark by default (matching the app), light when the app's
// localStorage theme is "light" (same origin, so it's shared). Palette values
// mirror styles.css :root / [data-theme=light].
const STYLE = `
  :root{color-scheme:dark;--bg:#12141c;--panel:#181b26;--border:#2a2f40;--border-soft:#232838;--text:#e8e6df;--dim:#9a9fb0;--faint:#5d6276;--accent:#d8a657;--accent-dim:#a3793c;--link:#8fb4d9;--on-accent:#1a1306}
  :root[data-theme="light"]{color-scheme:light;--bg:#f0ebe0;--panel:#e8e2d4;--border:#b5ab95;--border-soft:#c8c0ac;--text:#1e1a10;--dim:#56493a;--faint:#8a7a64;--accent:#966419;--accent-dim:#7a5015;--link:#2060a0;--on-accent:#f0ebe0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6}
  a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
  .wrap{max-width:780px;margin:0 auto;padding:2rem 1.4rem 4rem}
  header nav{font-size:.85rem;color:var(--dim);margin-bottom:1.5rem}
  h1{font-size:1.75rem;line-height:1.2;margin:.2rem 0 .4rem}
  h2{font-size:1.15rem;margin:2rem 0 .5rem;border-bottom:1px solid var(--border);padding-bottom:.3rem}
  .eyebrow{color:var(--accent-dim);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase}
  p{color:var(--text)}
  .lead{color:var(--dim);font-size:1.02rem}
  table{border-collapse:collapse;width:100%;max-width:360px;font-size:.9rem;margin:.5rem 0}
  th,td{text-align:left;padding:.35rem .6rem;border-bottom:1px solid var(--border-soft)}
  td.n{font-family:"IBM Plex Mono",ui-monospace,monospace;color:var(--accent);text-align:right}
  .cta{display:inline-block;margin:1.4rem 0 .5rem;padding:.6rem 1.1rem;background:var(--accent);color:var(--on-accent);font-weight:700;border-radius:6px}
  .cta:hover{filter:brightness(1.08);text-decoration:none}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem;margin:1rem 0}
  .card{display:block;padding:.7rem .85rem;background:var(--panel);border:1px solid var(--border);border-radius:6px;color:var(--text)}
  .card:hover{border-color:var(--accent-dim);text-decoration:none}
  .card .c{color:var(--dim);font-size:.82rem}
  footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--border);color:var(--faint);font-size:.82rem}
`;

function shell({ title, desc, canonical, body }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/icon-512.png">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/icon.svg">
<style>${STYLE}</style></head>
<body><div class="wrap">${body}</div></body></html>`;
}

function guidePage(g) {
  const canonical = `${SITE}/guides/${g.slug}.html`;
  const title = `${g.cls} — ${g.build} Build Guide | Payon Stories | Open PS Calc`;
  const desc = `${g.cls} ${g.build} build for Payon Stories (pre-renewal RO): recommended stats, signature skill (${g.skill}), gear, and a link to calculate its damage.`;
  const statRows = STAT_ORDER.map(([k, l]) => `<tr><td>${l}</td><td class="n">${g.stats[k]}</td></tr>`).join("");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › <a href="/guides.html">Build guides</a> › ${esc(g.cls)}</nav></header>
<span class="eyebrow">Payon Stories build guide</span>
<h1>${esc(g.cls)} — ${esc(g.build)}</h1>
<p class="lead">${esc(g.summary)}</p>
<a class="cta" href="/?t=${g.slug}">Open this build in the calculator →</a>
<p style="font-size:.85rem;color:#9a9fb0">Opens the calculator with the <strong>${esc(g.cls)} — ${esc(g.build)}</strong> build preloaded — then tune stats and gear.</p>
<h2>Recommended stats <span style="font-weight:400;font-size:.8rem;color:#5d6276">(base level 99)</span></h2>
<table><tbody>${statRows}</tbody></table>
<h2>Signature skill</h2>
<p><strong>${esc(g.skill)}</strong> — set it as your skill in the calculator to see a full step-by-step damage breakdown, plus ASPD/cast/hit breakpoints, time-to-kill, and survivability.</p>
<h2>Gear &amp; tips</h2>
<p>${esc(g.gear)}</p>
<h2>Learn more</h2>
<p><a href="https://wiki.payonstories.com/${g.wiki}" rel="noopener">${esc(g.cls)} on the Payon Stories wiki ↗</a> · <a href="/guides.html">All build guides</a></p>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>. Stats are a starting point — tune them to your gear and goals.</footer>`;
  return shell({ title, desc, canonical, body });
}

function indexPage() {
  const canonical = `${SITE}/guides.html`;
  const cards = GUIDES_DATA.map((g) =>
    `<a class="card" href="/guides/${g.slug}.html"><strong>${esc(g.cls)}</strong><div class="c">${esc(g.build)}</div></a>`
  ).join("");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › Build guides</nav></header>
<span class="eyebrow">Payon Stories</span>
<h1>Payon Stories Build Guides</h1>
<p class="lead">Starter builds for every class on Payon Stories (pre-renewal Ragnarok Online) — recommended stats and a signature skill, each ready to open in the <a href="/">damage calculator</a> and tune to your gear.</p>
<div class="grid">${cards}</div>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>.</footer>`;
  return shell({ title: "Payon Stories Build Guides — every class | Open PS Calc", desc: "Starter build guides for every Payon Stories class (pre-renewal RO): recommended stats and signature skills, ready to open in the damage calculator.", canonical, body });
}

// --- write flat .html files ---
// Flat files (not <slug>/index.html) so the host serves them via `try_files $uri`
// without needing directory-index resolution ($uri/), which it isn't configured for.
fs.mkdirSync(GUIDES, { recursive: true });
fs.writeFileSync(path.join(PUBLIC, "guides.html"), indexPage());           // → /guides.html
for (const g of GUIDES_DATA) {
  fs.writeFileSync(path.join(GUIDES, `${g.slug}.html`), guidePage(g));      // → /guides/<slug>.html
}

// --- regenerate sitemap (home + guides hub + each guide) ---
const urls = [
  `${SITE}/`,
  `${SITE}/guides.html`,
  ...GUIDES_DATA.map((g) => `${SITE}/guides/${g.slug}.html`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), sitemap);

console.log(`Generated ${GUIDES_DATA.length} guide pages + index + sitemap (${urls.length} urls).`);
