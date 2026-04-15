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
      { name: 'scope', label: 'Scope', type: 'text', placeholder: 'cockpit' },
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
]

export const CATEGORY_LABELS: Record<PromptTemplate['category'], string> = {
  'code-review': 'Code Review',
  refactoring: 'Refactoring',
  testing: 'Testing',
  docs: 'Docs',
  debugging: 'Debugging',
  learning: 'Learning',
  productivity: 'Productivity',
}
