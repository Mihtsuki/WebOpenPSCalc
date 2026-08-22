"""Bring item tooltips back in line with the live Payon Stories item API.

    python sync_descriptions.py --dry     # show what would change
    python sync_descriptions.py           # write it

Only touches DESCRIPTIONS. Scripts are hand-authored and are usually the correct
half when the two disagree — the 2026-08-22 audit found 15 items whose damage was
right and whose tooltip was stale, not the reverse. Never let this script near a
script field.

`getItemDescription` applies ps_item_overrides then ps_item_manual, so a manual
description WINS over an override. Items carrying both need both updated or the
stale manual copy keeps showing.
"""
import sys
import io
import json
import os
import re
from common import load, snapshot, PS_DATA, strip_html

OVERRIDES = os.path.join(PS_DATA, "ps_item_overrides.json")
MANUAL = os.path.join(PS_DATA, "ps_item_manual.json")


def effect_text(d):
    return re.split(
        r"\s(?:Class|Compound on|Weight|Type|Position|Level Requirement|Level|Jobs|Defense)\s*:",
        strip_html(d))[0].strip()


def differs(a, b):
    return re.sub(r"\W", "", effect_text(a).lower()) != re.sub(r"\W", "", effect_text(b).lower())


def main():
    dry = "--dry" in sys.argv
    api = load(snapshot("api_items.json"))
    ovr = load(OVERRIDES)
    man = load(MANUAL)

    changed_o, changed_m, renamed = [], [], []
    for iid, a in sorted(api.items(), key=lambda kv: int(kv[0])):
        new = a.get("description")
        if not a.get("name") or not new:
            continue

        o = ovr.get(iid)
        if o is not None and "description" in o and differs(o["description"], new):
            changed_o.append((iid, a["name"], o["description"], new))
            if not dry:
                o["description"] = new
        # A manual description shadows the override, so it has to move too.
        m = man.get(iid)
        if m is not None and "description" in m and differs(m["description"], new):
            changed_m.append((iid, a["name"]))
            if not dry:
                m["description"] = new
        # The API is also authoritative for the display name.
        if o is not None and "name" in o and o["name"].strip() != a["name"].strip():
            renamed.append((iid, o["name"], a["name"]))
            if not dry:
                o["name"] = a["name"]

    print("descriptions to sync: %d override, %d manual" % (len(changed_o), len(changed_m)))
    for iid, name, old, new in changed_o:
        print("\n  #%s %s" % (iid, name))
        print("     was: %s" % effect_text(old)[:150].replace("\n", " | "))
        print("     now: %s" % effect_text(new)[:150].replace("\n", " | "))
    if changed_m:
        print("\n  manual descriptions also updated (they shadow the override): %s"
              % ", ".join("%s %s" % (i, n) for i, n in changed_m))
    if renamed:
        print("\n  names: %s" % ", ".join("%s %r->%r" % r for r in renamed))

    if dry:
        print("\n--dry: nothing written")
        return
    # Preserve each file's existing indentation so the diff stays readable.
    io.open(OVERRIDES, "w", encoding="utf-8", newline="\n").write(
        json.dumps(ovr, ensure_ascii=False, indent=2) + "\n")
    io.open(MANUAL, "w", encoding="utf-8", newline="\n").write(
        json.dumps(man, ensure_ascii=False, indent=1) + "\n")
    print("\nwrote ps_item_overrides.json and ps_item_manual.json")
    print("Re-run audit_items.py — description drift should now be 0.")


if __name__ == "__main__":
    main()
