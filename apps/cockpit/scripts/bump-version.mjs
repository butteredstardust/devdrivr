import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const packageJsonPath = path.join(root, 'package.json');
const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');

function bump(version) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3) return version;
  parts[2] += 1; // Increment patch
  return parts.join('.');
}

try {
  // 1. Bump package.json
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const oldVersion = pkg.version;
  const newVersion = bump(oldVersion);
  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Bumping package.json: ${oldVersion} -> ${newVersion}`);

  // 2. Bump tauri.conf.json
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = newVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
  console.log(`Bumping tauri.conf.json: ${oldVersion} -> ${newVersion}`);

  // Output for CI
  console.log(`::set-output name=new_version::${newVersion}`);
} catch (err) {
  console.error('Failed to bump version:', err);
  process.exit(1);
}
