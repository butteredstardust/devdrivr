import { readdirSync, unlinkSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')

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
