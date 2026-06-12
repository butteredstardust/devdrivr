# Release Smoke Tests

Use this checklist before promoting a Cockpit release beyond internal validation.
The GitHub release workflow builds macOS Apple Silicon, macOS Intel, Windows, and
Linux artifacts and verifies `latest.json` asset coverage. This checklist covers
the runtime behavior that CI cannot prove from builds alone.

## Platforms

| Platform            | Release artifact                    | Runner/build source           | Required validation                                  |
| ------------------- | ----------------------------------- | ----------------------------- | ---------------------------------------------------- |
| macOS Apple Silicon | `devdrivr_<version>_aarch64.dmg`    | `.github/workflows/tauri.yml` | Install and smoke on Apple Silicon hardware          |
| macOS Intel         | `devdrivr_<version>_x64.dmg`        | `.github/workflows/tauri.yml` | Install and smoke on Intel macOS or equivalent VM    |
| Windows x64         | `devdrivr_<version>_x64-setup.exe`  | `.github/workflows/tauri.yml` | Install and smoke on Windows 10+ with WebView2       |
| Linux x64           | `devdrivr_<version>_amd64.AppImage` | `.github/workflows/tauri.yml` | Launch and smoke on a supported desktop Linux distro |

## Preflight

1. Confirm `Cockpit CI` is green for the release commit.
2. Confirm `Build & Release Cockpit` completed all matrix jobs.
3. Confirm the release contains the expected four platform artifacts.
4. Confirm `latest.json` exists on the release and maps all supported platform keys:
   `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, `linux-x86_64`.
5. Download artifacts from GitHub Releases, not local build output.

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
12. Enable MCP, start the server, copy URL/key, then stop the server and confirm status updates.
13. Trigger a manual update check and confirm success/error feedback is non-blocking.
14. Restart the app once more and confirm local data is still available.

## Failure Handling

- Block promotion for launch failures, data loss, installer failures, missing release assets,
  blank windows, broken persistence, or MCP starting unexpectedly on a fresh profile.
- Log platform-specific defects with artifact name, OS version, reproduction steps, and screenshots.
- If a defect only affects one platform, keep the release internal until the platform status is
  explicitly documented in release notes.
