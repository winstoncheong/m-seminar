"""Build the static M-Seminar site from the scraped data.

Reads ``data/talks.json`` + ``data/match.json`` + ``data/videos.json`` and writes:

  index.html          the page shell
  assets/data.js      window.MSEMINAR = {...}  (all data, embedded)

Run after ``scripts/scrape.py``::

    python scripts/build.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

try:  # tzdata ships with most builds; Windows Python may need the tzdata wheel
    from zoneinfo import ZoneInfo

    LOCAL_TZ = ZoneInfo("America/Chicago")
except Exception:  # noqa: BLE001 — no tz database: calendars fall back to wall clock
    LOCAL_TZ = None

sys.path.insert(0, str(Path(__file__).parent))
from validate import TAG_LABELS, validate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ASSETS = ROOT / "assets"

KSU = "https://www.math.ksu.edu"
BASE = KSU + "/research/research-centers/m-center"
CHANNEL = "https://www.youtube.com/@m-seminar_ksu"

# Calendar events are built from the prose on the source page. Seminar times are
# printed in Manhattan, Kansas time, so Google gets ctz=America/Chicago from the
# client; everything here stays in wall-clock terms.
TZ = "America/Chicago"
TALK_MINUTES = 60
MONTH_NUM = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
MONTH_ABBR = [None, "Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# "Monday (Nov 9) at 10:00am" — the per-lecture schedule of a series.
SESSION_RE = re.compile(r"\((\w{3,9})\.?\s+(\d{1,2})\)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)", re.I)
# "November 5, 3:30pm (special time)" — the single start time of one talk.
TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", re.I)


def _clock(hour: str, minute: str | None, meridiem: str) -> tuple[int, int]:
    h = int(hour) % 12 + (12 if meridiem.lower() == "pm" else 0)
    return h, int(minute or 0)


def _stamp(h: int, m: int) -> str:
    return f"{h % 12 or 12}:{m:02d}{'pm' if h >= 12 else 'am'}"


def _utc(d: date, hour: int, minute: int) -> str:
    """UTC stamp for .ics downloads; empty when no tz database is available."""
    if LOCAL_TZ is None:
        return ""
    local = datetime(d.year, d.month, d.day, hour, minute, tzinfo=LOCAL_TZ)
    return local.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _session(year: int, month: int, day: int, hour=None, minute=None) -> dict | None:
    """One calendar entry; all-day when the source gives no time of day."""
    try:
        d = date(year, month, day)
    except ValueError:
        return None
    label = f"{WEEKDAY_ABBR[d.weekday()]} {MONTH_ABBR[month]} {day}"
    if hour is None:
        return {"start": d.isoformat(),
                "end": date.fromordinal(d.toordinal() + 1).isoformat(),
                "all_day": True, "label": label}
    end_h, end_m = divmod(hour * 60 + minute + TALK_MINUTES, 60)
    same_day_end = end_h < 24
    end = date.fromordinal(d.toordinal() + (0 if same_day_end else 1))
    end_h %= 24
    return {"start": f"{d.isoformat()}T{hour:02d}:{minute:02d}",
            "end": f"{end.isoformat()}T{end_h:02d}:{end_m:02d}",
            "start_utc": _utc(d, hour, minute),
            "end_utc": _utc(end, end_h, end_m),
            "all_day": False,
            "label": f"{label} · {_stamp(hour, minute)}"}


def _listed_days(date_text: str) -> list[int]:
    """Extra day numbers in "October 14, 15 and 16" (times and other months are
    left alone: "November 5, 3:30pm" has none)."""
    text = re.sub(r"\([^)]*\)", "", date_text or "")
    _, _, rest = text.partition(",")
    days = []
    for part in re.split(r",|\band\b", rest):
        p = part.strip()
        if p.isdigit() and 1 <= int(p) <= 31:
            days.append(int(p))
        elif p:
            break
    return days


def sessions_for(talk: dict) -> list[dict]:
    """Calendar entries for a talk: one per lecture when the page lists a
    schedule, otherwise the date(s) and time in `date_text`."""
    year = talk.get("section_year")
    if not year:
        return []
    found = []
    for line in talk.get("extra") or []:
        m = SESSION_RE.search(line)
        if not m:
            continue
        month = MONTH_NUM.get(m.group(1)[:3].lower())
        if not month:
            continue
        hour, minute = _clock(m.group(3), m.group(4), m.group(5))
        s = _session(year, month, int(m.group(2)), hour, minute)
        if s:
            found.append(s)
    if found:
        return sorted(found, key=lambda s: s["start"])

    md = talk.get("month_day")
    if not md:
        return []
    month, day = md
    tm = TIME_RE.search(talk.get("date_text") or "")
    if tm:
        hour, minute = _clock(tm.group(1), tm.group(2), tm.group(3))
        s = _session(year, month, day, hour, minute)
        return [s] if s else []
    out = []
    for d in [day, *_listed_days(talk.get("date_text") or "")]:
        s = _session(year, month, d)
        if s:
            out.append(s)
    return out


def room_for(talk: dict) -> str:
    """The room, when the page states one ("In-person: Room CW 122")."""
    for line in talk.get("extra") or []:
        if line.lower().startswith(("in-person:", "room:")):
            return line.split(":", 1)[1].strip()
    return ""



def classify(link: dict) -> dict:
    url = urljoin(BASE + "/", link["url"])
    label = (link.get("label") or "").strip()
    low = url.lower()
    lab = label.lower()
    if "zoom.us" in low:
        kind = "zoom"
    elif "youtube" in low or "youtu.be" in low or "mediasite" in low or "kaltura" in low:
        kind = "video"
    elif "arxiv.org" in low:
        kind = "paper"
    elif low.endswith(".pdf") or re.search(r"notes?|slides?|lec|handout|plan", lab):
        kind = "notes"
    else:
        kind = "other"
    return {"label": label or "Link", "url": url, "kind": kind}


def build() -> dict:
    talks = json.loads((DATA / "talks.json").read_text(encoding="utf-8"))
    matches = {m["id"]: m for m in
               json.loads((DATA / "match.json").read_text(encoding="utf-8"))}
    videos = {v["id"]: v for v in
              json.loads((DATA / "videos.json").read_text(encoding="utf-8"))}

    today = date.today().isoformat()
    out_talks = []
    for t in talks:
        md = t.get("month_day")
        date_iso = None
        if md and t.get("section_year"):
            try:
                date_iso = date(t["section_year"], md[0], md[1]).isoformat()
            except ValueError:
                date_iso = None

        links = [classify(l) for l in t.get("links", [])]
        # de-duplicate links by url
        seen = set()
        links = [l for l in links if not (l["url"] in seen or seen.add(l["url"]))]

        vids = []
        for v in matches.get(t["id"], {}).get("videos", []):
            meta = videos.get(v["id"], {})
            vids.append({
                "id": v["id"],
                "title": meta.get("title", v.get("title", "")),
                "part": v.get("part", 1),
                "duration": meta.get("duration"),
                "views": meta.get("views"),
                "embed": f"https://www.youtube.com/embed/{v['id']}",
                "thumb": f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg",
                "url": f"https://www.youtube.com/watch?v={v['id']}",
            })

        out_talks.append({
            "id": t["id"],
            "year": t.get("section_year"),
            "season": t.get("season"),
            "date_text": t.get("date_text"),
            "date_iso": date_iso,
            "speaker": t.get("speaker"),
            "affiliation": t.get("affiliation"),
            "title": t.get("title") or "",
            "abstract": t.get("abstract") or "",
            "tags": t.get("tags") or [],
            "extra": t.get("extra") or [],
            "cancelled": bool(t.get("cancelled")),
            "upcoming": bool(date_iso and date_iso >= today),
            "links": links,
            "videos": vids,
            "sessions": sessions_for(t),
            "room": room_for(t),
            "source": t.get("source"),
        })

    years = sorted({t["year"] for t in out_talks if t["year"]}, reverse=True)

    speakers = {}
    sp_path = DATA / "speakers.json"
    if sp_path.exists():
        speakers = json.loads(sp_path.read_text(encoding="utf-8"))

    tag_counts: dict[str, int] = {}
    for t in out_talks:
        for tag in t["tags"]:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    tags = [
        {"slug": slug, "label": TAG_LABELS.get(slug, slug), "count": tag_counts[slug]}
        for slug in sorted(tag_counts, key=lambda s: (-tag_counts[s], s))
    ]

    payload = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "today": today,
        "channel": CHANNEL,
        "base": BASE,
        "counts": {
            "talks": len(out_talks),
            "withVideo": sum(1 for t in out_talks if t["videos"]),
            "videos": sum(len(t["videos"]) for t in out_talks),
            "speakers": len(speakers),
            "years": years,
        },
        "speakers": speakers,
        "tags": tags,
        "talks": out_talks,
    }
    return payload


HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>M-Seminar · Kansas State University</title>
<meta name="description" content="Archive of the K-State M-Seminar: talks, abstracts, slides and video recordings.">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="preconnect" href="https://i.ytimg.com">
<link rel="stylesheet" href="assets/style.css">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<script>
// Apply the stored theme before first paint to avoid a flash.
try {
  var t = localStorage.getItem('mseminar-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  }
} catch (e) {}
</script>
<script>
window.MathJax = {
  tex: { inlineMath: [['$','$'], ['\\\\(','\\\\)']], displayMath: [['$$','$$']],
         macros: { Bbb: "\\\\mathbb", CC: "\\\\mathbb{C}", RR: "\\\\mathbb{R}",
                   ZZ: "\\\\mathbb{Z}", QQ: "\\\\mathbb{Q}", NN: "\\\\mathbb{N}" } },
  options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] }
};
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <div class="brand">
      <span class="mark" aria-hidden="true"><svg viewBox="0 0 40 40" width="22" height="22" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 32 V11 l11 13 11-13 V32"/></svg></span>
      <div>
        <h1>M-Seminar</h1>
        <p class="sub">Kansas State University · M-Center</p>
      </div>
    </div>
    <nav class="header-links">
      <a href="https://www.math.ksu.edu/research/research-centers/m-center/" target="_blank" rel="noopener">M-Center</a>
      <a href="https://www.youtube.com/@m-seminar_ksu" target="_blank" rel="noopener">YouTube</a>
      <a href="https://www.math.ksu.edu/research/research-centers/m-center/seminars.html" target="_blank" rel="noopener">Original page</a>
      <button id="theme-toggle" class="theme-toggle" type="button" title="Toggle dark mode">☾</button>
    </nav>
  </div>
</header>

<main class="wrap">
  <aside class="disclaimer" role="note">
    <p><span class="disclaimer-tag">Please note</span>This is an unofficial, AI-generated archive. Everything here was put together by an AI agent from information scraped off the public web and then only partially reviewed by a human, so titles, dates, speakers and abstracts may be wrong. Treat the <a href="https://www.math.ksu.edu/research/research-centers/m-center/seminars.html" target="_blank" rel="noopener">official M-Seminar page</a> as the source of truth, and check the "Last built" date below before assuming a listing is current. This site will be updated irregularly.</p>
  </aside>

  <section class="hero">
    <p id="next-talk" class="next-talk" hidden></p>
    <div class="listing">
      <div class="controls">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="q" type="search" placeholder="Search title, speaker, abstract…  (press /)" autocomplete="off">
        </label>
        <select id="year" aria-label="Filter by year"><option value="">All years</option></select>
        <select id="sort" aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="speaker">By speaker</option>
        </select>
        <label class="check"><input id="hasVideo" type="checkbox"> With video</label>
        <label class="check"><input id="upcomingOnly" type="checkbox"> Upcoming</label>
        <label class="check"><input id="hideCancelled" type="checkbox" checked> Hide cancelled</label>
      </div>
      <div id="tagRow" class="tag-row" role="group" aria-label="Filter by topic">
        <span class="tag-row-label">Topics</span>
      </div>
      <p id="stats" class="stats"></p>
      <section id="results" class="results"></section>
      <p id="empty" class="empty" hidden>No talks match your filters.</p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap">
    <p>Programme data scraped from <a href="https://www.math.ksu.edu/research/research-centers/m-center/seminars.html" target="_blank" rel="noopener">math.ksu.edu</a> and partially reviewed by hand.
       Video recordings from the <a href="https://www.youtube.com/@m-seminar_ksu" target="_blank" rel="noopener">M-Seminar YouTube channel</a>.</p>
    <p class="muted">Last built <span id="built"></span>. Unofficial mirror; not affiliated with K-State.</p>
  </div>
</footer>

<script src="assets/data.js"></script>
<script src="assets/app.js"></script>
<!-- Vercel observability (zero-config static): replace UNIQUE-PATH-ANALYTICS with the script path shown in the Vercel dashboard under project > Analytics > Enable, and UNIQUE-PATH-SPEED with the one under project > Speed Insights. Both 404 harmlessly until enabled. -->
<script>
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/UNIQUE-PATH-ANALYTICS/script.js"></script>
<script>
window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
</script>
<script defer src="/UNIQUE-PATH-SPEED/script.js"></script>
</body>
</html>
"""


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the M-Seminar site.")
    ap.add_argument("--strict", action="store_true",
                    help="abort the build on validation warnings too")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

    issues = validate()
    errors = [m for lvl, m in issues if lvl == "error"]
    warns = [m for lvl, m in issues if lvl == "warn"]
    for m in errors:
        print(f"  [error] {m}")
    if warns:
        print(f"  {len(warns)} warning(s) — run `python scripts/validate.py` for details")
    if errors or (args.strict and warns):
        sys.exit("validation failed; not building")

    payload = build()
    ASSETS.mkdir(exist_ok=True)
    (ASSETS / "data.js").write_text(
        "window.MSEMINAR = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8")
    (ROOT / "index.html").write_text(HTML, encoding="utf-8")
    c = payload["counts"]
    print(f"Wrote index.html + assets/data.js  "
          f"({c['talks']} talks, {c['withVideo']} with video, {c['videos']} recordings)")


if __name__ == "__main__":
    main()
