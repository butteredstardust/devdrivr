#!/bin/bash
echo "--- CI DEBUG START ---"
echo "Working Directory: $(pwd)"

CONFIG_PATH="apps/cockpit/src-tauri/tauri.conf.json"
if [ -f "$CONFIG_PATH" ]; then
  echo "Found tauri.conf.json"
  PUBKEY=$(cat "$CONFIG_PATH" | jq -r '.plugins.updater.pubkey')
  echo "Public Key from Config: $PUBKEY"
  echo "Public Key Length: ${#PUBKEY}"
else
  echo "ERROR: tauri.conf.json not found at $CONFIG_PATH"
fi

if [ -n "$TAURI_SIGNING_PRIVATE_KEY" ]; then
  echo "Private Key is set (Length: ${#TAURI_SIGNING_PRIVATE_KEY})"
  echo "Private Key Start: ${TAURI_SIGNING_PRIVATE_KEY:0:50}..."
else
  echo "ERROR: TAURI_SIGNING_PRIVATE_KEY is NOT set"
fi
echo "--- CI DEBUG END ---"
