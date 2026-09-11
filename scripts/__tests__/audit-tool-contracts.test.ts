import { describe, expect, it } from 'vitest'
import { auditTool, parseRegistry, readSignals } from '../audit-tool-contracts.mjs'

type Finding = { tool: string; rule: string; detail: string }
type Tool = Record<string, unknown>

const audit = (tool: Tool, source: string): Finding[] =>
  (auditTool as (t: Tool, s: string) => Finding[])({ id: 'sample', ...tool }, source)

const rulesFor = (tool: Tool, source: string) => audit(tool, source).map((f) => f.rule)

const signals = (source: string) => (readSignals as (s: string) => Record<string, boolean>)(source)

describe('tool contract rules', () => {
  // Each rule below reproduces a defect that reached a user. The comment states which, because a
  // rule whose purpose is forgotten gets deleted the first time it is inconvenient.

  describe('html-drop-is-dead', () => {
    // The Image Tool answered "File drop is not supported by the active tool" for two releases.
    // Tauri runs with `dragDropEnabled` and claims the OS drop, so a React handler never fires.
    it('flags a React drop handler in a tool', () => {
      expect(rulesFor({}, '<div onDrop={handleDrop} />')).toContain('html-drop-is-dead')
    })

    it('accepts an ignore comment that states a reason', () => {
      const source = `/* tool-contract-ignore: html-drop-is-dead browser-only fallback */
        <div onDrop={handleDrop} />`
      expect(rulesFor({}, source)).not.toContain('html-drop-is-dead')
    })

    it('ignores a comment that names a different rule', () => {
      const source = `/* tool-contract-ignore: owns-drop-unhandled unrelated */
        <div onDrop={handleDrop} />`
      expect(rulesFor({}, source)).toContain('html-drop-is-dead')
    })
  })

  describe('capability flags and their handlers', () => {
    it('flags a registered Open File with no handler', () => {
      expect(rulesFor({ supportsOpenFile: true }, 'const x = 1')).toContain('open-file-flag-dead')
    })

    it('flags a handler with no registration', () => {
      expect(rulesFor({}, `if (action.type === 'open-file') load()`)).toContain(
        'open-file-flag-missing'
      )
    })

    it('stays quiet when both halves agree', () => {
      expect(
        rulesFor({ supportsOpenFile: true }, `if (action.type === 'open-file') load()`)
      ).toEqual([])
    })

    // A tool that runs its own binary dialog does not carry `supportsOpenFile`, and saying it
    // lacks a registration would be wrong.
    it('accepts ownsOpenFile in place of supportsOpenFile', () => {
      expect(rulesFor({ ownsOpenFile: true }, `case 'open-file-dialog': dialog()`)).toEqual([])
    })

    it('flags a save handler the shortcut can never reach', () => {
      expect(rulesFor({}, `if (action.type === 'save-file') save()`)).toContain(
        'save-file-flag-missing'
      )
    })
  })

  describe('native-drop-unregistered', () => {
    // Without `ownsFileDrop` the shell claims the same drop. The Markdown Editor inserts the
    // image and shows a read error for it at the same time.
    it('flags a native listener with no registry flag', () => {
      expect(rulesFor({}, 'webview.onDragDropEvent(handler)')).toContain('native-drop-unregistered')
    })

    it('stays quiet once the flag is set', () => {
      expect(rulesFor({ ownsFileDrop: true }, 'webview.onDragDropEvent(handler)')).toEqual([])
    })

    it('flags a flag with no listener', () => {
      expect(rulesFor({ ownsFileDrop: true }, 'const x = 1')).toContain('owns-drop-unhandled')
    })
  })

  describe('ungated-global-listener', () => {
    // The notes drawer renders beside every tool. An ungated document paste listener handled the
    // drawer's paste as well as its own, so one image landed twice.
    it('flags an ungated document paste listener', () => {
      expect(rulesFor({}, `document.addEventListener('paste', onPaste)`)).toContain(
        'ungated-global-listener'
      )
    })

    it('stays quiet when the tool checks the active instance', () => {
      const source = `const active = useIsInstanceActive()
        document.addEventListener('paste', onPaste)`
      expect(rulesFor({}, source)).toEqual([])
    })

    // A click-outside handler registered with its own menu is correct. Reporting it would make
    // the audit noise, and a noisy audit gets ignored.
    it('ignores a mousedown listener', () => {
      expect(rulesFor({}, `document.addEventListener('mousedown', onOutside)`)).toEqual([])
    })
  })

  describe('raw-action-subscription', () => {
    it('flags a direct subscription', () => {
      expect(rulesFor({}, 'subscribeToolAction((action) => {})')).toContain(
        'raw-action-subscription'
      )
    })

    it('stays quiet when the shared hook is used', () => {
      expect(rulesFor({}, 'useToolAction((action) => {})')).toEqual([])
    })
  })
})

describe('signal detection', () => {
  // An explicit type argument is the normal call style for these hooks. A pattern requiring `(`
  // reported every tool as stateless, which is how this was found.
  it('sees a hook called with a type argument', () => {
    expect(signals(`useToolState<JsonToolsState>('json-tools', {})`).toolState).toBe(true)
  })
})

describe('parseRegistry', () => {
  const REGISTRY = `
const JsonTools = lazy(() => import('@/tools/json-tools/JsonTools'))
const Base64Tool = lazy(() => import('@/tools/base64/Base64Tool'))

export const TOOLS: ToolDefinition[] = [
  {
    id: 'json-tools',
    component: JsonTools,
    supportsOpenFile: true,
    supportsSaveFile: true,
  },
  {
    id: 'base64',
    component: Base64Tool,
  },
]
`

  const parse = (text: string) => (parseRegistry as (t: string) => Tool[])(text)

  it('reads each entry with its flags', () => {
    expect(parse(REGISTRY)).toEqual([
      {
        id: 'json-tools',
        dir: 'json-tools',
        supportsOpenFile: true,
        supportsSaveFile: true,
        ownsFileDrop: false,
        ownsOpenFile: false,
        usesMonaco: false,
      },
      {
        id: 'base64',
        dir: 'base64',
        supportsOpenFile: false,
        supportsSaveFile: false,
        ownsFileDrop: false,
        ownsOpenFile: false,
        usesMonaco: false,
      },
    ])
  })

  // The directory comes from the import, not the id. A tool whose source cannot be found is
  // reported rather than skipped, because a skipped tool is exactly the hole this closes.
  it('leaves the directory undefined when no import resolves', () => {
    const text = REGISTRY.replace(
      `const JsonTools = lazy(() => import('@/tools/json-tools/JsonTools'))`,
      ''
    )
    expect(parse(text)[0]?.dir).toBeUndefined()
  })
})
