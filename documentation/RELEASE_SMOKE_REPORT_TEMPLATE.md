# devdrivr Release Smoke Report

This report is release evidence. Run every check against the downloaded GitHub Release artifact
identified below. Replace each `Not run` result with `Pass`, `Fail`, or `Blocked` and attach concise
evidence.

## Validation Metadata

| Field                           | Value                      |
| ------------------------------- | -------------------------- |
| Release                         | `devdrivr-v{{VERSION}}`    |
| Platform key                    | `{{PLATFORM_KEY}}`         |
| Artifact                        | `{{ARTIFACT_NAME}}`        |
| Downloaded path                 | `{{ARTIFACT_PATH}}`        |
| Artifact size                   | {{ARTIFACT_SIZE}} bytes    |
| SHA-256                         | `{{ARTIFACT_SHA256}}`      |
| OS / process architecture       | {{OS_VERSION}}             |
| Native / VM / emulation details | {{VALIDATION_ENVIRONMENT}} |
| Tester                          | {{TESTER}}                 |
| Report generated                | {{GENERATED_AT}}           |
| Validation completed            | _Not recorded_             |

## Promotion Decision

- [ ] **Pass** — every blocking check passed and no release-blocking defect is open.
- [ ] **Fail** — at least one blocking check failed.
- [ ] **Blocked** — validation could not be completed; promotion remains blocked.

Decision owner: _Not recorded_

## Preflight Evidence

| ID     | Check                                                                   | Blocking | Result  | Evidence |
| ------ | ----------------------------------------------------------------------- | -------- | ------- | -------- |
| PRE-01 | devdrivr CI is green for the release commit                             | Yes      | Not run |          |
| PRE-02 | All four `Build & Release devdrivr` matrix jobs passed                  | Yes      | Not run |          |
| PRE-03 | The release contains all four expected platform artifacts               | Yes      | Not run |          |
| PRE-04 | `latest.json` maps all four supported platform keys                     | Yes      | Not run |          |
| PRE-05 | Artifact identity matches the metadata and SHA-256 above                | Yes      | Not run |          |
| PRE-06 | Runtime checks use a disposable account/VM with clean devdrivr app data | Yes      | Not run |          |

## Runtime and Persistence Evidence

| ID     | Check                                                                          | Blocking | Result  | Evidence |
| ------ | ------------------------------------------------------------------------------ | -------- | ------- | -------- |
| RUN-01 | Install or launch succeeds from the downloaded artifact                        | Yes      | Not run |          |
| RUN-02 | Main window opens without a blank or stuck loading state                       | Yes      | Not run |          |
| RUN-03 | Resize/move/close/reopen restores visible window geometry                      | Yes      | Not run |          |
| RUN-04 | Theme, editor font size, and sidebar state survive restart                     | Yes      | Not run |          |
| RUN-05 | Workspace tabs survive restart after opening at least three tools              | Yes      | Not run |          |
| RUN-06 | Text file open/drop and save-output complete successfully                      | Yes      | Not run |          |
| RUN-07 | Create/edit/search/pin/reorder a note; restart; confirm it persists; delete it | Yes      | Not run |          |
| RUN-08 | Create/edit/tag/duplicate a snippet; restart; confirm it persists; delete it   | Yes      | Not run |          |
| RUN-09 | Code Formatter formats representative TypeScript or JSON                       | Yes      | Not run |          |
| RUN-10 | JSON Tools reports invalid JSON and formats valid JSON                         | Yes      | Not run |          |
| RUN-11 | API Client completes a known-safe request and shows response metadata          | Yes      | Not run |          |
| RUN-12 | Image Tool imports, resizes, and exports a small image                         | No       | Not run |          |
| RUN-13 | Prompt Templates fills variables and copies generated output                   | No       | Not run |          |
| RUN-14 | Fresh profile starts with MCP disabled and no unexpected server process        | Yes      | Not run |          |
| RUN-15 | MCP localhost/auth/key/permissions/redaction/restart/stop lifecycle succeeds   | Yes      | Not run |          |
| RUN-16 | Manual updater check returns clear, non-blocking success/error feedback        | Yes      | Not run |          |
| RUN-17 | Final restart retains settings, tabs, notes, and snippets without data loss    | Yes      | Not run |          |

## Defects

| Severity        | Issue link | Check ID | Summary | Disposition |
| --------------- | ---------- | -------- | ------- | ----------- |
| _None recorded_ |            |          |         |             |

## Release-Blocking Rules

Promotion is blocked when any blocking row is `Fail`, `Blocked`, or `Not run`, or when validation
finds:

- installer or launch failure;
- a blank/stuck window or missing required assets;
- settings, notes, snippets, or workspace data loss;
- window restore outside visible bounds;
- MCP starting unexpectedly on a fresh profile;
- missing platform artifacts or incomplete `latest.json`;
- an updater failure that blocks startup or normal app use.

Screenshots, logs, release URLs, and issue links may be attached in the Evidence and Defects tables.
