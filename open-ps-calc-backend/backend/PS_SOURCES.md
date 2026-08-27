# Payon Stories source record

Every Payon Stories source this calculator's numbers come from, in one place: the
class-rework PDFs, the GM patch notes, and the hand-authored data decisions layered on top
of them. **Check here first.** It exists so a formula in the engine can be traced back to
its source without reopening the original PDFs, which live outside the repo in a personal
Downloads folder and so are not reachable by anyone else reading this code.

Reproduced for accuracy verification, with thanks to the Payon Stories team. All game
content, patch notes and rework documents are the work of the **Payon Stories** staff; this
calculator is an unofficial fan tool.

## How to use this

- **A rework PDF outranks the wiki.** The live wiki lags reworks, sometimes by months. The
  2026-08-22 audit found six skills where the wiki still showed pre-rework formulas that we
  had already correctly taken from a PDF (recorded in `ROADMAP.md`). Where the two disagree
  the PDF wins, and the conflict gets written down rather than quietly resolved.
- **The GM patch notes carry changes the class PDFs do not.** The 2026-08-09 PDFs covered
  Merchant / Blacksmith / Alchemist, but the same day's GM post also reworked Crusader's
  Reflect Shield and Swordsman's Magnum Break. Read both.
- **A GM may correct their own notes in a follow-up**, and the follow-up wins - Crescent
  Scythe's crit heal is "0.1% per refine", not the original post's flat "0.1%".
- **The item API lags a patch by about a day**, then catches up and sometimes carries terms
  the PDFs never mentioned. Re-check it a day or two after a patch.
- Dates marked *(downloaded)* are when the file was obtained, not when Payon Stories
  published it. Treat them as an upper bound on the real publish date.
- **When the item API returns "No data", try the wiki's `List of Custom Items`.** That page
  is the canonical register of PS-custom gear - name, item id, equipment type and source -
  and it covers items `tools.payonstories.com` does not carry at all. A 2026-08-26 sweep of
  every item id published on the wiki found 4 real cases the API cannot describe, three of
  which are on that page (Ring of Peace 8269, Talisman of Holy Protection 8324, Ardent Helm
  8417). It is the ONLY source for Ardent Helm.
  Two cautions from that sweep. Its ids are not always right - it lists **Frozen Pick as
  8293**, but the API resolves Frozen Pick to **8393** and says 8293 is Costume Onigiri Hat,
  so cross-check an id before trusting it. And its `<ref>` citations can be broken - Ardent
  Helm cites `Patch Note - 22 Jun 2026`, which never mentions the item.
  An item's *mechanical* effect often lives on the SKILL's page rather than the item list:
  Ardent Helm's only documented effect is a line on `Magnum Break`.

## Index

| Date | Source | Type | Affects |
|---|---|---|---|
| 2026-08-18 | Patch Notes (18th August 2026) | GM patch notes | Super Novice, Crazy Uproar, DPS room |
| 2026-08-18 | Dastgir client hotfix | Discord (@Payon News) | Super Novice skill tab |
| 2026-03-23 *(downloaded)* | Payon Stories Knight Patch | Class rework | Knight / Swordsman |
| 2026-03-31 *(downloaded)* | PSRO Priest Acolyte Rework | Class rework | Acolyte / Priest |
| 2026-06-28 *(downloaded)* | PSRO Crusader Rework - 2026 | Class rework | Crusader |
| 2026-06-28 *(downloaded)* | PSRO Monk Rework - 2026 | Class rework | Monk |
| 2026-06-29 *(downloaded)* | Assassin_Rework_PayonStories | Class rework | Assassin |
| 2026-06-29 *(downloaded)* | Payon Stories - Hunter Rework | Class rework | Hunter |
| 2026-06-29 *(downloaded)* | Rogue - Patchnotes - Payon Stories | Class rework | Rogue |
| 2026-07-01 *(downloaded)* | Payon Stories Sage Rework Publication (Final) | Class rework | Sage |
| 2026-07-07 *(downloaded)* | Gunslinger Release Patch Notes | Class release | Gunslinger |
| 2025-12-13 | Wizard and High Wizard Trans Class Changes (Publish 12.13.25) | Class rework | Wizard / High Wizard |
| 2025-10-24 *(downloaded)* | HW only Trans Notes (First coding request) | Class rework (draft) | High Wizard (trans) |
| 2026-08-09 | PayonStories Merchant 2026-08-09 | Class rework | Merchant |
| 2026-08-09 | PayonStories Blacksmith 2026-08-09 | Class rework | Blacksmith |
| 2026-08-09 | PayonStories Alchemist Rework 2026-08-09 | Class rework | Alchemist |
| 2026-08-09 | PayonStories Burning 2026-08-09 | Mechanic | Burning status |

---

# 1. GM patch notes

## 2026-08-18 - Patch Notes (18th August 2026)

> Baby Super Novices will receive their skill reset on login - they were so small they flew
> under the radar with the previous resets.
>
> **Changes**
> - Super Novice now has access to Cart Revolution and Crazy Uproar.
> - Added warning text on 'DPS room'.
> - DPS Room now allows MvPs to be spawned
> - Added Beams for: Drifter [4], Bone Helm [1], Photo Album [4], RSX
> - Dark Blinker drop rate lowered to 10.01%
> - Somebody reported Rekenber Engineers evacuating the mines, it seems their project went
>   out of their control...
>
> **Fixes**
> - Crazy Uproar now correctly increases STR and VIT per Rank.
> - Crazy Uproar is no longer map-wide but screen-wide.
> - Adrenaline Rush now persists after login.
> - Added some safety checks to Meltdown.
> - Fix to RSX that could have led to a server crash.
> - Fixed Soul Harvest Platinum Skill not granted again on reset.
> - Fixed Shrink Platinum Skill skill not granted again on reset.
> - Fixed Resource Roundup Platinum Skill not being granted again on reset.
> - Fixed Unfair Trick Platinum Skill not being granted again on reset.
> - Fixed Items not showing trade restrictions on item description.
> - Ardent Helm Quest has been fixed where it could previously get stuck on kill completion.
> - Fixed few characters having extra skill points due to reset.

### Calculator impact

| Line | Impact here | Status |
|---|---|---|
| Super Novice gets Cart Revolution + Crazy Uproar | Crazy Uproar was missing job 23 in the buff picker, so a Super Novice could not tick it | **Fixed** |
| Crazy Uproar +STR/+VIT per rank | We already do `str += lv; vit += lv` under the `MC_LOUD_PS_REWORK` flag - the server caught up to us | Already correct |
| Beams for Drifter [4] / Bone Helm [1] / Photo Album [4] / RSX | Drop-beam visual. The bracketed slot counts were checked against our data and all match (Drifter 13157, Bone Helm 5162, Photo Album 8133, RSX-0806 is card 4342) | No action |
| Crazy Uproar screen-wide, not map-wide | Range, not magnitude | No action |
| Adrenaline Rush persists after login | Server-side persistence | No action |
| Meltdown safety checks | `WS_MELTDOWN` is Whitesmith, a trans class we do not model | No action |
| DPS room, drop rate, platinum resets, quest and skill-point fixes | Not modelled | No action |

## 2026-08-18 - Dastgir client hotfix (Discord, @Payon News)

> Hotfix client patch [18th August 2026]:
> Added Crazy Uproar and Cart Revolution to SN tree (It was always available but in Etc.
> tab, it is now correctly shown in "Novice" tab)

**This reframes the patch-note line above.** Super Novice *always* had both skills; only the
client's tab placement changed. So the gap on our side was pre-existing rather than new: the
vanilla Hercules `skill_tree.conf` we scrape does not list `MC_CARTREVOLUTION` or `MC_LOUD`
for job 23, while Payon Stories has always granted them. Cart Revolution already worked here
(the skill picker is not job-gated and the engine prices it fine for a Super Novice); only
the Crazy Uproar buff toggle was gated by an explicit job list.

---

# 2. Class rework PDFs

Extracted text, lightly cleaned - ligature and spacing artifacts from PDF extraction were
repaired, wording is otherwise verbatim. Where extraction garbled a word it is left as-is
rather than guessed at.

## Knight / Swordsman - Payon Stories Knight Patch

*Date: 2026-03-23 (downloaded) · Type: Class rework · Source file: `Payon Stories Knight Patch.pdf`*

```text
Overview 
Knights are a very strong class. They are excellent solo farmers/levelers, mobbers , 
and tanks. However, the job is weak at the low end (under geared/no SP regen equipment), 
and there are more than a few dead skills. This relatively small rework aims to add some 
improvements to auto attacking knights and hopefully make those historically "useless" 
skills more attractive. 
- Core Changes: 
- Overall Buffs to sword wielding builds; 
- Agility Knights getting a new tool; 
- Small utility for Spear Knights. 
 
 Living Sword: 
 
While Living Sword buff is active, makes the next Bash, Magnum Break , Bowling Bash, 
Charge Attack, cost no SP . 
Comment: while this new effect will do nothing for geared knights mobbing with Bowling 
Bash or Brandish Spear, it should be a welcome boon for auto attacking and lesser-geared 
knights. 
 
 Counter Attack: 
 
1. No longer has a directional requirement. 
2. Duration increased to 0.6/1.2/1.8/2.4/3.0 seconds; 
3. Damage changed to 200%. 
Comment: directional requirements in RO were always awkward to try and make use of 
given the game's netcode. Both a damage increase and removal of that requirement should 
make this skill more practical for dealing with high DEF/FLEE enemies, or tanking. 

 Sword Quickening: 
 
Two-Hand Quicken renamed to Sword Quickening. 
1. Can now be used with One-Hand Sword for 1/3 of the buff (10% ASPD); 
2. When auto-attacking with Sword Quickening Active, 5% chance to trigger Living 
Sword for 30 seconds; 
3. Increased CRIT chance from 0.8% per level to 1% per level. 
Comment: for the moment, this is the only source for knights to generate the Living Sword 
buff. A very small increase to CRIT chance was added to benefit auto attacking knights. The 
partial "one handed quicken" effect normally from Soul Linkers is another in a series of 
changes that have already been made to incorporate those effects into each class' base 
toolkit, in preparation for the eventual Soul Linker rework/release. 
 
 Spear Stab: 
 
1. Maximum Skill Level changed to 5; 
2. Knocks back enemies to the maximum range of 1+SkillLevel; 
3. Damage Ratio changed to 100+40*SkillLevel; 
4. Range changed from 4+Spear Range to 3; 
5. Causes a 20% slow for 3s. 
Comment: this skill was always something that knights had to reluctantly get as part of the 
pre-requisite for Brandish Spear, effectively serving as a much weaker single target version 
of that skill which was never used. Now, Spear Stab can be used either as a pvp/woe tool or 
something to help with ki tting difficult enemies in parties (Note: It does not work on boss 
protocol). 
 
 
 
Removed from the skill tree. Any requirements moved to Blade Mastery. 
 
 Sword Mastery: 

 
 
Two-Hand Sword Mastery renamed to Blade Mastery. Now apply to One-Hand Swords as 
well (4*SkillLevel). 
Comment: we are condensing the two masteries into Blade Mastery for Swordsman. This 
is a small improvement to Swordman skill point economy for 2h Knight builds. 
 
 Charge Attack: 
 
1. Cast time changed to 0; 
2. Cooldown changed to 3s; 
3. SP Cost changed to 20; 
4. No longer pushes the target away. 
Comment: the strange mechanics surrounding this skill's distance -related cast time and 
damage made it wildly impractical to use, as did its huge SP cost. These changes should 
make it more viable for actual use (gap closing, interrupting casts, escaping a mob, etc). 
 
 Blade Mastery:
```

## Acolyte / Priest - PSRO Priest Acolyte Rework

*Date: 2026-03-31 (downloaded) · Type: Class rework · Source file: `PSRO Priest Acolyte Rework.pdf`*

```text
Overview 
 This rework focuses primarily on the Acolyte skill tree and leveling experience. 
Aiming to make leveling an acolyte less painful, as well as making changes to the host 
of acolyte skills that were useless and/or seldom taken. It also focuses on the less 
popular priest builds (TU, ME, BP) aiming to either strengthen or introduce QoL 
changes in an effort to make them more viable. 
 
-Core changes 
• Condenses several (often ignored) acolyte skills which alongside other 
changes will make them more attractive picks for any priest build. 
• Make Turn Undead stronger for priests who lean more heavily into the build 
archetype. 
• Reduce the overall clunkiness of ME priests and BP through skill changes and 
items and increase map variety for the two builds. 
 
 
 
 

Acolyte 
 Angelus 
- Skill condensed from 10 points -> 5. 
- Now grants +3 * SkilLLv Soft DEF in addition to the %-based modifier. 
 
 
 
 
 
 
 
 
 
Even for FS priests, this is a skill that was often ignored (outside of pre-req) because of 
how insignificant its damage reduction was for tanks, and how completely irrelevant it 
was for everyone else. Condensing the skill and its new static bonus to soft DEF 
makes it more viable, and worth casting in parties even without a tank. 
 
 Signum Crucis 
- Skill condensed from 10 points -> 5 
- All else unchanged (Formula is (23 + 8 * SkillLv + LevelDifferential)%) 
 Signum Crucis 
Level Base Success DEF Reduction Duration (s) SP Cost 
1 31% -14% 60 35 
2 39% -23% 120 35 
3 47% -32% 180 35 
4 55% -41% 240 35 
5 63% -50% 300 35 
 
This skill was occasionally picked up by battle priests and (rarely) MvP fs priests but 
 Angelus 
Level +Soft DEF Soft DEF Multiplier Duration (s) SP Cost 
1 3 10% 60 22 
2 6 20% 120 29 
3 9 30% 180 36 
4 12 40% 240 43 
5 15 50% 300 50 
was usually skipped because most builds couldn't afford to put points into it. 
Condensing the skill from 10 to 5 makes it a more attractive choice. 
 
 Decrease AGI: 
- Skill condensed from 10 points -> 5. 
- Success rate changed from 
(40 + 2*SkillLV + (BaseLV + INT)/5 - Target MDEF)% 
→ (23 + 8 * SkillLv + LevelDifferential)%. 
- AGI reduction slightly increased 
- SP cost decreased. 
- Note: Duration is still halved in PvP . 
 Decrease AGI 
Level Base 
Success 
AGI Reduction Duration (s) SP Cost 
1 31% -3 40 15 
2 39% -6 60 17 
3 47% -9 80 19 
4 55% -12 100 21 
5 63% -15 120 23 
 
Only ever taken by WoE/PvP priests, this skill with its vanilla success rate was a pain 
to use even if you put in all 10 skill points. By condensing the skill and having its 
success rate being level-difference based, it will be a more viable choice for FS priests 
and even BP when facing hard to hit enemies. 
 
 Holy Light 
- Now deals 250% MATK Holy Damage instead of 101 + BaseLvl% MATK 
- Now has a 0.1s cooldown (experimental, lag compensating feature) 
 
Originally the skill was quite weak. It was later changed to scaling based on base level. 
The increased power of this skill is part of an effort to make Holy Light a more viable 
sidearm for all priest builds. 
 

Priest 
 
 Turn Undead 
- The success formula has been changed to 
[(20*SkillLv) + (3 x LUK) + INT + BaseLv + (1 - TargetHP/MaxHP)*200]/1000% 
- Success rate is halved if BaseINT is < 40. 
- The skill no longer has a maximum success rate. 
- SP cost changed from 20 -> 35 
 
 Current TU 
 Multiplier Value 
Skill Level 20 10 
LUK 1 70 
INT 1 120 
Base Lvl 1 99 
Target HP 20,000 
Target MaxHP 20,000 
 
Success Rate 48.9% 
 
TU priests were almost always hybrids of some sort, as the benefit to "specializing" 
were meagre with the old TU formula, maybe seeing a ~5% success rate boost in total. 
With the new formula, TU priests who fully lean into their build will see meaningful 
reward for stacking LUK, trading versatility for becoming a much more powerful killer 
of the undead. 
 
 
 
 
 
 NEW TU 
 Multiplier Value 
Skill Level 20 10 
LUK 3 70 
INT 1 120 
Base Lvl 1 99 
Target HP 20,000 
Target MaxHP 20,000 
Success Rate 57.9% 
 Holy Strike 
- Valid targets now include Shadow element, Undead element, Ghost element, 
Undead race, Demon race (previously: Only Undead/Shadow element). 
 
While the power of this skill is unchanged, the wider range of targets still fit its theme 
while also expanding the map variety for battle priests. 
 
 Impositio Manus 
- Aftercast delay reduced from 3s → 1.5s 
 
Gravity apparently thought this skill was a lot stronger than it actually is, giving it an 
even bigger ACD than Gloria and most other buff skills. Reducing its ACD will make it 
less clunky to use for BP and safer for FS priests to use on party members. 
 
 Magnus Exorcismus 
- Aftercast delay changed from 4s → 3.5s 
-Valid targets now include Undead/Ghost element, Undead/Demon race 
 
The reduced ACD of ME will help a little with the build's survivability as well as reduce 
the overall clunkiness of using the skill. A wider range of targets will expand map 
variety for ME priests while still fitting the skill's theme (how is it that ghosts/spirits 
couldn't be exorcised?). 
 
 
 
 
 
 
 
 
 
 

 Sanctuary 
- Condensed to 7 ranks ("valid target charges" adjusted for 7 ranks) 
- Healing and charges per rank now scales (mostly) linearly per rank 
- No longer consumes a Blue Gemstone when mastered (rank 7) 
- Valid damage targets now include Undead/Ghost element, Undead/Demon race 
- A maximum of 3 instances of Sanctuary can be active at once 
 Sanctuary 
Level # of 
Charges 
HP Healed Per Wave Duration (s) SP Cost 
1 14 111 4 15 
2 16 222 7 18 
3 18 333 10 21 
4 20 444 13 24 
5 22 555 16 27 
6 24 667 19 30 
7 26 777 22 33 
 
Sanctuary was always somewhat of a niche skill, mostly seeing use in ET and WoE by 
FS priests. It was rarely used outside of those maps, or by any other build. 
 
Alongside Moon Rabbit Card's static increase, the skill now scales more linearly per 
rank, meaning that priests have the option to either save skill points or master it and 
no longer require a reagent for its casting. The possibility of the skill no longer costing 
a blue gem also makes Sanctuary a more practical choice for ME priests. 
 
The skill has technically been condensed, but only for simplicity's sake. It was very 
rare that anyone who took Sanctuary put more than 7 points into the skill. If they did, it 
was either a newer player, or just to get more value out of each bgem (E.g., a 
dedicated WoE priest) as the number of heal/damage charges continued to increase 
past rank
7. With the removal of the reagent cost for rank 7, those higher levels have 
little reason to exist. 
 
 
 

 
 B.S. Sacramenti 
- Now only requires one Acolyte class character (down from two), or a 
Crusader/Paladin standing next to the caster. 
- No longer requires a specific facing (hidden requirement previously) 
- Does not require target to be in party (it said it did, but never actually required this) 
- Now requires 1 Holy Water per successful cast. 
 
Endowing an armor with the holy element is both a powerful and unique effect, but 
the requirements to actually use the skill were a little silly and impractical. A single 
partner and Holy Water as a reagent makes the skill actually useable, especially for 
something like GC Sader duoing. 
 
 Renew 
- Now has skill fx and a sound when used 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 

New Items 
 
 Purifying Ring 
- "An old ring that was once used in rituals to exorcise the undead. What a terrible 
irony that it came to be in the possession of one of those very creatures. " 
- Reduces the cast time of Magnus Exorcismus by 5%. [Combo with Rosary[0], 
Rosary[1]] Heal now deals 100% of its heal value as damage to undead instead of 
50%. 
- Drops off Wraith (0.08%) 
 
This is a new item that combos with Rosary (slotted or unslotted) to increase "heal 
bomb" damage. This will be a very welcome boon to low-mid level caster acolytes 
especially, who struggle to solo level. The bonus to Magnus Exorcismus' cast time 
helps a little with low level ME priests. However, even stacking gyokuto + 2 of these 
rings (or any other combination of % cast time reduction cards) is worse than using 
zerom gloves at high DEX values (i.e., helps low lvl ME, does nothing for high lvl ME). 
 
Costume Rosary's Necklace 
- New item 
- "A simple necklace of the holy rosary. It reminds you of a brave, young priest." 
- Lower headgear costume. Usable by all classes. 
 
 
 

This is a new costume obtainable via a short quest that has to do with the lore 
surrounding Glast Heim, the old capital. This quest can be accepted by any Acolyte 
class (e.g., Priest, Monk), or Crusader character. The costume itself is account bound 
but can be worn by any class. 
 
 
 
 
 
 
 
 
 
 
 
 
 
Card Changes 
 
 
 
Old: Increase the healing of Sanctuary by 50%. 
New: Increases healing of Sanctuary as if it were 2 skill ranks higher (can exceed rank 
7). increase the area of effect of Sanctuary from 5x5 to 7x7. 
 
This card was occasionally used in ET, and rarely ever outside of there. With the 
removal of Sanctuary's reagent cost, part of this card's raw healing boost has been 
reduced. In its stead, however, the card increases the radius of the skill to make it 
easier to use for group healing. 
 
 

 
Old: LUK +2, increases damage of Holy Light by 10% 
New: LUK +2, increases damage of Holy Light by 20%. 
 
The increase to holy light damage is part of an effort to make the skill a more viable 
sidearm for all priest builds. 
 
 
 

 
 
Old: Autocasts up to Signum Crucis lvl
10. Combo: Mummy Card, Adds/increases 
chance of Holy Strike by 5% when attacking valid targets. 
New: Autocasts up to Signum Crucis lvl 5 (if mastered, otherwise rank 3), as that is 
the new maximum. Signum Crucis no longer triggers its ACD when autocast (via this 
card or any other source like monk card combo). Adds/increases chance of Holy 
Strike by 7% when attacking valid targets. 
 
There were two issues with this card. The first is that the autocast of Signum triggered 
its rather large ACD (2s) and could get annoying on BP or combo monk who frequently 
use skills. The second issue is that despite being an "offensive" shield option, it ended 
up being less DPS than just using a third %race/element card, even if 
you needed the hit from mummy card in most cases.
```

## Crusader - PSRO Crusader Rework - 2026

*Date: 2026-06-28 (downloaded) · Type: Class rework · Source file: `PSRO Crusader Rework - 2026.pdf`*

```text
Overview: 
 
Crusader
 
is
 
a
 
constantly
 
popular
 
class,
 
no
 
matter
 
the
 
server,
 
though
 
sadly
 
the
 
builds
 
they
 
have
 
are
 
not
 
equal
 
in
 
the
 
slightest.
 
A
 
common
 
issue
 
for
 
most
 
of
 
these
 
builds
 
is
 
a
 
very
 
restrictive
 
skill
 
tree,
 
more
 
so
 
than
 
most
 
classes
 
now
 
that
 
the
 
archetypes
 
have
 
settled
 
heavily
 
over
 
20
 
years.
 
Our
 
approach
 
was
 
multipronged;
 
 ● Lessen the prerequisites straining several builds. ● Improve the stat budget for a few builds. ● Make the already powerful Grand Cross skill a little bit easier to get going and 
less
 
frustrating
 
to
 
use.
 
 ● Introducing a brand new buildtype that fits future trans builds, while also 
making
 
Devotion
 
easier
 
as
 
a
 
potential
 
first
 
character.
 
Swordsman Changes 
Magnum Break - No longer affects skills, and only applies its semi-endow to auto attacks. Magnum Break has its place as a cheap early job AoE tool for leveling, with minor 
uses
 
after
 
getting
 
promoted,
 
and
 
even
 
less
 
use
 
after
 
transcendence.
 
This
 
change,
 
while
 
a
 
minor
 
nerf,
 
is
 
made
 
alongside
 
a
 
few
 
item
 
tweaks
 
detailed
 
in
 
the
 
"Gear
 
and
 
Card"
 
section
 
at
 
the
 
end
 
of
 
this
 
PDF.
 

 
Crusader Changes 
Spear Quicken - No longer grants Critical Hit - Grants 1 Hit *SkillLvl. - Grants 1 Flee * SkillLvl. As Crusader has even less support for builds based around the critical strike 
mechanic,
 
instead
 
of
 
pushing
 
more
 
of
 
an
 
identity
 
the
 
class
 
never
 
had,
 
we
 
are
 
pulling
 
back
 
on
 
this,
 
and
 
focusing
 
more
 
on
 
giving
 
the
 
build
 
less
 
stat
 
strain.
 
Increasing
 
the
 
top
 
end
 
Flee
 
and
 
Hit
 
the
 
class
 
can
 
achieve,
 
while
 
lowering
 
the
 
hard
 
requirements
 
of
 
Agi
 
and
 
Dex
 
investment,
 
was
 
the
 
goal
 
for
 
this.
 
Devotion - No longer requires Grand Cross to learn. Requires Faith 10 instead. - Cast time reduced from 3 to 1.5s - Duration removed, is now an upkeep spell. - Costs 5 SP every 5 seconds per link. Expires if it cannot be paid. - Added a grace range of 10 cells to the normal range. If a hit is taken or upkeep is 
paid
 
while
 
in
 
that
 
grace
 
range,
 
the
 
link
 
is
 
visibly
 
turned
 
off
 
(no
 
damage/buff
 
transfer,
 
no
 
colored
 
tether),
 
but
 
the
 
devotion
 
itself
 
remains.
 
Returning
 
in
 
spell
 
range
 
reenables
 
it
 
under
 
the
 
same
 
conditions.
 - Casting Devotion on yourself now cancels all active links. - Casting Devotion again on a target now cancels the link. This is a big change. An extremely powerful skill, held back by several things like high stat needs, 
awkward
 
mechanics,
 
and
 
little
 
in
 
the
 
way
 
of
 
visceral
 
response
 
to
 
help
 
the
 
player
 
keep
 
a
 
track
 
on
 
it.
 
There
 
is
 
not
 
less
 
to
 
do,
 
but
 
there
 
is
 
much
 
much
 
more
 
control
 
for
 
how
 
the
 
skill
 
functions.
 
 
Requiring
 
Faith
 
10
 
instead
 
vastly
 
lessens
 
the
 
skill
 
point
 
tax
 
for
 
Devoted
 
Crusaders(heh)
 
Alongside
 
this
 
big
 
buff
 
in
 
usage,
 
comes
 
a
 
nerf
 
in
 
the
 
way
 
of
 
Defender
.
 
Clever
 
skill
 
queueing
 
no
 
longer
 
gives
 
the
 
target
 
of
 
Devotion
 
80%,
 
instead
 
the
 
intended
 
30%
 
resistance
 
to
 
range
 
attacks.
 

 
Grand Cross - Now immune to pushback while casting. - SP Cost changed to 30+6*SkillLvl (was: 30+7*SkillLvl). While strong, this skill has always had a few issues that are more frustrating than 
anything
 
else.
 
Getting
 
knockbacked
 
when
 
hard
 
casting
 
a
 
static
 
ground
 
AoE,
 
which
 
wastes
 
time
 
and
 
SP,
 
is
 
a
 
core
 
issue
 
we
 
are
 
addressing
 
with
 
the
 
addition
 
of
 
a
 
"Strong
 
Shield"
 
effect
 
while
 
casting.
 
Be
 
careful
 
though,
 
as
 
you
 
won't
 
be
 
knocked
 
away
 
by
 
skills
 
like
 
Storm
 
Gust
 
either,
 
which
 
can
 
become
 
dangerous
 
very
 
quickly.
 
For
 
the
 
SP
 
change,
 
either
 
the
 
player
 
is
 
constantly
 
out
 
of
 
SP,
 
or
 
they
 
are
 
never
 
dipping.
 
Not
 
the
 
biggest
 
reduction,
 
but
 
a
 
welcome
 
one.
 
Providence - Previous effects removed. - Now a self cast with: 
30+(30xSkillLVL)seconds
 
Duration
 
20xSkillLvl
 
SP
 
cost
 
3
 
Second
 
long
 
cast
 
time
 
-
 
Can
 
no
 
longer
 
be
 
interrupted
 
or
 
dispelled.
 - Increase MDEF by 2 * SkillLvl. - Defense Penalty reduced by 50% when active (5% -> 2.5% per mob in excess of 2) - No longer requires Heal to learn. Another big change. 
The
 
loss
 
of
 
the
 
resistances
 
will
 
be
 
noticed
 
on
 
certain
 
targets,
 
but
 
large
 
amounts
 
of
 
resistances
 
is
 
something
 
we
 
are
 
actively
 
trying
 
to
 
avoid
 
unless
 
very
 
situation
 
specific.
 
 
Instead,
 
we
 
are
 
introducing
 
a
 
more
 
unique
 
tank
 
archetype
 
for
 
the
 
Crusader,
 
in
 
the
 
form
 
of
 
reducing
 
the
 
Defense
 
Penalty
 
when
 
tanking
 
groups
 
of
 
mobs,
 
making
 
your
 
non
 
%resistance
 
gear
 
go
 
much
 
further.
 
The
 
addition
 
of
 
MDEF
 
for
 
the
 
duration,
 
helps
 
reduce
 
the
 
more
 
dangerous
 
types
 
of
 
damage
 
a
 
Crusader
 
is
 
normally
 
unable
 
to
 
mitigate.
 
This
 
along
 
with
 
Endure
 
should
 
help
 
push
 
it
 
further.
 
Reduced
 
prerequisite
 
for
 
this
 
skill
 
too,
 
so
 
more
 
than
 
very
 
specific
 
builds
 
can
 
reach
 
it.
 

Reflect Shield - Now also deals additional damage equals to Soft Def * (1+1.75 x DEF/100) * 
SkillLVL/10.
 
This
 
requires
 
a
 
Hit
 
roll
 
(80
 
+
 
Hit
 
-
 
Enemy
 
Flee)
 - Further enhanced by cards and armor attributes, and ignores target DEF - % Reflect is now capped to the lesser of damage or defender's max health. - Specific to Reflect shield: No longer can trigger additional effects. Other reflect 
sources
 
may
 
still
 
trigger
 
additional
 
effects.
 - No longer get doubled regen from Hunter Fly or other drain source A few nerfs, made to let the skill breathe on its own. 
Autocast
 
builds
 
now
 
require
 
another
 
source
 
of
 
reflected
 
damage
 
to
 
trigger,
 
like
 
High
 
Orc
 
Card.
 
And
 
Hunter
 
Fly,
 
nor
 
other
 
sources
 
of
 
drain
 
type
 
healing,
 
no
 
longer
 
gets
 
a
 
doubled
 
effect.
 
 
The
 
%
 
Reflect
 
now
 
has
 
a
 
max
 
ceiling,
 
to
 
prevent
 
weird
 
sacrificial
 
tactics
 
for
 
future
 
content.
 
With
 
that
 
out
 
of
 
the
 
way.
 
A
 
Reflect
 
Shield
 
Crusader,
 
affectionately
 
called
 
a
 
Thorner
 
or
 
Thorder
 
on
 
staff,
 
works
 
by
 
taking
 
their
 
Soft
 
Def,
 
increasing
 
it
 
through
 
Defense,
 
weapon
 
cards,
 
and
 
armor
 
property
 
cards,
 
to
 
deal
 
DEF
 
ignoring
 
damage.
 
Limited
 
through
 
several
 
factors,
 
like
 
target
 
attack
 
speed,
 
and
 
access
 
to
 
healing,
 
we
 
hope
 
that
 
this
 
brand
 
new
 
build
 
will
 
be
 
interesting
 
to
 
figure
 
out.
 
This
 
also
 
functions
 
as
 
an
 
escalator-build
 
for
 
a
 
future
 
Martyr's
 
Reckoning
 
Paladin,
 
and
 
for
 
a
 
Devotion
 
Crusader
 
to
 
play
 
on
 
their
 
own.
 

Card Changes 
 Old: +1 DEF. 20% resistance to STUN New : +1 DEF. +10 Soft DEF, if base VIT is >77 gain an 
additional
 
+10
 
Soft
 
DEF
 Due to how item increases to status resistances work, a 20% 
increase
 
has
 
little
 
relative
 
impact
 
for
 
anyone.
 
 
So,
 
we
 
are
 
stepping
 
further
 
into
 
giving
 
more
 
sources
 
for
 
Soft
 
DEF,
 
similar
 
to
 
the
 
new
 
Mineral
 
Card
 
effect.
 

 Old: +1 DEF, +20% resistance to Bleeding. New : +1 DEF. Now increases the effect duration for Magnum 
Break
 
by
 
2
 
seconds
 
per
 
SkillLvl.
 
[Swordsman]
 
Instead
 
increases
 
the
 
effect
 
duration
 
for
 
Magnum
 
break
 
by
 
11
 
seconds
 
per
 
SkillLvl.
 Same reasoning as for all status resistance headgear cards, 
though
 
Bleeding
 
is
 
more
 
impactful
 
than
 
most
 
status
 
effects
 
now.
 
 
 
An
 
easy
 
pick
 
up
 
card
 
for
 
Swordsman
 
classes
 
to
 
gain
 
a
 
short
 
term
 
situational
 
damage
 
increase
 
to
 
their
 
auto
 
attacks.
 
Has
 
an
 
interesting
 
interaction
 
with
 
a
 
certain
 
new
 
Crusader
 
item.
 

 
Item Changes Stone Discus: 
Now
 
increases
 
the
 
damage
 
done
 
by
 
Shield
 
Boomerang
 
by
 
5%
 
per
 
level
 
of
 
refinement.
 The intention is for Stone Discus to be a chase item for 
Boomers,
 
while
 
the
 
previously
 
superior
 
Herald
 
of
 
the
 
Gods
 
will
 
remain
 
as
 
the
 
stable
 
alternative
 
that
 
instead
 
gives
 
a
 
chunk
 
of
 
survivability.
 
New Items There are two new items introduced for the Crusader job. 
1
 
Costume
 
1
 
New
 
item
 
with
 
a
 
brand
 
new
 
unique
 
effect.
 No hints, no teasers. Find them in the game. Search the old places. Show us your burning drive.
```

## Monk - PSRO Monk Rework - 2026

*Date: 2026-06-28 (downloaded) · Type: Class rework · Source file: `PSRO Monk Rework - 2026.pdf`*

```text
Overview 
 This rework primarily focuses on combo and spirit (aka TSS) Monks. It aims to 
make them more viable by giving them more practical tools for spirit sphere 
management, SP sustain and utility, rather than focusing on improving their already 
solid damage output. It also fundamentally changes AA monks through the revamped 
Critical Explosion skill and helps to make Asura Monks more economical. 
 
-Core Changes 
• Condenses several skills to loosen the previously very rigid combo monk skill 
economy. 
• Changes how combo skills work to allow Monks more flexibility as to whether 
they want to use a combo in a given situation, without being as punished for 
opting not to use one. 
• Strengthens spirit Monks (especially low - mid level ones) by giving them 
stronger tools for controlling single targets (without needing very high DEX). 
• Changes certain skills and items to give Monks an easier time sustaining skill 
use, and less downtime resummoning spirit spheres. 
• Changes the drop locations and drop rates of various Fist weapons. 
 
 
 
 

General Skill Changes 
 
 Absorb Spirits 
- Now has a 100% success rate (up from 40%) 
- Now absorbs SP equivalent to MonsterLVL * 0.35 + 5 (Instead of 1 * MonsterLvl SP) 
- No longer grants 1 Spirit Sphere on cast. 
 
 
 
Absorb Spirits was annoying to use, especially when you got a string of bad luck and 
repeatedly spammed a skill which did nothing. The skill is now completely consistent, 
even if on average it restores only a bit more than it did previously. The skill no longer 
grants a Spirit Sphere on successful cast because this would be excessive with a 
100% success rate, especially when paired with the other changes that make Spirit 
Sphere management easier. 

 Asura Strike 
- Cast time and ACD normalized for all ranks. 
- Now consumes (20% * SkillLv) SP instead of all ranks consuming all remaining SP . 
- Now deals damage equivalent to (MaxSP * 0.2 * SkillLv) as per its usual formula of 
ATK*(8 + SP/10) + 1000. If used without having enough SP for the rank cast (20% * 
SkillLv Max SP), uses all remaining SP as per the above formula. 
- When used after Combo Finish, Asura Strike has no cast time, requires only 2 spirit 
spheres and does not require the Critical Explosion status. 
 
 
 
 
 
 
 
There are two key changes to Asura. The first aims to make the skill more flexible than 
just being used for MvPs. Spirit/MvP monks can now use it at lower power levels to kill 
high HP (non-mvp) mobs like mini bosses or Odin/Abyss monsters much more 
economically than before. The second change allows Asura Strike to be more 
realistically used by combo monks as a finisher for beefy targets at the end of their 
combos. 
 
 Dodge 
- This skill has been removed. 
 
 
 
 Asura Strike 
Level % Of SP Consumed 
1 20 
2 40 
3 60 
4 80 
5 100 
 
 Iron hand 
- Renamed "Martial Arts" 
- Combines "Dodge" and "Iron Hand" into a single 10 rank passive 
- Same values to fist/bare hand weapon mastery, but now also affects maces. 
- Same +FLEE value as Dodge previously. No longer boosts ASPD. 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
One of the issues plaguing combo Monks is a rigid skill economy that only gets worse 
later as Champions (Requiring 66 skill points for all combo skills and passives, no 
room for asura or other optionals). Combining Iron Hand and Dodge into a single 
passive helps ease combo Monk skill economy, and paired with the condensing of 
Triple Attack, leaves room for the new Spirits Recovery and potentially Asura Strike. 
 
 Spirits Recovery 
- Has a new effect 
- After sitting for 5 seconds, grants the "Spirits Recovery" buff for 30 seconds which 
restores (SkillLv + MaxSP/200) SP every 5 seconds. 
- While the Spirits Recovery Buff is active, being within 30 cells of a monster that is 
killed and grants EXP to the monk refreshes the "Spirits Recovery" buff for 30 seconds 
(to clarify, even if the monk does not deal the killing blow i.e., a party member does). 
 Martial Arts 
Level +FLEE +Mastery (Mace/Fist) 
1 2 5 
2 4 10 
3 6 15 
4 8 20 
5 10 25 
6 12 30 
7 14 35 
8 16 40 
9 18 45 
10 20 50 
The existence of Absorb Spirits, the impracticality of Asura Builds sitting after using 
Asura Strike, and skill point availability ultimately resulted in Spirits Recovery never 
being picked up. Now the skill will have a meaningful impact on the previously 
strenuous SP management of both TSS monks and (especially) Combo Monks. 
 
 Critical Explosion 
- Now partially halts Spirit Recovery while active (SkillLvl SP regen persists, MaxSP 
bonus does not). 
- Now grants 17.5 + 2.5*SkillLv CRIT instead of 7.5 + 2.5*SkillLv 
- Triple Attack can critically hit while Critical Explosion is active. 
- All other combo skills cannot be used while Critical Explosion is active. 
- Can now be toggled off by reusing it instead of having to log out. 
 
 
 
 
 
 
 
 
 
 
Critical Explosion's bonus to CRIT was always largely irrelevant, because monk skills 
cannot crit and the way Triple Attack works is it "eats" an autoattack when it triggers, 
meaning your chance of an attack being a CRIT was actually lower than suggested. 
Critical Explosion now has its function as a CRIT Stance fully realized as it allows 
Triple Attack to critically hit, doing away with the aforementioned issue of TA 
effectively reducing CRIT. The skill now enables AA Monks to be "CRIT Monks" , able to 
capitalize on cards and equipment that have to do with the stat in a way they never 
could before. 
 
 
 
 Fury 
Level +CRIT 
1 20 
2 22.5 
3 25 
4 27.5 
5 30 
 
 Steel Body 
- Now becomes subject to the "Overcrowding" penalty when the user is being 
attacked by 23 enemies or more (Every enemy after 23 decreases DEF by 5%) 
- Can now be removed by recasting the skill. 
The dynamic where MS monks had to constantly relog when tanking for a party was 
ridiculous. The skill can now be toggled off at will, though with its usual cast time as a 
balancing measure. An upper limit to the power of this skill has been added as MS 
monks are able to pull entire maps using certain setups. 
 
 Finger Offensive 
- Now innately grants 3 Spirit Spheres when used to get a killing blow on a target. 
- Cast time reduced from 1+1*SkillLv seconds → 1+0.8*SkillLv seconds. 
 
An issue with TSS monks is that they don't have a fast enough cast time until high 
levels to be able to hit aggressive or cast sensing enemies before being reached by 
them. The cast time has been reduced so that the build can level on non-passive 
enemies sooner than before. Similar to the change made to Investigate, and as part of 
an effort to make existing skill-related cards less "mandatory" for skill use, SCOUT's 
sphere refund effect has been incorporated into TSS. 
 
 Body Relocation 
- Now requires Martial Arts 10 instead of Dodge 5 (I.e., Same number of skill points 
required as before). 
 
 Blade Stop 
- Now requires Martial Arts 5 instead of Dodge 5. 
 
 
 
 

 
 Ki Translation 
- No longer requires recipient to be in a party with the Monk 
- SP cost reduced from 40 → 20 
- Cast time reduced from 2s → 1s, cast delay reduced from 1s → 0.5s 
 
Ki Translation always had a useful effect, but took dreadfully long to bestow 5 spheres 
on someone and cost a whopping 200 SP to do. Now at only 2x the cast time, SP cost 
and ACD of Call Spirits, Ki Translation will be a lot more practical to use either for split 
parties, buffing passersby in the Payon, etc. 
 
 Ki Explosion 
- ACD reduces from 2s → 1s 
 
Ki explosion likewise was useful in theory, but its long ACD made it impractical as an 
actual tool for crowd control (especially while comboing). 
 
 
 
 
 
 
 
 
 
 
 
 
 
 

Combo Skill Changes 
 
Regarding Combos 
 A brief history of how combos worked is that there was always a delay after Triple 
Attack or Chain Combo (if you had points in the next combo skill and 1+ spirit sphere 
active) on officials. However, this was bugged on Hercules until relatively recently (2 
years ago) when a fix to make it more official-like was pushed. The result is that 
comboing worked more smoothly, but the change was controversial as while some 
celebrated it, others who didn't want to combo in a given situation felt punished by 
this delay and that put a lot of people off playing them. 
 
The new monk rework removes this delay, triggering only the ASPD cooldown (the bare 
minimum required for animations to function). Instead, a new "x skill ready" buff 
exists. 
 
They are as follows: 
• Combo Ready: Lasts 3 seconds, enables the use of Chain Combo and Call 
Spirits. When Call Spirits is used during this window, it has no cast time, does 
not interrupt autoattacking and grants 2 spheres instead of 1. 
• Combo Finish Ready: Lasts 0.8s, enables the use of Combo Finish. Triple 
Attack cannot trigger while this is active, but autoattacking is not interrupted. 
• Asura Strike Ready: Lasts 0.8s, enables the use of Asura Strike with special 
properties (see page 3). 
 
 
The aim of this change is to still allow for smooth combo flow (especially with being 
able to gain spheres as part of a combo), while not impeding those who don't intend 
on using a combo in a given situation. 
 
 
 
Triple Attack 
- Condensed from 10 skill points to 5 
- Rank 5 is equivalent to the old rank 10's proc rate and damage (20% rate, 300% 
damage). 
- Requires Martial Arts 5 instead of Dodge 5 
- While wielding fist weapons, now grants a passive 0.2*SkillLvl% increased activation 
rate per 10 Joblvls for a total +5% bonus at rank 5 for a j50. 
- Triple Attack now triggers the "Combo Ready" buff, which enables the use of Chain 
Combo and Call Spirits (see page 8) for 3 seconds. 
 
 
 
 
 
 
 
 
 
 
Triple Attack had this weird dynamic where combo monks had the option to take 5 
points in the skill for the increased proc rate and slightly more DPS (via more frequent 
combos) or put all 10 points for a DPS loss but better SP efficiency. Condensing this 
skill does away with this dynamic and alongside the Martial Arts change allows combo 
monks to pick up the new Spirits Recovery as well as one optional skill, without 
affecting Rogues who plagiarize the skill. 
 
The 2%/3% increased proc rate to Triple Attack has been moved to this skill from the 
combo skills, as it is no longer needed after the combo delay changes and AA crit 
monk shouldn't feel forced to take those skills despite never using them. 
 
 
 
 Triple Attack 
Level Activation Rate ATK Mult 
1 28 140% 
2 26 180% 
3 24 220% 
4 22 260% 
5 20 300% 
 Chain Combo 
- Damage reduced to 260%/320%/380%/440%/500% 
- No longer passively increases TA activation rate. 
- Putting a point in this skill no longer adds a delay after Triple Attack activates. 
- After Chain Combo is used, the Monk gains a buff called "Combo Finish Ready" for 
0.8 seconds which prevents Triple Attack from triggering and enables the use of 
Combo Finish. This effect will not trigger unless the Monk knows Combo Finish and 
has at least 1 Spirit Sphere active. 
 
Combo Finish 
- Damage increased to 345%/435%/525%/615%/705% 
- No longer grants a damage buff after use. 
- No longer passively increases TA activation rate. 
- Putting a point in this skill no longer adds a delay after Chain Combo activates. 
- After Combo Finish is used, the Monk gains a buff called "Asura Strike Ready" for 2 
seconds which enables the use of Asura Strike with special properties (See page 3). 
This effect will not trigger unless the Monk knows Asura Strike and has at least 2 Spirit 
Spheres Active. 
 
It should be noted that with the above adjustments, partial combo (i.e., just Triple 
Attack -> Chain Combo spam) and full combo Monk DPS is roughly identical to before 
the rework. The aim of these changes wasn't to increase Combo Monk DPS (which is 
actually quite good), but to make it flow much smoother and be less tedious 
especially with regards to what was pretty brutal SP management and with having 
constant downtime casting Call Spirits. 
 
 It was also to allow monks the freedom to simply autoattack enemies without 
essentially losing this option as soon as they put a skill point into Chain Combo. 
Likewise, a monk that has spirit spheres active and points in further combo skills will 
not be as punished for opting not to use the next combo. 
 

Card Changes 
 
 
Old: Adds a 0.2% chance when attacking of autocasting Call Spirits. [Acolyte] The 
chance is increased to 2%. 
New: Refunds 33% of the SP cost of Asura Strike (Whether hard cast or used as a 
combo). Now has a 1% chance when attacking of autocasting Call Spirits. [Acolyte] 
The chance is increased to 5%. The SP refund after Asura Strike does not stack with 
multiple Greatest General Cards. 
Greatest General card's proc rate was absurdly low for non-acolytes, and difficult to 
justify using as a Monk in any scenario. Now it'll be more viable for all autoattackers 
(especially combo/AA monk) and be a cost-saving tool for any monk using Asura 
Strike. 
 

 
 
Old: +1 STR, -10% cast time of Throw Spirit Sphere, refunds 3 Spirit Spheres when 
Throw Spirit Sphere kills as target. 
New: +1 STR. Grants a 1*SpiritSphere knockback to Throw Spirit Sphere and a 3 cell 
knockback to Investigate in addition to their usual effects. 
 
The change to this card should make hunting targets with TSS and Investigate more 
practical for spirit monks, especially lower level monks (with lower DEX) or when 
paired with Blade Stop. 
 
 
 
 

Weapon Changes 
 Waghnak [4] 
- Drop rate increased from 0.04% → 0.06%, Bloody Butterfly (1408) 
 
The drop rate of this fist weapon is now similar to Huuma Giant Wheel Shuriken [4]'s 
drop rate from DRILL. 
 
 Studded Knuckle [3] 
- No longer drops from Green Maiden (1631) 
- Now drops from Yao Jun (1612) at a 0.06% rate 
 
This weapon was exceedingly rare owing to how few Green Maiden spawns there are 
(5) and how seldom they are hunted. The weapon's scarcity was also at odds with 
other weapon type's 3 slot, level 2 weapons. 
 
Knuckle Duster [3] 
- No longer drops from Zhu Po Long/Dancing Dragon (1609) 
- Now drops from Bongun (1611) at a 0.06% rate 
 
This weapon was added to Dancing Dragons a long time ago as a custom change, as it 
doesn't normally drop from anywhere. Its new drop location via Bongun is more fitting 
and should make it more readily available for monks looking for a budget weapon. 
 
 Finger [2] 
- Drop rate increased from 0.02% → 0.04%, Wootan Fighter (1499) 
- Now also drops from Green Maiden (1631) at a 0.36% rate 
 
This weapon was exceedingly rare given its drop rate and how few people ever hunted 
Wootan Fighters. Now at 0.04% and 0.36%, its drop rate is similar to that of Gladius 
[3] 's (another lvl 3 weapon) drop rate from Sleepers (0.04%) and Skeleton Generals 
(0.36%).
```

## Assassin - Assassin_Rework_PayonStories

*Date: 2026-06-29 (downloaded) · Type: Class rework · Source file: `Assassin_Rework_PayonStories.pdf`*

```text
Payon Stories Assassin Rework 
Below is a summary of the changes Assassins are getting as a part of the rework, along with some added 
commentary. 
 
 
General Server Changes 
Stat and Skill Resets: To facilitate player testing and adaptation on the live server, Assassins will be able 
to get up to 20 full Skill and Stat resets from an NPC in Morroc at coordinates 180,164. This reset NPC is 
planned to disappear at the end of April 30th 2024 (server time). 
Removal of the Crit Shield Mechanic: In classic RO, a monster's luck will reduce the critical chance you 
have against them. We are removing that mechanic from Payon Stories, which is a change that will 
benefit all classes. Players will get to experience the critical chance they expect to have based on their 
stats and gear without having to worry about reductions from the monsters luck. 

 
Thief Skill Changes 
Katar Offhand Damage: Has been increased from 21% to 61% (4% per level of Katar Mastery stacking up 
to 40% at level 10 and stacks with the 21% given by max level double attack.). This makes Katar auto 
attacks more impactful (the benefit still comes from learning the skill Double Attack, a Thief skill). 
 
Envenom: This skill now uses the element of your weapon instead of being forced to be the poison 
element. It still has a chance of inflicting the poison status as usual. This change will also let Poison React 
counter with your weapon element, making it more viable. This change helps Rogues that may want to 
use envenom as well. 
 
Assassin Skill Changes 
Cloak: Is getting two major improvements. 
1. Damage Bonus for Initiative - The first improvement is that when using Cloak level 3 or higher, if you 
auto attack to come out of cloak then your first auto attack deals double damage. If you Sonic Blow to 
come out of cloak then it will deal 10% more damage. This gives some incentive to use cloak in the 
playstyle of the Assassin to start a fight, and gives cloak some use in PVM. 
2. Go from Hide into Cloak - The second improvement is that you can now go into Cloak status while in 
Hide status. Being able to go directly from Cloak into Hide, and from Hide into Cloak, will improve 
Assassin mobility in PVM and WoE. 
 
Enchant Poison: The maximum level of this skill has been reduced to 5, making it easy to master. This 
skill now also gives the Assassin a passive damage increase to Poison element monsters. You would not 
use Enchant Poison against a Poison elemental monster, but having the skill learned will still passively 
increase your damage against them. 
 
 
 

Grimtooth: Can now be a critical hit. The chance of Grimtooth being a critical hit is double the crit 
chance of the Assassin, so having a 50% crit chance means that Grimtooth will crit 100% of the time 
(similar to how Katar auto attacks work). When Grimtooth crits it deals the maximum of its damage 
variance, and bypasses enemy defense just like any other critical attack. Note that Grimtooth does not 
benefit from the +50% critical damage bonus from having learned Katar Mastery level 10, but it does 
benefit from items like Ring of the Claw and critical racial cards like Assaulter Card. When Grimtooth 
does a critical hit the player will see the usual critical hit icon as feedback. This change lets Crit Katar 
builds with no dex utilize the skill effectively, especially against high defense or high flee enemies. 
 
 
 
 
Sonic Blow: Is getting three major improvements, listed below. 
1. Higher Base Damage - Sonic Blow now does [(100 + 400 + 40 * SkillLv) ATK = 900% ATK, higher than 
the original 800% at max level. 
 
2. Agility and Dex stats help Sonic Blow - An Assassin with Agility and Dexterity will now benefit from a 
lower Sonic Blow delay time. This change lets assassins that invested points into those stats get some 
benefit when using Sonic Blow. The formula for this and some examples are below: 

 
3. Sonic Blow can now Critical Hit - Just like Grimtooth, Sonic Blow can now be a critical hit. The rules for 
how Sonic Blow can crit are the same as Grimtooth. To recap: "The chance of Sonic being a critical hit is 
double the crit chance of an Assassin, so having a 50% crit chance means that Sonic Blow will crit 100% 
of the time (similar to how Katar auto attacks work). When Sonic Blow crits it deals the maximum of its 
damage variance, and bypasses enemy defense just like any other critical attack. Note that Sonic Blow 
does not benefit from the +50% critical damage bonus from having learned Katar Mastery level 10, but it 
does benefit from items like Ring of the Claw and critical racial cards like Assaulter Card. When Sonic 
Blow does a critical hit the player will see the usual critical hit icon as feedback. This change lets Crit 
Katar builds with no dex utilize the skill effectively, especially against high defense or high flee enemies." 
 
 
 
 
 
 
 
 

Venom Dust: Now applies the same Mailbreaker Payon Stories debuff to anything standing on it, 
including MVP and boss-flagged monsters, and has no ingredient casting cost. This debuff increases 
physical and magical damage taken by 10% for 5 seconds. The target does not have to become poisoned 
to get the debuff, they just have to be standing on the Venom Dust. This brings new usefulness to the 
skill as a "setup" skill for dealing higher damage with auto attacks, or with other skills. Casting Venom 
Dust will also help your party-mates do more damage, and letting the skill work on MVP gives Assassin a 
way to participate (though note that the MVP will not be poisoned). 
The maximum level of the skill is also being reduced to 5 in order for it to be easier to master. The new 
stay duration per level is shown below. 
 
 
Poison React: Is getting 3 improvements. 
 
1. Passive Life Steal - For every level of Poison React the Assassin has learned, they will get a passive 
chance of 0.1% Life Steal from all of their physical attacks and skills. At level 10 this is 1% life steal (half of 
an Assassin Fly card) at 5% chance. This passive is always on even if Poison React is not active. This 
change gives Assassins a bit of sustain for leveling. 
2. Because Envenom has been changed to be the same as the weapon element, Poison React will now 
counter with the same element as your weapon, making it useful against any monster with elemental 
weaknesses. 
3. If an Assassin is attacked by a poison elemental monster, Poison React will counter the same way it 
does against other monsters. It will not act differently just because the attacking enemy is poison 
element. 
These changes should make Poison React a more attractive skill to learn. 
 
 
 
 
 
 

Venom Splasher: Is getting 5 improvements. 
1. Works on MVP - The skill now works on MVP and boss-flagged monsters. 
2. Faster Explosion Time - The bomb will now go off after just 2 seconds. 
3. Faster Recast Time - The recast time of this skill is reduced to 3 seconds. 
4. Instant Cast - This skill no longer has a cast bar, it will cast instantly. 
5. Longer Range - The range of this skill has been increased to 3 cells. 
 
These changes should make Venom Splasher a more useful skill in PVM, MVP , and WoE.
```

## Hunter - Payon Stories - Hunter Rework

*Date: 2026-06-29 (downloaded) · Type: Class rework · Source file: `Payon Stories - Hunter Rework.pdf`*

```text
Overview: 
Hunters are a versatile class, well-suited for both beginners and veterans. They offer a 
safe
 
and
 
reliable
 
early
 
game,
 
along
 
with
 
strong
 
build
 
paths
 
that
 
scale
 
effectively
 
into
 
the
 
late
 
game.
 
However,
 
the
 
trapper
 
playstyle
 
struggles
 
with
 
sustained
 
farming
 
and
 
can
 
feel
 
clunky
 
in
 
terms
 
of
 
trap
 
usability.
 
This rework aims to smooth out those weaknesses by improving overall trap flow and 
consistency,
 
while
 
also
 
reducing
 
the
 
gap
 
between
 
carded
 
and
 
non-carded
 
trap
 
damage.
 
Core Changes: 
- Standardized damage scaling across all offensive traps; - Reduced reliance on Dory Card and Wolpertinger Card for trap damage; - Improved trap placement flow and usability; - Introduction of a variable fuse timer system. Variable Fuse Timer (VFT): 
- Traps with VFT no longer detonate instantly when triggered; - They now explode after a short delay (0.04s-0.3s) based on monster speed, 
improving
 
AoE
 
consistency.
 
 
Trap Positioning: 
- All traps can now be positioned on the cells around non-enemy players. 

 Skill Changes: 
 
Flasher: 
1. Blind chance increased to 60/70/80/90/100%;
2. Chance to lower target's perfect hit by 4%/8%/12%/16%/20%;
3. Now has a Variable Fuse Timer. 
Commentary: Flasher isn't a particularly impactful trap when compared to the other 
crowd
 
controls.
 
To
 
improve
 
its
 
usefulness,
 
its
 
application
 
chance
 
has
 
been
 
increased,
 
and
 
it
 
now
 
causes
 
attacks
 
to
 
have
 
a
 
20%
 
chance
 
to
 
miss,
 
regardless
 
of
 
the
 
attacker's
 
Hit
 
(effects
 
can
 
still
 
be
 
reduced/resisted).
 
 
 
Sandman: 
1. Sleep chance increased to 70/80/90/100/110%;
2. Now has a Variable Fuse Timer. Commentary: Increased effectiveness, making it a more reliable Sleep. Can still be 
resisted/reduced.
 
 
Skid Trap: 
1. Skid Trap can now trigger up to three times before expiring.
2. If the Skid Trap triggers at least once, the trap can't be recovered anymore. 
Commentary: Enables pseudo-AoE functionality through multiple slide charges, while 
providing
 
a
 
control
 
option
 
that
 
does
 
not
 
immobilize
 
the
 
target.
 
 
 

 
 
 
Land Mine: 
1. NEW FORMULA: SkillLevel * (JobLevel+Dex) * (BaseLevel+Int) / 45;
2. Now has a Variable Fuse Timer. 
Hunter 99/50 150 DEX/100 INT Damage Comparison 
Current Uncarded Setup 
Current Carded Setup (4x Wolper) 
Reworked Uncarded Setup 
Reworked Carded Setup (4x Wolper) 
3285 5256 4422 5306 
 
Blast Mine: 
1. NEW FORMULA: SkillLevel * (BaseLevel+Dex) * (JobLevel+Int) / 45;
2. Stay duration increased to 150/120/90/60/30 seconds;
3. Now has a Variable Fuse Timer. 
Hunter 99/50 150 DEX/100 INT Damage Comparison 
Current Uncarded Setup 
Current Carded Setup (4x Wolper) 
Reworked Uncarded Setup 
Reworked Carded Setup (4x Wolper) 
2876 4601 4150 4980 
 
 
 
 

 
 
 
Freezing Trap: 
1. NEW FORMULA: SkillLevel * (JobLevel+Dex) * (BaseLevel+Int) / 70;
2. Now has a Variable Fuse Timer. 
Hunter 99/50 150 DEX/100 INT Damage Comparison 
Current Uncarded Setup 
Current Carded Setup (4x Dory) 
Reworked Uncarded Setup 
Reworked Carded Setup (4x Dory) 
1325 2915 2842 3411 
 
 
Claymore Trap: 
1. NEW FORMULA: SkillLevel * (BaseLevel+Dex) * (JobLevel+Int) / 70;
2. Now has a Variable Fuse Timer. 
Hunter 99/50 150 DEX/100 INT Damage Comparison 
Current Uncarded Setup 
Current Carded Setup (4x Dory) 
Reworked Uncarded Setup 
Reworked Carded Setup (4x Dory) 
1800 2880 2667 3201 Commentary: All damage dealing traps have received a formula overhaul, aimed at 
reducing
 
the
 
damage
 
gap
 
between
 
carded
 
and
 
uncarded
 
setups.
 
A
 
general
 
damage
 
increase
 
has
 
also
 
been
 
applied
 
to
 
the
 
new
 
scaling
 
model.
 
This is particularly important for Freezing Trap, which now follows the standard INT/DEX 
scaling
 
instead
 
of
 
ATK.
 

 Item Changes: 
 
Dory Card: 
1. Increases damage of Freezing Trap and Claymore Trap by 5%;
2. Grants a 10% chance to not consume a Trap when using Freezing Trap and 
Claymore
 
Trap;
 3. Grants a 10% chance for Freezing Trap and Claymore Trap to become 
unrecoverable;
 4. The effects of this card stack with multiple instances of the same card. 
 
Wolpertinger Card: 
1. Increases damage of Land Mine and Blast Mine by 5%;
2. Grants a 10% chance to not consume a Trap when using Land Mine and Blast 
Mine;
 3. Grants a 10% chance for Land Mine and Blast Mine to become unrecoverable;
4. The effects of this card stack with multiple instances of the same card. Commentary: With the new trap damage formulas, the damage bonuses from Dory 
Card
 
and
 
Wolpertinger
 
Card
 
have
 
been
 
reduced.
 
To
 
compensate
 
while
 
still
 
allowing
 
specialization,
 
these
 
cards
 
now
 
provide
 
a
 
mix
 
of
 
damage
 
and
 
a
 
chance
 
to
 
preserve
 
traps
 
on
 
use.
 
Additionally,
 
there's
 
a
 
%
 
to
 
not
 
recover
 
traps
 
as
 
an
 
anti-dupe
 
mechanism.
 

 
 
Setting Dirk: 
1. Dealing damage with Traps increases movement speed for (base INT/10) 
seconds;
 2. Increases All Trap Damage by 5%; Commentary: The damage bonus from Setting Dirk has been reduced to better align 
with
 
the
 
new
 
trap
 
formulas.
 
 
Rust-Worn Apparatus: New Accessory [Hunter/Rogue] [Unslotted] [Level required: 52] [Weight: 40] INT +1, Perfect Dodge +2 [Base INT >= 70] Freezing Trap applies Slow instead of Freeze. Description: " A rusted trap mechanism found embedded in a dead creature. With proper handling, it can be adapted for practical use." Drops from: Giant Spider (0.08%) 
 
Commentary:
 
While
 
Freezing
 
Trap
 
has
 
situational
 
use
 
against
 
MVPs,
 
its
 
control
 
can
 
often
 
become
 
more
 
of
 
a
 
hindrance
 
than
 
a
 
benefit.
 
Desynchronizing
 
mob
 
packs
 
or
 
freezing
 
targets
 
you
 
intend
 
to
 
damage
 
with
 
water
 
attacks
 
can
 
be
 
undesirable.
 
As Freeze remains the core identity of the skill, this item allows Hunters with sufficient 
INT
 
to
 
tinker
 
with
 
the
 
trap,
 
converting
 
it
 
into
 
a
 
more
 
reliable
 
Slow
 
effect
 
instead.
```

## Rogue - Rogue - Patchnotes - Payon Stories

*Date: 2026-06-29 (downloaded) · Type: Class rework · Source file: `Rogue - Patchnotes - Payon Stories.pdf`*

```text
- Core Changes: 
- Rebalanced skill tree; - Improvements to Bow, and Mage Archetypes; - Reworked Backstab; - Class-exclusive goods. 
 
 
Divest Skills:
1. The success chance formula is now 50% + 2% * (Rogue Level - Target Level), 
though
 
it
 
is
 
important
 
to
 
note
 
that
 
the
 
minimum
 
success
 
chance
 
is
 
forced
 
to
 
be
 
40%,
 
and
 
the
 
maximum
 
success
 
chance
 
is
 
forced
 
to
 
be
 
90%;
 2. All Strip Skills have a base cast time of 1 second (reducible by dex);
3. The SP costs of has been changed to 30-6*Skill_Level;
4. Individual Strips no longer affect Boss-type monsters;
5. The maximum skill level for these four skills has been reduced to 3, thereby 
condensing
 
them,
 
and
 
reducing
 
the
 
skill
 
point
 
investment
 
needed
 
to
 
learn
 
all
 
strip
 
skills;
 6. Strip skills now benefit from the Vulture's Eye range bonus at half of the range. 
 
Skill Level 
SP Cost 
1 24 2 18 3 12 
Information on the debuff to enemies from Strip Skills 
- Strip Weapon : -40% ATK; - Strip Shield : -30% Hard Defense; - Strip Armor : -30% Hard Magic Defense; 

- Strip Helm : -40% of Base Intelligence Attribute. 
 
Vulture's Eye: 
1. Now it enables Double Attack when a bow is equipped. The trigger chance is 
based
 
on
 
the
 
lowest
 
level
 
of
 
Vulture's
 
Eye,
 
and
 
Double
 
Attack,
 
so
 
a
 
Rogue
 
will
 
want
 
to
 
maximize
 
both
 
skills;
 2. This skill now gives half of its range benefit to strip skills as well, allowing those 
skills
 
to
 
be
 
cast
 
at
 
a
 
distance.
 
Note : due to the change to Vulture's Eye, we will be allowing people to remove 
Sidewinder
 
cards
 
from
 
bows.
 
We
 
are
 
also
 
buffing
 
Sidewinder
 
card
 
to
 
enable
 
Double
 
Attack
 
Level
 
2.
 
 
Double
 
Strafe
 
has
 
been
 
removed.
 
 
 
Trick Arrow: 
Trick Arrow is a new skill created for use on Bow Rogues. Details below: 
1. Has a maximum level of 1;
2. Deals 200% ATK damage at your effective bow range;
3. The damage is delivered at two separate hits for 100% ATK each;
4. SP Cost is 20;
5. The first hit tries to afflict one of the following status effects at random on the 
target
 
at
 
100%
 
chance,
 
reduced
 
by
 
the
 
target's
 
resistances.
 
The
 
status
 
effects
 
are:
 
Poison,
 
Bleeding,
 
Slow,
 
Blind,
 
and
 
Silence.
 6. Each hit has the chance to roll arrow, cards, and items status effects. 
 
Remove Trap now requires Trick Arrow to be learned 
 
Steal Coin has been removed. 
 
 

 
 
 
Backstab: 
1. Backstab's skill requirement has been changed from Steal Coin level 4 to 
Snatcher
 
Level
 
4.
 2. Is now restricted to the following weapon types: one-handed swords, daggers, 
and
 
no
 
weapon;
 3. Has a range of 2 cells;
4. The cooldown, and aftercast delay is removed;
5. It no longer causes you to relocate;
6. It no longer has a hard positional requirement;
7. The damage is reduced from 300% + 40%*Skill_Level to 200%+30%*Skill_Level;
8. The skill will deal 40% more damage, multiplicatively, if one of the following 
conditions
 
is
 
met:
 a. Against a Monster: the monster is not currently targeting the Rogue; b. Against a Player: the player is not facing the Rogue.
9. This skill now uses the Bash animation, and sound effect in the event that the 
bonus
 
damage
 
is
 
not
 
achieved.
 
 
 
Raid: 
1. Skill requirement has been changed from Backstab Level 2 to Tunnel Drive level 
3;
 
2. Raid damage increased from 500% to 600%. 
 
 
Yser Card Rework: 
1. Increases the damage of Raid and Backstab by 10%;
2. Reduces Backstab SP cost by 2;
3. Increases HIT by 5. 
 

Ambushing has been replaced by a new skill called Quickstep . 
 
Quickstep (Platinum Skill): 
1. Costs 10 SP;
2. Has 6 seconds of cooldown, and 1 second of aftercast delay;
3. Range of 7;
4. Can target both allies, and enemies. In the case where an ally is targeted, it 
deals
 
no
 
damage,
 
and
 
acts
 
only
 
as
 
a
 
relocation
 
skill;
 5. Deals 10% ATK damage;
6. The skill causes you to relocate behind the target, specifically, two cells behind 
their
 
back.
 
If
 
this
 
cell
 
cannot
 
be
 
inhabited,
 
it
 
will
 
relocate
 
you
 
to
 
one
 
cell
 
behind
 
them,
 
and
 
if
 
that
 
cell
 
cannot
 
be
 
inhabited,
 
you
 
will
 
be
 
relocated
 
to
 
the
 
same
 
cell
 
as
 
the
 
target.
 
 
 
1. No longer requires another Rogue in the area of effect to be triggered;
2. After sitting for 5 seconds, the Rogue creates a cross shaped invisible zone 
around
 
them;
 3. Party members that sit in this zone, including the rogue, heal for 1% of their 
health
 
every
 
second,
 
and
 
gain
 
10%
 
SP
 
recovery;
 4. When triggered, this skill also causes non-boss protocol enemies to lose all 
interest
 
in
 
the
 
rogue,
 
and
 
party
 
members.
 
Party
 
members
 
must
 
sit
 
in
 
the
 
zone
 
for
 
5
 
seconds
 
to
 
gain
 
this
 
benefit;
 5. Leaving the zone, or standing up causes the player to lose the benefits of these 
effects
 
immediately;
 6. An attack originating from a player under the benefits of gangster's paradise, 
such
 
as
 
traps,
 
will
 
deal
 
0
 
damage.
 
This
 
prevents
 
players
 
from
 
safely
 
dealing
 
damage
 
to
 
enemies;
 7. This skill does not stack with other gangster's paradises;
8. The skill requirement from Gangster's Paradise has been changed from Strip 
Shield
 
Level
 
3
 
to
 
Tunnel
 
Drive
 
3.
 
 
 
Gangster's Paradise: 

Note: previously Grand Cross was applying the "Strip Shield" effect for a moment when 
it
 
was
 
cast.
 
That
 
effect
 
has
 
been
 
removed
 
due
 
to
 
technical
 
reasons
 
relating
 
to
 
these
 
changes.
 
 
Compulsion Discount's skill requirement has been changed from Gangster's Paradise to 
Snatcher
 
level
 
5.
 
 
 
 
 
New Platinum Skill. Gives Rogues access to the Black Market, where they can 
purchase
 
goods
 
obtained
 
by
 
shady
 
means.
 
Enables
 
dropping
 
Stolen
 
Coins
 
from
 
monsters,
 
according
 
to
 
their
 
level.
 
Monster Level 
Drop Rate 1 to 11 0.25% 12 to 39 0.5% 39+ 5% 
Items purchased in the Black Market are not tradeable and may only be carried or used 
by
 
Thief
 
and
 
Rogue
 
classes,
 
depending
 
on
 
the
 
item.
 
 
- Level 3 Basic Bolt Spell Scrolls in bulk of 10 per box, 1 coin; - Level 5 Basic Bolt Spell Scrolls in bulk of 10 per box, 3 coins; - Level 3 Earth Spike Spell Scrolls in bulk of 10 per box, 3 coins; - Level 3 Heal Spell Scroll in bulk of 10 per box, 1 coin; - Level 5 Heal Spell Scroll in bulk of 10 per box, 3 coins; - Level 1 Magnificat Scroll, 5 coins; - Repair Weapon Scroll, 5 coins; - Status Arrow Quivers, for Poison, Sleep, Flash, Mute Arrows, 10 coins; - Teleport Scrolls 1, 2, and 4, 3 coins; - Badge of Authority, 5 coins; - Cultist Dagger, 50 coins; - Costume Spiked Collar, 150 coins; - Costume Snake Hat, 300 coins; - Costume Skull Cap, 500 coins. 
 
Stolen Goods:
```

## Sage - Payon Stories Sage Rework Publication (Final)

*Date: 2026-07-01 (downloaded) · Type: Class rework · Source file: `Payon Stories Sage Rework Publication (Final).pdf`*

```text
Page | 1 
 
 
Payon Stories Sage Rework 
Below is a summary of the changes Sages are getting as a part of the rework, along with some added 
commentary. 
 
 
 
 
 
 
 
 

Page | 2 
 
Goal of the Rework 
The goal of this rework is to make Int/Dex caster Sages and auto-attack hindsight Sages more viable in 
PVM, MVP , and Party situations. 
 
Int/Dex Caster Sages: The INT/DEX caster Sage will never be as proficient as the Wizard in terms of raw 
AoE power. However, with this rework, its raw single-target damage will be substantially improved and 
will be competitive with Wizard and Super Novice. It will also receive additional mobility, allowing it to 
reposition more effectively. By reducing the amount of points required for key skills, they will have a 
more impactful and flexible playstyle. 
Hindsight Sages: The Hindsight Sage will perform better in terms of DPS, its ability to tank enemies, and 
the ability to use utility spells to handle unique situations. 
Sage as a Party Support Class: Many Sage skills have received enhancements that will allow them to give 
various kinds of support and utility to themselves and their party, such as providing healing, faster SP 
regeneration, faster movement speed, and various damage buffs or enhancements to certain skills. 
A Note from GM Devastate: I want to say a special Thank You to the players on the Sage Council that 
helped with this rework. Without their help we could have never come up with so many great ideas. 
 
General Server Changes 
Stat and Skill Resets: To facilitate player testing and adaptation on the live server, Sages will be able to 
get up to 20 full Skill and Stat resets from an NPC in Juno. Please visit Yuna inside of the Juno Sage Castle 
on Map yuno_in02 and coordinates 40,
67. She is standing next to the Dean of the Academy. This NPC 
will eventually stop giving resets, but we will make an announcement regarding that later on. 
Disclaimer: As with any rework, it is possible that some bugs will be found or some balancing may be 
done after the Sage Rework Launches. I ask that players be patient during this process. If we make deep 
changes, we will most likely give more resets. If you find a bug please open a Support ticket on Discord to 
report it. 
 
 
 
 
 
 
 
 
Page | 3 
 
Skill Changes that impact Wizard, Super Novice, Priest, and Sage 
Soul Strike Changes: Soul Strike now ignores 50% of the MDEF of any target if you have learned level 10 
of the skill. The MDEF ignore is applied to any level of Soul Strike, but you must learn level 10 to get it. 
Note that this MDEF ignore works on everything, including MVPs and Players. 
 
Impositio Manus Changes: Now has a duration of 120 seconds at all levels. 
 
Earth Spike Changes: This skill now uses 140% MATK per skill level instead of 100%. The damage of Level 
5 will be similar to a level 7 bolt. No other changes. 
 
Heavens Drive Changes: This skill now uses 140% MATK per skill level instead of 100%. The damage of 
Level 5 will be similar to a level 7 bolt. No other changes. 
 
Fireball Changes: Fireball has had its MATK increased. Table below: 
 
 
Frost Diver: If any player has the Deluge persistence buff on them, their Frost Diver will become 
empowered. An empowered Frost Diver has an additional 25% chance of freezing the target and also 
applies the "Chilled" status effect to non-boss monsters and players at a 100% chance. The Chilled status 
effect reduces the monster's movement speed by -40% for 10 seconds. 
 
Napalm Beat: The AoE range of this spell is now 6x6 instead of 3x3. This change makes it ideal for 
breaking the freeze status of monsters under a Storm Gust, or for quickly tapping a group of monsters. 
 
 
 

Page | 4 
 
Sage Skill Changes 
Elemental Change (Water, Earth, Fire, and Wind): Thanks to some successful research conducted on the 
Heart of Ymir by the Juno Sage guild, the elemental affinity of every Sage in Rune Midgard has improved. 
Every Sage will automatically learn all 4 of these skills without any skill points being spent. Simply visit 
the Sage NPC Yuna in the Juno castle to learn these skills (Map yuno_in02 and coordinates 40, 67). 
The notes below apply to each Elemental Change skill: 
1. The SP Cost is 100 SP . 
2. Variable Cast Time = 2 seconds. 
3. No cast delay after casting. 
4. Elemental Change does not require any reagent or item to cast. 
5. It gives the enemy the corresponding elemental aura to indicate that their element has 
been changed (pictured below are Fire, Earth, Water, and Wind auras). 
6. Note that it does not work on monsters that are flagged as an MVP, and it does not work 
on other players. 
 
 
Double Casting: Has been added to the Sage Skill tree. (Notes below) 
1. It is now a Sage skill, and does not require any skill pre-reqs. 
2. It has a max skill level of 1, making it a lower skill point investment. 
3. It has a 100% chance to double cast 
4. It has a stay duration of 300 seconds. 
5. It also causes Soul Strike to double cast. 
6. It also causes Earth Spike to double cast. 
7. It cannot be dispelled. 
As an example: Double Cast will cause a level 10 Fire Bolt to have a second cast with 10 bolts. A level 
10 Soul Strike (which has 5 bolts) will have a second cast with 5 bolts. 
 
 
 
 
 
 
 

Page | 5 
 
Free Cast Changes: The new maximum level of Free Cast is level
5. It also gives a Flee bonus now. Refer 
to the table below for effects. 
 
 
Hind Sight Changes: (Notes below) 
1. It cannot be dispelled. 
2. It has no cast time, or cooldown, or SP cost. 
3. Hind Sight no longer has a skill window when used. Instead, you can choose the level of the skill 
and put it on your skill bar. For example, you could choose to cast level 5 or level
6. When you 
use Hindsight of a certain skill level, a number will appear above you to indicate the level used. 
4. For Fire Bolt, Cold Bolt, and Lightning Bolt, there is a 50% chance of using level 2 of the spell, 
35% chance of using level 3, and 15% chance of using level 4. 
5. Double Cast has a reduced effect when a player has hindsight turned on. The double cast will 
only do half of the bolts it usually does, rounded up. Refer to the second table below for details. 
6. The Sage must have learned the spell up to the required level to use it in Hindsight. For example, 
you must learn level 4 of Fire Bolt in order to use Hindsight level 3, which casts Fire Bolt. 
7. New Hindsight Spell table and Proc chances below: 
 
 
 
GM Devastates Note: Allowing Sages to quickly swap between different Hindsight levels makes 
the skill act more like a magic "stance" style of skill, and you can change your stance quickly in 
combat. 

Page | 6 
 
 
 
Devastates Note: For now, we have decided that Double Cast will be less effective when a player 
has Hindsight turned on. The Sage council had difficulty coming to a consensus on how to handle 
double cast for Hindsight Sages and caster Sages. Please note that we might make further 
changes to Double Cast and Hindsight later on for balancing purposes. 
 
Endow Skill Changes (Flame Launcher, Frost Weapon, Lightning Loader, Seismic Weapon): (below) 
1. Endow skills are now level selectable. All endow levels have a 100% chance to succeed. 
2. Level 1 of an endow skill no longer requires a stone. However, the stay duration is only 120 
seconds. 
3. Level 1 endow also gives the target Impositio Manus level
5. The duration of Impositio Manus is 
now 120 seconds. 
 
 
 
 
 
 
 
 
 
 
 

Page | 7 
 
Volcano Changes: 
1. Volcanos Pre-req is now level 1 of fire endow (Flame Launcher). 
2. The new cast range is 9 cells away. 
3. It no longer requires a gemstone to cast. 
4. The cast time is reduced to 0 seconds (instant cast). 
5. The stay duration is 300 seconds at all levels. 
6. The SP cost is 30 at all levels. 
7. Persistence Buff: The buff given by Volcano lasts for 120 seconds after leaving the land spell. It 
does not stack with the persistence buff of other land spells. 
8. The max skill level is now 3, and gives a persistence buff to the player and allies without any of 
them needing to wear an elemental armor. 
 
 
Deluge Changes: 
1. The pre-req is now level 1 of water endow (Frost Weapon). 
2. The new cast range is 9 cells away. 
3. It no longer requires a gemstone to cast. 
4. The cast time is reduced to 0 seconds (instant cast). 
5. The stay duration is 300 seconds at all levels. 
6. The SP cost is 30 at all levels 
7. Persistence Buff: The buff given by Deluge lasts for 120 seconds after leaving the land spell. It 
does not stack with the persistence buff of other land spells. 
8. Using Water Ball or Aqua Benedict does not deplete the water cells anymore. 
9. The max skill level is now 3, and gives a persistence buff to the player and allies without any of 
them needing to wear an elemental armor. 
 
 
 
 
 

Page | 8 
 
Violent Gale changes: 
1. Pre-req is now only level 1 of Wind endow (Lightning Loader). 
2. New cast range is 9 cells away. 
3. No longer requires a gemstone to cast. 
4. Cast time reduced to 0 seconds (instant cast). 
5. Stay duration is 300 seconds at all levels. 
6. SP cost is 30 at all levels. 
7. Persistence: The buff given by Violent Gale lasts for 120 seconds after leaving the land spell. The 
move speed given by Violent Gale does not stack with agi-up. It does not stack with the 
persistence buff of other land spells. 
8. Max skill level is 3, and gives the below effects to the player and allies without any of them 
needing to wear an elemental armor. 
 
 
Dragonology Changes: This skill no longer has a pre-requirement skill. Note that Abyss Lake is in the 
process of being balanced for release on Payon Stories in the near future. 
 
Advanced Book Changes: 
1. The new max skill level of Advanced Book is now level 5. 
2. Advanced Book no longer gives a +% MATK bonus. Instead, all book weapons will have at least 
+15% MATK built into them (such as Bible, Book of Billows, etc.). 
3. This skill is no longer a pre-req for any other Sage skill.
 
GM Devastates Note: By now you have likely noticed that there is a theme of making Sage skills take less 
skill points to master, and also reducing or removing pre-req skills. I felt that Advanced Book being the 
gate-keeper of access to all other Sage skills was too oppressive to builds that aren't Hindsight. This 
should allow an Int/Dex Sage to use more skill points on Mage skills instead. 
 

Page | 9 
 
Magic Rod Changes: Magic Rod now behaves similarly to how some players remember it on iRo. That is, 
by spamming the Magic Rod button you are basically guaranteed to eat any single target magic spell that 
is cast on you. 
 
Spell Breaker Changes: Level 5 Spell Breaker will reduce the targets health by 20% if it successfully 
breaks a spell. This does not work on MVPs, but it does work on players. 
 
 
Dispel Changes: Dispel no longer consumes a Yellow gem, and also the success chance is not reduced by 
MVPs. 
 
Cast Cancel Changes: The maximum level of this skill is now
1. Level 1 returns 100% SP and has no 
aftercast delay. 
 
New Sage Skill Tree Planner 
 
 

Page | 10 
 
Skill Build Examples
```

## Gunslinger - Gunslinger Release Patch Notes

*Date: 2026-07-07 (downloaded) · Type: Class release · Source file: `Gunslinger Release Patch Notes.pdf`*

```text
Gunslinger Patch Notes
Friekshow, Payon Stories Team, Beta Testers
March 1, 2025
The Gunslinger class has always been known as a great class that you start on a new private
server, that you then drop as soon as you have got your other "better" characters going. This
was mostly due to them being able to get some of their best weapons as a regular NPC Vendor
purchase, and a strange place in the general balance between pre-trans and transcendent classes.
The oddities and strangeness of the class resulted in the ∼15 pages of changes and coding
requests, and now into these final patch notes. Skills being remade, all weapons getting tweaked,
and a complete remake of the way the class can scale their output, is the result of these 4 months
of work. Enjoy ∼ Friekshow, Content Curator
Core Changes
• Gunslingers are no longer able to be endowed, nor can they gain the effect of element
converters;
• Silver and Bloody Bullets have both been removed from the game, and have been replaced
by new types of ammunition. Same goes for elemental grenade spheres. New grenades
have been made to replace them;
• All weapons have received more slots, and some have had their base ATK increased;
• Noticeable SP cost reductions across the board;
• Upkeep and "annoyance" buffs have been changed or removed completely, with appropriate
compensation in other places;
• All skills have been tweaked or changed to be more attractive and usable, to increase the
different types of builds we will see in game.
Skill Changes
General Utility Skills and Self-buffs
Coin Flip
The skill now costs (2 × Skill Lvl)2 zeny, e.g., 10 Coins cost 100 zeny.
Generates 2 × Skill Lvl Coins for use in Gunslinger skills.
Cast time of 3 seconds, reducible by DEX .
There is a (2 × Skill Lvl) % chance to not cost any zeny.
1
Barrage (Madness Canceller Rework)
Requirements: Coin Flip
5. Cost: 2 Coins.
Duration: 20 seconds.
Increases ASP D by 20%.
Increased DM G by 30%.
Halves character's movement speed.
Replaces Run and Gun buff.
Run and Gun (Adjustment Rework)
Requirements: Coin Flip
5. Cost: 1 Coin.
Duration: 1 minute.
Cooldown: 6 seconds.
Increases movement speed for 5 seconds, stacks with effects like "Agility Up".
Ranged damage resistance +30%.
Increases FLEE +30.
No HIT penalty.
Replaces Barrage buff.
Soul Bullet (Magical Bullet Rework)
Requirements: Coin Flip
1. Cost: 1 Coin, 7 SP .
Deals 100 + DEX + Base Lvl, 3 times like "Triple Action", as Ghost Property DM G.
Wing Clip (Cracker Rework)
Requirements: Coin Flip
1. Reduces target movement speed by 20%.
Duration: 10 seconds, reducible by target AGI.
Wounding Shot (Piercing Shot Rework)
Requirement: Single Action
5. Cost: 0 Coins, 10 SP .
Inflicts Bleeding status at 15 + (5 × Skill Lvl) %.
Disarm
Requirement: Single Action
7. Cost: 1 Coin.
Triple Action
Minimum Delay increased from 0 .3 to 0 .45 seconds.
Increase Accuracy
Removed. +4 DEX , and +4 AGI have been made into bonuses from Job Levels.
2
Single Action
HIT bonus increased from 2 per Skill Lvl to 4 per Skill Lvl.
Chain Action
Chance to trigger increased from 50% to 70%.
Friekshow's notes: The amount of "dead" skills on the Gunslinger skill tree is well known,
despite their great class fantasy and unique flavor. "Barrage" and "Run and Gun ", have been
made into core skills for the class, and their survivability and damage output are tuned with
these skills in mind. Making their previously niche and less useful "Trick Shots" more powerful
and supportive should help them see actual use.
Pistol Skills
Rapid Shower
Cost: 10 + (2 × Skill Lvl), e.g., level 1 is 12 SP and level 10 is 30 SP .
Desperado
Cost: 20 + (2 × Skill Lvl), e.g., level 1 is 22 SP and level 10 is 40 SP .
Bullet Cost: changed to 5, down from
10. Lowered DM G per hit to 100 × (20 × Skill Lvl) % the AT K.
Increased average hits from 3.6 to ≈ 6 per cast.
Friekshow's notes: Most attack skills for Gunslinger are seeing a decent reduction in SP
costs, so I will not mention them anymore after this one. Desperado, however, was often re-
ferred to as the "only skill worth using " in the Gunslinger arsenal. We increased the average
hits to avoid the frustrating "swinginess" of the ability, whilst lowering the DM G at the same
time to pull it in line with the projected strength of the rest of the class.
Rifle Skills
Tracking
Cost: 10 + (2 × Skill Lvl), e.g., level 1 is 12 SP and level 10 is 30 SP .
Cast time changed to 1 + (0.1 × Skill Lvl), so 2 seconds at Skill Lvl
10. Cooldown: 1 second. Increased damage to 160 × Skill Lvl, so 1600% at Skill Lvl
10. Can CRIT .
Tranq Shot (Bull's Eye Rework)
Cost: 1 Coin.
Lowered DM G to 100% ATK, is not affected by cards, but ignores DEF .
Has 140% chance to put the target in the "SLEEP" status, for 6 seconds.
Success rate and duration are reducible by VIT .
Friekshow's notes: Playing a sniper or scout type class in shooters is a favorite for a lot
of players, so it was a shame that the Rifle Gunslinger have always fallen flat. Key changes are
reducing the cast time, without increasing the amount of casts too much, and making the skill
3
able to CRIT . We wanted to give the Tracking user a reason to decide exactly which rank to
use, since you get rooted, and to give the user a drive to group with support classes and groups.
For the eager CRIT Gunslinger, Tranq Shot was built around having an easy way to increase
their CRIT against a target on the short term, but also as a crowd control option in group
content. Gear and ammunition changes have also been made with enabling a dedicated CRIT
build in mind.
Shotgun Skills
Dust
Cast range: 3 cells, knockback is still 5 cells from the point of where the target was hit.
Reduced DM G to 100 + (30 × Skill Lvl), so 400% at Skill Lvl
10. Gives 1 AT K per point in ST R.
When the skill has been mastered at Skill Lvl 10, the player has 5% resistance against neutral
damage. Only works when wielding a Shotgun.
Stacks with similar effects.
Full Buster
Cost: 5 + (5 × Skill Lvl), e.g., level 1 is 10 SP and level 10 is 50 SP .
Bullet cost: 1 bullet per 2 Skill Lvl used.
Reduced DM G to 350 + (75 × Skill Lvl), so 1100% at Skill Lvl
10. No longer blinds the character on skill use.
When the skill has been mastered at Skill Lvl 10, the player has 5% resistance against neutral
damage.Only works when wielding a Shotgun.
Stacks with similar effects.
Spread Attack
Cost: 10 + (2 × Skill Lvl), e.g., level 1 is 12 SP and level 10 is 30 SP .
Increased DM G to 200 + (20 × Skill Lvl), so 400% at Skill Lvl
10. When the skill has been mastered at Skill Lvl 10, the player has 5% resistance against neutral
damage.Only works when wielding a Shotgun.
Stacks with similar effects.
Friekshow's notes: Shotgun... Previously, a Shotgun Gunslinger only went for Full Buster as
it was a very powerful skill that sadly cost an oppressive amount of both SP and Bullets. In
an effort to make the Shotgun Gunslinger have its own style of build archetype, we have made
several large changes. The short range Dust having a small extra AT K scaling with ST R, and
the regular weight of its weapon type, plus getting access to heavier armor, has all been done in
an attempt at incentivizing the Gunslinger into going for a much more different build style than
usual. Spread Attack was buffed to deal a larger amount of damage, with the slow and bulky
Shotgun weapon type, to be more in line with other classes and other Gunslinger AoE skills.
Sub-Weapon Skills
Gatling Fever
Duration: 10 minutes.
Increases ASP D by 20%.
4
Increased DM G by 40%, instead of flat + AT K.
No FLEE penalty.
No character movement speed penalty.
Ground Drift
Changed the DM G to 100 + (50 × Skill Lvl), so 600% at Skill Lvl
10. Deals half DM G when the mine hits more than 1 target, for 300% at Skill Lvl 10 AoE size is
5 × 5 cells.
Friekshow's notes: These two weapons, Gatling Gun and Grenade Launcher, are very im-
pactful conceptwise. I still remember the first time I picked up a Gunslinger with the goal to
be a Gatling Gun main, only to be shockingly disappointed with the massive penalties the skill
incurred for no apparent reason. So the skill has been changed from being a punishment skill,
to a regular upkeep "Quicken" type skill. For Ground Drift, we are doing a plain output buff,
with an ability to hit more than one target for a larger AoE, with a DM G penalty instead. At
first glance, this skill seems like a superior version to a Hunters trap skills, but there are some
core differences. The main one is that the skill now requires much much larger card investments
than before. The testing team and the staff are looking forward to what the community can
come up with for builds and uses for the skill.
New Items and Item Changes
New Items
Gunner Goggles
Weight:
10. Defense:
1. Usable by: Gunslinger, Rebellion.
Level requirement:
55. Description: "Lightweight goggles, lined with odd technology and wires. Looks like it can
connect with something else... ".
Combo Effect: when worn at the same time as "Oxygen Mask" (5004); Increase heal value of
Red, Orange, Yellow, and White Potion by 20%.
Armor Piercing Bullet
AT K:
30. CRIT rate ×1.2, +20 CRIT rate if wearing a Rifle weapon.
Hollow-Point Bullet
AT K:
45. Damage to Demi-Humans +20%.
Plated Bullet
AT K:
45. Damage to Neutral +20%.
5
Heavy-Tipped Bullet
AT K:
55. Each bullet type has their own "Case" that contains 500 bullets.
Thud Grenade
AT K:
10. High Explosive Grenade
AT K: 200.
Flashbang Grenade
AT K: 80.
50% chance to blind any mob hit by the shell.
Stun Grenade
AT K: 80.
50% chance to stun any mob hit by the shell.
Sticky Grenade
AT K: 80.
35% chance to immobilize any mob hit by the shell.
Ghosthunter Grenade
AT K:
80. Ghost element property.
Item Changes
Heavy Gunner Armor (81009)
Added combo effect: if wearing a Shotgun type weapon:
Increase HP from +150 to +300.
Increase Demi-Human DM G reduction from 2% to 5%.
Thunder-P [1]
Change number of slots to
3. Weapon level is now 1, and level requirement is now
10. Price is reduced to 10,000 zeny.
Thunder-P [2]
Change number of slots to
4. Weapon level is now 1, and level requirement is now
10. Price is reduced to 10,00 zeny.
6
Rolling Stone
Change number of slots to
3. Weapon level is now 2, and level requirement is now
20. Price is reduced to 36,000 zeny.
Black Rose
Change number of slots to
2. Weapon level is now
3. Price is reduced to 76,000 zeny.
Can now be crafted only, in place of the Inferno Grenade Launcher, at the same NPC.
Butcher [0]
Change number of slots to
2. Butcher [1]
Change number of slots to
3. Drifter
Change number of slots to
4. Branch
Made a 4 slot version, increased weapon AT K to 70 for both versions.
Add HIT +10, add CRIT rate +10%.
Cyclone [1]
Change number of slots to
2. Cyclone [2]
Change number of slots to
3. Dusk
Change number of slots to
2. Six Shooter [1]
Change number of slots to
3. Six Shooter [2]
Change number of slots to
4. Crimson Bolt [1]
Change number of slots to 3.
7
Crimson Bolt [2]
Change number of slots to
4. Garrison [1]
Change number of slots to
2. Increased weapon AT K to
90. Garrison [2]
Change number of slots to
3. Increased weapon AT K to
90. Destroyer [0]
Change number of slots to
3. Gunslinger Job Change quest rewards:
One of either:
• Branch [3];
• Six Shooter [3];
• Thunder-P [3].
Bullet Case.
Gun Vendor
Now Sells:
• Bullets;
• Bullet Case;
• Thud Grenades;
• Crimson Bolt [3];
• Branch [3];
• Cyclone [2];
• Thunder-P [3].
There exists 2 new NPCs. One in Einbroch, one in Aldebaran. Talk to them to find out the
costs and materials required to craft your new ammunition.
A previous custom NPC now gives you a new quest for a class specific item.
8
Special Thanks:
To my testers, who stuck with the project, I give you my heartfelt thanks.
A special shoutout to Rula, who was with me "Ride or Die ", until the end. Testing things
for hours and hours, even when we did not agree on things.
9
```

## Wizard / High Wizard - Wizard and High Wizard Trans Class Changes (Publish 12.13.25)

*Date: 2025-12-13 · Type: Class rework · Source file: `Wizard and High Wizard Trans Class Changes (Publish 12.13.25).pdf`*

```text
Wizard and High Wizard Changes: 
 
 Gravitational Field: Has received the following changes: 
 
1. The area of effect is now 7x7 (up from 5x5). 
 
2. It only requires Mystical Amplification level 5 to learn (that is the new max level of Mystic Amp). 
 
3. The player can act freely aŌer casting Gravity field, they are no longer unable to move or act. 
 
4. If a player casts gravity field while they already have one active, the old Gravity Field they had 
out will disappear (similar to moving a sage land spell). 
 
5. Only one gravity field can exist on a cell at a time. If another player casts gravity field over yours, 
their field will not take effect (so the first gravity field that is cast will stay). 
 
6. The spell no longer consumes a blue gemstone. 
 
7. The aŌercast delay of the spell is reduced to 1.5 seconds. 
 
8. This spell is now reduced by WoE damage reduction. Since the WoE damage reduction for skills 
is 40%, it will only deal 720 damage per second in WoE at max level. 
 
9. The spell has a new particle effect as a visual, shown below. 
 
10. If the player is 30 cells away from their gravity field, it will disappear. 
 
11. Note that casting Gravity Field will not use nor consume Mystical Amplification. 

 
 
Below is the new Gravity Field scaling per skill level: 
 
 
 Ganbantain: Success chance is now 100% instead of 80%, and it only uses one blue gemstone per 
cast. 
 
 Napalm Vulcan: Three changes: 
1. The damage is no longer divided between targets. It does not maƩer how many targets it hits, it 
will do the same damage to each. 
 
2. The element is now Shadow, not Ghost element. 
 
3. All levels of this spell ignores 50% of the enemy Magic Defense (both the hard and soŌ defense), 
which for reference is the same behavior as Soul Strike level 10. 
 

 Soul Drain: Now additionally gives +1% max HP per level. At level 10 it also gives 5% stun resistance 
and stun time reduction, as if the player had an additional 5 vitality. So at level 10 you get +10% max HP , 
and 5% stun resistance and stun time reduction. Chart below, everything else about Soul Drain stays the 
same. 
 
 
 Stave Crasher: Now has a 70% chance to inflict Stun, and a 10% chance to inflict bleeding. 
 
 Mystical Amplification: Has had two major changes: 
 
1. This skill has been condensed into a level 5 skill. 
2. It will also affect the entirety of a spell that has been cast with it regardless of being cast again. 
Devastates Note: Official behavior for this skill was rather unintuitive. If you cast Amp, and then cast 
Storm Gust, and then cast Amp again while your Storm Gust was only half-way done, the Storm Gust you 
had active would stop being Amped. We have fixed this behavior. This also extends to the trap spell Fire 
Pillar. It is now possible to Amp, cast Fire Pillar, and then Amp again and cast Fire Pillar again. Both fire 
pillars will retain the Mystical Amplification benefit. 
 

 Fire Pillar: A few changes: 
1. Now does 70% MATK per hit, and ignores 50% of the hard and soŌ Magic Defense of the target. 
 
2. Additionally, gains +2% MATK per hit for every level of Fire Wall learned, resulting in +20% MATK 
per hit if level 10 Fire Wall is learned. 
 
3. Max skill level is now 5. 
 
4. New hit formula is [(2 + (2xSkill Level)] hits. 
 
5. No longer requires a gemstone to cast. 
 
6. Can be cast under the feet of any player. 
 
7. Now has a 5 second priming time. During the priming stage, the Fire Pillar appears as a red 
swirling mass of fire on the ground. It will not trigger if someone walks over it. AŌer 5 seconds it 
will turn into an active Fire Pillar with the usual animation. 
 
8. You may have 5 Fire Pillars active at one time. If you cast a sixth Fire Pillar, the oldest one will 
disappear. 
 
Below is the new table: 
 
 
 
 
 
 
 
 
 

 Sightrasher: A few changes 
1. Maximum skill level is now 5. 
 
2. Damage formula increased to [100% + (75%xSkill Level)] 
 
3. We have corrected an issue whereby this skill could create some lag for the player if it hit many 
enemies. 
 
 
 
 Frost Nova: Has been completely reworked into a new skill with a new behavior. 
Description of the skill: 
 
1. The max skill level is 5. 
2. The skill now targets an enemy. 
2. The visual effect of the skill is that a large ice crystal forms above the enemy, and then all enemies 
within a 5 cell square radius are hit with an ice particle effect. Diagram of the AoE size below. 
 
9. If the player casts level 5 of this skill, it causes the "Hypothermia" status effect on all enemies hit 
by it. This is a custom status effect with the following properties: 
 

 Hypothermia: Has a duration of 10 seconds and cannot be reduced or resisted by stats. 
Hypothermia causes -20% movement speed, -20% aƩack speed, +20% longer cast time, and -10 
Dexterity. 
 
10. For every level of Frost Diver that the wizard has learned, the MATK of Frost Nova increases by 
10%. This means that a level 5 Frost Nova could deal 350% MATK. 
 
11. Frost Nova has a 1 second aŌer cast delay at all levels. 
 
Refer to the skill table below for details: 
 
 
 
 Meteor Storm: Received a few changes: 
1. Cast time reduced to 10 seconds. 
 
2. The chance to stun is equal to Skill Level x 5% (so at level 10, each meteor will stun at a 50% 
chance, reduced by vit of course.) 
 
3. The center of a meteor can only fall on cells within a 5 cell star shaped grid, as depicted below. 
This forces meteors to cluster into the center area of the casting circle. Note that the splash 
damage of the meteors is still the official size of 7 x
7. This change means that enemies in the 
center of the meteor storm will get hit by every meteor. 

 
 
 
 Lord of Vermillion: Has had the following changes made. 
1. The overall damage of Lord of Vermillion (LoV) has been increased to 2,000% MATK at level 10, 
and each wave of the spell deals a different amount of damage that ramps up with later waves. 
For reference, LoV technically hits in 4 waves that are able to be impacted by Lex Aeterna. For 
reference, the MATK damage is (20% MATK x Skill Lv x Wave #). 
 
2. LoV now has a 1% x Skill Level chance with each wave to inflict Silence on the enemy (10% per 
wave at level 10, resulting in a 34% chance for a level 10 LoV to inflict silence on a target. 
 
3. Each wave of LoV now causes a uniquely potent flinch that lasts for one second. Note that this 
more potent flinch is not as effective on boss protocol monsters. 
 
4. LoV no longer inflicts blind on the enemy. 
 
 
 
 
 

The below table depicts the traits of a level 10 Lord of Vermillion 
 
 
 
Special Thank You to our High Wizard Player Testers for their creativity and effort in this project! 
Bangman 
DoubleBlind 
Kaho 
Leo - Paneb 
Ocatamai 
Tranquility
```

## High Wizard (trans) - HW only Trans Notes (First coding request)

*Date: 2025-10-24 (downloaded) · Type: Class rework (draft) · Source file: `HW only Trans Notes (First coding request).pdf`*

```text
High Wizard Changes: 
 
Gravitational Field: A few changes: 
1. Deals 2,000 neutral damage per second at level 5 (up from 1,200). Still damages the Emperium. 
 
2. The area of effect is now 7x7 (up from 5x5). 
 
3. It only requires Mystical Amplification level 5 to learn. 
 
4. The player can act freely after casting Gravity field, they are no longer unable to move or act. 
 
5. If a player casts gravity field while they already have one active, the old Gravity Field they had 
out will disappear (similar to moving a sage land spell). 
 
6. Only one gravity field can exist on a cell at a time. If another player casts gravity field over yours, 
their field will not take effect (so the first gravity field that is cast will stay). 
 
7. The spell no longer consumes a blue gem stone. 
 
Below is the new Gravity Field scaling per skill level: 
 
 
Ganbantain: Success chance is now 100% instead of 80%, and it only uses one blue gem per cast. 
 
 

Napalm Vulcan: Three changes: 
1. The damage is no longer divided between targets. It does not matter how many targets it hits, it 
will do the same damage to each. 
 
2. The element is now Shadow, not Ghost element. 
 
3. All levels of this spell pierces 50% of the enemy Magic Defense (the same behavior as Soul 
Strike). 
 
Soul Drain: Lets let it also give +1% max HP per level, so that there is a bit of an incentive for WoE players 
to get it also. At level 10 it also gives 5% stun resistance. So at level 10 you get +10% max HP , and 5% stun 
resistance. Chart below, everything else about it stays the same. 
 
 
Stave Crasher: Now has a 70% chance to inflict Stun, and a 10% chance to inflict bleeding. Gives people a 
reason to use it. 
 
Mystical Amplification: Has been condensed into a level 5 skill. 
 
 

Fire Pillar: A few changes: 
1. Now does 100% MATK per hit. 
 
2. Max skill level is now 5. 
 
3. New hit formula is [(2 + (2xSkill Level)] hits, 
 
4. No longer requires a gemstone to cast. 
 
Below is the new table: 
 
 
Sighttrasher: A few changes 
1. Maximum skill level is now 5. 
 
2. Damage formula increased to [100% + (75%xSkill Level)] 
 
 
 
 
 
 
 
 

Frost Nova: We will rework this skill into a new skill that is like a multi-target frost diver. I believe you 
could use the Frost Diver skill as a base for coding it. 
Description of the skill: 
 
1. The max skill level is 5. 
2. The visual effect of the skill is the same as frost diver. 
3. You cast the skill on an enemy, just like frost diver. 
4. If there are any other enemies within a 5 cell radius of your target, the spell duplicates and those 
enemies are also attacked by this spell (so there will be multiple frost diver particle effects, one for 
each enemy). In the grid below, the enemy you cast on is the red cell. Any enemies in the yellow cells 
would also have a copy of this spell attack them at the same time. 
 
 
5. If the player casts level 5 of this skill, it causes the "Freezing" Status on all enemies hit by it. 
Refer to this weblink for code references: https://irowiki.org/wiki/Status_Effects#Freezing 
 
6. For every level of Frost Diver that the wizard has learned, the MATK of this skill increases by 10%. 
This means that a level 5 Frost Nova could deal 350% MATK. 
 
7. This skill has a 1 second cast delay at all levels. 
 
Refer to the skill table below for details: 
 
 

 
 
Meteor Storm: A few changes 
1. Cast time reduced to 10 seconds. 
2. The AoE size of each meteor is increased to 5 x 5 instead of the current 3 x 3 (I actually don't 
know if meteors hit for 3 x 3 today but I think they do). 
3. The chance to stun is equal to Skill Level x 5% (so at level 10, each meteor will stun at a 50% 
chance, reduced by vit of course.) 
4. The center of a meteor can only fall on cells within a 5 cell star shaped grid, as depicted below. 
This forces meteors to cluster into the center area of the casting circle.
```

## Merchant - PayonStories Merchant 2026-08-09

*Date: 2026-08-09 · Type: Class rework · Source file: `PayonStories Merchant 2026-08-09.pdf`*

```text
Overview
Whether people use Merchants for hanging out, battling, vending, or just 
selling loot - everyone has one. We are making some improvements to Battle 
Merchant builds and rebalancing the skill economy overall. Creating a 
vending/loot seller Merchant should be easier now, requiring less jobs. The 
improvements to the battle build will mostly be felt in auto attack Blacksmiths, 
but there are slight improvements to SVD Smiths, and Sphere Alchemists.
- Core Changes:
- New Mastery Skill for Axes, and Maces;
- Discount, and Overcharge now a single skill called Barter;
- Platinum Skills that are considered core are now part of the skill tree.
Pushcart:
Pushcart condensed into a 5 rank skill.
Skill Level Movement Speed
1 80%
2 85%
3 90%
4 95%
5 100%
Comment: condensing of this skill will help setting up a vendor more quickly, 
and clears a couple points.
Barter:
New Skill that condenses Discount, and Overcharge. Barter requires 3 ranks of 
Enlarge Weight Limit.
Skill Level Discount Overcharge Mammonite Discount
1 -7% +7% 5%
2 -9% +9% 10%
3 -11% +11% 15%
4 -13% +13% 20%
5 -15% +15% 25%
6 -17% +17% 30%
7 -19% +19% 35%
8 -21% +21% 40%
9 -23% +23% 45%
10 -24% +24% 50%
Comment: condensing these two skills into one helps clear points for Blunt 
Mastery but also helps setting up their vendor characters with less levels.
Tool Mastery:
New Mastery Skill for merchants. Adds 4*SkillLevel Mastery ATK to Axes, and 
Maces.
Skill Level Mastery ATK
1 4
2 8
3 12
4 16
5 20
6 24
7 28
8 32
9 36
10 40
Comment: this skill will give merchants more solo leveling capabilities, while 
buffing auto attacker builds.
Zeny Pincher:
Zeny Pincher now halves skill multiplier of Mammonite. Mammonite's 
damage is 100+50*SkillLevel, and with Zeny Pincher 100+25*SkillLevel.
Skill Level Mammonite Mammonite + Zeny Pincher
1 150 125
2 200 150
3 250 175
4 300 200
5 350 225
6 400 250
7 450 275
8 500 300
9 550 325
10 600 350
Comment: the change to Zeny Pincher interaction is done to give it a small 
buff when cast manually, but to also justify use of Pirate Skel Card as a 
Merchant, otherwise the damage would be lower than an auto attack.
Cart Revolution:
Now a regular skill in the skill tree, with 5 ranks. Requires Pushcart rank 3, and 
Crazy Uproar rank 2 to learn. Deals full damage regardless of cart weight.
Skill Level ATK SP Cost
1 50% 2
2 100% 4
3 150% 6
4 200% 8
5 250% 10
Comment: this is a ubiquitous skill for battle builds, especially SVD Blacksmith. 
It feels weird to have your main skill being a platinum skill.
Crazy Uproar:
Requires Blunt Mastery 5 to learn. Adds 3*SkillLevel SoftDEF to Merchant, and 
adds 2*SkillLevel SoftDEF to their party members. It also adds +1 STR/VIT per 
skill level to the Merchant while the buff is active.
Skill Level STR VIT SP Cost SoftDEF Party-Buff Duration
1 1 1 6 3 2 75
2 2 2 12 6 4 150
3 3 3 18 9 6 225
4 4 4 24 12 8 300
Comment: another skill that has 100% uptime in battle builds. The extra VIT is a 
slight buff to Sphere Alchemists too.
With Cart Revolution and Crazy Uproar being moved to the skill tree, 
Gershuan, and Necko are cashing in their retirement after collecting many 
quest items. Maybe someday they will make a reappearance…
 
 
Pill Bug Card: Increases the damage dealt by Cart Revolution by 
10%. Additionally, Cart Revolution will no longer 
cause knock back effect.
Comment: to make the +% Skill Damage cards on shoes uniform, we are 
buffing Pill Bug Card's Cart Revolution damage to 10%.
Pirate Skel Card: Add a 5% chance of auto casting Level 1 
Mammonite when dealing a physical attack. 
Zeny costs apply, as well as Zeny Pincher .
[Blacksmith]
If the user has mastered the skill at level 10, it 
will cast Level 10 Mammonite.
Comment: AA Blacksmiths get a tool similar to Rekenber Mercenary Card, in 
the form of an Auto Mammonite card.
Flame Beetle Card: Has a 50% chance to reduce the zeny cost of 
Mammonite skill to zero when the skill is 
used.
Also prevents auto Mammonite from being 
affected by Zeny Pincher or costing money.
Comment: Flame Beetle card works in tandem with Skel Pirate Card.
```

## Blacksmith - PayonStories Blacksmith 2026-08-09

*Date: 2026-08-09 · Type: Class rework · Source file: `PayonStories Blacksmith 2026-08-09.pdf`*

```text
Overview
The changes to Merchant achieve some of the quality-of-life and buffs to 
the builds battle builds. We are increasing the set of weapons a Blacksmith can 
wield effectively by reworking Adrenaline Rush, while also increasing their 
impact in party settings.
- Core Changes:
- Adrenaline Rush has a similar effect to Full Adrenaline Rush;
- Blacksmith buff duration normalized to 60/120/180/240/300 seconds;
- New tools for auto attacker builds, cart revolution builds, and forging 
builds.
Smith Weapon:
1. All Smith Weapon Skills can be ranked 4 times, instead of the original 3;
2. Mastering them requires 4 levels;
3. Smith Sword and Smith Two-Handed Sword have been condensed into 
Smith Sword;
4. Change smithing success rate from 5*SkillLevel to 4*SkillLevel, so 5/10/15 
to 4/8/12/16. This is a 1% buff of successfully smithing when skills are 
mastered.
Comment: this makes it so that Smith Sword and Smith Two-Handed Sword 
behave like the other Smithing skills, that allow both one-handed and two-
handed variants to be made with one single skill. See the new Veteran Axe [2] at 
the end.
Hilt Binding:
No longer increases duration of any active skill.
Adrenaline Rush, Over Thrust, and Weapon Perfection have their buff 
duration normalized to to 60/120/180/240/300 duration.
Comment: this just makes things easier to understand; you get exactly what is 
written on the tin can.
Adrenaline Rush:
Adrenaline Rush now affects all melee weapons. User/Party members Maces, 
and Axes have ASPD increased by 30%/20%, other weapons ASPD increased by 
20%/10%.
Skill Level Duration SP Cost
1 60 25
2 120 30
3 180 35
4 240 40
5 300 45
Comment: Adrenaline Rush now works similarly to Full Adrenaline Rush, but 
with some nerfs. Blacksmiths are more versatile in the weapons they can wield, 
making them great secondary characters to use 1h Swords and Daggers, 
although less effectively than maces and axes.
Veteran Axe [2]:
An axe made out of the metal which the Ancient 
God of Blacksmiths gave to humans. If 
someone handy with metals uses this axe, it will 
show their incredible power .
ATK: 155
Level Requirement: 60
Class: Two-Handed Axe
If base DEX, and base LUK between 60 and 79, 
+5 ATK/+4 Perfect Dodge/+1% ASPD for each 
Smith Weapon skill Mastered.
If base DEX, and base LUK 80 and above, +10 
ATK/+8 Perfect Dodge/+2% ASPD for each Smith 
Weapon skill Mastered.
Comment: Forgers now have a tool for solo farming, and solo leveling. 
Whirling Hammer [1]:
A heavy hammer made for reckless 
swings, with no regard to who it connects 
with.
ATK: 190
Weight: 350
Weapon Level: 4
Level Requirement: 70
Class: Two-Handed Mace
Gain 1 SP on Kill. For each refinement, 
+1% damage to Cart Revolution.
Comment: a very heavy Cart Revolution tool.
Sasquatch Card: Add the chance of freezing an enemy when the 
user receives Physical Damage. Hammerfall 
has a 30% chance to freeze targets (does not 
stack with stun).
Comment: Sasquatch card now freezes for regular 12 seconds instead of 5 
seconds, resistances apply.
Grizzly Card: Adds a 3% chance of inflicting Blind on the 
attacker when receiving a physical attack.
Set Bonus: Bigfoot Card, Grizzly Card
Adds a 3% chance of inflicting Blind on the 
attacker when receiving a physical attack.
Hammerfall now inflicts Blind on the attacker .
Comment: Grizzly card now blinds for the regular 30 seconds, instead of 5 
seconds. Resistances still apply. Card buffed from 30% chance of attempting to 
blind to 100% chance to attempting to blind.
```

## Alchemist - PayonStories Alchemist Rework 2026-08-09

*Date: 2026-08-09 · Type: Class rework · Source file: `PayonStories Alchemist Rework 2026-08-09.pdf`*

```text
Overview: 
Alchemists are a highly flexible class, offering strong damage, sustain, and the ability to 
provide
 
side
 
support
 
in
 
parties
 
through
 
a
 
unique
 
playstyle.
 
This
 
rework
 
will
 
focus
 
on
 
adjustments
 
in
 
light
 
of
 
the
 
Merchant
 
changes,
 
the
 
introduction
 
of
 
unique
 
buffs,
 
and
 
improvements
 
to
 
plants
 
and
 
magical
 
autocast,
 
alongside
 
a
 
few
 
changes
 
aimed
 
at
 
making
 
brewers
 
a
 
more
 
capable
 
and
 
proactive
 
build.
 
Core Changes: 
- Increased flexibility in Chemical Protection skill allocation; - Expanded Brewer viability in active combat; - Simplified and strengthened AGI/INT scaling for plants; - Improved the foundation of magic-oriented autocast builds; - Introduced unique effects to pitched potions. 

Skill Changes: 
 
Acid Terror: 
1. Damage increased from 500% to 600% ATK at max level;
2. NEW FORMULA: (100+100*SkillLv)% ATK;
3. SP cost increased from 8 to 10 SP. Commentary: Following the trend of reducing the impact of certain cards, Acid Terror's 
base
 
damage/SP
 
cost
 
has
 
been
 
increased
 
to
 
compensate
 
for
 
the
 
FUEL
 
Card
 
changes,
 
while
 
also
 
receiving
 
a
 
slight
 
boost.
 
 
 
Demonstration:
1. SP cost increased from 14 to 20 SP. 
Commentary: Demonstration SP cost has been increased to better match its potential 
as
 
a
 
high
 
damage,
 
sustained
 
AoE
 
skill.
 
 
 
Chemical Protections: 
 
1. Can now all be learned independently from each other;
2. All Chemical Protections now require Pharmacy Lv. 2 to be learned;
3. Maximum level reduced from 5 to 3;
4. Duration set to 200 seconds per level. Commentary: Chemical Protections have received a similar flexibility update to Strips, 
allowing
 
players
 
to
 
choose
 
which
 
ones
 
to
 
invest
 
in
 
individually
 
while
 
making
 
skill
 
allocation
 
more
 
convenient.
 
 
 
 
 
 

 
Bio Cannibalize: 
1. INT Scaling NEW FORMULA: Geographer Healing +0.8% per INT;
2. AGI Scaling NEW FORMULA: Plant Attack Delay reduced by 0.3% per point of 
Base
 
AGI;
 3. Mandragora/Hydra/Flora HIT Rate increased by 52/46/31. Commentary: AGI scaling has been adjusted to make it more valuable as a secondary 
stat
 
for
 
plants,
 
improving
 
both
 
overall
 
DPS
 
and
 
autocast
 
performance,
 
while
 
INT
 
now
 
provides
 
a
 
stronger
 
and
 
more
 
intuitive
 
healing
 
scaling,
 
no
 
longer
 
relying
 
on
 
breakpoints
 
created
 
by
 
the
 
interaction
 
between
 
the
 
Alchemist's
 
INT
 
and
 
the
 
plant's
 
INT.
 
Low-rank
 
plants
 
have
 
also
 
received
 
a
 
HIT
 
boost
 
to
 
remain
 
viable
 
options
 
in
 
the
 
end
 
game.
 
 
Learning Potion: 
1. NEW EFFECT: Has a (LUK × Skill Lv / 60)% chance to not consume potions 
when
 
using
 
Potion
 
Pitcher;
 2. With Learning Potion at max level, every 6 LUK grants a 1% chance (e.g. 90 LUK 
equals
 
a
 
15%
 
chance
 
to
 
not
 
consume
 
potions);
 3. This chance stacks additively with other similar effects. Commentary: As part of the effort to make Brewers a more active build, Learning 
Potion
 
now
 
grants
 
an
 
innate
 
chance
 
to
 
conserve
 
pitched
 
potions,
 
encouraging
 
players
 
to
 
use
 
them
 
more
 
freely
 
as
 
a
 
support
 
tool.
 
 
 
 
 
 
 

 
Transmutation: 
1. REWORKED Axe Mastery;
2. When wielding Axes or Swords, increases ASPD and MATK by 1% per skill level, 
up
 
to
 
a
 
maximum
 
of
 
10%
 
ASPD
 
and
 
MATK
 
at
 
Level
 
10.
 
 Commentary: With the existence of Tool Mastery in the Merchant class, Alchemists 
now
 
gain
 
a
 
new
 
passive
 
aimed
 
at
 
supporting
 
magical
 
builds,
 
while
 
retaining
 
a
 
slightly
 
improved
 
version
 
of
 
the
 
original
 
Axe
 
Mastery's
 
ASPD
 
bonus,
 
now
 
expanded
 
to
 
also
 
apply
 
to
 
Swords.
 
 
Remote Detonator: 
1. When used with a Marine Sphere Bottle in the inventory, applies 5 stacks of 
Burning
 
to
 
targets
 
upon
 
remote
 
detonation.
 Commentary: Marine Sphere Bottles were the only reagent that provided no additional 
effects.
 
They
 
now
 
apply
 
an
 
extra
 
debuff
 
and
 
enhance
 
fire
 
damage
 
potential.
 
The
 
bottle
 
is
 
consumed
 
when
 
Remote
 
Detonator
 
is
 
used,
 
rather
 
than
 
when
 
summoning
 
a
 
Marine
 
Sphere.
 
 
Burning: 
 1. NEW STATUS EFFECT
2. Can stack up to 5 times;
3. Each stack deals 60 Fire Magic damage every second;
4. Each stack reduces MDEF by 2;
5. Lasts for 5 seconds. Commentary: A new effect making its debut. Far from being exclusive to Alchemist (in 
fact,
 
it
 
will
 
be
 
a
 
core
 
mechanic
 
for
 
another
 
class),
 
this
 
effect
 
combines
 
elemental
 
damage
 
over
 
time
 
with
 
magical
 
defense
 
reduction.
 
It
 
can
 
be
 
resisted
 
and
 
mitigated
 
through
 
the
 
target's
 
MDEF
 
or
 
fire
 
resistance.
 
Each
 
stack
 
increases
 
its
 
potential
 
and
 
can
 
be
 
refreshed
 
when
 
reapplied,
 
since
 
its
 
duration
 
is
 
intentionally
 
short.
 
 

 
Potion Pitcher: 
1. EFFECTS REWORKED: 
Potion Pitcher New Effects 
Potion Effect Duration 
Red Potion Restores +15% MaxHP overtime 15 seconds 
Orange Potion Gives Level 1 Endure 10 seconds 
Yellow Potion Increases Resistance to Freeze/Stoned/Stun by 50% 
60 seconds 
White Potion Increases Healing Received by 15% 180 seconds 
Blue Potion Reduces SP Cost by 30% 180 seconds Commentary: Alchemist potions have been reworked to move away from directly 
replicating
 
existing
 
skills,
 
especially
 
those
 
from
 
Acolyte/Priest.
 
They
 
now
 
provide
 
more
 
unique
 
effects
 
while
 
still
 
maintaining
 
a
 
theme
 
similar
 
to
 
their
 
original
 
design.
 
 Yellow, white, and blue potion buffs stack multiplicatively with similar effects.
1. Red Potion: Provide a gradual healing effect over 15 seconds, with healing ticks 
increasing
 
over
 
time
 
(1%
 
/
 
2%
 
/
 
4%
 
/
 
8%
 
MaxHP);
 2. Orange Potion: Kept as is;
3. Yellow Potion: Increase resistance against negative statuses, reducing both the 
chance
 
of
 
being
 
afflicted
 
and
 
the
 
duration
 
of
 
the
 
effects;
 4. White Potion: Increase overall healing effectiveness from both skills and 
consumable
 
items;
 5. Blue Potion: Reduce SP cost of skills by 30%. 

Item Changes: 
 
FUEL Card: 
1. Increases damage of Acid Terror and Demonstration by 10%;
2. Reduces the cooldown of Demonstration by 2 seconds;
3. Grants +5 FLEE. Commentary: FUEL Card's damage bonus has been reduced and compensated 
through
 
base
 
skill
 
adjustments,
 
in
 
line
 
with
 
similar
 
cards.
 
Acid
 
Terror's
 
damage
 
has
 
been
 
relatively
 
increased,
 
while
 
Demonstration
 
will
 
not
 
receive
 
compensation,
 
as
 
it
 
was
 
already
 
slightly
 
outperforming
 
in
 
terms
 
of
 
damage.
 
A
 
new
 
unique
 
effect
 
has
 
been
 
added,
 
reducing
 
Demonstration's
 
cooldown
 
while
 
reinforcing
 
the
 
card's
 
pyromaniac
 
theme.
 
 
Tengu Card: 
1. Add the chance to gain a random restorative item each time a monster is killed.
2. Increases Geographers healing effectiveness by 10%;
3. Geographers are unable to attack. Commentary: The healing effectiveness has been reduced as an adjustment to 
account
 
for
 
the
 
stronger
 
healing
 
scaling
 
from
 
INT,
 
keeping
 
the
 
card
 
more
 
balanced
 
and
 
focused
 
on
 
its
 
unique
 
perk
 
rather
 
than
 
serving
 
as
 
a
 
major
 
healing
 
amplifier.
 
 
 
Plant Bottle: 
1. Summoning a Geographer directly from Plant Bottle has been removed. Commentary: Due to the highly buggy behavior associated with summoning an 
additional
 
Geographer
 
from
 
Plant
 
Bottle,
 
and
 
its
 
impact
 
on
 
future
 
interactions
 
within
 
the
 
Creator
 
kit,
 
this
 
functionality
 
has
 
been
 
removed.
 
Note
 
that
 
it
 
is
 
still
 
possible
 
to
 
use
 
Bio
 
Cannibalize
 
to
 
summon
 
a
 
plant
 
beyond
 
the
 
limit
 
by
 
consuming
 
a
 
bottle.
 

 
Giant Pestle: 
 
NEW ONE-HANDED MACE: 
[Alchemist] [100 ATK] [1 Slot] [Level 3] [Weight: 130] [Level required: 58] [Base LUK and Base DEX >= 60] +3 ATK for each level in [Pharmacy] +5% chance for [Potion Pitcher] to affect an additional target [Base LUK and Base DEX >= 80] the total bonus becomes: +12 ATK for each level in [Pharmacy] +20% chance for [Potion Pitcher] to affect an additional target Description: "An oversized pestle built to prepare remedies in quantities few can 
handle."
 Drops from: M█████████ Commentary: A weapon designed to push Brewers into active combat and party play. 
Besides
 
providing
 
offensive
 
scaling,
 
it
 
also
 
adds
 
another
 
way
 
to
 
conserve
 
potions
 
while
 
supporting
 
your
 
allies.
 The secondary target must be a party member within the cast range of Potion Pitcher, 
and
 
can
 
also
 
be
 
yourself.
 
Since
 
the
 
secondary
 
target
 
is
 
chosen
 
completely
 
at
 
random,
 
the
 
fewer
 
valid
 
targets
 
there
 
are
 
within
 
the
 
skill's
 
range,
 
the
 
more
 
reliable
 
the
 
effect
 
becomes,
 
making
 
it
 
potentially
 
more
 
valuable
 
in
 
duos/smaller
 
parties.
 
This
 
additional
 
proc
 
does
 
not
 
consume
 
an
 
extra
 
potion.
```

## Burning status - PayonStories Burning 2026-08-09

*Date: 2026-08-09 · Type: Mechanic · Source file: `PayonStories Burning 2026-08-09.pdf`*

```text
Burning: 
 
- Burning has a single duration of 5 seconds; 
- Burning can stack up to 5 levels; 
- Each level applies: 
• 60 Fire (magic) damage per second; 
• -2 MDEF per stack. 
- Applying Burning: 
• Increases the stack level by 1 (up to 5); 
• Resets duration to 5 seconds; 
• Does not interrupt or delay damage ticks. 
- Burning does not maintain separate timers per stack, only the current stack level; 
- Damage is treated as Magic Fire Damage , and as such it is mitigated by the usual 
Fire Resistance, MDEF , INT, Armor Element, etc.
```

---

# 3. Hand-authored data decisions

Payon Stories publishes item *descriptions*, but the engine reads item **scripts**. A
PS-reworked effect that exists only in a description does nothing until a script is written
for it. These are the layers, in application order, and the decisions taken in them.

## Data layers

| Layer | File | Carries | Authored by |
|---|---|---|---|
| Base | `db/item_db.json` | vanilla Hercules items + scripts | upstream |
| PS overrides | `ps/ps_item_overrides.json` | name + description **only**, no scripts | auto-scraped |
| PS manual | `ps/ps_item_manual.json` | hand-written `script` (replaces the vanilla one) | us |

`dataLoader._applyPsItemLayers` applies them in that order. A `_note` key on a manual entry
documents why a script deviates and is stripped at load.

## Conventions

- **Provisional ids live in a reserved `95xxx` block** with a `_comment_95xxx` note, for
  items that are documented but not yet obtainable. Re-key them to the real id on release -
  Giant Pestle went 95002 -> 8430 a day after its patch.
- **`bAddRace,RC_DemiPlayer`** fans out to `RC_DemiHuman` + `RC_Player`; **`RC_All`** fans
  out to `RC_Boss` + `RC_NonBoss`.
- **PS-custom bonus names** exist where no Hercules bonus fits: `bHealBombFull`, `bCritHeal`
  (per-mille of a crit healed), `bMagnumLinger`.
- **`autobonus` is a proc, not an always-on bonus** - applied only through the auto-bonus /
  "always proc" path.
- **`skill_level_cap_overrides` SETS a skill's PS max** and can raise as well as lower it;
  `BS_TWOHANDSWORD: 0` is how a removed skill disappears from the pickers.
- **The in-game client tooltip beats the API right after a patch**, and the API beats the
  PDFs a day or two later.

## Descriptions that drift from scripts

The scripts are hand-maintained and the descriptions are scraped, so the two can disagree.
When they do, **the script is usually the correct one and the description is stale** - the
2026-08-22 audit found 15 such items where damage was right but the tooltip was wrong
(Grizzly Card, Flame Beetle, Tengu, Ancient Mummy and others). Fix the description; do not
"correct" a script to match stale text without checking a PDF or the live item API first.
