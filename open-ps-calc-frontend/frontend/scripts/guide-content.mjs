// Per-guide depth: the sections that turn a stat table into an actual guide,
// keyed by the slug in src/data/starterBuilds.json.
//
// Rules for anything written here:
//   * Stat/skill numbers that are specific to Payon Stories must be ones the
//     engine models and the ROADMAP audit verified — otherwise keep it
//     qualitative and let the calculator produce the number.
//   * `faq` entries become BOTH a visible section and FAQPage structured data,
//     so answers must be plain text, self-contained, and true on their own.
//   * `mechanics` cross-links to /mechanics/<slug>.html; `related` to sibling guides.
export const GUIDE_CONTENT = {
  "knight-hybrid": {
    why: `A Knight's damage is mostly flat ATK — STR, weapon mastery and refine — pushed through a
big two-hander. That profile is forgiving: it does not need a crit threshold or a cast-time
breakpoint to function, and mastery ATK lands after the target's DEF, so it holds up against
armoured monsters that punish weapon-ATK builds.`,
    playstyle: `Open with Bash on a single target and auto-attack between casts; Magnum Break for
packs, which also leaves a Fire buff on your attacks for ten seconds. VIT is what lets you stand
still and keep swinging, and it is the reason a Knight can tank targets an Assassin has to dodge.`,
    skills: [
      "<strong>Bash</strong> — your bread and butter. Each rank adds both damage and accuracy (+5% of your hit rate per level), so a maxed Bash lands on targets your auto-attack misses.",
      "<strong>Two-Handed Sword Mastery / Spear Mastery</strong> — flat ATK per level, applied after DEF. Max it early; it is the most reliable damage on the sheet.",
      "<strong>Magnum Break</strong> — AoE plus a ten-second Fire buff on your attacks that ignores the target's DEF.",
      "<strong>Provoke</strong> — cuts the target's DEF, which raises every subsequent hit.",
      "<strong>Endure / Auto Berserk</strong> — staying power while you commit to a target.",
    ],
    gear: `Start with any two-handed sword or spear you can wield and put every point of mastery in
before you chase a better weapon — mastery ATK is worth more than the same ATK on the weapon
because it lands after DEF. Then move to a slotted two-hander and add race or size cards for the
targets you actually farm. Armour goes to VIT and Neutral resistance; a Raydric Card is the single
biggest survivability upgrade for most melee.`,
    faq: [
      {
        q: "Is a Knight better with a spear or a two-handed sword?",
        a: "Size is not what separates them: spears and two-handed swords share the same size profile, full damage against Large and three quarters against Small and Medium. Choose on the skills instead — spears for Pierce and Brandish Spear and for riding a Peco Peco, two-handed swords for Bash and the higher raw ATK.",
      },
      {
        q: "How much DEX does a Knight need?",
        a: "Enough to stop missing what you fight, which depends entirely on the target's flee. Bash helps a great deal because each rank adds five percent of your hit rate, so a maxed Bash reaches targets your auto-attack cannot.",
      },
      {
        q: "Does Provoke increase my damage?",
        a: "Yes. Provoke reduces the target's DEF, and since defence is applied partway through the damage chain, everything after it lands harder.",
      },
    ],
    mechanics: ["damage-formula", "hit-and-accuracy", "magnum-break", "weapon-size-penalty"],
    related: ["crusader-grand-cross", "blacksmith-battle-smith"],
  },

  "crusader-grand-cross": {
    why: `Grand Cross is the rare skill that adds ATK and MATK together before its multiplier, so
STR and INT both feed one number instead of competing. It is Holy, which most undead and demon
targets are weak to, and it hits three times per cast.`,
    playstyle: `Grand Cross costs you HP as well as SP: the hit is re-run against your own defences
and halved, plus a flat 20% of your current HP. That is what makes VIT and Faith mandatory rather
than optional — you are paying for every cast. Pull a pack, cast into it, and watch the recoil panel
as carefully as the damage one.`,
    skills: [
      "<strong>Grand Cross</strong> — (ATK + MATK) × (100 + 40 × rank)%, Holy, three waves.",
      "<strong>Faith</strong> — Holy resistance and Max HP. Both reduce the recoil, so it is a damage-uptime skill as much as a defensive one.",
      "<strong>Holy Cross</strong> — a single-target Holy hit whose accuracy bonus rises 2% per rank, up to +20% of your hit rate at Lv10.",
      "<strong>Shield Boomerang / Shield Charge</strong> — shield-scaling damage for targets not worth the Grand Cross recoil.",
      "<strong>Providence</strong> — Holy and demon resistance for the fights that hurt.",
    ],
    gear: `A one-handed sword or spear plus a shield, and INT gear that does not cost you too much
VIT. Holy resistance directly increases how long you can keep casting, so Faith and Holy-resist gear
are damage upgrades in disguise. Weapon masteries and Demon Bane's flat bonus do apply to Grand
Cross, so keep them ranked.`,
    faq: [
      {
        q: "Does Grand Cross ignore DEF?",
        a: "No, not on Payon Stories. The physical half takes hard and soft DEF while the magic half takes soft MDEF only, so Provoke and other DEF reductions do increase the damage.",
      },
      {
        q: "How do I reduce Grand Cross recoil?",
        a: "Rank Faith and stack Max HP and Holy resistance. The recoil is the hit recalculated against your own defences and halved, plus twenty percent of your current HP, so Holy resistance cuts the first part and Max HP softens the second.",
      },
      {
        q: "Should a Grand Cross Crusader wear a shield?",
        a: "Yes for most content. The skill does not scale with the shield, but the recoil and the melee range you cast from make survivability the limiting factor, and it enables Shield Boomerang for single targets.",
      },
    ],
    mechanics: ["grand-cross", "hit-and-accuracy", "reflect-shield", "damage-formula"],
    related: ["knight-hybrid", "priest-magnus-exorcismus"],
  },

  "wizard-pve-dex": {
    why: `Wizard damage per cast is enormous but slow, so the binding constraint is almost never
MATK — it is cast time. DEX buys casts, and a cast you do not finish is zero damage. That is why the
DEX Wizard out-damages a pure INT one in practice despite a lower number on the tooltip.`,
    playstyle: `Position first, cast second. Storm Gust and Meteor Storm reward pulling a pack into
one place; Lord of Vermilion is the fastest to lay down when things are already gathered. A little
VIT stops a stray hit from cancelling a long cast, which is worth more than the INT it costs.`,
    skills: [
      "<strong>Storm Gust</strong> — the workhorse: heavy Water AoE that also freezes, which is defence as well as damage.",
      "<strong>Meteor Storm</strong> — Fire AoE for undead and plant-heavy maps.",
      "<strong>Lord of Vermilion</strong> — Wind AoE, the quickest of the three to get out.",
      "<strong>Jupitel Thunder</strong> — single-target Wind, and the reason Wind gear matters.",
      "<strong>Amplify Magic Power</strong> — +10% MATK per rank on your next spell, five ranks on Payon Stories.",
    ],
    gear: `A staff with MATK and INT, then anything that reduces cast time or after-cast delay.
Element matters more for a Wizard than for anyone else: matching the target's weakness is a larger
multiplier than any single piece of gear, so carry the spells rather than the perfect staff.`,
    faq: [
      {
        q: "How much DEX does a Wizard need on Payon Stories?",
        a: "Enough to reach the cast times you can actually play with, and ideally the instant-cast threshold for your key spell. The calculator's cast breakpoints panel gives the exact DEX for your build rather than a general number, because gear and Bragi change it.",
      },
      {
        q: "Is INT or DEX more important for a Wizard?",
        a: "INT is the damage per cast and DEX is the number of casts. Below the cast breakpoints DEX usually wins because an interrupted or slow cast wastes the MATK entirely, which is why the standard build maxes INT and then pours everything into DEX.",
      },
      {
        q: "Does Amplify Magic Power stack with elemental staffs?",
        a: "Yes. Amplify raises your MATK for the next spell and the element multiplier is applied separately later in the chain, so the two multiply together rather than overlapping.",
      },
    ],
    mechanics: ["damage-formula"],
    related: ["sage-bolter", "priest-magnus-exorcismus"],
  },

  "sage-bolter": {
    why: `Bolts are single-target damage that arrives in a chosen element, and element choice is the
biggest multiplier in the game. A bolter picks the right bolt for the target instead of hoping their
one spell matches, and Double Bolt doubles the volley outright.`,
    playstyle: `Identify the target's element, then bolt it with what it is weakest to. Because bolts
are per-hit, cast interruption costs you less than it costs a Wizard — you lose part of a volley
rather than a whole Storm Gust.`,
    skills: [
      "<strong>Fire / Cold / Lightning Bolt</strong> — the three elements you carry everywhere.",
      "<strong>Double Bolt</strong> — a second volley per cast, which is effectively double damage for the same cast time.",
      "<strong>Free Cast</strong> — move while casting; five ranks on Payon Stories, and it adds flee as well.",
      "<strong>Endow</strong> — turn a party melee's weapon to your element of choice; a Sage's contribution to a group is often larger than their own damage.",
    ],
    gear: `MATK staff, INT, and DEX for cast time. Elemental amplifier gear is worth carrying in sets
if you farm several maps, because switching element beats stacking MATK against a resistant target.`,
    faq: [
      {
        q: "What is Double Bolt on Payon Stories?",
        a: "It is the server's name for Double Casting, and it fires a second bolt volley instantly for the same cast. It applies to the bolts, Earth Spike and Soul Strike, and it is a Sage skill on Payon Stories rather than a Professor one.",
      },
      {
        q: "Which bolt should I use?",
        a: "Whichever the target is weakest to. Element is a larger multiplier than almost any gear upgrade, so a correctly matched bolt from a modest staff beats a mismatched one from a great staff.",
      },
      {
        q: "Is a Sage bolter better than a Wizard?",
        a: "For single targets and mixed-element content, often yes, because of element flexibility and Double Bolt. For clearing gathered packs a Wizard's area spells are far ahead.",
      },
    ],
    mechanics: ["damage-formula"],
    related: ["wizard-pve-dex", "sage-hindsight"],
  },

  "sage-hindsight": {
    why: `Hindsight turns a melee swing into a spell. You attack for ordinary weapon damage and a
flat 30% of those swings autocast the spell your Hindsight rank selects, so INT and AGI both become
damage stats — INT for the autocast, AGI for how often you swing.`,
    playstyle: `Pick the Hindsight rank that selects the spell you want, then simply auto-attack.
Because the spell is chosen by rank rather than at random, you can re-rank on the fly to suit the
target — Soul Strike for single targets, Fire Ball or Heaven's Drive when things clump.`,
    skills: [
      "<strong>Hindsight (Auto Spell)</strong> — the rank picks the spell: Soul Strike, the bolts, Fire Ball, Thunderstorm, Heaven's Drive. Ranks 9 and 10 select non-damaging spells.",
      "<strong>Free Cast</strong> — attack speed and flee while it is up.",
      "<strong>Endow</strong> — set your own weapon's element as well as the party's.",
    ],
    gear: `A fast one-hander rather than a big slow one: the autocast rides the swing, so swings per
second is the throughput. INT gear for the spell damage, AGI for the swings, and a shield because
you are standing in melee range as a cloth-armour class.`,
    faq: [
      {
        q: "How does Hindsight choose which spell it casts?",
        a: "The activated rank selects it rather than it being random. Rank one gives Soul Strike, ranks two to eight give the bolts, Fire Ball, Thunderstorm and Heaven's Drive, and ranks nine and ten select spells that deal no damage.",
      },
      {
        q: "Does Hindsight work with any weapon?",
        a: "Yes, and faster weapons are better because the autocast rides your normal attacks. Attack speed is the throughput, so a quick one-hander beats a slow two-hander for this build.",
      },
      {
        q: "Is INT or AGI more important for a Hindsight Sage?",
        a: "Both, in balance. INT sets how hard each autocast lands and AGI sets how often you swing, so the build wants high values of each rather than maximising one.",
      },
    ],
    mechanics: ["damage-formula"],
    related: ["sage-bolter", "assassin-sonic-blow"],
  },

  "hunter-double-strafe": {
    why: `Double Strafe is two hits from full range for one SP cost, and bow damage keys off DEX,
which is also your hit and your cast speed for traps. Almost every point you spend does two jobs.`,
    playstyle: `Range is the defence. Keep distance, let the falcon and traps do the work when things
close, and swap arrows to match the target — arrow element is free damage that costs you nothing but
inventory.`,
    skills: [
      "<strong>Double Strafe</strong> — the single-target staple; two hits per cast.",
      "<strong>Owl's Eye / Vulture's Eye</strong> — DEX and HIT, plus bow range.",
      "<strong>Falcon</strong> — Blitz Beat procs on your bow attacks, scaling with LUK and INT and ignoring DEF.",
      "<strong>Improve Concentration</strong> — AGI and DEX, so damage, hit and attack speed at once.",
    ],
    gear: `A composite bow you can slot, and a full set of elemental arrows. Arrows are the cheapest
damage upgrade in the game — carrying five types beats a single better bow for most content.`,
    faq: [
      {
        q: "Do arrows change my damage element on Payon Stories?",
        a: "Yes. The equipped arrow sets your attack element for physical hits, so matching arrows to the target is a straightforward multiplier that costs nothing but carrying them.",
      },
      {
        q: "Is Double Strafe affected by the weapon size penalty?",
        a: "Yes, like other physical attacks it is scaled by how well your bow suits the target's size before your status ATK is added.",
      },
      {
        q: "Does a falcon help a Double Strafe Hunter?",
        a: "Yes. Blitz Beat procs from your bow attacks for fixed damage that ignores DEF, and its chance scales with LUK, so even a modest investment adds steady damage.",
      },
    ],
    mechanics: ["damage-formula", "hit-and-accuracy", "weapon-size-penalty"],
    related: ["hunter-trapper", "bard-musical-strike"],
  },

  "hunter-trapper": {
    why: `Trap damage comes from INT and DEX and ignores the target's DEF entirely. Against armoured
monsters that blunt every weapon build, a trapper's numbers do not move — which is exactly when
traps are worth the setup.`,
    playstyle: `Traps are placed, not aimed: you set the ground, pull the target across it, and let
the element do the work. Because each trap is a different element, a trapper answers a wider range
of monsters than any single-element caster.`,
    skills: [
      "<strong>Land Mine</strong> (Earth), <strong>Blast Mine</strong> (Wind), <strong>Freezing Trap</strong> (Water), <strong>Claymore Trap</strong> (Fire) — pick by the target's weakness.",
      "<strong>Remove Trap</strong> — recover and re-place; traps are consumables and this is your economy.",
      "<strong>Ankle Snare</strong> — control that makes the damage traps land.",
    ],
    gear: `INT and DEX gear, and enough VIT to survive placing them. Bow choice barely matters for
the traps themselves, so use it for stats or carry one for Double Strafe as a second mode.`,
    faq: [
      {
        q: "Do Hunter traps ignore DEF on Payon Stories?",
        a: "Yes. Trap damage is computed from INT and DEX and is not reduced by the target's DEF, which makes traps unusually strong against heavily armoured monsters.",
      },
      {
        q: "Which trap should I use?",
        a: "Match the element to the target: Land Mine for Earth, Blast Mine for Wind, Freezing Trap for Water and Claymore Trap for Fire, choosing whichever the monster is weakest against.",
      },
      {
        q: "Is a trapper viable for solo play?",
        a: "Yes, though it is slower to set up than Double Strafe. Its advantage shows against high-DEF targets and in places where you can prepare the ground before pulling.",
      },
    ],
    mechanics: ["damage-formula"],
    related: ["hunter-double-strafe", "alchemist-acid-demonstration"],
  },

  "bard-musical-strike": {
    why: `Payon Stories turns the Bard into a real attacker: the Performing bonus adds ratio to
Musical Strike, and the equipped arrow supplies the element. An instrument plus the right arrows
gives you a ranged attack with the same element flexibility a Hunter enjoys.`,
    playstyle: `Sing when the party needs it, attack when it does not. Bragi in particular changes
what the casters around you can do, so a Bard's contribution is rarely just their own damage number.`,
    skills: [
      "<strong>Musical Strike</strong> — ranged physical damage, element from your arrow.",
      "<strong>A Poem of Bragi</strong> — cuts cast time and after-cast delay for everyone in range; the single most valuable song in a caster party.",
      "<strong>Assassin Cross of Sunset</strong> — attack speed for the melee around you.",
      "<strong>Musical Lesson</strong> — flat ATK with an instrument, and better songs.",
    ],
    gear: `An instrument you can slot, elemental arrows, and DEX-heavy gear. AGI is what turns
Musical Strike into sustained damage rather than an occasional poke.`,
    faq: [
      {
        q: "Can a Bard actually deal damage on Payon Stories?",
        a: "Yes. The Performing bonus adds ratio to Musical Strike and the equipped arrow sets the element, so a Bard with the right arrows is a genuine ranged attacker rather than only a support.",
      },
      {
        q: "Does the arrow element apply to Musical Strike?",
        a: "Yes, the equipped arrow supplies the attack element exactly as it does for a bow attack.",
      },
      {
        q: "Should a Bard prioritise DEX or AGI?",
        a: "DEX first for damage and hit, then AGI for attack speed. Both are needed for Musical Strike to be sustained rather than occasional.",
      },
    ],
    mechanics: ["damage-formula", "hit-and-accuracy"],
    related: ["dancer-throw-arrow", "hunter-double-strafe"],
  },

  "dancer-throw-arrow": {
    why: `Throw Arrow is the Dancer's mirror of Musical Strike, and it works the same way: Performing
adds ratio, and the arrow you have equipped decides the element. DEX drives the damage and the hit.`,
    playstyle: `Dance for the party, attack between. Like the Bard, your ensemble skills often matter
more to a group's output than your own damage — but unlike vanilla, you are not choosing between
them and contributing damage.`,
    skills: [
      "<strong>Throw Arrow</strong> — ranged physical damage with your arrow's element.",
      "<strong>Fortune's Kiss</strong> and the other dances — party-wide value that no other class provides.",
      "<strong>Dancing Lesson</strong> — flat ATK with a whip and better dances.",
    ],
    gear: `A slotted whip, a full arrow set, and DEX-first gear with AGI behind it.`,
    faq: [
      {
        q: "Is Throw Arrow worth using on Payon Stories?",
        a: "Yes. The Performing bonus adds ratio to it and the arrow sets its element, which makes it a real ranged attack rather than a filler skill.",
      },
      {
        q: "What is the difference between a Bard and a Dancer here?",
        a: "Mechanically the attacks mirror each other, Musical Strike with an instrument against Throw Arrow with a whip. The difference is which party songs and dances you bring.",
      },
      {
        q: "Do I need AGI as a Dancer?",
        a: "Enough to attack at a reasonable rate. DEX is the damage stat, but attack speed decides whether that damage is sustained.",
      },
    ],
    mechanics: ["damage-formula", "hit-and-accuracy"],
    related: ["bard-musical-strike", "hunter-double-strafe"],
  },

  "priest-magnus-exorcismus": {
    why: `Magnus Exorcismus lays down Holy area damage that hits undead and demon monsters in full,
which is most of what a Priest farms. Against those races it is the most efficient clearing tool in
pre-renewal, and it costs you nothing defensively to use.`,
    playstyle: `Place the ground, pull onto it, and let it tick. Turn Undead handles single tough
undead, and your buffs make you welcome in any party even while you farm your own way.`,
    skills: [
      "<strong>Magnus Exorcismus</strong> — Holy area damage over its duration, brutal against undead and demons.",
      "<strong>Turn Undead</strong> — a chance to remove an undead target outright, with damage on failure.",
      "<strong>Aspersio</strong> — turns your own or a party member's weapon Holy, which converts a melee character into an undead-killer.",
      "<strong>Safety Wall / Kyrie Eleison</strong> — what lets a cloth caster stand where the mobs are.",
    ],
    gear: `INT and DEX, with VIT for the moments a pull goes wrong. A rod with MATK and gear that
reduces cast time; Holy-boosting gear pays off across the whole build.`,
    faq: [
      {
        q: "What is Magnus Exorcismus best against?",
        a: "Undead and demon monsters, which take Holy damage in full. Against other races it is far less efficient, so it is a farming tool for specific maps rather than a general nuke.",
      },
      {
        q: "Does Aspersio help a party's damage?",
        a: "Considerably, when the targets are undead. It sets the weapon's element to Holy, and an active endow overrides other weapon elements while it lasts.",
      },
      {
        q: "Does a Priest need DEX?",
        a: "Yes. Magnus Exorcismus has a long cast, and being interrupted wastes the whole thing, so DEX is what makes the build function rather than a luxury.",
      },
    ],
    mechanics: ["damage-formula"],
    related: ["crusader-grand-cross", "wizard-pve-dex"],
  },

  "monk-asura": {
    why: `Asura Strike is the biggest single hit available to a pre-renewal character, and its
formula makes SP a damage stat: ATK × (8 + SP/10) + 1000. A Monk therefore builds STR and INT
together, which is unusual enough that ordinary stat advice does not apply.`,
    playstyle: `Everything is setup for one button. Gather spheres, get your SP full, land the combo,
and detonate. Because the flat bonus is 1000 at every rank and the cast eats a fifth of your Max SP
per rank, managing SP is the skill of the class.`,
    skills: [
      "<strong>Asura Strike</strong> — ATK × (8 + ⌊SP/10⌋) + 1000. It does not ignore DEF on Payon Stories.",
      "<strong>Call Spirits / Critical Explosion</strong> — spheres are +3 ATK each for the Monk line and feed the multiplier.",
      "<strong>Triple Attack</strong> — five ranks here, procs on normal attacks, and can crit while Critical Explosion is up.",
      "<strong>Finger Offensive</strong> — throws one sphere per rank; a useful single-target filler between Asuras.",
    ],
    gear: `Knuckles, STR for ATK, INT for the SP pool, and any gear that raises Max SP — it is
literally damage. DEX enough to land the combo hits that set Asura up.`,
    faq: [
      {
        q: "How much SP do I need for a big Asura Strike?",
        a: "As much as you can carry, because current SP is inside the multiplier: every ten SP adds another multiple of your ATK. The cast itself consumes twenty percent of your Max SP per rank.",
      },
      {
        q: "Does Asura Strike ignore DEF?",
        a: "Not on Payon Stories. The target's defence applies normally, unlike vanilla Ragnarok Online where the skill bypasses it.",
      },
      {
        q: "Do spirit spheres increase Asura Strike?",
        a: "Yes. Each active sphere adds three ATK for the Monk line, and because that lands on base ATK it is amplified by the skill's multiplier.",
      },
    ],
    mechanics: ["asura-strike", "triple-attack", "damage-formula"],
    related: ["assassin-sonic-blow", "knight-hybrid"],
  },

  "blacksmith-battle-smith": {
    why: `A Battle Smith brings its own buffs. Power-Thrust, Adrenaline Rush and Weapon Perfection
turn an ordinary axe swing into something several classes would need a party for — and Weaponry
Research quietly adds hit, ATK and accuracy to everything you do.`,
    playstyle: `Buff, then swing. Mammonite for burst when the zeny is worth it, auto-attacks the
rest of the time, and Cart Revolution for packs. If you forge, your own weapon is your best upgrade.`,
    skills: [
      "<strong>Power-Thrust</strong> — five ranks, +5% ATK each, added into the skill's ratio rather than multiplied on top.",
      "<strong>Adrenaline Rush</strong> — +30% attack speed with an axe or mace for yourself, +20% for the party.",
      "<strong>Weapon Perfection</strong> — removes the weapon-versus-size penalty for you and the party.",
      "<strong>Weaponry Research</strong> — +2 HIT, +2 ATK and +2% accuracy per level, on everything.",
      "<strong>Hilt Binding</strong> — small, permanent, and easy to miss in the skill list.",
    ],
    gear: `An axe or mace — Adrenaline Rush's full bonus is limited to those — and either a slotted
weapon with cards or a forged one. A forged weapon cannot hold cards, so that is a genuine choice:
Star Crumb damage and an element against cards for a specific race.`,
    faq: [
      {
        q: "How much ATK does Power-Thrust add?",
        a: "Five percent per rank across five ranks, so twenty-five percent at most, and it is added into the skill's ratio rather than multiplied at the end. A 250% skill becomes 275%.",
      },
      {
        q: "Should I use a forged weapon or a carded one?",
        a: "You cannot have both, because a forge occupies the weapon's card slots. Star Crumb damage ignores DEF and an elemental forge sets your element, so forged weapons shine against armoured or element-vulnerable targets, while cards win when you farm one race consistently.",
      },
      {
        q: "Does Adrenaline Rush work with every weapon?",
        a: "On Payon Stories it gives its full bonus with axes and maces and a smaller one with other melee weapons. Bows and guns are excluded.",
      },
    ],
    mechanics: ["power-thrust", "weapon-size-penalty", "forged-weapons", "hit-and-accuracy"],
    related: ["alchemist-acid-demonstration", "knight-hybrid"],
  },

  "alchemist-acid-demonstration": {
    why: `Acid Terror works through DEF, so the monsters that shrug off weapon builds are exactly
where it shines. Add plants that attack alongside you and the class turns into steady, DEF-proof
throughput rather than big single hits.`,
    playstyle: `Summon, throw, repeat. Throughput is limited by cast and delay more than by damage,
which is why an Alchemist gains more from a Bard's Bragi than almost any other class.`,
    skills: [
      "<strong>Acid Terror</strong> — (100 + 100 × rank)% and works through DEF; 600% at rank 5.",
      "<strong>Summon Flora / Marine Sphere</strong> — free damage that does not cost you casts.",
      "<strong>Pharmacy</strong> — your supply line, and it scales some Alchemist gear.",
      "<strong>Crazy Uproar</strong> — four ranks on Payon Stories: STR, VIT and soft DEF.",
    ],
    gear: `STR and DEX gear with enough AGI to keep plants and yourself moving. Bottles are the real
cost of the build, so Pharmacy ranks are effectively damage.`,
    faq: [
      {
        q: "Does Acid Terror ignore DEF?",
        a: "It works through defence rather than being reduced by it in the ordinary way, which is why it is the standard answer to high-DEF, high-HP targets.",
      },
      {
        q: "How much damage does Acid Terror do at max rank?",
        a: "Six hundred percent at rank five under the reworked formula of one hundred plus one hundred per rank.",
      },
      {
        q: "Why do Alchemists want Bragi?",
        a: "Because the build is limited by how often it can throw rather than by the damage of each throw. Reducing cast time and after-cast delay directly raises throughput.",
      },
    ],
    mechanics: ["damage-formula"],
    related: ["blacksmith-battle-smith", "hunter-trapper"],
  },

  "assassin-sonic-blow": {
    why: `Crits bypass both flee and DEF, so a LUK-hybrid Assassin sidesteps the two things that
usually blunt a melee build. Sonic Blow on Payon Stories can crit, which turns LUK from a
consistency stat into a damage stat.`,
    playstyle: `Open from cloak, land Sonic Blow, and let the katar's crit rate carry the rest.
Against high-flee targets crits are the answer; against high-DEF targets they are also the answer,
which is what makes the build so forgiving.`,
    skills: [
      "<strong>Sonic Blow</strong> — 900% at max rank on Payon Stories, and it can crit here.",
      "<strong>Sonic Acceleration</strong> — +50% accuracy for Sonic Blow, and +10% damage.",
      "<strong>Katar Mastery</strong> — ATK per rank and a large crit-damage bonus at max.",
      "<strong>Enchant Poison</strong> — a Poison weapon and a passive bonus against Poison-element targets.",
      "<strong>Cloaking</strong> — approach, and a damage bonus on the attack that breaks it.",
    ],
    gear: `A katar for crit, or dual daggers for the three-hit dual-wield model. LUK gear for crit
rate, STR for the hit itself, and INT only for the SP to keep casting Sonic Blow.`,
    faq: [
      {
        q: "Can Sonic Blow critical on Payon Stories?",
        a: "Yes. The server's rework lets Sonic Blow crit and scale with crit damage, which is why LUK is a damage stat for this build rather than only a consistency one.",
      },
      {
        q: "What does Sonic Acceleration do?",
        a: "It raises Sonic Blow's damage by ten percent and adds fifty percent accuracy. That accuracy is a percentage of your hit rate rather than flat HIT, so it turns a sixty percent chance into ninety.",
      },
      {
        q: "Katar or dual daggers?",
        a: "Katars give the higher crit rate and simpler damage; dual daggers use the three-hit model and benefit from two separate weapons, each of which can be forged or carded differently.",
      },
    ],
    mechanics: ["hit-and-accuracy", "forged-weapons", "damage-formula"],
    related: ["rogue-back-stab", "monk-asura"],
  },

  "rogue-back-stab": {
    why: `Back Stab is a heavy single hit that cannot miss, with a further multiplier when the target
is not facing you. Add Plagiarism — the ability to carry someone else's skill — and the Rogue
becomes the most situationally adaptable damage class on the server.`,
    playstyle: `Approach unseen, strike from behind, and keep the opportunity bonus by managing
where the target is looking. Plagiarism means your kit changes with what has hit you recently, so
Preserve is what turns a lucky copy into a plan.`,
    skills: [
      "<strong>Back Stab</strong> — always hits, and gains roughly forty percent more when the target is not facing you.",
      "<strong>Plagiarism</strong> — copies the last copyable offensive skill that hit you, at the rank it was used and capped by your own rank.",
      "<strong>Preserve</strong> — keeps that copy instead of losing it to the next hit.",
      "<strong>Raid</strong> — area damage for when one target is not the problem.",
      "<strong>Sword Mastery / Vulture's Eye</strong> — flat ATK, or bow range if you play the bow variant.",
    ],
    gear: `A dagger for Back Stab, or a bow if you lean on Double Attack at range. STR and AGI, with
enough INT to sustain repeated casts.`,
    faq: [
      {
        q: "What can a Rogue plagiarise on Payon Stories?",
        a: "Strictly offensive skills that can damage the Rogue, from a published list covering most classes — Bash, the bolts, Grand Cross, Asura Strike, Triple Attack and many more. Only one is held at a time unless Preserve is active.",
      },
      {
        q: "Does a plagiarised Triple Attack work for a Rogue?",
        a: "Yes. A copied Triple Attack procs on the Rogue's normal attacks exactly as it does for a Monk, which makes it one of the few copies that changes your auto-attack rather than giving you a skill to cast.",
      },
      {
        q: "Does Back Stab ever miss?",
        a: "No, it always hits. The opportunity bonus for striking a target that is not facing you is separate and multiplies the damage further.",
      },
    ],
    mechanics: ["triple-attack", "hit-and-accuracy", "damage-formula"],
    related: ["assassin-sonic-blow", "hunter-double-strafe"],
  },

  "super-novice-melee": {
    why: `A Super Novice borrows every first-class skill, which means Bash, Magnum Break, mastery and
Fury on one character. With the never-died bonus of +10 to all stats, it hits far above what the
name suggests.`,
    playstyle: `Play it like a small Knight with a crit habit. Fury's crit bonus is what lifts the
damage, and the never-died bonus is worth guarding — dying costs you ten points in every stat.`,
    skills: [
      "<strong>Bash</strong> — damage and accuracy, borrowed from the Swordman tree.",
      "<strong>Magnum Break</strong> — AoE and the ten-second Fire buff on your attacks.",
      "<strong>Fury (Critical Explosion)</strong> — the chant grants a large crit bonus.",
      "<strong>Weapon masteries</strong> — flat ATK after DEF, the same as any melee.",
    ],
    gear: `A dagger, one-handed sword or mace, and crit gear. Because your stat pool is smaller than a
second class's, cards and gear carry proportionally more of the build.`,
    faq: [
      {
        q: "How strong is a Super Novice on Payon Stories?",
        a: "Stronger than the name suggests. Access to every first-class skill, the Fury crit bonus and the never-died bonus of ten points in every stat make it a genuine melee character rather than a novelty.",
      },
      {
        q: "What is the never-died bonus?",
        a: "Reaching job level seventy without dying grants plus ten to all stats. It is a large fraction of a Super Novice's total stat pool, which is why it is worth playing carefully for.",
      },
      {
        q: "Should a Super Novice build crit?",
        a: "Usually yes. The Fury chant provides a large critical bonus, and crits bypass both flee and DEF, which compensates for the smaller stat pool.",
      },
    ],
    mechanics: ["magnum-break", "damage-formula", "hit-and-accuracy"],
    related: ["knight-hybrid", "assassin-sonic-blow"],
  },

  "gunslinger-desperado": {
    why: `Desperado is rapid multi-hit area damage that scales primarily with DEX, and a revolver
Gunslinger has Chain Action turning ordinary attacks into two. It is one of the few ranged classes
that wants to be inside the pack rather than away from it.`,
    playstyle: `Gather, then spray. Between Desperados your auto-attacks are doing real work thanks
to Chain Action, so attack speed and DEX both matter more than the tooltip suggests.`,
    skills: [
      "<strong>Desperado</strong> — multi-hit area damage around you, scaling with DEX.",
      "<strong>Chain Action</strong> — revolver attacks proc a second hit, up to seventy percent at max rank.",
      "<strong>Single Action</strong> — hit and attack speed with guns.",
      "<strong>Gatling Fever</strong> — a flat forty percent ATK on Payon Stories plus attack speed that scales with rank.",
    ],
    gear: `A revolver for Chain Action, DEX-first gear, INT for sustained SP, and VIT because
Desperado puts you in the middle of what you are shooting.`,
    faq: [
      {
        q: "What stat does Desperado scale with?",
        a: "Primarily DEX, which is also your hit and much of your attack throughput, so it is the clear first priority for the build.",
      },
      {
        q: "What does Chain Action do on Payon Stories?",
        a: "It gives revolver normal attacks a chance to fire a second time, reaching seventy percent at maximum rank, which roughly transforms auto-attack throughput.",
      },
      {
        q: "Is Gatling Fever worth using?",
        a: "Yes on Payon Stories, where it grants a flat forty percent ATK at all levels plus attack speed that rises with rank, and the vanilla flee penalty is suppressed.",
      },
    ],
    mechanics: ["damage-formula", "hit-and-accuracy"],
    related: ["hunter-double-strafe", "ninja-throwing"],
  },

  "ninja-throwing": {
    why: `Huuma Shuriken is heavy ranged area damage that is physical, so STR drives it while DEX
provides the hit and consistency. It is one of the cleanest "gather and delete" tools available
outside the mage classes.`,
    playstyle: `Throw from range, reposition, throw again. The Ninja's mobility skills are what keep
the build safe — you are trading the armour of a melee class for the ability not to be there.`,
    skills: [
      "<strong>Huuma Shuriken</strong> — the throwing line's heavy hitter, physical and ranged.",
      "<strong>Throwing Mastery</strong> — flat ATK for thrown weapons.",
      "<strong>Ninja Aura</strong> — +2 STR and +2 INT per level, to a maximum of five ranks here.",
      "<strong>The elemental jutsu</strong> — Flaming Petals, Freezing Spear, Wind Blade and friends, for when an element beats raw damage.",
    ],
    gear: `Shuriken and huuma for the throwing build, STR and DEX gear, and INT enough to keep the
jutsu available as a second mode.`,
    faq: [
      {
        q: "Is Huuma Shuriken physical or magical?",
        a: "Physical, which is why STR is the main damage stat rather than INT, with DEX for hit and consistency.",
      },
      {
        q: "What does Ninja Aura give on Payon Stories?",
        a: "Two STR and two INT per level to a maximum of five ranks, so ten of each when fully ranked.",
      },
      {
        q: "Should a Ninja invest in the elemental jutsu?",
        a: "Enough to answer targets that resist your main damage. They are magic and scale with INT, so they work best as a secondary mode rather than as the whole build.",
      },
    ],
    mechanics: ["damage-formula", "hit-and-accuracy"],
    related: ["gunslinger-desperado", "assassin-sonic-blow"],
  },
};
