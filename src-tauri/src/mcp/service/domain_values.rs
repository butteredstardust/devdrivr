//! Closed value sets the app and this service both enforce on the same tables.
//!
//! Each one must match `shared/domain-contract.json`, which the TypeScript side also asserts
//! against. The app drops a row whose value falls outside its set, so a value added on one side
//! and forgotten on the other makes a row disappear from the tool, or makes an update here
//! rewrite it. The contract test in `tests.rs` fails first instead.

/// Kept in step with `NOTE_COLORS` in `src/lib/schemas.ts`.
pub(super) const NOTE_COLORS: [&str; 8] = [
    "yellow", "green", "blue", "pink", "purple", "orange", "red", "gray",
];

/// Kept in step with `TaskStatus` in `src/types/models.ts`.
pub(super) const TASK_STATUSES: [&str; 4] = ["todo", "in_progress", "done", "blocked"];

/// Kept in step with `TaskPriority` in `src/types/models.ts`.
pub(super) const TASK_PRIORITIES: [&str; 3] = ["low", "medium", "high"];

/// Kept in step with `PROMPT_TEMPLATE_CATEGORIES` in `src/types/models.ts`.
pub(super) const TEMPLATE_CATEGORIES: [&str; 8] = [
    "code-review",
    "refactoring",
    "testing",
    "docs",
    "debugging",
    "security",
    "learning",
    "productivity",
];

/// Kept in step with `PromptTemplate.optimizedFor` in `src/types/models.ts`.
pub(super) const TEMPLATE_TARGETS: [&str; 4] = ["Claude", "ChatGPT", "Cursor", "Generic"];

/// Kept in step with `ResourceKind` in `src/types/models.ts`.
pub(super) const FOLDER_KINDS: [&str; 3] = ["notes", "snippets", "apiRequests"];

/// Kept in step with `INBOX_FOLDER_IDS` in `src/lib/resource-folders.ts`.
pub(super) const SYSTEM_INBOX_IDS: [&str; 3] =
    ["notes-inbox", "snippets-inbox", "api-requests-inbox"];
