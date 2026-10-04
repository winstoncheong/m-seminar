# m-seminar

Standalone archive site for the K-State M-Seminar. `README.md` documents the
data schema and the agent-maintenance workflow — read it before changing
anything under `data/`.

# Layout: generated files vs. source of truth

Read this before editing anything. **Three tracked files are build outputs, and
editing one directly is silently discarded by the next `build.py` run** — no
error, no warning, the build just overwrites it. That failure mode is silent
and has already cost one agent a lost edit.

| File | Role | Hand-edit? |
|---|---|---|
| `scripts/build.py` | source — also holds the `HTML` page template | yes |
| `assets/style.css` | source — all styling, light/dark via `--*` tokens | yes |
| `assets/app.js` | source — render, search, filters, video | yes |
| `data/*.json` | source — scraped, then partially reviewed by a human | yes, see `README.md` |
| `index.html` | **generated** from the `HTML` string in `scripts/build.py` | **no** |
| `assets/data.js` | **generated** from `data/*.json` as `window.MSEMINAR` | **no** |

To change markup, edit the `HTML = """..."""` template near the bottom of
`scripts/build.py` and rebuild — the committed `index.html` is a *rendered
artifact*, not an input. To restyle, edit `assets/style.css` directly; it is
hand-written and not regenerated.

Both generated files are committed anyway, so the site works without running
anything, and so a reviewer can read the page without executing Python. That
convenience is exactly what makes them look editable. They are not.

# Submodule relationship

This repo is tracked as a submodule at `m-seminar-page/` inside the notes
vault (`winstoncheong/notes`). Vault search and the `Seminars.md` wikilink
depend on these files being checked out at that path — keep them there.

# Publishing changes

Two-step push, in this order:

1. Commit and push here first.
2. Then, in the notes vault: `git add m-seminar-page`, commit the pointer
   bump, and push.

Pushing here without bumping the pointer leaves the vault on a stale commit;
bumping before pushing here leaves a dangling pointer.

# Commits

Same convention as the notes vault: well-structured commits, and declare
model + thinking level in the message body
(e.g. `Model: <provider>/<model-id>, Thinking: <level>`).

# Building

`python scripts/validate.py` must report 0 errors, then
`python scripts/build.py`, then `bash scripts/format.sh`. `build.py` refuses
to build on validation errors.

Never leave unexplained churn from a `build + format` cycle. Exactly one line
always changes: `generated:` in `assets/data.js`, which feeds the footer's
"Last built" date. That timestamp stays — on a scraped archive it is the only
freshness signal a reader gets, and the disclaimer points at it. So the
invariant to check is that the diff is *nothing but* that line:

```bash
git diff --stat   # expect exactly:  assets/data.js | 2 +-
```

Any other entry means a build product is stale or a source file was left
unformatted — fix it before committing.

Prettier normalizes the page shell on every format run, so keep the `HTML`
template readable rather than pre-indenting it by hand; the build output is
what gets the 100-column wrapping.