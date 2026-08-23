"""Harvest the live Payon Stories item DB and diff it against ours.

    python fetch_ps_items.py            # harvest + report (writes snapshots/ps_item_index.json)
    python fetch_ps_items.py --report   # report only, from the existing snapshot

There is no bulk endpoint, so this uses two passes that cover different blind spots:

  1. NAME SEARCH. `?name=<substring>` is a substring match with a 3-character
     minimum ("ar" returns No data, "Hat" returns 456). Querying every 3-gram that
     occurs in a known item name harvests most of the DB in one sweep — any item
     whose name shares a trigram with anything we already know comes back.
  2. ID SCAN of the custom block. PS's own items live in 9xxxx and can be named
     unlike anything in the vanilla DB, so trigrams may never reach them. That
     range is small enough to walk directly.

Pass 1 cannot prove completeness on its own: an item whose name shares no trigram
with any known name stays invisible. The report says how many trigrams were used
so that limit stays visible rather than being mistaken for a full dump.
"""
import sys
import re
import json
import subprocess
import concurrent.futures as cf
from common import load, save, snapshot, build, UA, PS_DATA, BACKEND, node_eval

API = "https://tools.payonstories.com/api/pc/item"
CUSTOM_RANGE = (90000, 92000)

OUR_IDS_JS = r"""
const {loader}=require("./src/engine/dataLoader");
const {getProfile}=require("./src/engine/serverProfiles");
loader.setProfile(getProfile("payon_stories"));
const out={};
for (const t of ["IT_HEALING","IT_USABLE","IT_ETC","IT_ARMOR","IT_WEAPON","IT_CARD",
                 "IT_PETEGG","IT_PETARMOR","IT_AMMO","IT_DELAYCONSUME","IT_CASH"]) {
  for (const it of loader.getItemsByType(t)||[]) out[it.id]=it.name||"";
}
process.stdout.write(JSON.stringify(out));
"""


def ours():
    return json.loads(node_eval(OUR_IDS_JS, cwd=BACKEND))


def get(url):
    r = subprocess.run(["curl", "-s", "-m", "25", "-A", UA, url], capture_output=True)
    try:
        return json.loads(r.stdout.decode("utf-8", "replace"))
    except Exception:
        return None


def by_name(term):
    d = get("%s?name=%s" % (API, term.replace(" ", "%20")))
    if not d:
        return []
    if d.get("items"):
        return [(str(i["id"]), i.get("name", ""), i.get("slots")) for i in d["items"]]
    if d.get("name"):
        return [(str(d.get("id")), d["name"], d.get("slots"))]
    return []


def by_id(iid):
    d = get("%s?id=%s" % (API, iid))
    if d and d.get("name"):
        return (str(iid), d["name"], d.get("slots"))
    return None


def trigrams(names):
    out = set()
    for n in names:
        s = re.sub(r"[^a-z0-9 ]", "", (n or "").lower())
        for w in s.split():
            for i in range(len(w) - 2):
                out.add(w[i:i + 3])
    return sorted(out)


def harvest(our_names):
    grams = trigrams(our_names.values())
    print("querying %d distinct trigrams from %d known names..." % (len(grams), len(our_names)))
    found = {}
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for n, rows in enumerate(ex.map(by_name, grams)):
            for iid, name, slots in rows:
                found[iid] = {"name": name, "slots": slots}
            if n % 200 == 0:
                sys.stdout.write("\r  %d/%d trigrams, %d items" % (n, len(grams), len(found)))
                sys.stdout.flush()
    print("\r  %d trigrams done, %d items" % (len(grams), len(found)))

    lo, hi = CUSTOM_RANGE
    todo = [i for i in range(lo, hi) if str(i) not in found]
    print("scanning the %d-%d custom block (%d ids not already seen)..." % (lo, hi, len(todo)))
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for n, row in enumerate(ex.map(by_id, todo)):
            if row:
                found[row[0]] = {"name": row[1], "slots": row[2]}
            if n % 200 == 0:
                sys.stdout.write("\r  %d/%d ids" % (n, len(todo)))
                sys.stdout.flush()
    print("\r  custom block done — %d items total" % len(found))
    return found, len(grams)


def report(ps, our_names, ngrams=None):
    missing = {i: v for i, v in ps.items() if i not in our_names}
    slotdiff = []
    for i, v in ps.items():
        if i in our_names and v.get("slots") is not None:
            slotdiff.append((i, v["name"], v["slots"]))
    print("\nPS items harvested : %d" % len(ps))
    print("we already have    : %d" % (len(ps) - len(missing)))
    print("MISSING from ours  : %d" % len(missing))
    if ngrams:
        print("(harvested via %d trigrams + a %d-%d id scan; an item sharing no trigram "
              "with any known name would not appear)" % (ngrams, *CUSTOM_RANGE))
    for i in sorted(missing, key=lambda x: int(x)):
        print("   %-7s %s" % (i, missing[i]["name"]))
    save(build("ps_missing_items.json"), missing)
    print("\n-> build/ps_missing_items.json")
    return missing


def main():
    our_names = ours()
    if "--report" in sys.argv:
        ps = load(snapshot("ps_item_index.json"))
        report(ps, our_names)
        return
    ps, ngrams = harvest(our_names)
    save(snapshot("ps_item_index.json"), ps)
    report(ps, our_names, ngrams)


if __name__ == "__main__":
    main()
