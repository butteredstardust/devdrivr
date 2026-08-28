# Deployment and Release Process

This document outlines the deployment and release processes for the devdrivr cockpit application.

## Overview

The devdrivr cockpit application uses a continuous deployment approach with automated builds and releases managed through GitHub Actions. This document describes the process for building, testing, and releasing new versions of the application.

## Release Process

### Versioning

The project follows Semantic Versioning (SemVer) for version numbering:

- MAJOR version for incompatible API changes
- MINOR version for backward-compatible feature additions
- PATCH version for backward-compatible bug fixes

### Pre-release Checklist

1. **Code Quality**
   - All tests must pass (`bun run test`)
   - Type checking must pass (`npx tsc --noEmit`)
   - No console errors in development mode
   - Code follows style guidelines

2. **Documentation**
   - Draft the GitHub release notes (there is no CHANGELOG.md; the release body is the changelog)
   - Update version number in `package.json`
   - Ensure all new features are documented

3. **Testing**
   - Run full test suite locally
   - Manual testing of critical user flows
   - Run the cross-platform [release smoke tests](RELEASE_SMOKE_TESTS.md)

### Deployment Steps

1. **Build Process**

   ```bash
   # Install dependencies
   bun install

   # Run type checking
   npx tsc --noEmit

   # Run tests
   bun run test

   # Create production build
   bun run build
   ```

2. **Release Creation**
   - Create a git tag with the version number
   - Push tag to GitHub
   - GitHub Actions will automatically create a release

3. **Post-Deployment**
   - Monitor for issues
   - Update documentation if needed
   - Announce release in appropriate channels

## GitHub Actions Workflows

The deployment process is automated through GitHub Actions:

| Workflow                           | Purpose                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `.github/workflows/cockpit-ci.yml` | Pull request and main-branch checks: lint, typecheck, Vitest, Rust check, and clippy |
| `.github/workflows/tauri.yml`      | Release build matrix for macOS Apple Silicon, Windows x64, and Linux x64             |

The release workflow also verifies expected release assets before publishing `latest.json`
for the in-app updater.

## Environment Setup

### Development Environment

- Node.js >= 18.x
- Bun >= 1.0
- Required system dependencies (Rust, cargo-cp-artifact)

### Production Environment

- GitHub Actions runner
- macOS 12.0+ (for universal binary builds)
- Windows 10+ (for Windows builds)
- Ubuntu 20.04+ (for Linux builds)

## Build Configuration

### Development

- Uses Vite with HMR
- Source maps enabled
- Development tools included

### Production

- Minified bundles
- Tree-shaken dependencies
- Optimized assets
- Code splitting enabled

## Automated Testing

### Test Matrix

- Unit tests: `bun run test`
- Type checking: `npx tsc --noEmit`
- Rust checks: `cargo check` and `cargo clippy -- -D warnings`
- Release smoke: manual platform checklist in [RELEASE_SMOKE_TESTS.md](RELEASE_SMOKE_TESTS.md)

## Troubleshooting

### Common Issues

1. **Dependency Conflicts**
   - Run `bun install --force` to clear cache
   - Check for version conflicts in `bun.lock`

2. **Build Failures**
   - Verify Node.js and Bun versions
   - Check for missing native dependencies
   - Ensure sufficient disk space

3. **Release Issues**
   - Verify tag format matches SemVer
   - Check GitHub Actions permissions
   - Ensure proper artifact permissions

## Security Considerations

### Code Signing

Releases are **not** signed with a paid identity on any platform. What each one does have:

- **macOS** — ad-hoc signed, via `bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`. This
  seals the bundle so `codesign --verify` passes; it does not identify a developer and is not
  notarized. Without it the bundle carries only a linker-applied signature that fails validation,
  and Gatekeeper reports a quarantined copy as _damaged_ with no way to open it short of the
  terminal. Do not remove it without reading `README.md` § Unsigned builds.
- **Windows** — unsigned. SmartScreen warns on first run.
- **Linux** — the AppImage is unsigned; nothing checks it.

Adding a Developer ID would mean an Apple Developer account plus `APPLE_ID` / `APPLE_PASSWORD` /
`APPLE_TEAM_ID` (or the API-key trio) in the release workflow, which currently logs
`skipping app notarization` on every macOS build.

## Rollback Procedures

Rollback is entirely manual. Cockpit reports no telemetry, so a bad build is never detected
automatically — it surfaces as a user report. The in-app updater (`src/stores/updater.store.ts`)
only downloads an installer to disk; it never installs or downgrades anything, so there is no
"push a rollback" lever.

1. Mark the bad GitHub release as a pre-release or draft. The updater reads `latest.json` from
   `releases/latest/download/`, so this is what stops it being offered.
2. Fix forward on `main` and cut a new patch version; the previous release stays downloadable for
   anyone who needs it in the meantime.
3. Note the known-bad version in the new release notes.

## Additional Resources

- [GitHub Releases Documentation](https://docs.github.com/en/github/administering-a-repository/releasing-projects-on-github)
- [Semantic Versioning](https://semver.org/)
- [Tauri Distribute Documentation](https://tauri.app/distribute/)
