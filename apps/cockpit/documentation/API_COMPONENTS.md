# API Documentation - Core Components

This document provides comprehensive API documentation for the core components of the devdrivr cockpit application.

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
   - [useFormatter](#useformatter)
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

The devdrivr cockpit application follows a modular architecture with the following key components:

```
apps/cockpit/
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

The main application component that orchestrates the entire cockpit interface.

**Location:** `src/app/App.tsx`

**Props:** None

**Description:** The root component that renders the main application layout including the sidebar, workspace, and notes drawer.

### Providers Component

The application bootstrap component that initializes the application state.

**Location:** `src/app/providers.tsx`

**Props:** None

**Description:** Initializes the application state including window geometry, settings, notes, snippets, and history stores. It also sets up the window move/resize listeners.

## Shared Components

### Button

A customizable button component with different visual variants.

**Location:** `src/components/shared/Button.tsx`

**Props:**

- `variant`: Button style variant ('primary' | 'secondary' | 'ghost')
- `size`: Button size ('sm' | 'md')
- All standard HTMLButtonElement props

**Example:**

```typescript
import { Button } from '@/components/shared/Button'

<Button variant="primary" size="md" onClick={handleClick}>
  Click me
</Button>
```

### Toast

Auto-dismissing notification component.

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

Horizontal tab navigation component.

**Location:** `src/components/shared/TabBar.tsx`

**Props:**

- `tabs`: Array of tab objects with id and label
- `activeTab`: Currently active tab ID
- `onTabChange`: Callback when tab changes

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

Animated toggle switch component.

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

Copy-to-clipboard button with success feedback.

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

Lightweight RPC wrapper for Web Workers.

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

Persists tool-specific state to SQLite with debounced writes.

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

Subscribe to shell→tool actions.

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

Registers all global keyboard shortcuts.

**Location:** `src/hooks/useGlobalShortcuts.ts`

**Parameters:** None

**Description:** Sets up global keyboard shortcuts for the application.

### useFileDropZone

Tauri file drop to content handler.

**Location:** `src/hooks/useFileDropZone.ts`

**Parameters:** None

**Description:** Handles file drag and drop operations.

### useFormatter

Main-thread Prettier formatting with cached plugins.

**Location:** `src/hooks/useFormatter.ts`

**Parameters:** None

**Returns:** Object with `format` and `detectLanguage` functions

### useMonaco

Syncs Monaco editor theme with app theme.

**Location:** `src/hooks/useMonaco.ts`

**Parameters:** None

**Returns:** Object with `useMonacoTheme` hook and `EDITOR_OPTIONS`

## Libraries

### Database (db.ts)

All SQLite database access and operations.

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

Pub/sub system for shell↔tool communication.

**Location:** `src/lib/tool-actions.ts`

**Functions:**

- `dispatchToolAction()`: Dispatch an action to subscribers
- `useToolActionListener()`: Listen for tool actions

### Theme (theme.ts)

Apply CSS theme and manage persistence.

**Location:** `src/lib/theme.ts`

**Functions:**

- `applyTheme()`: Apply CSS class and update localStorage
- `getEffectiveTheme()`: Get effective theme based on system preference

### Platform (platform.ts)

OS detection utilities.

**Location:** `src/lib/platform.ts`

**Functions:**

- `detectPlatform()`: Detect current platform
- `getModKey()` / `getModKeySymbol()`: Get platform-specific modifier key

### Keybindings (keybindings.ts)

Keyboard shortcut matching and formatting.

**Location:** `src/lib/keybindings.ts`

**Functions:**

- `matchesCombo()`: Check if keyboard combo matches
- `formatCombo()`: Format keyboard combo for display

### File I/O (file-io.ts)

Tauri file dialog wrappers.

**Location:** `src/lib/file-io.ts`

**Functions:**

- `openFile()`: Open file dialog
- `saveFile()`: Save file dialog

## Stores

### Settings Store

Application settings management.

**Location:** `src/stores/settings.store.ts`

**State:**

- `theme`: Application theme
- `sidebarCollapsed`: Sidebar state
- `notesDrawerCollapsed`: Notes drawer state
- `editorFontSize`: Editor font size
- `historyRetention`: History retention count

### UI Store

UI state management.

**Location:** `src/stores/ui.store.ts`

**State:**

- `activeTool`: Currently active tool ID
- `commandPaletteOpen`: Command palette visibility
- `settingsPanelOpen`: Settings panel visibility
- `shortcutsModalOpen`: Shortcuts modal visibility
- `lastAction`: Last action feedback

### Notes Store

Sticky notes management.

**Location:** `src/stores/notes.store.ts`

**State:**

- `notes`: Array of note objects
- `activeNoteId`: Currently active note ID

### Snippets Store

Code snippets management.

**Location:** `src/stores/snippets.store.ts`

**State:**

- `snippets`: Array of snippet objects
- `activeSnippetId`: Currently active snippet ID

### History Store

Tool execution history management.

**Location:** `src/stores/history.store.ts`

**State:**

- `history`: Array of history entries
- `historyRetention`: Number of entries to retain

### API Store

API client state management.

**Location:** `src/stores/api.store.ts`

**State:**

- `environments`: API environments
- `collections`: API collections
- `requests`: API requests

## Workers

### RPC Worker

Custom RPC protocol for Web Workers.

**Location:** `src/workers/rpc.ts`

**Functions:**

- `handleRpc()`: Worker-side message handler

### Formatter Worker

Prettier + sql-formatter for all language formatting.

**Location:** `src/workers/formatter.worker.ts`

**Functions:**

- `format()`: Format code using Prettier
- `detectLanguage()`: Detect language for syntax highlighting
- `getSupportedLanguages()`: Get supported languages

### Diff Worker

Text comparison and diff computation.

**Location:** `src/workers/diff.worker.ts`

**Functions:**

- `createTwoFilesPatch()`: Create diff between two files

### TypeScript Worker

TypeScript transpilation.

**Location:** `src/workers/typescript.worker.ts`

**Functions:**

- `transpile()`: Transpile TypeScript to JavaScript

## Types

### Models

Type definitions for data models.

**Location:** `src/types/models.ts`

**Types:**

- `AppSettings`: Application settings interface
- `Note`: Note model
- `Snippet`: Code snippet model
- `HistoryEntry`: History entry model
- `NoteColor`: Note color enumeration
- `Theme`: Theme enumeration

### Tools

Tool definition types.

**Location:** `src/types/tools.ts`

**Types:**

- `ToolDefinition`: Tool definition interface
- `ToolGroup`: Tool group metadata
