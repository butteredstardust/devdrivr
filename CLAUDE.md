# CLAUDE.md — devdrivr

Guidance for Claude Code working in this repository.

**Canonical ruleset:** [`AGENTS.md`](./AGENTS.md) in this directory has the full development
workflow, git/commit conventions, non-negotiable coding rules, file map, established patterns, and
submission checklist. Read that first — this file only covers what's specific to Claude Code.

---

## Commit PATH note

The pre-commit hook calls `bunx`, and Claude Code runs git through a non-interactive shell. If a
commit fails with `command not found: bunx`, that shell's PATH is missing Bun's install directory —
see [`AGENTS.md` § Commits run a `bunx` pre-commit hook](./AGENTS.md#commits-run-a-bunx-pre-commit-hook)
for the prefix form. You will see that prefix on commands throughout this repo's git history; it is
an environment workaround, not something to reproduce by default.

---

## Documentation index

Full canonical docs live in [`documentation/`](./documentation/). Start with
[`documentation/README.md`](./documentation/README.md) for the index, or
[`documentation/PRODUCT_MAP.md`](./documentation/PRODUCT_MAP.md) for product status and the full
30-tool list.
