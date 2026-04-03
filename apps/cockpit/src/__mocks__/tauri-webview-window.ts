// Mock for @tauri-apps/api/webviewWindow — used in jsdom test environment
export function getCurrentWebviewWindow() {
  return {
    onDragDropEvent: (_handler: unknown) => Promise.resolve(() => {}),
  }
}
