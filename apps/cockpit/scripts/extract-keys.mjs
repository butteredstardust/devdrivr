import fs from 'fs';

// Read files
const pubFileB64 = fs.readFileSync('apps/cockpit/final_prod.key.pub', 'utf8').trim();
const pubContent = Buffer.from(pubFileB64, 'base64').toString('utf-8');
const pubKey = pubContent.split('\n')[1].trim();

const privFileB64 = fs.readFileSync('apps/cockpit/final_prod.key', 'utf8').trim();
const privContent = Buffer.from(privFileB64, 'base64').toString('utf-8');

console.log('--- PUBKEY_FOR_CONFIG ---');
console.log(pubKey);
console.log('--- PRIVKEY_FOR_SECRET ---');
process.stdout.write(privContent);
console.log('\n--- END ---');

// Update tauri.conf.json
const configPath = 'apps/cockpit/src-tauri/tauri.conf.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.plugins.updater.pubkey = pubKey;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

// Update lib.rs to be extra safe
const libPath = 'apps/cockpit/src-tauri/src/lib.rs';
let libContent = fs.readFileSync(libPath, 'utf8');
libContent = libContent.replace(
  '.plugin(tauri_plugin_updater::Builder::new().build())',
  `.plugin(tauri_plugin_updater::Builder::new().build())` // Keep it simple for now, but ensure config is right
);
// Actually, let's stick to config first to avoid Rust compile errors if I mess up the syntax.
// But I will verify the config is perfectly formatted.
