import * as fs from 'fs/promises'
import path from 'path'

const OWNER = 'butteredstardust'
const REPO = 'devdrivr'

async function main() {
  const pkgPath = path.resolve(process.cwd(), 'package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  const version = pkg.version
  const date = new Date().toISOString()
  const tag = `cockpit-v${version}`

  const manifest = {
    version,
    notes: 'Auto generated release manifest',
    pub_date: date,
    platforms: {
      'windows-x86_64': {
        url: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_${version}_x64-setup.exe`,
        signature: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_${version}_x64-setup.exe.sig`,
      },
      'darwin-x86_64': {
        url: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_x64.app.tar.gz`,
        signature: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_x64.app.tar.gz.sig`,
      },
      'darwin-aarch64': {
        url: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_aarch64.app.tar.gz`,
        signature: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_aarch64.app.tar.gz.sig`,
      },
      'linux-x86_64': {
        url: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_${version}_amd64.AppImage`,
        signature: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/devdrivr_${version}_amd64.AppImage.sig`,
      },
    },
  }

  await fs.writeFile('latest.json', JSON.stringify(manifest, null, 2))
  console.log('latest.json generated for version ' + version)
}

main().catch(console.error)
