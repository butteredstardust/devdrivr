# Release Smoke Tests

Use this checklist before promoting a devdrivr release beyond internal validation.
The GitHub release workflow builds macOS Apple Silicon, Windows, and Linux
artifacts and verifies `latest.json` asset coverage. This checklist covers
the runtime behavior that CI cannot prove from builds alone.

Intel macOS is not a supported platform as of 0.1.83; 0.1.82 is the last release
with an `x64.dmg`.

## Platforms

| Platform            | Release artifact                    | Runner/build source           | Required validation                                  |
| ------------------- | ----------------------------------- | ----------------------------- | ---------------------------------------------------- |
| macOS Apple Silicon | `devdrivr_<version>_aarch64.dmg`    | `.github/workflows/tauri.yml` | Install and smoke on Apple Silicon hardware          |
| Windows x64         | `devdrivr_<version>_x64-setup.exe`  | `.github/workflows/tauri.yml` | Install and smoke on Windows 10+ with WebView2       |
| Linux x64           | `devdrivr_<version>_amd64.AppImage` | `.github/workflows/tauri.yml` | Launch and smoke on a supported desktop Linux distro |

## Preflight

1. Confirm `devdrivr CI` is green for the release commit.
2. Confirm `Build & Release devdrivr` completed all matrix jobs.
3. Confirm the release contains the expected three platform artifacts.
4. Confirm `latest.json` exists on the release and maps all supported platform keys:
   `darwin-aarch64`, `windows-x86_64`, `linux-x86_64`.
5. Download artifacts from GitHub Releases, not local build output.
6. Use a disposable OS account or VM with clean devdrivr app data. Do not delete or overwrite a
   validator's personal devdrivr profile.

## Create the Evidence Report

Create one report on the machine that will validate each platform artifact:

```bash
bun run smoke:report -- \
  --version 0.1.52 \
  --platform darwin-aarch64 \
  --artifact /path/to/devdrivr_0.1.52_aarch64.dmg \
  --tester "Release validator" \
  --environment "Native Apple Silicon hardware"
```

Supported platform keys are `darwin-aarch64`, `windows-x86_64`, and `linux-x86_64`.
The command:

- requires the exact release artifact name for the selected version and platform;
- requires the report runtime OS and process architecture to match the selected platform key;
- rejects artifacts under local Rust build-output directories;
- records artifact size and SHA-256 plus the runtime OS/architecture, native/VM/emulation details,
  tester, and timestamp;
- refuses to overwrite an existing report unless `--force` is passed and the target is an existing
  devdrivr smoke report;
- writes to `documentation/release-smoke-results/<version>-<platform>.md` by default.

Use `--output <path>` when evidence is stored outside the repository. Complete every result and
evidence cell in the generated report while following the runtime path below.

Compatibility environments such as Rosetta, Windows-on-ARM x64 emulation, or virtual machines are
allowed when they represent the artifact's supported runtime. Record them explicitly with
`--environment`; the generated OS/process architecture alone does not prove native hardware.

## Runtime Smoke

Run this checklist independently on each platform:

1. Install or launch the release artifact.
2. Confirm the app opens to the main window without a blank/loading state.
3. Confirm the window can be resized, moved, closed, reopened, and restores within visible bounds.
4. Open Settings and confirm the current version is displayed.
5. Change theme, editor font size, and sidebar collapsed state; restart and confirm persistence.
6. Open at least three tools from the sidebar or command palette and confirm workspace tabs persist after restart.
7. Use file open/drop on a text-backed tool and save output to disk.
8. Create, edit, search, pin, reorder, and delete a note.
9. Create, edit, tag, duplicate, and delete a snippet.
10. Run representative tools:
    - Code Formatter: format TypeScript or JSON.
    - JSON Tools: validate invalid JSON and confirm an error is shown.
    - API Client: send a local or known-safe request and inspect response metadata.
    - Image Tool: load, resize, and export a small image.
    - Prompt Templates: fill variables and copy generated output.
11. Open Settings > MCP and confirm MCP is disabled by default on a fresh profile.
12. Enable MCP and start the server. Confirm the displayed URL uses `127.0.0.1` (not `0.0.0.0`,
    a LAN address, or an IPv6 wildcard) and that the status changes to running.
13. Exercise MCP authentication and settings:
    - A request without a bearer key and a request with the wrong key both return unauthorized.
    - The copied current key authenticates successfully.
    - Rotate the key; confirm the old key is rejected and the new key succeeds.
    - Keep one resource read-only and confirm a write is denied; enable that exact permission and
      confirm the setting applies without exposing other write actions.
    - With API request secret exposure disabled, confirm bearer tokens/basic passwords are redacted.
    - Change the port or restart the server and confirm the new status/URL is usable.
14. Stop MCP and confirm status updates. Trigger one safe failure, such as attempting to start on an
    occupied port, and confirm the error is visible without closing Settings or blocking the app.
15. Trigger a manual update check and confirm success/error feedback is non-blocking.
16. Restart the app once more and confirm local data is still available and MCP remains stopped
    unless auto-start was explicitly enabled.

## Failure Handling

- Release promotion requires one completed, passing report for every supported platform artifact.
- Any `Fail`, `Not run`, or `Blocked` status on a blocking report row blocks promotion.
- Block promotion for launch failures, data loss, installer failures, missing release assets,
  blank windows, broken persistence, or MCP starting unexpectedly on a fresh profile.
- Log platform-specific defects with artifact name, OS version, reproduction steps, and screenshots.
- If a defect only affects one platform, keep the release internal until the platform status is
  explicitly documented in release notes.
