import { describe, expect, it } from 'vitest'
import { auditRegistry, auditTool, factsForFile, parseRegistry } from '../audit-tool-contracts.mjs'

type Finding = { tool: string; rule: string; detail: string; file?: string; line?: number }
type Tool = Record<string, unknown>
type Fact = { kind: string; name: string; line: number }

const parseFacts = (source: string) =>
  (factsForFile as (f: string, s: string) => Fact[])('sample.tsx', source)

/** Registry ids a handoff may name. Tests that do not care pass a tool id through. */
const REGISTERED = { ids: new Set(['sample', 'json-tools']) }

const audit = (tool: Tool, source: string): Finding[] =>
  (auditTool as (t: Tool, f: Fact[], s: string, r: unknown) => Finding[])(
    { id: 'sample', ...tool },
    parseFacts(source),
    source,
    REGISTERED
  )

const rulesFor = (tool: Tool, source: string) => audit(tool, source).map((f) => f.rule)

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
      const source = `switch (action.type) { case 'open-file-dialog': dialog() }`
      expect(rulesFor({ ownsOpenFile: true }, source)).toEqual([])
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

    // Most tools reach the drop through a hook rather than the Tauri call. Detection reads the
    // callee name, so a wrapper that `DROP_REGISTRARS` does not list reports every tool using it
    // as having no handler.
    it('sees the drop through a wrapper hook', () => {
      expect(
        rulesFor({ ownsFileDrop: true }, 'useNativeFileDrop(ref, callbacks, isInstanceActive)')
      ).toEqual([])
    })

    it('stays quiet once the flag is set', () => {
      const source = `useEffect(() => {
          if (!enabled) return
          webview.onDragDropEvent(handler)
        }, [enabled])`
      expect(rulesFor({ ownsFileDrop: true }, source)).toEqual([])
    })

    it('flags a flag with no listener', () => {
      expect(rulesFor({ ownsFileDrop: true }, 'const x = 1')).toContain('owns-drop-unhandled')
    })

    // Deleting the handler usually leaves the import behind. A signal that accepts a bare name
    // stays green through exactly the change the rule exists to catch.
    it('does not take an import or a prose mention for a handler', () => {
      const source = `import { useNativeFileDrop } from '@/hooks/useNativeFileDrop'
        // useNativeFileDrop answers the drop.
        const x = 1`
      expect(rulesFor({ ownsFileDrop: true }, source)).toContain('owns-drop-unhandled')
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

describe('fact extraction', () => {
  // An explicit type argument is the normal call style for these hooks. A pattern requiring `(`
  // reported every tool as stateless, which is how this was found.
  it('sees a hook called with a type argument', () => {
    const facts = parseFacts(`useToolState<JsonToolsState>('json-tools', {})`)
    expect(facts.some((f) => f.kind === 'call' && f.name === 'useToolState')).toBe(true)
  })

  // A tool that ships a sample document is describing HTML, not writing a handler. The text
  // search read three `<h1>` in the HTML validator's sample templates as headings it rendered.
  it('does not read code out of a comment or a string', () => {
    const source = `// useNativeFileDrop answers the drop
      const sample = '<div onDrop={x} />'`
    expect(parseFacts(source).filter((f) => f.kind !== 'call')).toEqual([])
  })

  it('carries the line a fact sits on', () => {
    const facts = parseFacts(`const a = 1\nconst b = 2\nuseMonaco()`)
    expect(facts.find((f) => f.name === 'useMonaco')?.line).toBe(3)
  })

  // Half the tools answer an action with an early return rather than a positive branch.
  it('reads a negated comparison as a handler', () => {
    expect(rulesFor({ supportsSaveFile: true }, `if (action.type !== 'save-file') return`)).toEqual(
      []
    )
  })

  // A construction is its own node. Reading calls alone left `raw-worker-construction` unable to
  // see the syntax it forbids.
  it('sees a Worker construction', () => {
    const facts = (factsForFile as (f: string, s: string) => Fact[])(
      'sample.ts',
      `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`
    )
    expect(facts.some((f) => f.kind === 'new' && f.name === 'Worker')).toBe(true)
  })

  // TSX reads `<Foo>value` as an unterminated JSX element and drops every fact after it.
  it('parses an angle-bracket assertion in a .ts file', () => {
    const facts = (factsForFile as (f: string, s: string) => Fact[])(
      'sample.ts',
      `const value = <Foo>input\nuseMonaco()`
    )
    expect(facts.some((f) => f.kind === 'call' && f.name === 'useMonaco')).toBe(true)
  })

  // A tool that dispatches an action does not handle it. The text search could not tell the two
  // apart, so a tool that only sent `open-file` read as one that answered it.
  it('does not read a dispatch as a handler', () => {
    expect(
      rulesFor({ supportsOpenFile: true }, `dispatchToolAction({ type: 'open-file' })`)
    ).toContain('open-file-flag-dead')
  })
})

describe('native-drop-not-instance-gated', () => {
  // Every mounted tab keeps its listener and every listener sees every drop. The Markdown Editor
  // shipped ungated, so a drop could replace a background tab's document.
  it('flags a drop registered with no instance gate', () => {
    expect(
      rulesFor({ ownsFileDrop: true }, 'useImageDrop(editorRef, ref, onText, onError)')
    ).toContain('native-drop-not-instance-gated')
  })

  it('stays quiet when the gate is passed', () => {
    expect(
      rulesFor({ ownsFileDrop: true }, 'useNativeFileDrop(ref, callbacks, isInstanceActive)')
    ).toEqual([])
  })

  // A wrapper forwards its own `enabled` parameter. Its caller is checked at the caller's line.
  it('accepts a forwarded enabled parameter', () => {
    expect(rulesFor({ ownsFileDrop: true }, 'useNativeFileDrop(ref, callbacks, enabled)')).toEqual(
      []
    )
  })

  // A name that only looks like the gate is worse than no check, because it certifies.
  it.each([
    ['an inverted flag', 'useNativeFileDrop(ref, callbacks, isNotActive)'],
    ['an object property', 'useNativeFileDrop(ref, callbacks, { active: false })'],
    ['a string', `useNativeFileDrop(ref, callbacks, () => false, 'active')`],
  ])('rejects %s', (_name, source) => {
    expect(rulesFor({ ownsFileDrop: true }, source)).toContain('native-drop-not-instance-gated')
  })

  it('accepts the gate narrowed further', () => {
    const source = `useNativeFileDrop(ref, callbacks, isInstanceActive && state.mode === 'encode')`
    expect(rulesFor({ ownsFileDrop: true }, source)).toEqual([])
  })

  // The raw Tauri listener takes no gate argument, so its gate is a guard around it.
  it('flags a raw listener with no guard', () => {
    const source = `useEffect(() => {
        getCurrentWebviewWindow().onDragDropEvent(handler)
      }, [])`
    expect(rulesFor({ ownsFileDrop: true }, source)).toContain('native-drop-not-instance-gated')
  })

  it('accepts a raw listener the enclosing effect guards', () => {
    const source = `useEffect(() => {
        if (!enabled) return
        getCurrentWebviewWindow().onDragDropEvent(handler)
      }, [enabled])`
    expect(rulesFor({ ownsFileDrop: true }, source)).toEqual([])
  })

  // The gate is checked at the call. A directory-wide boolean let one gated listener bless every
  // ungated one beside it, which is how the Markdown Editor stayed green.
  it('does not let one gated call bless another', () => {
    const source = `const isInstanceActive = useIsInstanceActive()
      useNativeFileDrop(ref, callbacks, isInstanceActive)
      useImageDrop(editorRef, ref, onText, onError)`
    const findings = audit({ ownsFileDrop: true }, source)
    const gate = findings.filter((f) => f.rule === 'native-drop-not-instance-gated')
    expect(gate).toHaveLength(1)
    expect(gate[0]?.line).toBe(3)
  })
})

describe('flags that steer the shell', () => {
  it('flags a Monaco tool that does not declare it', () => {
    expect(rulesFor({}, 'const monaco = useMonaco()')).toContain('monaco-flag-missing')
  })

  it('flags a declared Monaco tool that never calls it', () => {
    expect(rulesFor({ usesMonaco: true }, 'const x = 1')).toContain('monaco-flag-dead')
  })

  // The key names the SQLite row. A typo reads another tool's state, which looks like a reset.
  it('flags a tool state key that is not the tool id', () => {
    expect(rulesFor({}, `useToolState<S>('json-tool', {})`)).toContain('tool-state-id-mismatch')
  })

  it('accepts the matching key', () => {
    expect(rulesFor({}, `useToolState<S>('sample', {})`)).toEqual([])
  })

  it('flags a handoff to a tool that is not registered', () => {
    expect(rulesFor({}, `sendToTool('jsn-tools', patch)`)).toContain('handoff-target-unregistered')
  })

  it('accepts a handoff to a registered tool', () => {
    expect(rulesFor({}, `sendToTool('json-tools', patch)`)).toEqual([])
  })
})

describe('auditRegistry', () => {
  const registryFindings = (tools: Tool[], dirs: string[]) =>
    (auditRegistry as (t: Tool[], d: string[]) => Finding[])(tools, dirs).map((f) => f.rule)

  it('flags two entries sharing one id', () => {
    const tools = [
      { id: 'base64', component: 'A', dir: 'base64' },
      { id: 'base64', component: 'B', dir: 'base64' },
    ]
    expect(registryFindings(tools, ['base64'])).toContain('duplicate-tool-id')
  })

  it('flags two entries sharing one component', () => {
    const tools = [
      { id: 'base64', component: 'A', dir: 'base64' },
      { id: 'url-codec', component: 'A', dir: 'base64' },
    ]
    expect(registryFindings(tools, ['base64'])).toContain('duplicate-tool-component')
  })

  // Source nothing imports ships in no build and cannot be opened.
  it('flags a tool directory the registry never names', () => {
    const tools = [{ id: 'base64', component: 'A', dir: 'base64' }]
    expect(registryFindings(tools, ['base64', 'placeholder'])).toContain('orphan-tool-directory')
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
        component: 'JsonTools',
        dir: 'json-tools',
        supportsOpenFile: true,
        supportsSaveFile: true,
        ownsFileDrop: false,
        ownsOpenFile: false,
        usesMonaco: false,
      },
      {
        id: 'base64',
        component: 'Base64Tool',
        dir: 'base64',
        supportsOpenFile: false,
        supportsSaveFile: false,
        ownsFileDrop: false,
        ownsOpenFile: false,
        usesMonaco: false,
      },
    ])
  })

  // A phantom entry makes an orphan directory look registered, and adds a handoff target that
  // opens nothing.
  it('reads entries from TOOLS only', () => {
    const text = `const Orphan = lazy(() => import('@/tools/orphan/Orphan'))
const metadata = { id: 'not-a-tool', component: Orphan }
${REGISTRY}`
    expect(parse(text).map((tool) => tool.id)).toEqual(['json-tools', 'base64'])
  })

  // A short list reads exactly like a clean one, so an unreadable entry stops the run.
  it('refuses an entry it cannot read', () => {
    const text = REGISTRY.replace(`    id: 'base64',\n`, '    ...base,\n')
    expect(() => parse(text)).toThrow(/read 1 of 2/)
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
