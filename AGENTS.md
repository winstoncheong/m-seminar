# m-seminar

Standalone archive site for the K-State M-Seminar. `README.md` documents the
data schema and the agent-maintenance workflow — read it before changing
anything under `data/`.

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
to build on validation errors. Never leave a dirty `build + format` cycle —
the tree must be exactly reproducible (`git status` clean after running both).
