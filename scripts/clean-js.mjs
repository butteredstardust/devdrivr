import { readdirSync, rmSync, unlinkSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = join(appDirectory, 'src')

const removeGeneratedJavaScript = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== '__mocks__') {
        removeGeneratedJavaScript(join(directory, entry.name))
      }
      continue
    }

    if (entry.isFile() && extname(entry.name) === '.js') {
      unlinkSync(join(directory, entry.name))
    }
  }
}

removeGeneratedJavaScript(sourceDirectory)

// A stray `tsc` emit leaves a compiled `vite.config.js` next to the source
// config. Vite resolves `.js` before `.ts`, so the build silently runs against
// a frozen copy of the config — worker options and manual chunks simply have
// no effect until it is removed.
for (const generated of ['vite.config.js', 'vite.config.d.ts']) {
  rmSync(join(appDirectory, generated), { force: true })
}
