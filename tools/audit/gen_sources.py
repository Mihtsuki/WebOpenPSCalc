"""Regenerate open-ps-calc-backend/backend/PS_SOURCES.md from the PDF snapshot.

    python gen_sources.py

Run this after extract_pdfs.py picks up a new rework PDF, or after adding a patch
note to the PATCHES block below. The generated file is committed; this script is
how it stays reproducible instead of being hand-edited into drift.
"""
import json, io, re, os, datetime

from common import snapshot, HERE, BACKEND
import os
docs = json.load(io.open(snapshot("pdfs.json"), encoding="utf-8"))
DL = r"C:\Users\ervin\Downloads"

LIG = {"\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
       "\u019f": "ti", "\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"',
       "\u2013": "-", "\u00a0": " "}


def clean(t):
    for a, b in LIG.items():
        t = t.replace(a, b)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\b([A-Z]) ([A-Z]{2,})\b", r"\1\2", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"(?<!\n)\s(\d{1,2}\.)\s(?=[A-Z(])", r"\n\1 ", t)
    return t.strip()


META = [
    ("Payon Stories Knight Patch.pdf", None, "Class rework", "Knight / Swordsman"),
    ("PSRO Priest Acolyte Rework.pdf", None, "Class rework", "Acolyte / Priest"),
    ("PSRO Crusader Rework - 2026.pdf", None, "Class rework", "Crusader"),
    ("PSRO Monk Rework - 2026.pdf", None, "Class rework", "Monk"),
    ("Assassin_Rework_PayonStories.pdf", None, "Class rework", "Assassin"),
    ("Payon Stories - Hunter Rework.pdf", None, "Class rework", "Hunter"),
    ("Rogue - Patchnotes - Payon Stories.pdf", None, "Class rework", "Rogue"),
    ("Payon Stories Sage Rework Publication (Final).pdf", None, "Class rework", "Sage"),
    ("Gunslinger Release Patch Notes.pdf", None, "Class release", "Gunslinger"),
    ("Wizard and High Wizard Trans Class Changes (Publish 12.13.25).pdf", "2025-12-13",
     "Class rework", "Wizard / High Wizard"),
    ("HW only Trans Notes (First coding request).pdf", None, "Class rework (draft)", "High Wizard (trans)"),
    ("PayonStories Merchant 2026-08-09.pdf", "2026-08-09", "Class rework", "Merchant"),
    ("PayonStories Blacksmith 2026-08-09.pdf", "2026-08-09", "Class rework", "Blacksmith"),
    ("PayonStories Alchemist Rework 2026-08-09.pdf", "2026-08-09", "Class rework", "Alchemist"),
    ("PayonStories Burning 2026-08-09.pdf", "2026-08-09", "Mechanic", "Burning status"),
]


def dl_date(b):
    p = os.path.join(DL, b)
    if not os.path.exists(p):
        return "unknown"
    return datetime.date.fromtimestamp(os.path.getmtime(p)).isoformat()


HEADER = """# Payon Stories source record

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
"""

PATCHES = """---

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
"""

MANUAL = """---

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
"""


def main():
    out = [HEADER, "## Index", "",
           "| Date | Source | Type | Affects |", "|---|---|---|---|",
           "| 2026-08-18 | Patch Notes (18th August 2026) | GM patch notes | Super Novice, Crazy Uproar, DPS room |",
           "| 2026-08-18 | Dastgir client hotfix | Discord (@Payon News) | Super Novice skill tab |"]
    for b, pub, kind, aff in META:
        d = pub or (dl_date(b) + " *(downloaded)*")
        out.append("| {} | {} | {} | {} |".format(d, b.replace(".pdf", ""), kind, aff))
    out += ["", PATCHES]
    for b, pub, kind, aff in META:
        d = pub or (dl_date(b) + " (downloaded)")
        out += ["## {} - {}".format(aff, b.replace(".pdf", "")), "",
                "*Date: {} · Type: {} · Source file: `{}`*".format(d, kind, b), "",
                "```text", clean(docs.get(b, "(extraction failed)")), "```", ""]
    out.append(MANUAL)
    dest = os.path.join(BACKEND, "PS_SOURCES.md")
    io.open(dest, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print("wrote " + dest)


main()
