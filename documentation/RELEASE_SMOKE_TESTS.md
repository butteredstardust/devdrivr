# Release Smoke Tests

Use this checklist before you promote a devdrivr release beyond internal validation.
The release workflow builds macOS Apple Silicon, Windows, and Linux artifacts. It checks `latest.json` asset coverage. Use this checklist to validate runtime behavior that CI cannot validate from builds alone.

Intel macOS is unsupported. The last release with an `x64.dmg` is 0.1.82.

## Platforms

| Platform            | Release artifact                    | Runner/build source             | Required validation                                  |
| ------------------- | ----------------------------------- | ------------------------------- | ---------------------------------------------------- |
| macOS Apple Silicon | `devdrivr_<version>_aarch64.dmg`    | `.github/workflows/release.yml` | Install and smoke on Apple Silicon hardware          |
| Windows x64         | `devdrivr_<version>_x64-setup.exe`  | `.github/workflows/release.yml` | Install and smoke on Windows 10+ with WebView2       |
| Linux x64           | `devdrivr_<version>_amd64.AppImage` | `.github/workflows/release.yml` | Launch and smoke on a supported desktop Linux distro |

## Preflight

Complete these checks before you download an artifact:

1. Confirm `devdrivr CI` passes for the release commit.
2. Confirm `Build & Release devdrivr` completes all matrix jobs.
3. Confirm the release contains the three expected platform artifacts.
4. Confirm the release includes `latest.json`. Confirm it maps these supported platform keys:
   `darwin-aarch64`, `windows-x86_64`, `linux-x86_64`.
5. Download artifacts from GitHub Releases. Do not use local build output.
6. Use a disposable OS account or VM with clean devdrivr app data. Do not remove or overwrite a validator's personal devdrivr profile.

## Create the Evidence Report

Create one report on the machine that will validate the platform artifact.

```bash
bun run smoke:report -- \
  --version 0.1.52 \
  --platform darwin-aarch64 \
  --artifact /path/to/devdrivr_0.1.52_aarch64.dmg \
  --tester "Release validator" \
  --environment "Native Apple Silicon hardware"
```

Supported platform keys are `darwin-aarch64`, `windows-x86_64`, and `linux-x86_64`.
The command does these checks:

- Requires the exact release artifact name for the selected version and platform.
- Requires the runtime OS and process architecture to match the platform key.
- Rejects artifacts in local Rust build-output directories.
- Records artifact size, SHA-256, runtime details, tester, and timestamp.
- Refuses to overwrite an existing report. Use `--force` only for an existing devdrivr smoke report.
- Writes to `documentation/release-smoke-results/<version>-<platform>.md` by default.

Use `--output <path>` when you store evidence outside the repository. Complete each result and evidence cell during runtime validation.

Use Rosetta, Windows-on-ARM x64 emulation, or virtual machines only when they represent the supported runtime. Record them with `--environment`. The generated OS and process architecture do not prove native hardware.

## Runtime Smoke

Run these checks independently on each platform:

1. Install or launch the release artifact.
2. Confirm the app opens to the main window without a blank/loading state.
3. Confirm the window can be resized, moved, closed, reopened, and restores within visible bounds.
4. Open Settings and confirm the current version is displayed.
5. Change theme, editor font size, and sidebar collapsed state; restart and confirm persistence.
6. Open at least three tools from the sidebar or command palette. Confirm workspace tabs persist after restart.
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
    - Confirm requests without a bearer key return unauthorized.
    - Confirm requests with the wrong key return unauthorized.
    - Confirm the copied current key authenticates.
    - Rotate the key. Confirm the old key is rejected. Confirm the new key succeeds.
    - Keep one resource read-only. Confirm a write is denied. Enable that exact permission. Confirm other write actions remain unavailable.
    - Disable API request secret exposure. Confirm bearer tokens and basic passwords are redacted.
    - Change the port or restart the server. Confirm the new status and URL are usable.
14. Stop MCP and confirm status updates. Trigger one safe failure, such as an occupied port. Confirm the error remains visible without closing Settings or blocking the app.
15. Trigger a manual update check and confirm success/error feedback is non-blocking.
16. Restart the app once more and confirm local data is still available and MCP remains stopped
    unless auto-start was explicitly enabled.

## Failure Handling

Promotion requires one completed passing report for each supported platform artifact.

- Do not promote when a blocking row is `Fail`, `Not run`, or `Blocked`.
- Do not promote for launch failures, data loss, installer failures, missing assets, blank windows, broken persistence, or unexpected MCP start on a fresh profile.
- Log platform defects with the artifact name, OS version, reproduction steps, and screenshots.
- Keep the release internal when a defect affects one platform. Document the platform status in the release notes.
