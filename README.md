# M-Seminar site

A single-page archive of the **M-Seminar** (Kansas State University M-Center):
talks, speakers, affiliations, abstracts, slides/notes links, and the matching
YouTube recordings — all in one searchable page.

The data is **scraped from the sources below and then partially reviewed by a
human**. An agent reads those pages and standardizes them into `data/`; a person
then checks the result. Review is partial, not exhaustive — the K-State pages have
changed markup several times since 2007, which is exactly why the scraped text
needs a second pair of eyes. So expect the odd wrong date or mangled title, and
treat the official page as the source of truth. The "Last built" line in the
footer says how stale the archive may be.

- Official page: <https://www.math.ksu.edu/research/research-centers/m-center/seminars.html>
- Past seasons: <https://www.math.ksu.edu/research/research-centers/m-center/past_seminars/>
- YouTube channel: <https://www.youtube.com/@m-seminar_ksu>

## What's here

```
  index.html            generated page (open this, or serve the folder)
  assets/
    style.css           styling (light + dark, with toggle)
    app.js              rendering, search, filters, click-to-load video
    data.js             generated: window.MSEMINAR = {...}
  data/
    talks.json          the programme, newest first (scraped + reviewed)
    videos.json         YouTube channel inventory (scraped + reviewed)
    match.json          talk -> video mapping (scraped + reviewed)
    speakers.json       speaker name -> homepage URL (scraped + reviewed)
  scripts/
    build.py            data/*.json -> index.html + assets/data.js
    validate.py         check the data for mistakes (run before building)
    format.sh           Prettier the assets/data
```

Everything under `data/` and the generated `index.html` / `assets/data.js` are
committed, so the site works without running anything.

## Maintaining (for agents)

To add a new semester (or fix entries), read the official pages and the
YouTube channel, then update `data/`:

1. **`talks.json`** — one object per talk, newest first. Fields:
   `id` (stable slug, e.g. `2026-tatsuki-kuwagaki-sheaf-theory-for-non-exact-lagrangians`),
   `section_year` (int), `season` (`Spring`/`Summer`/`Fall`/`Winter` or null),
   `date_text` (as printed, e.g. `September 24, 1:30pm (special time)`),
   `month_day` ([month, day] numbers, or null), `speaker`, `affiliation`,
   `cancelled` (bool), `title`, `abstract`, `links` (array of
   `{label, url}` — K-State PDF links are site-rooted, e.g.
   `/research/research-centers/m-center/foo.pdf`; `build.py` absolutizes them),
   `extra` (lecture-series schedules, room info, …), `source` (page URL),
   `order` (position on the source page, for stable sorting).
   Endowed lectures name the lecture, not the speaker (`William J. Spencer
Lecture`): put that in `extra` and the real speaker in `speaker`.
2. **`videos.json`** — one object per channel video: `id` (YouTube id),
   `title`, `duration` (seconds), `views`, `url`.
3. **`match.json`** — `{"id": <talk id>, "videos": [{"id", "part",
"title"}]}` (keyed by id, so inserting talks never breaks it).
   Multi-part series go on the single series talk, ordered by `part`.
   A talk with no recording gets `"videos": []` — the site then says so
   explicitly.
4. **`speakers.json`** — plain `{name: homepage URL}` map. Prefer the
   speaker's own page; university faculty pages are fine. Never link
   Wikipedia, Scholar, LinkedIn, arXiv, or conference pages. Only add a URL
   you are confident belongs to that person — no link beats a wrong link.

Math in titles/abstracts uses `$...$`. Every `$` must be paired, and each
pair must contain only math (a missing closer makes MathJax swallow prose —
`validate.py` catches this). Custom macros available: `\Bbb`, `\CC`, `\RR`,
`\ZZ`, `\QQ`, `\NN` (defined for MathJax in `build.py`).

Then rebuild:

```bash
python scripts/validate.py   # must report 0 errors
python scripts/build.py      # runs the validator first, refuses on errors
bash scripts/format.sh       # Prettier the assets/data for easy searching
```

`build.py` refuses to build on validation errors (unbalanced `$`, a
non-person "speaker", a bad date, a dangling/duplicate video reference).
Pass `--strict` to also fail on warnings. Serve the folder over HTTP to view:

```bash
python -m http.server 8765
```

### Weekly update

Once a week (or on request), re-scan the two sources and fold in what changed:

1. **Programme.** Open the official seminars page. Compare its talk list
   against `talks.json` (which is newest-first):
   - New talks go at the **top**. Give each a stable `id`
     (`{year}-{speaker-slug}-{title-slug}`, lowercase, truncated ~60 chars).
     Because `match.json` is keyed by id, existing entries are unaffected.
   - Backfill talks whose abstracts or `Notes` PDFs appeared after listing.
   - Mark cancellations (`cancelled: true`); fix postponements/room changes.
   - If a season rolled over (e.g. a new `past_seminars/2026.html` link
     appeared), check it for talks the current page dropped.
2. **Recordings.** List the YouTube channel's videos and compare against
   `videos.json` by video id. For each new upload: append to `videos.json`
   (`id`, `title`, `duration`, `views`, `url`) and add/extend the matching
   `match.json` entry. Multi-part series (`Part N`, `Lec N`, roman numerals
   like `Part II`) belong on the single series talk, ordered by `part`.
   Also check past talks with empty `"videos": []` — recordings are often
   uploaded weeks late.
3. **Speakers.** New names need a `speakers.json` entry: find the speaker's
   own homepage (university faculty pages are fine; never Wikipedia,
   Scholar, LinkedIn, arXiv, conference pages). Fetch the page and confirm
   the name appears before adding — no link beats a wrong link.
4. **Rebuild and verify** with the three commands above (`validate` must
   report 0 errors), spot-check the new/changed cards in a browser
   (abstract math renders, players load, no-recording notices where
   expected), then publish per `AGENTS.md` (push here first, then bump the
   vault pointer).

If nothing changed, do nothing — say so and stop.

## Deploying

The site is fully static (no build step at serve time), so any static host
works. On Vercel: import this repo, Framework Preset `Other`, no build
command, output directory `./` (the repo root). Every push redeploys.

## Notes

- Unofficial mirror; not affiliated with K-State. Programme text belongs to the
  M-Seminar.
- The abstract text may contain LaTeX; the page renders it with MathJax.
- arXiv references in titles/abstracts (`arXiv:YYMM.NNNNN`, old-style
  `archive/YYMMNNN`, and arxiv.org URLs) are auto-linked to the arXiv
  abstract page at render time — leave them as plain text in `data/`.
