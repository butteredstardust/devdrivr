/**
 * Third-party attribution shown on the Settings → Acknowledgments tab.
 *
 * Two lists, because they come from two package managers and neither one can be read at runtime:
 * the app ships as a compiled bundle with no node_modules and no cargo registry beside it, so the
 * data has to be baked in at authoring time.
 *
 * Regenerating the npm list after `bun add` / `bun update` — run from `apps/cockpit/`:
 *
 *     bun -e 'const p=require("./package.json");for(const n of Object.keys(p.dependencies)){const f=require(`./node_modules/${n}/package.json`);console.log(n,f.version,f.license)}'
 *
 * and reconcile the output with NPM_DEPENDENCIES below. The Rust list comes from
 * `cargo metadata --format-version 1` run against `src-tauri/Cargo.toml`, filtered to the direct
 * dependencies of the `cockpit` package.
 *
 * Only *direct* dependencies are listed. The transitive graph is ~600 crates and several thousand
 * npm packages; every one of them is covered by a licence that is reproduced in full under
 * LICENSE_TEXTS, which is what the notice requirements actually turn on.
 */

export type Attribution = {
  name: string
  version: string
  /** SPDX identifier as declared by the package. May be a disjunction, e.g. `MIT OR Apache-2.0`. */
  license: string
  /** Declared copyright holder, where the package names one. */
  copyright?: string
}

/** npm packages the frontend depends on directly. */
export const NPM_DEPENDENCIES: readonly Attribution[] = [
  { name: '@fontsource/cascadia-code', version: '5.2.3', license: 'OFL-1.1' },
  { name: '@fontsource/fira-code', version: '5.2.7', license: 'OFL-1.1' },
  { name: '@fontsource/jetbrains-mono', version: '5.2.8', license: 'OFL-1.1' },
  { name: '@fontsource/silkscreen', version: '5.2.8', license: 'OFL-1.1' },
  { name: '@fontsource/source-code-pro', version: '5.2.7', license: 'OFL-1.1' },
  { name: '@monaco-editor/react', version: '4.7.0', license: 'MIT', copyright: 'Suren Atoyan' },
  { name: '@noble/hashes', version: '2.0.1', license: 'MIT', copyright: 'Paul Miller' },
  { name: '@phosphor-icons/react', version: '2.1.10', license: 'MIT', copyright: 'Tobias Fried' },
  { name: '@prettier/plugin-xml', version: '3.4.2', license: 'MIT', copyright: 'Kevin Newton' },
  { name: '@tailwindcss/vite', version: '4.2.2', license: 'MIT', copyright: 'Tailwind Labs' },
  { name: '@tanstack/react-table', version: '8.21.3', license: 'MIT', copyright: 'Tanner Linsley' },
  {
    name: '@tauri-apps/api',
    version: '2.11.1',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: '@tauri-apps/plugin-dialog',
    version: '2.7.0',
    license: 'MIT OR Apache-2.0',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: '@tauri-apps/plugin-fs',
    version: '2.5.0',
    license: 'MIT OR Apache-2.0',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: '@tauri-apps/plugin-opener',
    version: '2.5.4',
    license: 'MIT OR Apache-2.0',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: '@tauri-apps/plugin-http',
    version: '2.5.8',
    license: 'MIT OR Apache-2.0',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: '@tauri-apps/plugin-process',
    version: '2.3.1',
    license: 'MIT OR Apache-2.0',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: '@tauri-apps/plugin-sql',
    version: '2.4.0',
    license: 'MIT OR Apache-2.0',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: '@tauri-apps/plugin-updater',
    version: '2.10.1',
    license: 'MIT OR Apache-2.0',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  { name: '@xmldom/xmldom', version: '0.9.9', license: 'MIT', copyright: 'xmldom contributors' },
  { name: 'ajv', version: '8.18.0', license: 'MIT', copyright: 'Evgeny Poberezkin' },
  { name: 'ajv-formats', version: '3.0.1', license: 'MIT', copyright: 'Evgeny Poberezkin' },
  { name: 'css-tree', version: '3.2.1', license: 'MIT', copyright: 'Roman Dvornov' },
  { name: 'diff', version: '7.0.0', license: 'BSD-3-Clause', copyright: 'Kevin Decker' },
  { name: 'diff2html', version: '3.4.56', license: 'MIT', copyright: 'Rodrigo Fernandes' },
  {
    name: 'dompurify',
    version: '3.3.3',
    license: 'MPL-2.0 OR Apache-2.0',
    copyright: 'Dr.-Ing. Mario Heiderich, Cure53',
  },
  { name: 'fuse.js', version: '7.3.0', license: 'Apache-2.0', copyright: 'Kiro Risk' },
  { name: 'graphql', version: '16.13.2', license: 'MIT', copyright: 'GraphQL Contributors' },
  { name: 'htmlhint', version: '1.9.2', license: 'MIT', copyright: 'HTMLHint contributors' },
  { name: 'immer', version: '11.1.4', license: 'MIT', copyright: 'Michel Weststrate' },
  { name: 'js-yaml', version: '4.1.1', license: 'MIT', copyright: 'Vladimir Zapparov' },
  { name: 'jscodeshift', version: '17.3.0', license: 'MIT', copyright: 'Felix Kling' },
  { name: 'mermaid', version: '11.14.0', license: 'MIT', copyright: 'Knut Sveidqvist' },
  { name: 'monaco-editor', version: '0.55.1', license: 'MIT', copyright: 'Microsoft Corporation' },
  { name: 'monaco-themes', version: '0.4.8', license: 'MIT', copyright: 'Brijesh' },
  { name: 'nanoid', version: '5.1.7', license: 'MIT', copyright: 'Andrey Sitnik' },
  { name: 'papaparse', version: '5.5.3', license: 'MIT', copyright: 'Matthew Holt' },
  { name: 'parse5', version: '8.0.1', license: 'MIT', copyright: 'Ivan Nikulin' },
  { name: 'prettier', version: '3.8.1', license: 'MIT', copyright: 'James Long' },
  {
    name: 'react',
    version: '19.2.4',
    license: 'MIT',
    copyright: 'Meta Platforms, Inc. and affiliates',
  },
  {
    name: 'react-dom',
    version: '19.2.4',
    license: 'MIT',
    copyright: 'Meta Platforms, Inc. and affiliates',
  },
  { name: 'rehype-highlight', version: '7.0.2', license: 'MIT', copyright: 'Titus Wormer' },
  { name: 'rehype-sanitize', version: '6.0.0', license: 'MIT', copyright: 'Titus Wormer' },
  { name: 'rehype-stringify', version: '10.0.1', license: 'MIT', copyright: 'Titus Wormer' },
  { name: 'remark-gfm', version: '4.0.1', license: 'MIT', copyright: 'Titus Wormer' },
  { name: 'remark-parse', version: '11.0.0', license: 'MIT', copyright: 'Titus Wormer' },
  { name: 'remark-rehype', version: '11.1.2', license: 'MIT', copyright: 'Titus Wormer' },
  {
    name: 'sql-formatter',
    version: '15.7.3',
    license: 'MIT',
    copyright: 'sql-formatter contributors',
  },
  { name: 'tailwindcss', version: '4.2.2', license: 'MIT', copyright: 'Tailwind Labs' },
  { name: 'unified', version: '11.0.5', license: 'MIT', copyright: 'Titus Wormer' },
  { name: 'xpath', version: '0.0.34', license: 'MIT', copyright: 'Cameron McCormack' },
  { name: 'zod', version: '4.3.6', license: 'MIT', copyright: 'Colin McDonnell' },
  { name: 'zustand', version: '5.0.12', license: 'MIT', copyright: 'Paul Henschel' },
]

/** Rust crates `src-tauri` depends on directly. */
export const CARGO_DEPENDENCIES: readonly Attribution[] = [
  { name: 'axum', version: '0.8.9', license: 'MIT', copyright: 'Tokio contributors' },
  { name: 'objc2', version: '0.6.4', license: 'MIT', copyright: 'objc2 contributors' },
  {
    name: 'objc2-app-kit',
    version: '0.3.2',
    license: 'Zlib OR Apache-2.0 OR MIT',
    copyright: 'objc2 contributors',
  },
  {
    name: 'objc2-quartz-core',
    version: '0.3.2',
    license: 'Zlib OR Apache-2.0 OR MIT',
    copyright: 'objc2 contributors',
  },
  {
    name: 'rmcp',
    version: '0.16.0',
    license: 'Apache-2.0',
    copyright: 'Model Context Protocol contributors',
  },
  {
    name: 'serde',
    version: '1.0.228',
    license: 'MIT OR Apache-2.0',
    copyright: 'Serde contributors',
  },
  {
    name: 'serde_json',
    version: '1.0.149',
    license: 'MIT OR Apache-2.0',
    copyright: 'Serde contributors',
  },
  { name: 'sqlx', version: '0.8.6', license: 'MIT OR Apache-2.0', copyright: 'LaunchBadge, LLC' },
  {
    name: 'tauri',
    version: '2.10.3',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-build',
    version: '2.5.6',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-plugin-dialog',
    version: '2.6.0',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-plugin-fs',
    version: '2.4.5',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-plugin-opener',
    version: '2.5.4',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-plugin-http',
    version: '2.5.7',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-plugin-process',
    version: '2.3.1',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-plugin-sql',
    version: '2.3.2',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-plugin-updater',
    version: '2.10.1',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  {
    name: 'tauri-runtime',
    version: '2.10.1',
    license: 'Apache-2.0 OR MIT',
    copyright: 'Tauri Programme within The Commons Conservancy',
  },
  { name: 'tokio', version: '1.50.0', license: 'MIT', copyright: 'Tokio contributors' },
  { name: 'tokio-util', version: '0.7.18', license: 'MIT', copyright: 'Tokio contributors' },
  {
    name: 'uuid',
    version: '1.22.0',
    license: 'Apache-2.0 OR MIT',
    copyright: 'uuid-rs contributors',
  },
]

/**
 * Typefaces bundled with the app. They arrive through the `@fontsource/*` packages above, but the
 * OFL asks for the *font* to be credited, not the delivery mechanism, so they are named here too.
 */
export const FONTS: readonly Attribution[] = [
  { name: 'JetBrains Mono', version: '5.2.8', license: 'OFL-1.1', copyright: 'JetBrains s.r.o.' },
  {
    name: 'Fira Code',
    version: '5.2.7',
    license: 'OFL-1.1',
    copyright: 'The Fira Code Project Authors',
  },
  {
    name: 'Cascadia Code',
    version: '5.2.3',
    license: 'OFL-1.1',
    copyright: 'Microsoft Corporation',
  },
  {
    name: 'Source Code Pro',
    version: '5.2.7',
    license: 'OFL-1.1',
    copyright: 'Adobe Systems Incorporated',
  },
  {
    name: 'Silkscreen',
    version: '5.2.8',
    license: 'OFL-1.1',
    copyright: 'The Silkscreen Project Authors',
  },
]

/**
 * Split a declared SPDX string into the individual licences it names.
 *
 * A disjunction (`MIT OR Apache-2.0`, and the older `MIT/Apache-2.0` spelling still used by a few
 * crates) grants a choice, but the Acknowledgments tab shows the full text of every licence a
 * package could be used under rather than silently picking one on the reader's behalf.
 */
export function licenseKeysFor(spdx: string): string[] {
  return spdx
    .split(/\s+OR\s+|\//)
    .map((part) => part.trim())
    .filter(Boolean)
}
