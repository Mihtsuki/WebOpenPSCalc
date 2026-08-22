"""Snapshot every base/2nd-job skill page from the Payon Stories wiki.

The wiki runs MediaWiki 1.39 with an open api.php, so we take raw wikitext
rather than scraping rendered HTML — the per-level damage tables come through
intact and nothing is lost to a summariser.

    python fetch_wiki.py            # refresh snapshots/wiki_raw.json
    python fetch_wiki.py --diff     # show what changed vs the committed snapshot

The --diff mode is the point of committing the snapshot: it answers "what did PS
change on the wiki since the last audit?" in one command.
"""
import sys
import json
import urllib.parse
from common import get_json, get, snapshot, load, UA, save

API = "https://wiki.payonstories.com/api.php"

# Base and 2nd-job classes only. Trans/High classes are unmodelled by design
# (see ROADMAP), so pulling their pages would add noise to every diff.
CLASSES = [
    "Swordman", "Knight", "Crusader", "Mage", "Wizard", "Sage", "Archer",
    "Hunter", "Bard", "Dancer", "Acolyte", "Priest", "Monk", "Merchant",
    "Blacksmith", "Alchemist", "Thief", "Assassin", "Rogue", "Ninja",
    "Gunslinger", "Taekwon", "Super_Novice", "Novice",
]


def page_titles():
    titles = set()
    for c in CLASSES:
        q = urllib.parse.urlencode({
            "action": "query", "list": "categorymembers",
            "cmtitle": "Category:" + c, "cmlimit": "500",
            "cmnamespace": "0", "format": "json",
        })
        d = get_json(API + "?" + q, 40) or {}
        for m in d.get("query", {}).get("categorymembers", []):
            titles.add(m["title"])
    return sorted(titles)


def fetch(titles):
    out = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        q = urllib.parse.urlencode({
            "action": "query", "prop": "revisions", "rvprop": "content",
            "rvslots": "main", "format": "json", "titles": "|".join(batch),
        })
        try:
            d = json.loads(get(API + "?" + q, 60))
        except Exception as e:
            print("  batch %d failed: %s" % (i, e))
            continue
        for _pid, pg in (d.get("query", {}).get("pages", {}) or {}).items():
            revs = pg.get("revisions")
            if revs:
                out[pg["title"]] = revs[0]["slots"]["main"]["*"]
        sys.stdout.write("\r  %d/%d" % (min(i + 40, len(titles)), len(titles)))
        sys.stdout.flush()
    print()
    return out


def main():
    diff_only = "--diff" in sys.argv
    print("enumerating category members...")
    titles = page_titles()
    print("%d unique pages across %d classes" % (len(titles), len(CLASSES)))
    fresh = fetch(titles)
    print("fetched %d pages, %s chars" % (len(fresh), f"{sum(map(len, fresh.values())):,}"))

    path = snapshot("wiki_raw.json")
    try:
        old = load(path)
    except Exception:
        old = {}

    added = sorted(set(fresh) - set(old))
    removed = sorted(set(old) - set(fresh))
    changed = sorted(t for t in set(fresh) & set(old) if fresh[t] != old[t])
    print("\nvs committed snapshot:  +%d  -%d  ~%d" % (len(added), len(removed), len(changed)))
    for t in added[:40]:
        print("   NEW      ", t)
    for t in removed[:40]:
        print("   GONE     ", t)
    for t in changed[:60]:
        print("   CHANGED  ", t)

    if diff_only:
        print("\n--diff: snapshot NOT written")
        return
    save(path, fresh)
    print("\nwrote %s" % path)
    if changed:
        print("Re-run audit_skills.py — a changed page may be a rework, or may be the "
              "wiki finally catching up to a PDF we already followed.")


if __name__ == "__main__":
    main()
