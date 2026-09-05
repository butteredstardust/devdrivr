# Contribution Guidelines

Use this guide to prepare a contribution that reviewers can validate.

## Contribute

You can report bugs, suggest features, update code, update documentation, create tools, improve performance, or improve accessibility.

## Report an issue

Check existing issues before you create a report. Create a reduced test case for a bug.

Include a clear title, reproduction steps, expected behavior, actual behavior, screenshots when useful, and your OS, browser, and devdrivr version.

## Contribute code

Create a fork. Clone it with `git clone https://github.com/your-username/devdrivr.git`.

Create a branch with `git checkout -b feature/your-feature-name`. Update the workspace.

Commit the update with a clear message. Push the branch with `git push origin feature/your-feature-name`.

Create a pull request.

## Set up development

Run `bun install` to install dependencies. Run `bun run tauri dev` to open the desktop app with hot reload.

`bun run dev` opens the Vite web preview only. It does not provide the Tauri shell or native APIs.

Run `bunx vitest run` to validate tests. Run `npx tsc --noEmit` to check types.

## Prepare a pull request

Update `README.md` when the change needs it. Add or update tests for the change.

Run `bunx vitest run`. Run `npx tsc --noEmit`.

Update documentation when you change APIs. Follow the commit message conventions in [`AGENTS.md`](AGENTS.md).

## Code style

Follow the existing code style. Use TypeScript strict-mode features correctly.

Use consistent names. Write clear code and handle errors. Add tests for new behavior.

## Commit messages

Use conventional commit messages:

- `feat(tools): add new JSON validator tool`
- `fix(ui): resolve sidebar toggle issue`
- `docs(readme): update installation instructions`
- `test(api): add test for error handling`
- `chore(deps): update dependency versions`

## Testing

Add tests for new behavior. Check existing tests and edge cases.

Use these test paths:

- `src/tools/__tests__/`
- `src/hooks/__tests__/`
- `src/lib/__tests__/`
- `src/stores/__tests__/`
- `src/components/<subdir>/__tests__/`
- `src/app/__tests__/`
- `src/workers/__tests__/`

Do not create a flat `src/__tests__/` directory.

## Documentation

Update `README.md` for new features. Document APIs or components when needed.

Keep documentation clear. Use examples when they help. Update this file when the contribution process changes.

## Development workflow

1. Open [ONBOARDING.md](documentation/ONBOARDING.md) for setup.
2. Open [CODING_PATTERNS.md](documentation/infrastructure/CODING_PATTERNS.md) before you write code.
3. Open [TESTING.md](documentation/TESTING.md) before you validate.
4. Keep [documentation/](documentation/) current with the update.

## Code review

All submissions require code review. Automated checks, tests, and type checks must pass.

At least one maintainer must approve the pull request. Do not leave console errors in development mode.

## Additional resources

- [Architecture Decisions](documentation/infrastructure/ARCHITECTURE_DECISIONS.md)
- [Directory Map](documentation/infrastructure/DIRECTORY_MAP.md)
- [Troubleshooting](documentation/infrastructure/TROUBLESHOOTING.md)
- [Product Map](documentation/PRODUCT_MAP.md)
