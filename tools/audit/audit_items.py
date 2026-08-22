"""Audit our item data against the live Payon Stories item API.

    python audit_items.py             # use the committed API snapshot
    python audit_items.py --refresh   # re-query the API first (slow, ~4 min)

Two checks, and they fail in opposite directions:

  DESCRIPTION DRIFT — our text disagrees with the API's. Usually harmless: the
  scripts are hand-maintained and the descriptions are scraped, so damage is
  right and only the tooltip misleads. Fix the description, and do NOT "correct"
  a script to match stale text without checking a PDF or the API first.

  UNIMPLEMENTED EFFECT — the description promises something no script grants.
  This is the one that costs damage. Watch for false positives: set bonuses live
  in the combo DB, not the item script, so those are checked separately below.
"""
import sys
import re
import os
from common import (load, save, snapshot, build, get_json, strip_html,
                    node_eval, PS_DATA, BACKEND)

EXPORT_JS = r"""
const fs=require("fs");
const {loader}=require("./src/engine/dataLoader");
const {getProfile}=require("./src/engine/serverProfiles");
const PS=getProfile("payon_stories"); loader.setProfile(PS);
const ovr=JSON.parse(fs.readFileSync("src/engine/data/ps/ps_item_overrides.json","utf8"));
const out=[];
for(const id of Object.keys(ovr)){
  const it=loader.getItem(Number(id)); if(!it) continue;
  out.push({id:Number(id),name:it.name,aegis:it.aegis_name||"",type:it.type||"",
    desc:(ovr[id].description||"").replace(/<[^>]+>/g," ").replace(/\s+/g," "),
    script:it.script||""});
}
const combos=[...loader._loadItemComboDb(), ...loader._loadPsItemComboDb()];
process.stdout.write(JSON.stringify({items:out,
  combo_items:[...new Set(combos.flatMap(c=>c.items||[]))]}));
"""


def effective_items():
    return __import__("json").loads(node_eval(EXPORT_JS, cwd=BACKEND))


def refresh_api(ids):
    out = {}
    for i, iid in enumerate(ids):
        d = get_json("https://tools.payonstories.com/api/pc/item?id=%s" % iid, 25)
        out[str(iid)] = d or {"error": "fetch"}
        if i % 40 == 0:
            sys.stdout.write("\r  %d/%d" % (i, len(ids)))
            sys.stdout.flush()
    print()
    return out


def effect_text(d):
    """Description with the trailing Class:/Weight:/Jobs: boilerplate removed.

    The split must NOT require a newline. Our exported descriptions are
    whitespace-collapsed onto one line while the API's keep <br/> as newlines, so
    anchoring on \\n trimmed the boilerplate from one side only and made nearly
    every item look like it had drifted (188 false hits vs the 15 real ones).
    """
    return re.split(r"\s(?:Class|Compound on|Weight|Type|Position|Level Requirement|Level|Jobs|Defense)\s*:",
                    strip_html(d))[0].strip()


SKILLPCT = re.compile(
    r"(?:increase[sd]?|raises?|boost)\s+(?:the\s+)?(?:physical\s+|magic(?:al)?\s+)?"
    r"damage\s+of\s+([A-Z][A-Za-z' ]{2,34}?)\s+(?:skills?\s+)?by\s+(\d+)\s*%", re.I)
ATK = re.compile(r"\bATK\s*\+\s*(\d+)\b", re.I)
MATK = re.compile(r"\bMATK\s*\+\s*(\d+)\b", re.I)


def main():
    data = effective_items()
    items, combo_items = data["items"], set(data["combo_items"])
    combo_lower = {c.lower() for c in combo_items}
    man = load(os.path.join(PS_DATA, "ps_item_manual.json"))

    if "--refresh" in sys.argv:
        ids = [k for k in man if str(k).isdigit()]
        print("querying the item API for %d hand-authored items..." % len(ids))
        api = refresh_api(ids)
        save(snapshot("api_items.json"), api)
    else:
        api = load(snapshot("api_items.json"))

    # ---- 1. description drift on hand-authored items -------------------------
    ovr = {str(i["id"]): i for i in items}
    drift = []
    for iid, a in api.items():
        if not a.get("name"):
            continue
        ours = (man.get(iid, {}) or {}).get("description") or \
               (ovr.get(iid, {}) or {}).get("desc")
        if not ours:
            continue
        o, n = effect_text(ours), effect_text(a.get("description", ""))
        if o and n and re.sub(r"\W", "", o.lower()) != re.sub(r"\W", "", n.lower()):
            # Strip whitespace out of each token before comparing — the raw
            # regex captures trailing spaces and newlines, so "10 " and "10"
            # read as a numeric difference and buried the real ones (188 hits
            # of noise vs the 15 that matter).
            def numbers(t):
                return {re.sub(r"\s+", "", x) for x in re.findall(r"\d+(?:\.\d+)?\s*%?", t)}
            ours_n, api_n = numbers(o), numbers(n)
            drift.append({"id": iid, "name": a["name"], "ours": o, "api": n,
                          "numeric": sorted(ours_n ^ api_n)})
    print("=== description drift vs the live API: %d item(s) ===" % len(drift))
    for d in drift:
        tag = "NUMERIC" if d["numeric"] else "wording"
        print("  %-7s %-26s %s" % (d["id"], d["name"][:25], tag))
        if d["numeric"]:
            print("           differing numbers: %s" % ", ".join(d["numeric"][:8]))

    # ---- 2. described but unimplemented --------------------------------------
    missing = []
    for it in items:
        d, s = it["desc"], it["script"]
        # A pet's loyal/cordial bonus comes from profile.pet_bonuses, never from
        # an item script. Matched on the description rather than the item type,
        # because pet eggs carry no type in our data.
        if re.search(r"Pet|Cordial/Loyal|Pet Incubator", d, re.I):
            continue
        # A set bonus lives in the combo DB, so its absence from the item script
        # is expected. Match on AEGIS name — the combo DB keys on that, and
        # display names do not map to it ("Witch's Pumpkin Hat" is Wit_Pumpkin_Hat),
        # so name-based matching silently misses set members.
        in_combo = (it.get("aegis") or "").lower() in combo_lower
        for m in SKILLPCT.finditer(d):
            if not re.search(r"bSkillAtk|bAddSkill|bSkillDamage|bAddAtkEle", s, re.I):
                missing.append((it["id"], it["name"], "skill dmg %s%% (%s)"
                                % (m.group(2), m.group(1).strip()), in_combo))
        for m in ATK.finditer(d):
            if not re.search(r"bAtk\b|bBaseAtk|bAtkRate|bLongAtkRate|bAddRace", s, re.I):
                missing.append((it["id"], it["name"], "ATK +%s" % m.group(1), in_combo))
        for m in MATK.finditer(d):
            if not re.search(r"bMatk", s, re.I):
                missing.append((it["id"], it["name"], "MATK +%s" % m.group(1), in_combo))

    real = [m for m in missing if not m[3]]
    combo = [m for m in missing if m[3]]
    print("\n=== described but not implemented: %d likely, %d covered by a combo ===" % (len(real), len(combo)))
    seen = set()
    for iid, name, what, _ in real:
        if iid in seen:
            continue
        seen.add(iid)
        print("  %-7s %-26s %s" % (iid, name[:25], what))
    if combo:
        print("  (set/combo bonuses, expected to be absent from the item script: %s)"
              % ", ".join(sorted({m[1] for m in combo})[:8]))

    save(build("item_audit.json"), {"drift": drift, "missing": [list(m) for m in missing]})
    print("\nfull detail -> build/item_audit.json")


if __name__ == "__main__":
    main()
