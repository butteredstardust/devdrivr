# Backlog

Open work items for devdrivr. Append new items here. Remove an item when it ships.

Each item states why it matters first, then what to do.

---

## S3 — Screenshot baseline

**Status:** blocked on manual capture.

Visual regressions reach release undetected. No committed screenshot baseline exists, so a human
must drive a harness to find them.

To close this item:

1. Capture a screenshot set for every tool, in both themes.
2. Commit the set as the baseline.
3. Add a comparison step to the release smoke run.

See [`HARNESSES.md`](HARNESSES.md) for the harness to capture with.
