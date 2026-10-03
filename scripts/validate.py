"""Validate the scraped M-Seminar data before building.

The scraper's failures are silent: a mis-parsed speaker or a merged
title/abstract ships unless someone reads every card.  This catches the
known failure modes and reports them.

Usage::

    python scripts/validate.py            # report; exit 1 if there are errors
    python scripts/validate.py --strict   # treat warnings as errors too
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Month names as they appear in the KSU date lines ("Ocotber" is their typo).
MONTH_NUM = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "ocotber": 10,
    "november": 11, "december": 12,
}

NON_PERSON = re.compile(
    r"\b(lecture|colloquium|memorial|prize|award|conference|seminar|workshop|"
    r"symposium|series|tba|tbd)\b", re.I)


def load(name: str):
    p = DATA / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def validate() -> list[tuple[str, str]]:
    issues: list[tuple[str, str]] = []

    def err(msg):
        issues.append(("error", msg))

    def warn(msg):
        issues.append(("warn", msg))

    talks = load("talks.json") or []
    videos = load("videos.json") or []
    matches = load("match.json") or []
    speakers = load("speakers.json") or {}

    if not talks:
        err("talks.json is empty")
        return issues

    names = {(t.get("speaker") or "").strip() for t in talks}
    seen_ids: set[str] = set()

    for i, t in enumerate(talks):
        who = t.get("speaker") or ""
        tag = f"{t.get('section_year')} {who or '(no speaker)'}"

        # identity
        if t.get("id") in seen_ids:
            err(f"duplicate id: {t['id']}")
        seen_ids.add(t.get("id"))
        if not who:
            warn(f"{tag}: no speaker")
        elif NON_PERSON.search(who):
            err(f"{tag}: speaker looks like a non-person ({who!r})")

        # dates
        md = t.get("month_day")
        dt = t.get("date_text")
        if md:
            m, d = md
            if not (1 <= m <= 12 and 1 <= d <= 31):
                err(f"{tag}: invalid month/day {md} (date_text={dt!r})")
            if dt:
                mm = re.match(r"^\s*([A-Za-z]+)", dt)
                if mm and mm.group(1).lower() in MONTH_NUM:
                    if MONTH_NUM[mm.group(1).lower()] != m:
                        err(f"{tag}: month mismatch {dt!r} -> {md}")

        # text integrity
        for field in ("title", "abstract"):
            s = t.get(field) or ""
            if s.count("$") % 2:
                err(f"{tag}: unbalanced $ in {field}")
            # a $$ pair with no TeX inside is usually a mis-paired delimiter
            # (e.g. "$X$ Y$$"), not real display math
            no_display = re.sub(r"\$\$.+?\$\$",
                                lambda m: "" if "\\" in m.group(0) else m.group(0),
                                s, flags=re.S)
            if "$$" in no_display:
                warn(f"{tag}: suspicious $$ in {field} (possible mis-paired $)")
        title = t.get("title") or ""
        if title and ("\n" in title
                      or (len(title) > 100 and re.search(r"\.\s+[A-Z]", title))
                      or len(title) > 200):
            warn(f"{tag}: title looks like it contains prose/abstract")

    # video references
    video_ids = {v["id"] for v in videos}
    talk_ids = {t.get("id") for t in talks}
    talk_by_id = {t.get("id"): t for t in talks}
    used: dict[str, int] = {}
    for m in matches:
        tid = m.get("id")
        if tid not in talk_ids:
            err(f"match entry {tid!r} has no talk in talks.json")
            continue
        for v in m.get("videos", []):
            used[v["id"]] = used.get(v["id"], 0) + 1
            if v["id"] not in video_ids:
                err(f"talk {tid}: video {v['id']} not in videos.json")
    for vid, n in used.items():
        if n > 1:
            err(f"video {vid} matched to {n} talks")
    unmatched = video_ids - set(used)
    if unmatched:
        warn(f"{len(unmatched)} channel video(s) not matched to any talk")

    # speaker links
    for name in speakers:
        if name not in names:
            warn(f"speaker homepage for {name!r} has no matching talk")

    return issues


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true",
                    help="exit non-zero on warnings too")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

    issues = validate()
    errors = [m for lvl, m in issues if lvl == "error"]
    warns = [m for lvl, m in issues if lvl == "warn"]
    for lvl, msg in issues:
        print(f"  [{lvl}] {msg}")
    print(f"\n{len(errors)} error(s), {len(warns)} warning(s)")
    if errors or (args.strict and warns):
        sys.exit(1)


if __name__ == "__main__":
    main()
