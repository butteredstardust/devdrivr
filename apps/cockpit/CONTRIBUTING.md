# Contribution Guidelines

Welcome to the devdrivr cockpit contribution guidelines! We're excited to have you contribute to our project. This document outlines the process and standards for contributing to the devdrivr cockpit application.

## How to Contribute

There are many ways to contribute to devdrivr cockpit:

- Report bugs
- Suggest features
- Submit code fixes
- Improve documentation
- Create new tools
- Optimize performance
- Fix accessibility issues

## Reporting Issues

### Before Submitting a Bug Report

- Check the existing issues to avoid duplicates
- Create a reduced test case to demonstrate the issue
- Include steps to reproduce, expected behavior, and actual behavior

### Submitting a Bug Report

When submitting a bug report, please include:

- A clear, descriptive title
- Specific steps to reproduce the issue
- Expected vs. actual behavior
- Screenshots if applicable
- Your environment (OS, browser, devdrivr version)

## Code Contributions

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/devdrivr.git`
3. Create a branch for your feature: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Commit your changes with a clear commit message
6. Push to your fork: `git push origin feature/your-feature-name`
7. Create a pull request

### Development Setup

1. Install dependencies: `bun install`
2. Start the desktop app (Vite + Tauri hot-reload): `bun run tauri dev`
   - `bun run dev` only starts the Vite web preview (no Tauri/native APIs) — use it for quick UI
     iteration, but `bun run tauri dev` is what you need to see the actual cockpit app.
3. Run tests: `bun run test`
4. Check types: `npx tsc --noEmit` (also runs automatically as part of `bun run build`)

### Pull Request Process

1. Update the README.md with details of changes if applicable
2. Add or update tests for your changes
3. Ensure all tests pass: `bun run test`
4. Check types: `npx tsc --noEmit`
5. Update documentation if you've changed APIs
6. Follow the commit message conventions

### Code Style

- Follow the existing code style in the project
- Use TypeScript strict mode features properly
- Maintain consistent naming conventions
- Write clear, self-documenting code
- Use proper error handling
- Write tests for new functionality

### Commit Messages

Use conventional commit messages:

- `feat(tools): add new JSON validator tool`
- `fix(ui): resolve sidebar toggle issue`
- `docs(readme): update installation instructions`
- `test(api): add test for error handling`
- `chore(deps): update dependency versions`

### Testing

- Add tests for any new functionality
- Ensure existing tests pass
- Write unit tests for pure functions
- Test edge cases and error conditions
- Use the existing test patterns colocated per area: `src/tools/__tests__/`, `src/hooks/__tests__/`,
  `src/lib/__tests__/`, `src/stores/__tests__/`, `src/components/<subdir>/__tests__/`,
  `src/app/__tests__/`, `src/workers/__tests__/` — there is no single flat `src/__tests__/`

### Documentation

- Update README.md if adding new features
- Document new APIs or components
- Keep documentation clear and concise
- Use examples where helpful
- Update this file if changing contribution process

## Development Workflow

1. **Setup**: Follow the development setup in [ONBOARDING.md](documentation/ONBOARDING.md)
2. **Coding**: Follow the patterns in [CODING_PATTERNS.md](documentation/infrastructure/CODING_PATTERNS.md)
3. **Testing**: Follow the guidelines in [TESTING.md](documentation/TESTING.md)
4. **Documentation**: Follow the style in [STYLE_GUIDE.md](documentation/STYLE_GUIDE.md)

## Code Review Process

All submissions require code review:

1. Automated checks must pass
2. At least one maintainer must approve
3. Tests must pass
4. Type checking must pass
5. No console errors in development mode

## Additional Resources

- [Architecture Decisions](documentation/infrastructure/ARCHITECTURE_DECISIONS.md)
- [Directory Map](documentation/infrastructure/DIRECTORY_MAP.md)
- [Troubleshooting](documentation/infrastructure/TROUBLESHOOTING.md)
- [Product Map](documentation/PRODUCT_MAP.md)
