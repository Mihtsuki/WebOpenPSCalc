// Source content for the /mechanics pages.
//
// These document how Payon Stories ACTUALLY computes damage — the reworked
// formulas the engine implements, each one audited against the PS wiki, the
// class-rework PDFs, or in-game measurement (see backend/ROADMAP.md for the
// audit trail). Nothing here may be invented: if a number isn't verified, say
// so on the page rather than guessing, exactly as the calculator does.
//
// Shape per entry:
//   slug     — URL: /mechanics/<slug>.html
//   title    — H1 (also the <title> stem)
//   blurb    — meta description + lead paragraph (plain text, one or two sentences)
//   sections — [{ h, html }] body sections, in order
//   faq      — [{ q, a }] rendered as an FAQ section AND as FAQPage JSON-LD;
//              `a` must be plain text (no tags) since it goes into the schema
//   sources  — [{ label, href }] where the numbers come from
//   related  — slugs of other mechanics pages
//   guides   — slugs of build guides this most affects
export const MECHANICS = [
  {
    slug: "damage-formula",
    title: "How damage is calculated on Payon Stories",
    blurb:
      "The order every physical hit passes through on Payon Stories — base damage, skill ratio, DEF, masteries, element, cards — and why the order changes the result.",
    sections: [
      {
        h: "The pipeline, in order",
        html: `<p>A physical hit is not one multiplication. It is a chain, and each step
works on the result of the last one, so the order decides the number. Payon Stories keeps
the pre-renewal order:</p>
<ol>
<li><strong>Base damage</strong> — the weapon's ATK roll, the size penalty, then your status ATK (STR/DEX/LUK and gear) added on top.</li>
<li><strong>ATK rate</strong> — flat %ATK buffs.</li>
<li><strong>Skill ratio</strong> — the skill's own multiplier (Bash Lv10 = 400%, Cart Revolution Lv5 = 250%). Buffs like Power-Thrust are <em>added into this percentage</em>, not multiplied afterwards.</li>
<li><strong>Critical</strong> — a crit takes the weapon's maximum roll and skips DEF entirely.</li>
<li><strong>Defense</strong> — the target's hard DEF (a percentage cut) and then soft DEF (a flat subtraction).</li>
<li><strong>Refine and mastery</strong> — refine ATK and weapon-mastery ATK, both applied <em>after</em> DEF, which is why they are so strong against high-DEF targets.</li>
<li><strong>Element</strong> — your attack element against the target's element and level.</li>
<li><strong>Forge bonus</strong> — a forged weapon's Star Crumb damage, also after DEF.</li>
<li><strong>Cards</strong> — race, size, element and class card multipliers.</li>
<li><strong>Final rate</strong> — melee/ranged and per-weapon final modifiers.</li>
</ol>`,
      },
      {
        h: "Why the order matters",
        html: `<p>Two bonuses of the same size are not worth the same. Anything applied
<em>before</em> DEF gets cut by it; anything applied <em>after</em> arrives whole. Against a
high-DEF target, +40 ATK from a mastery is worth far more than +40 ATK on the weapon itself,
because the mastery lands after the subtraction. It is also why refine and forge damage feel
disproportionately good against armoured monsters — and why a crit, which skips DEF outright,
is not simply "more damage" but a different calculation.</p>
<p>The calculator prints every one of these steps with its running total, so you can see
exactly where a number came from rather than trusting a final figure.</p>`,
      },
    ],
    faq: [
      {
        q: "Does a critical hit ignore DEF on Payon Stories?",
        a: "Yes. A critical hit uses the weapon's maximum damage roll and bypasses the defence step entirely, which is why crit builds hold up so well against high-DEF monsters.",
      },
      {
        q: "Are weapon mastery and refine damage reduced by the target's DEF?",
        a: "No. Both are applied after the defence step, so they arrive at full value. That is why flat ATK from masteries and refine is worth more against armoured targets than the same amount of ATK on the weapon.",
      },
      {
        q: "Do ATK buffs multiply the final damage?",
        a: "Not usually. Power-Thrust and Over Thrust are added into the skill's ratio percentage rather than multiplied at the end, so a maxed Power-Thrust turns a 250% skill into a 275% skill.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki", href: "https://wiki.payonstories.com/" },
    ],
    related: ["hit-and-accuracy", "weapon-size-penalty", "forged-weapons"],
    guides: ["knight-hybrid", "blacksmith-battle-smith"],
  },

  {
    slug: "hit-and-accuracy",
    title: "Hit, flee and accuracy on Payon Stories",
    blurb:
      "How hit chance is computed, why skill accuracy bonuses are a percentage of your hit rate rather than flat HIT, and how much DEX you need to stop missing.",
    sections: [
      {
        h: "The hit formula",
        html: `<p>Your chance to land a hit is:</p>
<p class="formula">hit chance % = 80 + your HIT − the target's FLEE</p>
<p>capped at 100% and floored at 5% — you can always miss a little, and you can always
connect a little. Your HIT is your base level plus your DEX, plus any flat +HIT on gear.
A monster's FLEE is its level plus its AGI.</p>`,
      },
      {
        h: "Accuracy is not HIT",
        html: `<p>Several skills grant "accuracy", and it is a different thing from +HIT.
Accuracy is a <strong>percentage of your hit rate</strong>, applied after the subtraction
above. The Payon Stories wiki puts it plainly: if you would hit a monster 67% of the time,
Bash Lv10's +50% accuracy takes you to 100%, not to 117 HIT.</p>
<table><thead><tr><th>Source</th><th>Accuracy</th></tr></thead><tbody>
<tr><td>Bash</td><td class="n">+5% per level</td></tr>
<tr><td>Magnum Break</td><td class="n">+10% per level</td></tr>
<tr><td>Pierce</td><td class="n">+5% per level</td></tr>
<tr><td>Holy Cross</td><td class="n">+2% per rank</td></tr>
<tr><td>Shield Chain</td><td class="n">+20%</td></tr>
<tr><td>Sonic Blow (with Sonic Acceleration)</td><td class="n">+50%</td></tr>
<tr><td>Weaponry Research</td><td class="n">+2% per level (all attacks)</td></tr>
</tbody></table>
<p>Multiple sources add together into a single multiplier rather than compounding, so
Weaponry Research 10 and Holy Cross 10 give ×1.40, not ×1.44.</p>`,
      },
      {
        h: "A worked example",
        html: `<p>Abysmal Knights are level 79 with 68 AGI, so 147 FLEE. At base level 99
your HIT is 99 + DEX. To never miss:</p>
<table><thead><tr><th>Attack</th><th>DEX needed</th></tr></thead><tbody>
<tr><td>Auto-attack</td><td class="n">68</td></tr>
<tr><td>Holy Cross Lv1 (+2%)</td><td class="n">67</td></tr>
<tr><td>Holy Cross Lv5 (+10%)</td><td class="n">59</td></tr>
<tr><td>Holy Cross Lv10 (+20%)</td><td class="n">52</td></tr>
</tbody></table>
<p>That is 16 stat points of DEX bought purely by the skill's rank — which is why the
accuracy line on a skill is worth reading before you plan your stats. The calculator's
Hit breakpoints panel does this for your actual build and target.</p>`,
      },
    ],
    faq: [
      {
        q: "How much DEX do I need to never miss Abysmal Knights?",
        a: "At base level 99 you need 52 total DEX when attacking with Holy Cross Lv10, or 68 DEX on a plain auto-attack. Abysmal Knights have 147 flee, and Holy Cross Lv10 adds 20% to your hit rate on top of your HIT.",
      },
      {
        q: "Is skill accuracy the same as +HIT?",
        a: "No. HIT is subtracted against the monster's flee to give a hit rate; accuracy multiplies that hit rate afterwards. A skill with +50% accuracy turns a 60% hit chance into 90%, whereas +50 HIT would raise the hit chance by 50 percentage points before the cap.",
      },
      {
        q: "Can I reach 100% hit chance against everything?",
        a: "Against most monsters yes, but perfect dodge is separate. A monster with high LUK can still dodge normal attacks outright, though that lucky dodge does not apply to skills.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki — Accuracy", href: "https://wiki.payonstories.com/Accuracy" },
      { label: "Payon Stories wiki — Bash", href: "https://wiki.payonstories.com/Bash" },
    ],
    related: ["damage-formula", "power-thrust"],
    guides: ["crusader-grand-cross", "knight-hybrid"],
  },

  {
    slug: "asura-strike",
    title: "Asura Strike damage on Payon Stories",
    blurb:
      "The reworked Asura Strike formula: ATK × (8 + SP/10) + 1000, a flat 1000 at every rank, and unlike vanilla it does not ignore the target's DEF.",
    sections: [
      {
        h: "The formula",
        html: `<p class="formula">damage = ATK × (8 + ⌊SP ÷ 10⌋) + 1000</p>
<p>where SP is your <em>current</em> SP at the moment of the cast. Two things differ from
vanilla Ragnarok, and both matter:</p>
<ul>
<li>The flat bonus is <strong>1000 at every rank</strong>, not 250 + 150 per level. Rank buys you
the SP cost and the cast, not the flat damage.</li>
<li>Asura on Payon Stories <strong>does not ignore DEF</strong>. The vanilla skill bypasses it;
here the target's defence applies normally, so a high-DEF target genuinely blunts it.</li>
</ul>
<p>The cast consumes ⌊MaxSP × 0.2 × rank⌋ SP, so a bigger SP pool is both the damage
multiplier and the fuel.</p>`,
      },
      {
        h: "Why INT is a damage stat here",
        html: `<p>Because SP enters the multiplier, INT is not a support stat for a Monk — it is
part of the damage. Every 10 SP is another whole multiple of your ATK. That is what makes the
Monk build unusual: you stack STR for ATK <em>and</em> INT for Max SP, and gear that adds Max SP
adds damage directly.</p>
<p><strong>Spirit spheres</strong> add +3 ATK each to the Monk line, and because they land on
base ATK they are amplified by the ×(8 + SP/10) multiplier along with everything else.</p>`,
      },
    ],
    faq: [
      {
        q: "How is Asura Strike damage calculated on Payon Stories?",
        a: "Damage is your ATK multiplied by (8 + your current SP divided by 10, rounded down), plus a flat 1000. The flat 1000 is the same at every skill rank.",
      },
      {
        q: "Does Asura Strike ignore DEF on Payon Stories?",
        a: "No. Unlike vanilla Ragnarok Online, Asura Strike on Payon Stories takes the target's defence normally, so high-DEF targets reduce it.",
      },
      {
        q: "Does INT increase Asura Strike damage?",
        a: "Yes, indirectly but substantially. INT raises Max SP, and current SP is part of the damage multiplier, so more SP means a larger multiple of your ATK.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki — Asura Strike", href: "https://wiki.payonstories.com/Asura_Strike" },
      { label: "PSRO Monk Rework (2026)", href: "https://wiki.payonstories.com/Monk" },
    ],
    related: ["damage-formula", "triple-attack"],
    guides: ["monk-asura"],
  },

  {
    slug: "grand-cross",
    title: "Grand Cross damage and recoil on Payon Stories",
    blurb:
      "Grand Cross combines ATK and MATK, hits three times, applies defence asymmetrically, and hurts the caster — how each half is computed.",
    sections: [
      {
        h: "The formula",
        html: `<p class="formula">damage = (ATK + MATK) × (100 + 40 × rank)%</p>
<p>Holy element, delivered as three waves that are summed. Because both ATK and MATK feed the
same number, a Grand Cross Crusader invests in STR <em>and</em> INT rather than choosing.</p>`,
      },
      {
        h: "Defence applies — but asymmetrically",
        html: `<p>This is the part that surprises people. The physical half takes the target's
hard and soft DEF as normal, while the magic half takes <strong>soft MDEF only</strong> — hard
MDEF does not apply to it. That asymmetry was settled by calibrating against in-game screenshots
of an INT Grand Cross against a Knight of Abyss (hard DEF 55, hard MDEF 50): applying both hard
values undershot the real number badly, ignoring defence entirely overshot it, and the
asymmetric reading landed on it.</p>
<p>It also means <strong>Provoke helps</strong>: cutting the target's DEF scales the physical half,
which matches what players report.</p>`,
      },
      {
        h: "The recoil",
        html: `<p>Grand Cross hurts you too, in two parts:</p>
<ul>
<li>the hit re-run against <em>your own</em> DEF, MDEF and Holy resistance, then <strong>halved</strong> — players take half;</li>
<li>a flat <strong>20% of your current HP</strong>.</li>
</ul>
<p><strong>Faith</strong> reduces both: its Holy resistance cuts the damage-based half (up to −50%
at Lv10) and its +MaxHP raises the pool the 20% is taken from. The calculator shows the recoil as
its own red panel rather than folding it into your damage.</p>`,
      },
    ],
    faq: [
      {
        q: "Does Grand Cross ignore DEF on Payon Stories?",
        a: "No. The physical half takes hard and soft DEF normally, while the magic half takes only soft MDEF. Reducing a target's DEF with Provoke therefore does increase Grand Cross damage.",
      },
      {
        q: "How much does Grand Cross hurt the caster?",
        a: "Two parts: the hit recalculated against your own defences and Holy resistance then halved, plus a flat 20% of your current HP. Faith reduces both, through Holy resistance and extra Max HP.",
      },
      {
        q: "Should a Grand Cross Crusader stack INT or STR?",
        a: "Both. The damage adds ATK and MATK together before the skill multiplier, so STR and INT contribute to the same number, with VIT for survivability and the recoil.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki — Grand Cross", href: "https://wiki.payonstories.com/Grand_Cross" },
      { label: "RateMyServer skill database", href: "https://ratemyserver.net/index.php?page=skill_db&skid=254" },
    ],
    related: ["damage-formula", "weapon-size-penalty"],
    guides: ["crusader-grand-cross"],
  },

  {
    slug: "weapon-size-penalty",
    title: "The weapon size penalty, and Weapon Perfection",
    blurb:
      "Every weapon deals reduced damage against some monster sizes. Weapon Perfection removes that penalty outright — for you and your party.",
    sections: [
      {
        h: "The table",
        html: `<p>Before your status ATK is added, the weapon's own damage is scaled by how well
that weapon class suits the target's size:</p>
<table style="max-width:420px"><thead><tr><th>Weapon</th><th>Small</th><th>Medium</th><th>Large</th></tr></thead><tbody>
<tr><td>Dagger</td><td class="n">100%</td><td class="n">100%</td><td class="n">100%</td></tr>
<tr><td>One-handed sword</td><td class="n">75%</td><td class="n">100%</td><td class="n">75%</td></tr>
<tr><td>Two-handed sword</td><td class="n">75%</td><td class="n">75%</td><td class="n">100%</td></tr>
<tr><td>Spear (either hand)</td><td class="n">75%</td><td class="n">75%</td><td class="n">100%</td></tr>
<tr><td>Axe</td><td class="n">50%</td><td class="n">75%</td><td class="n">100%</td></tr>
<tr><td>Mace</td><td class="n">75%</td><td class="n">100%</td><td class="n">100%</td></tr>
<tr><td>Knuckle</td><td class="n">100%</td><td class="n">75%</td><td class="n">50%</td></tr>
<tr><td>Katar</td><td class="n">75%</td><td class="n">100%</td><td class="n">75%</td></tr>
<tr><td>Bow</td><td class="n">100%</td><td class="n">100%</td><td class="n">75%</td></tr>
<tr><td>Staff</td><td class="n">100%</td><td class="n">100%</td><td class="n">100%</td></tr>
</tbody></table>
<p>A few things fall out of that table. Daggers and staves are never penalised. Spears and
two-handed swords share exactly the same profile, so size is <em>not</em> what separates them.
Axes are the most lopsided melee weapon — full damage against Large, half against Small — and
knuckles are the mirror image, which is awkward for a Monk, since Large is where the big targets
live.</p>
<p>The penalty applies to the <em>weapon</em> portion only, not to your status ATK, so it costs
weapon-heavy builds more than STR-heavy ones.</p>`,
      },
      {
        h: "Weapon Perfection removes it",
        html: `<p>The Blacksmith buff <strong>Weapon Perfection</strong> nullifies the size penalty
completely: every weapon deals 100% to every size for its duration. On Payon Stories party members
receive the effect too, so one Blacksmith removes it for the group. Its rank only sets the duration
— the effect is the same at Lv1 and Lv5.</p>
<p>How much that is worth depends entirely on what you swing and at what. An axe against a Small
target recovers half its weapon ATK; a knuckle against a Large target likewise. A two-hander
against Medium — the size of most monsters and of players — recovers a quarter. A dagger gains
nothing, because it never lost anything.</p>`,
      },
    ],
    faq: [
      {
        q: "What does Weapon Perfection do on Payon Stories?",
        a: "It removes the weapon-versus-size damage penalty entirely, so every weapon deals full damage to every monster size. On Payon Stories party members receive the effect as well as the caster.",
      },
      {
        q: "Does the size penalty affect my whole attack?",
        a: "No, only the weapon's own damage. Your status ATK from STR, DEX and LUK is added after the size scaling, so builds that lean on stats rather than weapon ATK feel it less.",
      },
      {
        q: "Does a higher rank of Weapon Perfection remove more of the penalty?",
        a: "No. Rank only extends the duration. The penalty is fully removed at every rank.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki — Weapon Perfection", href: "https://wiki.payonstories.com/Weapon_Perfection" },
    ],
    related: ["damage-formula", "forged-weapons"],
    guides: ["blacksmith-battle-smith", "knight-hybrid"],
  },

  {
    slug: "forged-weapons",
    title: "Forged weapons: Star Crumbs, elements and slots",
    blurb:
      "What a Blacksmith's forge actually adds — seeking damage that ignores DEF, an element from the stone used, and why a forged weapon can never hold a card.",
    sections: [
      {
        h: "Star Crumbs add damage that ignores DEF",
        html: `<p>Star Crumbs give a forged weapon flat "seeking" damage, added <em>after</em> the
defence step and applied per hit:</p>
<table><thead><tr><th>Forge</th><th>Damage</th></tr></thead><tbody>
<tr><td>VS (1 crumb)</td><td class="n">+5</td></tr>
<tr><td>VVS (2 crumbs)</td><td class="n">+10</td></tr>
<tr><td>VVVS (3 crumbs)</td><td class="n">+40</td></tr>
<tr><td>Ranked forge</td><td class="n">+10 on top</td></tr>
</tbody></table>
<p>Because it lands after DEF and applies to every hit, it is worth most on fast, multi-hit
attacks and against armoured targets.</p>`,
      },
      {
        h: "The elemental stone sets the weapon's element",
        html: `<p>Forging with an elemental stone makes the weapon that element: Flame Heart for
Fire, Mystic Frozen for Water, Rough Wind for Wind, Great Nature for Earth. Those four are the
only forgeable elements. An elemental forge needs no Star Crumbs — a plain Fire weapon is a
perfectly ordinary thing to own — and an active endow overrides the forged element while it lasts.</p>`,
      },
      {
        h: "Forged weapons take no cards",
        html: `<p>A forge writes the crafter's signature and the crumb and element data into the
weapon's own card slots. There is no room left for a card, whatever slot count the weapon prints.
That is a real trade-off when planning: a VVVS Fire weapon competes against a triple-slotted one
with race cards in it, and which wins depends on the target's DEF and element.</p>`,
      },
    ],
    faq: [
      {
        q: "Can a forged weapon have cards on Payon Stories?",
        a: "No. The forge fills the weapon's card slots with the crafter's signature and the Star Crumb and element data, so no card can be inserted regardless of the weapon's printed slot count.",
      },
      {
        q: "How much damage does a VVVS weapon add?",
        a: "Three Star Crumbs give +40 damage per hit, and a ranked forge adds a further +10. It is applied after the target's defence, so it arrives at full value.",
      },
      {
        q: "Which elements can a weapon be forged with?",
        a: "Fire, Water, Wind and Earth, from a Flame Heart, Mystic Frozen, Rough Wind or Great Nature respectively. No other element is forgeable.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki", href: "https://wiki.payonstories.com/" },
    ],
    related: ["damage-formula", "weapon-size-penalty"],
    guides: ["blacksmith-battle-smith", "assassin-sonic-blow"],
  },

  {
    slug: "power-thrust",
    title: "Power-Thrust and the ATK buffs that stack with it",
    blurb:
      "Power-Thrust adds its percentage into the skill ratio rather than multiplying the total — five ranks, +25% at most.",
    sections: [
      {
        h: "Five ranks, +5% each",
        html: `<p>Power-Thrust (also called Over Thrust) has <strong>five ranks</strong> and grants
+5% ATK each, so +25% at maximum. It affects the caster and every party member on screen.</p>
<p>Crucially, the wiki notes that the bonus is <em>additive for skills, not multiplicative</em>:
it is added into the skill's ratio percentage. So Cart Revolution Lv5, a 250% skill, becomes a
275% skill — not 250% × 1.25 = 312%. On a plain auto-attack (100%) it becomes 125%.</p>`,
      },
      {
        h: "The rest of the Blacksmith buff kit",
        html: `<ul>
<li><strong>Maximum Power-Thrust</strong> — +20% ATK per level, but caster-only; it cannot be given to the party.</li>
<li><strong>Adrenaline Rush</strong> — attack speed, not damage. On Payon Stories the caster gets +30% ASPD with an axe or mace and +20% with any other melee weapon; party members get +20% / +10%.</li>
<li><strong>Weapon Perfection</strong> — removes the size penalty for the caster and the party.</li>
<li><strong>Weaponry Research</strong> — passive: +2 HIT, +2 ATK and +2% accuracy per level.</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: "How much ATK does Power-Thrust give on Payon Stories?",
        a: "Five percent per rank across five ranks, so twenty-five percent at maximum, for the caster and party members on screen.",
      },
      {
        q: "Is Power-Thrust multiplied with the skill's damage?",
        a: "No, it is added into the skill's ratio. A 250% skill under a maxed Power-Thrust becomes a 275% skill rather than being multiplied by 1.25.",
      },
      {
        q: "Can Maximum Power-Thrust be cast on party members?",
        a: "No. Maximum Power-Thrust affects only the caster; it is the Whitesmith's personal damage buff.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki — Power-Thrust", href: "https://wiki.payonstories.com/Power-Thrust" },
      { label: "Payon Stories wiki — Weaponry Research", href: "https://wiki.payonstories.com/Weaponry_Research" },
    ],
    related: ["damage-formula", "hit-and-accuracy", "weapon-size-penalty"],
    guides: ["blacksmith-battle-smith"],
  },

  {
    slug: "triple-attack",
    title: "Triple Attack, and how Rogues can borrow it",
    blurb:
      "Triple Attack is five ranks on Payon Stories, procs on normal attacks, and a Rogue who plagiarises it procs it too.",
    sections: [
      {
        h: "Five ranks, and the proc rate falls as damage rises",
        html: `<p>Payon Stories retuned Triple Attack to <strong>five ranks</strong>. Each rank
raises the damage and <em>lowers</em> the proc chance:</p>
<table><thead><tr><th>Rank</th><th>Damage</th><th>Chance</th></tr></thead><tbody>
<tr><td>1</td><td class="n">140%</td><td class="n">28%</td></tr>
<tr><td>2</td><td class="n">180%</td><td class="n">26%</td></tr>
<tr><td>3</td><td class="n">220%</td><td class="n">24%</td></tr>
<tr><td>4</td><td class="n">260%</td><td class="n">22%</td></tr>
<tr><td>5</td><td class="n">300%</td><td class="n">20%</td></tr>
</tbody></table>
<p>It <em>replaces</em> the normal attack when it fires rather than adding a hit. Knuckle weapons
gain a small extra proc chance that scales with job level, and while Critical Explosion is up the
proc can critical.</p>`,
      },
      {
        h: "Plagiarism: a Rogue with someone else's skill",
        html: `<p>A Rogue or Stalker copies the last offensive skill that hit them, at the rank it
was used and no higher than their own Plagiarism rank — one skill at a time, kept between fights
only while Preserve is on. Triple Attack is on the copyable list, and a copied Triple Attack procs
on the Rogue's normal attacks just as it does for a Monk.</p>
<p>That makes it one of the few plagiarised skills that changes your auto-attack damage rather than
giving you something to cast. In the calculator it is set in the Plagiarism slot, so you can leave
the damage skill on Normal attack and still see it.</p>`,
      },
    ],
    faq: [
      {
        q: "How many ranks does Triple Attack have on Payon Stories?",
        a: "Five. Damage runs 140% to 300% and the proc chance runs 28% down to 20%, so higher ranks hit harder but fire slightly less often.",
      },
      {
        q: "Can a Rogue use Triple Attack?",
        a: "Yes, by plagiarising it. A copied Triple Attack procs on the Rogue's normal attacks exactly as it does for a Monk, at the rank it was copied.",
      },
      {
        q: "Does Triple Attack add an extra hit to my attack?",
        a: "No. When it procs it replaces the normal attack rather than adding to it, so its value is the difference between its damage and the swing it displaced.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki — Plagiarism", href: "https://wiki.payonstories.com/Plagiarism" },
      { label: "Payon Stories wiki — Monk", href: "https://wiki.payonstories.com/Monk" },
    ],
    related: ["asura-strike", "damage-formula"],
    guides: ["monk-asura", "rogue-back-stab"],
  },

  {
    slug: "magnum-break",
    title: "Magnum Break's lingering fire damage",
    blurb:
      "After casting Magnum Break your attacks carry extra Fire damage — an added chunk that bypasses the target's DEF.",
    sections: [
      {
        h: "What the buff actually adds",
        html: `<p>For ten seconds after casting Magnum Break, your attacks carry an extra chunk of
damage equal to <strong>20% of a fresh normal-attack's base damage</strong>, converted to Fire.
Two details make it stronger than it sounds:</p>
<ul>
<li>It is 20% of a <em>normal attack</em>, not of the skill you are using.</li>
<li>It is added after the defence step, so it <strong>bypasses the target's DEF</strong>, and it is
element-fixed as Fire against the target's element.</li>
</ul>
<p>On Payon Stories the bonus rides <strong>auto-attacks and Magnum Break itself</strong> — not
every skill, as it does in vanilla.</p>`,
      },
      {
        h: "Wootan Fighter Card",
        html: `<p>A Wootan Fighter Card raises the lingering fire from 20% to 30%. Two copies do not
stack to 40% — the card sets the value rather than adding to it.</p>`,
      },
    ],
    faq: [
      {
        q: "How much damage does Magnum Break's fire buff add?",
        a: "An extra 20% of a normal attack's base damage, as Fire, on top of each attack for ten seconds. A Wootan Fighter Card raises it to 30%.",
      },
      {
        q: "Does the Magnum Break buff apply to skills?",
        a: "On Payon Stories it applies to auto-attacks and to Magnum Break itself, unlike vanilla Ragnarok where it applies to nearly every attack.",
      },
      {
        q: "Is the extra fire damage reduced by DEF?",
        a: "No. It is added after the defence step, so the target's DEF does not reduce it — though its Fire element still matters.",
      },
    ],
    sources: [
      { label: "Payon Stories wiki — Magnum Break", href: "https://wiki.payonstories.com/Magnum_Break" },
    ],
    related: ["damage-formula", "hit-and-accuracy"],
    guides: ["knight-hybrid", "super-novice-melee"],
  },

  {
    slug: "reflect-shield",
    title: "Reflect Shield on Payon Stories",
    blurb:
      "The reworked Reflect Shield formula makes VIT quadratic, so a tank's returned damage scales far faster than it used to.",
    sections: [
      {
        h: "The formula",
        html: `<p class="formula">damage = ⌊rank × (softDEF ÷ 2 + ⌊VIT ÷ 10⌋²) × (100 + 2 × hardDEF) ÷ 1000⌋</p>
<p>The important change is that <strong>VIT is quadratic</strong>. Under the old formula VIT
contributed linearly through soft DEF; now ⌊VIT/10⌋² means each block of ten VIT is worth more
than the last. Hard DEF still multiplies the whole thing, so armour and refine feed it too.</p>`,
      },
      {
        h: "Why the calculator won't give it a DPS",
        html: `<p>Reflect Shield fires when something hits <em>you</em>, so its throughput depends on
the monster's attack speed, not yours. The calculator prices the damage per reflected hit and
deliberately does not present a damage-per-second figure, because that number would depend on
what is attacking you rather than on your build.</p>`,
      },
    ],
    faq: [
      {
        q: "How does VIT affect Reflect Shield on Payon Stories?",
        a: "VIT enters the formula as VIT divided by ten, rounded down, then squared. That makes it quadratic, so each additional block of ten VIT returns more damage than the one before.",
      },
      {
        q: "Why does the calculator not show DPS for Reflect Shield?",
        a: "Because it triggers on incoming hits. Its rate depends on how fast the monster attacks you, not on your own attack speed, so a damage-per-second figure would say more about the monster than about your build.",
      },
    ],
    sources: [
      { label: "Payon Stories patch notes, 2026-08-09", href: "https://wiki.payonstories.com/Reflect_Shield" },
    ],
    related: ["damage-formula", "grand-cross"],
    guides: ["crusader-grand-cross"],
  },
];
