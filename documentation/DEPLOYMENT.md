# Deployment and Release Process

Use this document to prepare and validate a devdrivr release.

## Overview

GitHub Actions builds and publishes devdrivr releases. Use CI to validate changes before release work.

## Release Process

### Versioning

Use Semantic Versioning (SemVer) for release numbers:

- MAJOR version for incompatible API changes
- MINOR version for backward-compatible feature additions
- PATCH version for backward-compatible bug fixes

### Pre-release Checklist

Complete these checks before the release workflow runs.

1. **Code Quality**
   - All tests must pass (`bun run test`)
   - Type checking must pass (`npx tsc --noEmit`)
   - Check development mode for console errors
   - Follow the project style guidelines

2. **Documentation**
   - Draft GitHub release notes. The release body is the changelog.
   - Check the version number in `package.json`
   - Document each new feature

3. **Testing**
   - Run the full test suite locally
   - Validate critical user flows manually
   - Run the cross-platform [release smoke tests](RELEASE_SMOKE_TESTS.md)

### Deployment Steps

#### Build Process

Complete the pre-release checklist before you run these commands.

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

#### Release Creation

Push the release change to `main`. The `Build & Release devdrivr` workflow creates the version bump and release.

#### Post-Deployment

Check the release for reported issues. Update documentation when needed. Announce the release through the required channels.

## GitHub Actions Workflows

Use these workflows in the release process:

| Workflow                        | Purpose                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `.github/workflows/ci.yml`      | Pull request and main-branch checks: lint, typecheck, Vitest, Rust check, and clippy |
| `.github/workflows/release.yml` | Release build matrix for macOS Apple Silicon, Windows x64, and Linux x64             |

The release workflow checks the required release assets. It then publishes `updater.json` for the plugin and `latest.json` for earlier versions.

## Environment Setup

### Development Environment

- Node.js >= 18.x
- Bun >= 1.0
- Required system dependencies (Rust, cargo-cp-artifact)

### Production Environment

GitHub Actions provides the release environment. The build matrix uses macOS Apple Silicon, Windows, and Ubuntu runners.

## Build Configuration

### Development

The development build uses Vite with HMR. It includes source maps and development tools.

### Production

The production build creates minified, tree-shaken bundles. It optimizes assets and uses code splitting.

## Automated Testing

### Test Matrix

Run these checks before release:

- Unit tests: `bun run test`
- Type checking: `npx tsc --noEmit`
- Rust checks: `cargo check` and `cargo clippy -- -D warnings`
- Release smoke: manual platform checklist in [RELEASE_SMOKE_TESTS.md](RELEASE_SMOKE_TESTS.md)

## Troubleshooting

### Common Issues

1. **Dependency Conflicts**
   - Run `bun install --force` to clear cache
   - Check `bun.lock` for version conflicts

2. **Build Failures**
   - Check the Node.js and Bun versions
   - Check for missing native dependencies
   - Check available disk space

3. **Release Issues**
   - Check the release version format
   - Check GitHub Actions permissions
   - Check artifact permissions

## Security Considerations

### Code Signing

WARNING: Keep the update-signing private key secure. Installed users cannot receive updates if the key is lost.

Update signing and code signing have different purposes:

- **Update signing (minisign)** — Run `bunx tauri signer generate` to create the keypair. The public key is in `plugins.updater.pubkey`. The `TAURI_SIGNING_PRIVATE_KEY` repository secret provides the private key. CI requires it because `createUpdaterArtifacts` is enabled. Update signing proves that an update payload comes from this repository. It does not identify a developer to an operating system.
- **Code signing (Developer ID / Authenticode)** — Gatekeeper and SmartScreen use this signing. devdrivr does not use a paid signing identity.

Releases use these platform signing settings:

- **macOS** — The build uses ad-hoc signing through `bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`. This validates the bundle with `codesign --verify`. It does not identify a developer or notarize the app. Do not remove this setting without reading `README.md` § Unsigned builds.
- **Windows** — unsigned. SmartScreen warns on first run.
- **Linux** — The AppImage is unsigned.

To add a Developer ID, provide an Apple Developer account and `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`. You can instead provide the API-key trio. The release workflow logs `skipping app notarization` for each macOS build.

## Rollback Procedures

WARNING: The updater only moves to newer versions. Do not use it to install an older release.

devdrivr has no telemetry. A user report identifies a bad build. The updater in `src/stores/updater.store.ts` uses `tauri-plugin-updater`. It compares versions in `updater.json` and does not install an older version.

1. Mark the bad GitHub release as a pre-release or draft. The updater reads `updater.json` from `releases/latest/download/`.
2. Fix the issue on `main`. Create a new patch release.
3. Keep the previous release available for users who need it.
4. Identify the bad version in the new release notes.

## Additional Resources

- [GitHub Releases Documentation](https://docs.github.com/en/github/administering-a-repository/releasing-projects-on-github)
- [Semantic Versioning](https://semver.org/)
- [Tauri Distribute Documentation](https://tauri.app/distribute/)
