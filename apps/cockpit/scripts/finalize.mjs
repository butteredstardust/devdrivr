import fs from 'fs';

const pubKey = "RWSx8PWh4TF7cKvtAZ0dHEWR1A2EMDMkkcCZ6uODCQxy99xcEvJRWh1N";
const configPath = 'apps/cockpit/src-tauri/tauri.conf.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

config.plugins.updater.pubkey = pubKey;
config.bundle.createUpdaterArtifacts = true;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('Finalized config with pubkey: ' + pubKey);
