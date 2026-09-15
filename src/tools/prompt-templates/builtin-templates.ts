import type { PromptTemplate } from './types'

const LANGUAGE_OPTIONS = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'SQL']
const TEST_FRAMEWORK_OPTIONS = ['Vitest', 'Jest', 'pytest', 'Go test', 'JUnit']

export const BUILTIN_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'review-code-smells',
    name: 'Review: Detect Code Smells',
    description: 'Find maintainability issues, anti-patterns, and refactoring opportunities.',
    category: 'code-review',
    tags: ['quality', 'maintainability', 'refactoring'],
    prompt: `Act as a senior software engineer. Review the following {{language}} code for code smells, anti-patterns, and maintainability issues.

Focus on:
- Specific line-level risks
- Readability and cohesion
- Hidden coupling or surprising side effects
- Practical refactorings that preserve behavior

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Return findings ordered by severity. Include concise reasoning and concrete fixes.`,
    variables: [
      { name: 'language', label: 'Language', type: 'select', options: LANGUAGE_OPTIONS },
      { name: 'code', label: 'Code', type: 'textarea', required: true },
    ],
    estimatedTokens: 102,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
    tips: ['Include enough surrounding code for dependencies and call sites.'],
  },
  {
    id: 'review-security-audit',
    name: 'Review: Security Audit',
    description: 'Audit code for common application security vulnerabilities.',
    category: 'code-review',
    tags: ['security', 'owasp', 'audit'],
    prompt: `Act as an application security engineer. Review this {{language}} code for security issues.

Checklist:
- Injection risks
- Authentication or authorization gaps
- Sensitive data exposure
- Unsafe parsing or deserialization
- Insecure dependency or configuration assumptions

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

For each issue, return severity, affected lines or functions, exploit scenario, and a specific recommendation.`,
    variables: [
      { name: 'language', label: 'Language', type: 'select', options: LANGUAGE_OPTIONS },
      { name: 'code', label: 'Code', type: 'textarea', required: true },
    ],
    estimatedTokens: 99,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
    tips: ['Include route handlers, auth middleware, and data access code together when possible.'],
  },
  {
    id: 'generate-unit-tests',
    name: 'Generate: Unit Tests',
    description: 'Create comprehensive unit tests for a function, component, or module.',
    category: 'testing',
    tags: ['tests', 'coverage', 'edge-cases'],
    prompt: `Write comprehensive unit tests for the following {{language}} code using {{framework}}.

Requirements:
- Cover happy paths and edge cases
- Use descriptive test names
- Mock external dependencies where appropriate
- Include failure cases
- Keep tests deterministic and isolated

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Return only the test file content.`,
    variables: [
      { name: 'language', label: 'Language', type: 'select', options: LANGUAGE_OPTIONS },
      { name: 'framework', label: 'Framework', type: 'select', options: TEST_FRAMEWORK_OPTIONS },
      { name: 'code', label: 'Code', type: 'textarea', required: true },
    ],
    estimatedTokens: 86,
    optimizedFor: 'Cursor',
    author: 'builtin',
    version: '1.0.0',
    tips: ['Paste existing tests too if the project has strong test conventions.'],
  },
  {
    id: 'debug-bug-triage',
    name: 'Fix: Bug Triage',
    description: 'Turn a bug report into likely causes, repro steps, and a fix plan.',
    category: 'debugging',
    tags: ['bug', 'triage', 'root-cause'],
    prompt: `Act as a pragmatic debugging partner. Triage this bug report.

Bug report:
{{bug_report}}

Relevant context:
{{context}}

Return:
1. Most likely root causes
2. Minimal reproduction steps
3. What to inspect first
4. Proposed fix strategy
5. Regression tests to add`,
    variables: [
      { name: 'bug_report', label: 'Bug Report', type: 'textarea', required: true },
      {
        name: 'context',
        label: 'Context',
        type: 'textarea',
        placeholder: 'Logs, code paths, recent changes, environment details',
      },
    ],
    estimatedTokens: 67,
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'debug-stack-trace',
    name: 'Debug: Stack Trace',
    description: 'Analyze an error stack trace and propose next debugging moves.',
    category: 'debugging',
    tags: ['stack-trace', 'errors', 'debugging'],
    prompt: `Analyze this stack trace and explain the most likely failure path.

Runtime or framework:
{{runtime}}

Stack trace:
\`\`\`
{{stack_trace}}
\`\`\`

Relevant code or notes:
{{context}}

Return probable root cause, first three checks to run, and a minimal fix plan.`,
    variables: [
      {
        name: 'runtime',
        label: 'Runtime',
        type: 'text',
        placeholder: 'Node 22, Tauri, Python 3.12',
      },
      { name: 'stack_trace', label: 'Stack Trace', type: 'textarea', required: true },
      { name: 'context', label: 'Context', type: 'textarea' },
    ],
    estimatedTokens: 64,
    optimizedFor: 'ChatGPT',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'optimize-performance',
    name: 'Optimize: Performance Issues',
    description: 'Identify bottlenecks and practical optimizations in code or traces.',
    category: 'code-review',
    tags: ['performance', 'profiling', 'optimization'],
    prompt: `Act as a performance engineer. Analyze the following {{language}} code or performance notes.

Goal:
{{goal}}

Input:
\`\`\`{{language}}
{{input}}
\`\`\`

Find the likely bottlenecks, explain the tradeoffs, and propose the smallest safe changes first. Include measurement guidance.`,
    variables: [
      { name: 'language', label: 'Language', type: 'select', options: LANGUAGE_OPTIONS },
      {
        name: 'goal',
        label: 'Goal',
        type: 'text',
        placeholder: 'Reduce render time, lower memory usage',
      },
      { name: 'input', label: 'Code or Trace', type: 'textarea', required: true },
    ],
    estimatedTokens: 66,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'refactor-async-await',
    name: 'Refactor: Async/Await',
    description: 'Convert promise chains or callback-heavy code to async/await.',
    category: 'refactoring',
    tags: ['async', 'promises', 'cleanup'],
    prompt: `Convert the following {{language}} code to async/await.

Requirements:
- Preserve behavior and error handling
- Keep public function signatures compatible unless a change is necessary
- Avoid unrelated cleanup
- Return only the refactored code

Code:
\`\`\`{{language}}
{{code}}
\`\`\``,
    variables: [
      { name: 'language', label: 'Language', type: 'select', options: LANGUAGE_OPTIONS },
      { name: 'code', label: 'Code', type: 'textarea', required: true },
    ],
    estimatedTokens: 62,
    optimizedFor: 'Cursor',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'generate-types-from-json',
    name: 'Generate: TypeScript Types from JSON',
    description: 'Infer TypeScript types from a JSON sample.',
    category: 'refactoring',
    tags: ['typescript', 'json', 'types'],
    prompt: `Generate TypeScript types from this JSON sample.

Preferences:
- Use descriptive type names
- Mark fields optional only when the sample clearly indicates optionality
- Prefer type aliases for object shapes
- Include comments only for non-obvious fields

Root type name: {{type_name}}

JSON:
\`\`\`json
{{json}}
\`\`\`

Return only TypeScript code.`,
    variables: [
      { name: 'type_name', label: 'Root Type Name', type: 'text', placeholder: 'ApiResponse' },
      { name: 'json', label: 'JSON', type: 'textarea', required: true },
    ],
    estimatedTokens: 75,
    optimizedFor: 'ChatGPT',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'document-api-endpoint',
    name: 'Document: API Endpoint',
    description: 'Draft human-readable API documentation from code or notes.',
    category: 'docs',
    tags: ['api', 'documentation', 'endpoint'],
    prompt: `Write API documentation for this endpoint.

Endpoint details:
{{endpoint}}

Implementation or notes:
\`\`\`
{{implementation}}
\`\`\`

Include:
- Purpose
- Request method and path
- Parameters
- Request body
- Response schema
- Error cases
- Example request and response`,
    variables: [
      { name: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'POST /api/users' },
      {
        name: 'implementation',
        label: 'Implementation or Notes',
        type: 'textarea',
        required: true,
      },
    ],
    estimatedTokens: 71,
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'write-readme',
    name: 'Write: README.md',
    description: 'Create or improve a README for a project, package, or tool.',
    category: 'docs',
    tags: ['readme', 'docs', 'onboarding'],
    prompt: `Write a practical README.md for this project.

Project name:
{{project_name}}

Project details:
{{project_details}}

Include:
- What it does
- Key features
- Requirements
- Installation
- Usage examples
- Configuration
- Development commands
- Troubleshooting notes

Keep it concise and useful for a new contributor.`,
    variables: [
      { name: 'project_name', label: 'Project Name', type: 'text' },
      { name: 'project_details', label: 'Project Details', type: 'textarea', required: true },
    ],
    estimatedTokens: 73,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'write-commit-message',
    name: 'Write: Commit Message',
    description: 'Generate a conventional commit message from a change summary or diff.',
    category: 'docs',
    tags: ['git', 'commit', 'conventional-commits'],
    prompt: `Write a conventional commit message for these changes.

Scope:
{{scope}}

Change summary or diff:
\`\`\`diff
{{changes}}
\`\`\`

Return:
1. A single commit subject under 72 characters
2. Optional body bullets only if they add meaningful context`,
    variables: [
      { name: 'scope', label: 'Scope', type: 'text', placeholder: 'devdrivr' },
      { name: 'changes', label: 'Changes or Diff', type: 'textarea', required: true },
    ],
    estimatedTokens: 58,
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'explain-concept',
    name: 'Explain: Concept',
    description: 'Explain a technical concept with simple language and analogies.',
    category: 'learning',
    tags: ['explain', 'learning', 'analogy'],
    prompt: `Explain this concept in simple terms for a developer who is new to it.

Concept:
{{concept}}

Existing context:
{{context}}

Use:
- A short definition
- One concrete analogy
- A small example
- Common pitfalls
- How to know when to use it`,
    variables: [
      { name: 'concept', label: 'Concept', type: 'text', required: true },
      { name: 'context', label: 'Context', type: 'textarea' },
    ],
    estimatedTokens: 54,
    optimizedFor: 'ChatGPT',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'plan-project-breakdown',
    name: 'Plan: Project Breakdown',
    description: 'Break a feature idea into scoped implementation tasks.',
    category: 'productivity',
    tags: ['planning', 'tasks', 'scope'],
    prompt: `Break this project or feature into an implementation plan.

Goal:
{{goal}}

Constraints:
{{constraints}}

Context:
{{context}}

Return:
1. Refined scope
2. Milestones
3. Small implementation tasks
4. Risks and assumptions
5. Test plan`,
    variables: [
      { name: 'goal', label: 'Goal', type: 'textarea', required: true },
      { name: 'constraints', label: 'Constraints', type: 'textarea' },
      { name: 'context', label: 'Context', type: 'textarea' },
    ],
    estimatedTokens: 52,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'analyze-log-output',
    name: 'Analyze: Log Output',
    description: 'Summarize logs and isolate the likely failure signal.',
    category: 'debugging',
    tags: ['logs', 'errors', 'analysis'],
    prompt: `Analyze this log output.

System or command:
{{system}}

Logs:
\`\`\`
{{logs}}
\`\`\`

Return:
- The key failure signal
- Events leading up to it
- Noise that can be ignored
- Most likely root cause
- Next commands or checks to run`,
    variables: [
      { name: 'system', label: 'System or Command', type: 'text' },
      { name: 'logs', label: 'Logs', type: 'textarea', required: true },
    ],
    estimatedTokens: 57,
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'diagnose-db-query',
    name: 'Diagnose: Database Query Performance',
    description: 'Review a query, schema, and plan for likely performance problems.',
    category: 'debugging',
    tags: ['database', 'sql', 'performance'],
    prompt: `Act as a database performance engineer. Diagnose this query.

Database:
{{database}}

Query:
\`\`\`sql
{{query}}
\`\`\`

Schema, indexes, or explain plan:
\`\`\`
{{schema_or_plan}}
\`\`\`

Return likely bottlenecks, missing indexes, query rewrites, and how to validate the improvement.`,
    variables: [
      {
        name: 'database',
        label: 'Database',
        type: 'text',
        placeholder: 'PostgreSQL, SQLite, MySQL',
      },
      { name: 'query', label: 'Query', type: 'textarea', required: true },
      { name: 'schema_or_plan', label: 'Schema or Plan', type: 'textarea' },
    ],
    estimatedTokens: 69,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
  },
  {
    id: 'threat-model-feature',
    name: 'Security: Threat Model a Feature',
    description: 'Walk a feature through STRIDE and rank the realistic threats.',
    category: 'security',
    tags: ['security', 'threat-model', 'design', 'stride'],
    prompt: `Act as an application security engineer. Threat model the feature described below.

Work through STRIDE in order: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.

For each threat you find, give:
- The category and a one-line description
- The entry point an attacker uses
- What they gain
- A concrete mitigation the team can build

Feature:
{{feature}}

Trust boundaries and data handled:
{{boundaries}}

Attacker the team cares about: {{attacker}}

Rank the threats by realistic risk, not by theoretical severity. Say plainly which threats you judge to be out of scope for this attacker and why. Do not pad the list.`,
    variables: [
      {
        name: 'feature',
        label: 'Feature',
        type: 'textarea',
        required: true,
        description: 'What the feature does, who uses it, and what it touches.',
        example:
          'A share link that makes a private note readable by anyone holding the URL. Links are created from the note toolbar and can be revoked.',
      },
      {
        name: 'boundaries',
        label: 'Trust boundaries and data',
        type: 'textarea',
        required: true,
        description: 'Where trust changes hands, and the sensitivity of the data crossing it.',
        example:
          'Browser to API over TLS. Link tokens are stored hashed. Note bodies may contain credentials pasted by the user.',
      },
      {
        name: 'attacker',
        label: 'Attacker',
        type: 'select',
        options: [
          'Anonymous internet user',
          'Authenticated customer',
          'Malicious insider',
          'Compromised dependency',
          'Network attacker',
        ],
        description: 'Ranking depends on who you are defending against.',
      },
    ],
    estimatedTokens: 180,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
    tips: [
      'Name the data that would hurt most if it leaked. Vague input produces a generic model.',
      'Run it again after the design changes. A threat model tracks a design, not a release.',
    ],
  },
  {
    id: 'secure-by-design-review',
    name: 'Security: Secure-by-Design Questions',
    description: 'Get the security questions a design review should have asked.',
    category: 'security',
    tags: ['security', 'design', 'review', 'checklist'],
    prompt: `Act as a security architect reviewing a design before it is built.

Do not list generic best practices. Ask the questions this specific design leaves unanswered.

Design:
{{design}}

Stack and platform: {{stack}}

Group your questions under:
1. Authentication and authorization
2. Data handling and retention
3. Input trust and validation
4. Secrets and key management
5. Failure and abuse behaviour

For each question, state in one line why it matters here. End with the three questions you would block the design on, and say what a good answer to each looks like.`,
    variables: [
      {
        name: 'design',
        label: 'Design',
        type: 'textarea',
        required: true,
        description: 'The proposed design. A summary works; the questions sharpen with detail.',
        example:
          'Background worker pulls user-supplied webhook URLs from a queue and POSTs export payloads to them, retrying five times with backoff.',
      },
      {
        name: 'stack',
        label: 'Stack and platform',
        type: 'text',
        description: 'Runtime, datastore and hosting. Many risks are platform-specific.',
        example: 'Rust worker on Fly.io, Postgres, secrets in Vault',
      },
    ],
    estimatedTokens: 150,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
    tips: ['Use it before the code exists. After merge it becomes an audit, which costs more.'],
  },
  {
    id: 'design-document-draft',
    name: 'Docs: Draft a Design Document',
    description: 'Turn a rough idea into a reviewable design document.',
    category: 'docs',
    tags: ['design', 'documentation', 'planning', 'rfc'],
    prompt: `Act as a staff engineer writing a design document for peer review.

Problem:
{{problem}}

Proposed approach:
{{approach}}

Constraints: {{constraints}}

Write the document with these sections:
- **Problem** — what breaks today, and for whom
- **Goals and non-goals** — non-goals are as important as goals
- **Proposed design** — how it works, in enough detail to argue with
- **Alternatives considered** — at least two, each with the reason it lost
- **Risks and open questions** — what could make this the wrong call
- **Rollout** — how it ships and how it is reversed

Write plainly and in the present tense. State trade-offs directly rather than defending the proposal. Where the input is missing something the reviewer will need, mark it **TBD** instead of inventing it.`,
    variables: [
      {
        name: 'problem',
        label: 'Problem',
        type: 'textarea',
        required: true,
        description: 'The problem in its own terms, before any solution.',
        example:
          'Tool state is written to localStorage on every keystroke, so a large JSON payload freezes the UI for several seconds.',
      },
      {
        name: 'approach',
        label: 'Proposed approach',
        type: 'textarea',
        required: true,
        description: 'Your current thinking. Rough is fine; the draft sharpens it.',
        example: 'Debounce writes and move serialization into a worker.',
      },
      {
        name: 'constraints',
        label: 'Constraints',
        type: 'text',
        description:
          'Deadlines, compatibility promises, team size, anything that limits the set of designs.',
        example: 'Must not change the on-disk format; ships in the next patch release',
      },
    ],
    estimatedTokens: 170,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
    tips: ['Keep the TBD markers in the first draft. They are the agenda for the review.'],
  },
  {
    id: 'mermaid-from-description',
    name: 'Docs: Describe a Diagram in Mermaid',
    description: 'Turn a description of a system or flow into Mermaid syntax.',
    category: 'docs',
    tags: ['mermaid', 'diagram', 'documentation', 'architecture'],
    prompt: `Convert the description below into a valid Mermaid {{diagramType}} diagram.

Description:
{{description}}

Requirements:
- Output only the Mermaid code block. No explanation before or after.
- Use readable node ids and quote any label containing punctuation.
- Keep the layout legible: group related nodes and avoid crossing edges where you can.
- Do not invent components the description does not mention.

If the description is ambiguous, pick the reading that produces the simpler diagram, then add a Mermaid comment (%%) naming the assumption.`,
    variables: [
      {
        name: 'diagramType',
        label: 'Diagram type',
        type: 'select',
        options: [
          'flowchart',
          'sequenceDiagram',
          'erDiagram',
          'stateDiagram-v2',
          'classDiagram',
          'gantt',
        ],
        description: 'Mermaid diagram keyword. Sequence suits request flows; ER suits schemas.',
      },
      {
        name: 'description',
        label: 'Description',
        type: 'textarea',
        required: true,
        description:
          'The system, flow or schema in prose. Name the actors and the steps between them.',
        example:
          'The client requests an export. The API queues a job and returns 202. The worker builds the file, writes it to storage, then notifies the client over the websocket.',
      },
    ],
    estimatedTokens: 120,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
    tips: [
      'Paste the result straight into the Mermaid Editor to render and correct it.',
      'A diagram over about 20 nodes is usually two diagrams.',
    ],
  },
  {
    id: 'agent-rules-file',
    name: 'Write an Agent Rules File',
    description: 'Generate a CLAUDE.md or equivalent from how the project actually works.',
    category: 'productivity',
    tags: ['agents', 'documentation', 'conventions', 'tooling'],
    prompt: `Write a {{fileName}} for the project described below. It instructs an AI coding agent working in this repository.

Project:
{{project}}

Commands that must be run and must pass:
{{commands}}

Conventions the agent must follow:
{{conventions}}

Rules for the file you write:
- Instructions, not description. The agent needs to know what to do, not what the project is.
- One rule per line. No paragraphs of prose.
- State the exact commands verbatim, in a code block.
- Put anything destructive or irreversible at the top, under a clear warning.
- Omit anything the agent can read from the code itself. Directory listings and dependency lists are noise.
- Where a rule exists for a non-obvious reason, give the reason in the same line. A rule without a reason gets ignored.

Keep it under 100 lines. A rules file nobody reads is worse than none.`,
    variables: [
      {
        name: 'fileName',
        label: 'File name',
        type: 'select',
        options: ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'GEMINI.md', 'CONTRIBUTING.md'],
        description: 'Different agents read different files. The content is largely the same.',
      },
      {
        name: 'project',
        label: 'Project',
        type: 'textarea',
        required: true,
        description: 'Stack, purpose and anything unusual about the layout.',
        example: 'Tauri 2 + React 19 desktop app. Bun, not npm. Rust lives in src-tauri/.',
      },
      {
        name: 'commands',
        label: 'Commands',
        type: 'textarea',
        required: true,
        description: 'The checks that gate a change. Exact invocations, not descriptions.',
        example: 'bunx tsc --noEmit\nbunx vitest run\nbun run lint\ncargo clippy -- -D warnings',
      },
      {
        name: 'conventions',
        label: 'Conventions',
        type: 'textarea',
        description: 'Git rules, naming, testing and review expectations.',
        example:
          'Always branch from origin/main. Conventional commits. Never commit directly to main.',
      },
    ],
    estimatedTokens: 200,
    optimizedFor: 'Claude',
    author: 'builtin',
    version: '1.0.0',
    tips: [
      'Give it the commands you actually run, including the ones you forget. That is the point of the file.',
      'Revisit it when an agent repeats a mistake. The missing rule is the useful one.',
    ],
  },
]

export const CATEGORY_LABELS: Record<PromptTemplate['category'], string> = {
  'code-review': 'Code Review',
  refactoring: 'Refactoring',
  testing: 'Testing',
  docs: 'Docs',
  debugging: 'Debugging',
  security: 'Security',
  learning: 'Learning',
  productivity: 'Productivity',
}
