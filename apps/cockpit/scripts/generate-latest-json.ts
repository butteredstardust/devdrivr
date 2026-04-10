import * as fs from 'fs/promises'
import { execSync } from 'child_process'

async function main() {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'))
  const version = pkg.version
  const date = new Date().toISOString()
  const manifest = {
    version,
    notes: 'Auto generated release manifest',
    pub_date: date,
    platforms: {
      win32: {
        url: `https://github.com/butteredstardust/devdrivr/releases/latest/download/devdrivre.exe`,
      },
      darwin: {
        url: `https://github.com/butteredstardust/devdrivr/releases/latest/download/devdrivre.app.tar.gz`,
      },
      linux: {
        url: `https://github.com/butteredstardust/devdrivr/releases/latest/download/devdrivre.AppImage`,
      },
    },
  }
  await fs.writeFile('latest.json', JSON.stringify(manifest, null, 2))
  console.log('latest.json generated')
}
main().catch(console.error)
