import { TEMPLATE_DATE } from '@/tools/markdown-editor/markdown-model'

/** The starter documents offered by the editor's Templates menu. */
export const TEMPLATES: { label: string; content: string }[] = [
  {
    label: 'README',
    content: `# Project Name

> Short description of what this project does.

## Getting Started

### Prerequisites

- Node.js 18+
- Bun

### Installation

\`\`\`bash
bun install
bun run dev
\`\`\`

## Usage

Describe how to use the project here.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/items | List all items |
| POST   | /api/items | Create an item |

## Contributing

1. Fork it
2. Create your feature branch (\`git checkout -b feat/amazing\`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT
`,
  },
  {
    label: 'Blog Post',
    content: `# Title of the Post

*Published: ${TEMPLATE_DATE}*

## Introduction

Hook the reader with a compelling opening paragraph.

## Main Point

Develop your argument here. Use examples:

> "A relevant quote that supports your point."

### Supporting Detail

- First reason
- Second reason
- Third reason

## Code Example

\`\`\`typescript
function greet(name: string): string {
  return \\\`Hello, \\\${name}!\\\`
}
\`\`\`

## Conclusion

Summarize the key takeaway and call to action.

---

*Thanks for reading! Follow me for more posts.*
`,
  },
  {
    label: 'Meeting Notes',
    content: `# Meeting Notes — ${TEMPLATE_DATE}

**Attendees:** Alice, Bob, Charlie
**Facilitator:** Alice

## Agenda

1. Status updates
2. Blockers
3. Next steps

## Discussion

### Status Updates

- **Alice:** Completed the auth flow, PR open for review
- **Bob:** Working on database migration, ETA tomorrow
- **Charlie:** Researching caching strategy

### Blockers

- [ ] CI pipeline timing out on integration tests
- [ ] Waiting on design review for settings page

## Action Items

| Owner | Task | Due |
|-------|------|-----|
| Bob   | Fix CI timeout | EOD |
| Charlie | Share caching proposal | Thursday |
| Alice | Review Bob's migration PR | Tomorrow |

## Next Meeting

Same time next week.
`,
  },
  {
    label: 'Changelog',
    content: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- New feature description

### Changed
- Updated behavior description

### Fixed
- Bug fix description

## [1.0.0] — ${TEMPLATE_DATE}

### Added
- Initial release
- Core feature A
- Core feature B

### Security
- Dependency audit completed
`,
  },
]
