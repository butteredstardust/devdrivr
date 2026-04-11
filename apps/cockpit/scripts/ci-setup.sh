#!/bin/bash
echo "--- COCKPIT CI SETUP & DIAGNOSTICS ---"
echo "Current Directory: $(pwd)"

CONFIG_PATH="apps/cockpit/src-tauri/tauri.conf.json"

if [ -f "$CONFIG_PATH" ]; then
    echo "Found tauri.conf.json"
    PUBKEY=$(cat "$CONFIG_PATH" | jq -r '.plugins.updater.pubkey')
    echo "Public Key: $PUBKEY"
    echo "Public Key Length: ${#PUBKEY}"
else
    echo "ERROR: tauri.conf.json not found"
fi

if [ -n "$TAURI_SIGNING_PRIVATE_KEY" ]; then
    echo "Private Key is set (Length: ${#TAURI_SIGNING_PRIVATE_KEY})"
else
    echo "ERROR: TAURI_SIGNING_PRIVATE_KEY is NOT set"
fi
echo "--- CI SETUP COMPLETE ---"
