# API Documentation — Core Components

This document lists shared frontend APIs in devdrivr.

## Table of Contents

1. [Application Structure](#application-structure)
2. [Core Components](#core-components)
   - [App Component](#app-component)
   - [Providers Component](#providers-component)
3. [Shared Components](#shared-components)
   - [Button](#button)
   - [Toast](#toast)
   - [TabBar](#tabbar)
   - [Toggle](#toggle)
   - [CopyButton](#copybutton)
   - [ErrorBoundary](#errorboundary)
   - [SendToMenu](#sendtomenu)
4. [Hooks](#hooks)
   - [useWorker](#useworker)
   - [useToolState](#usetoolstate)
   - [useToolAction](#usetoolaction)
   - [useGlobalShortcuts](#useglobalshortcuts)
   - [useFileDropZone](#usefiledropzone)
   - [useMonaco](#usemonaco)
   - [usePlatform](#useplatform)
5. [Libraries](#libraries)
   - [Database (db.ts)](#database-dbts)
   - [Tool Actions (tool-actions.ts)](#tool-actions-tool-actionsts)
   - [Theme (theme.ts)](#theme-themets)
   - [Platform (platform.ts)](#platform-platformts)
   - [Keybindings (keybindings.ts)](#keybindings-keybindingsts)
   - [File I/O (file-io.ts)](#file-io-file-iots)
6. [Stores](#stores)
   - [Settings Store](#settings-store)
   - [UI Store](#ui-store)
   - [Notes Store](#notes-store)
   - [Snippets Store](#snippets-store)
   - [History Store](#history-store)
   - [API Store](#api-store)
7. [Workers](#workers)
   - [RPC Worker](#rpc-worker)
   - [Formatter Worker](#formatter-worker)
   - [Diff Worker](#diff-worker)
   - [TypeScript Worker](#typescript-worker)
8. [Types](#types)
   - [Models](#models)
   - [Tools](#tools)

## Application Structure

The frontend separates app code, components, hooks, libraries, stores, tools, workers, and types.

```
./
├── src/                    # React/TypeScript frontend
│   ├── app/               # Application bootstrap and routing
│   ├── components/         # UI components
│   ├── hooks/            # Custom React hooks
│   ├── lib/               # Utility libraries
│   ├── stores/           # Zustand stores
│   ├── tools/            # Individual tool components
│   ├── workers/           # Web workers for heavy computations
│   └── types/           # TypeScript type definitions
├── src-tauri/            # Rust/Tauri backend
└── public/               # Static assets
```

## Core Components

### App Component

The root component renders the workspace.

**Location:** `src/app/App.tsx`

**Props:** None

**Export:** `App()`.

### Providers Component

The bootstrap component initializes application state around its children.

**Location:** `src/app/providers.tsx`

**Props:** None

**Export:** `Providers({ children }: { children: ReactNode })`.

## Shared Components

### Button

A shared button that forwards its ref to an HTML button.

**Location:** `src/components/shared/Button.tsx`

**Props:**

- `variant`: Button style variant (`primary`, `secondary`, `ghost`, `danger`, or `icon`)
- `size`: Button size (`xs`, `sm`, or `md`)
- `loading`: Preserves width while showing the shared spinner and disabling the button
- All standard HTMLButtonElement props

**Example:**

```typescript
import { Button } from '@/components/shared/Button'

<Button variant="primary" size="md" onClick={handleClick}>
  Click me
</Button>
```

### Toast

The toast container renders the application toast queue.

**Location:** `src/components/shared/Toast.tsx`

**Props:**

- `message`: The message to display
- `type`: Toast type ('success' | 'error' | 'info')
- `duration`: Auto-dismiss duration in milliseconds (default: 3000)

**Example:**

```typescript
import { Toast } from '@/components/shared/Toast'

<Toast message="Operation completed successfully" type="success" />
```

### TabBar

Use this component for accessible horizontal tabs.

**Location:** `src/components/shared/TabBar.tsx`

**Props:**

- `tabs`: Array of tab objects with id and label
- `activeTab`: Currently active tab ID
- `onTabChange`: Callback when tab changes
- `aria-label`: Optional tab-list label (defaults to "Tool sections")

**Example:**

```typescript
import { TabBar } from '@/components/shared/TabBar'

const TABS = [
  { id: 'format', label: 'Format' },
  { id: 'minify', label: 'Minify' }
]

<TabBar
  tabs={TABS}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

### Toggle

Use this component for a boolean setting.

**Location:** `src/components/shared/Toggle.tsx`

**Props:**

- `checked`: Boolean indicating toggle state
- `onChange`: Callback when state changes
- `label`: Optional label text

**Example:**

```typescript
import { Toggle } from '@/components/shared/Toggle'

<Toggle
  checked={state.enabled}
  onChange={setChecked}
  label="Enable feature"
/>
```

### CopyButton

Use this component to copy text to the clipboard.

**Location:** `src/components/shared/CopyButton.tsx`

**Props:**

- `text`: Text to copy to clipboard
- `label`: Optional button label
- All standard button props

**Example:**

```typescript
import { CopyButton } from '@/components/shared/CopyButton'

<CopyButton text={output} label="Copy result" />
```

### TextArea

Standard multiline input with shared typography, focus, disabled, border, and radius behavior.

**Location:** `src/components/shared/TextArea.tsx`

Use `monospace` for source or code and `size="md"` for larger prose input.

### StatusBadge

Compact semantic status treatment for `neutral`, `info`, `success`, `warning`, and `error` states.

**Location:** `src/components/shared/StatusBadge.tsx`

### Toolbar

Shared action row with optional wrapping. Use `ToolbarGroup` to label related actions and
`ToolbarSpacer` to keep trailing actions predictably aligned.

**Location:** `src/components/shared/Toolbar.tsx`

### ErrorBoundary

Error boundary component for graceful error handling.

**Location:** `src/components/shared/ErrorBoundary.tsx`

**Props:**

- `children`: React children to wrap
- `fallback`: Optional fallback component

**Example:**

```typescript
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>
```

### SendToMenu

Context menu for sending content between tools.

**Location:** `src/components/shared/SendToMenu.tsx`

**Props:**

- `content`: Content to send to other tools
- All standard menu props

**Example:**

```typescript
import { SendToMenu } from '@/components/shared/SendToMenu'

<SendToMenu content={output} />
```

## Hooks

### useWorker

This hook creates a typed RPC wrapper for a worker.

**Location:** `src/hooks/useWorker.ts`

**Parameters:**

- `factory`: Function that creates a new Worker instance
- `methods`: Array of method names exposed by the worker

**Returns:** Worker RPC object or null

**Example:**

```typescript
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
const api = useWorker<FormatterWorker>(
  () => new FormatterWorkerFactory(),
  ['format', 'detectLanguage', 'getSupportedLanguages']
)
```

### useToolState

This hook loads and persists state for one tool tab.

**Location:** `src/hooks/useToolState.ts`

**Parameters:**

- `toolId`: Unique identifier for the tool
- `defaultState`: Default state object

**Returns:** [state, update function]

**Example:**

```typescript
const [state, updateState] = useToolState<JsonToolsState>('json-tools', { input: '', output: '' })
```

### useToolAction

This hook receives shell actions for the active tool instance.

**Location:** `src/hooks/useToolAction.ts`

**Parameters:**

- `type`: Action type to listen for
- `handler`: Callback function to handle the action

**Example:**

```typescript
useToolAction('execute', () => {
  // Handle execute action
})
```

### useGlobalShortcuts

This hook registers the application keyboard shortcuts.

**Location:** `src/hooks/useGlobalShortcuts.ts`

**Parameters:** None

**Description:** Sets up global keyboard shortcuts for the application.

### useFileDropZone

This hook registers file-drop callbacks for the Tauri window.

**Location:** `src/hooks/useFileDropZone.ts`

**Parameters:** None

**Description:** Handles file drag and drop operations.

### useMonaco

This module builds Monaco preferences, theme data, and editor options.

**Location:** `src/hooks/useMonaco.ts`

**Parameters:** None

**Returns:** Object with `useMonacoTheme` hook and `EDITOR_OPTIONS`

## Libraries

### Database (db.ts)

This module owns the SQLite connection and persistence operations.

**Location:** `src/lib/db.ts`

**Functions:**

- `getDb()`: Get database connection singleton
- `getSetting()` / `setSetting()`: Get/set application settings
- `loadToolState()` / `saveToolState()`: Load/save tool state
- `loadNotes()` / `saveNote()` / `deleteNote()`: Notes CRUD operations
- `loadSnippets()` / `saveSnippet()` / `deleteSnippet()`: Snippets CRUD operations
- `loadHistory()` / `addHistoryEntry()` / `pruneHistory()`: History operations
- `loadApiEnvironments()` / `saveApiEnvironment()` / `deleteApiEnvironment()`: API client operations
- `loadApiCollections()` / `saveApiCollection()` / `deleteApiCollection()`: API collections
- `loadApiRequests()` / `saveApiRequest()` / `deleteApiRequest()`: API requests

### Tool Actions (tool-actions.ts)

This module dispatches shell actions to subscribed tool instances.

**Location:** `src/lib/tool-actions.ts`

**Functions:**

- `dispatchToolAction()`: Dispatch an action to subscribers
- `useToolActionListener()`: Listen for tool actions

### Theme (theme.ts)

This module resolves and applies the current theme.

**Location:** `src/lib/theme.ts`

**Functions:**

- `applyTheme()`: Apply CSS class and update localStorage
- `getEffectiveTheme()`: Get effective theme based on system preference

### Platform (platform.ts)

This module detects the current platform and formats its modifier key.

**Location:** `src/lib/platform.ts`

**Functions:**

- `detectPlatform()`: Detect current platform
- `getModKey()` / `getModKeySymbol()`: Get platform-specific modifier key

### Keybindings (keybindings.ts)

This module matches and formats keyboard shortcuts.

**Location:** `src/lib/keybindings.ts`

**Functions:**

- `matchesCombo()`: Check if keyboard combo matches
- `formatCombo()`: Format keyboard combo for display

### File I/O (file-io.ts)

This module opens, saves, and exports files through Tauri dialogs.

**Location:** `src/lib/file-io.ts`

**Functions:**

- `openFile()`: Open file dialog
- `saveFile()`: Save file dialog

## Stores

### Settings Store

This Zustand store persists application settings.

**Location:** `src/stores/settings.store.ts`

**State:**

- `theme`: Application theme
- `sidebarCollapsed`: Sidebar state
- `notesDrawerCollapsed`: Notes drawer state
- `editorFontSize`: Editor font size
- `historyRetention`: History retention count

### UI Store

This Zustand store holds transient workspace state.

**Location:** `src/stores/ui.store.ts`

**State:**

- `activeTool`: Currently active tool ID
- `commandPaletteOpen`: Command palette visibility
- `settingsPanelOpen`: Settings panel visibility
- `shortcutsModalOpen`: Shortcuts modal visibility
- `lastAction`: Last action feedback

### Notes Store

This Zustand store loads and updates notes.

**Location:** `src/stores/notes.store.ts`

**State:**

- `notes`: Array of note objects
- `activeNoteId`: Currently active note ID

### Snippets Store

This Zustand store loads and updates snippets.

**Location:** `src/stores/snippets.store.ts`

**State:**

- `snippets`: Array of snippet objects
- `activeSnippetId`: Currently active snippet ID

### History Store

This Zustand store loads and updates execution history.

**Location:** `src/stores/history.store.ts`

**State:**

- `history`: Array of history entries
- `historyRetention`: Number of entries to retain

### API Store

This Zustand store loads and updates API Client data.

**Location:** `src/stores/api.store.ts`

**State:**

- `environments`: API environments
- `collections`: API collections
- `requests`: API requests

## Workers

### RPC Worker

This module handles worker RPC messages.

**Location:** `src/workers/rpc.ts`

**Functions:**

- `handleRpc()`: Worker-side message handler

### Formatter Worker

This worker exposes formatter methods through the RPC protocol.

**Location:** `src/workers/formatter.worker.ts`

**Functions:**

- `format()`: Format code using Prettier
- `detectLanguage()`: Detect language for syntax highlighting
- `getSupportedLanguages()`: Get supported languages

### Diff Worker

This worker exposes text-diff computation through the RPC protocol.

**Location:** `src/workers/diff.worker.ts`

**Functions:**

- `createTwoFilesPatch()`: Create diff between two files

### TypeScript Worker

This worker exposes TypeScript transpilation through the RPC protocol.

**Location:** `src/workers/typescript.worker.ts`

**Functions:**

- `transpile()`: Transpile TypeScript to JavaScript

## Types

### Models

This module exports application model types and default settings.

**Location:** `src/types/models.ts`

**Types:**

- `AppSettings`: Application settings interface
- `Note`: Note model
- `Snippet`: Code snippet model
- `HistoryEntry`: History entry model
- `NoteColor`: Note color enumeration
- `Theme`: Theme enumeration

### Tools

This module exports tool and workspace tab types.

**Location:** `src/types/tools.ts`

**Types:**

- `ToolDefinition`: Tool definition interface
- `ToolGroup`: Tool group metadata
