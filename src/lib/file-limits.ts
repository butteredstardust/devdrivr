/** Size ceilings for text surfaces that intentionally keep their full input in memory. */
export const MAX_EDITABLE_TEXT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024

/**
 * Default ceiling for a text file that is read whole into memory. A tool can set its own limit.
 * A larger file stalls or crashes the WebView before any tool can check its size.
 */
export const MAX_TEXT_FILE_BYTES = 50 * 1024 * 1024

/** Largest note image attachment. src-tauri/src/note_assets.rs enforces the same limit. */
export const MAX_NOTE_IMAGE_BYTES = 10 * 1024 * 1024
