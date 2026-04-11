import fs from 'fs';
import path from 'path';

// 1. Read the public key file
const pubKeyFileB64 = fs.readFileSync('apps/cockpit/production.key.pub', 'utf8').trim();
const pubKeyFileContent = Buffer.from(pubKeyFileB64, 'base64').toString('utf-8');
const lines = pubKeyFileContent.split('\n').filter(line => line.trim() !== '');
const pubKey = lines[1].trim();

console.log('--- PUBKEY ANALYSIS ---');
console.log('Pubkey String:', pubKey);
console.log('Length:', pubKey.length);

if (pubKey.length !== 56) {
  console.error('ERROR: Pubkey length is not 56 characters!');
  process.exit(1);
}

// 2. Update tauri.conf.json
const configPath = 'apps/cockpit/src-tauri/tauri.conf.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.plugins.updater.pubkey = pubKey;

// Also ensure createUpdaterArtifacts is true
config.bundle.createUpdaterArtifacts = true;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('Updated tauri.conf.json successfully.');

// 3. Read private key for display
const privKeyFileB64 = fs.readFileSync('apps/cockpit/production.key', 'utf8').trim();
const privKeyFileContent = Buffer.from(privKeyFileB64, 'base64').toString('utf-8');
console.log('\n--- PRIVATE KEY CONTENT (FOR GITHUB SECRET) ---');
console.log(privKeyFileContent);
console.log('--- END PRIVATE KEY ---');
