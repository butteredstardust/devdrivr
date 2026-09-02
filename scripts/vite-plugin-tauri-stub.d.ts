import type { Plugin } from 'vite'

/** Dev-server plugin that inlines the browser Tauri stub into index.html. */
export function tauriStubPlugin(): Plugin
