//! Files the operating system hands to devdrivr — "Open With", a double-click on an associated
//! file, or a path passed on the command line.
//!
//! WARNING: `opened_file_read` reads a path outside the filesystem scope in `capabilities`. It is
//! safe only because it refuses any path the OS did not hand over. Every accepted path is recorded
//! in `allowed` first, and the read compares canonical paths. Do not widen that check.
//!
//! Two arrival routes exist, and both are needed:
//!
//! - macOS delivers `RunEvent::Opened` — at launch for a cold start, at runtime for a warm one.
//! - Windows and Linux pass the path as a command-line argument. A second "Open With" starts a
//!   second process, so `tauri-plugin-single-instance` forwards that argument to the live window.
//!
//! A cold start races the webview: the path arrives before the frontend can listen. Paths are
//! therefore queued here and drained by `opened_files_take` when the frontend mounts. The
//! `opened-files` event covers the warm case.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

/// Event emitted when the OS opens a file while the app already runs.
pub const OPENED_FILES_EVENT: &str = "opened-files";

#[derive(Default)]
pub struct OpenedFiles {
    /// Paths waiting for the frontend to drain.
    pending: Mutex<Vec<String>>,
    /// Every path the OS has handed over, canonicalized. Guards `opened_file_read`.
    allowed: Mutex<HashSet<PathBuf>>,
}

/// Reads a lock, recovering the value if another thread panicked while holding it. A poisoned lock
/// must not take the whole "open with" path down — the data behind it is a plain list.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|err| err.into_inner())
}

fn canonical(path: &str) -> Option<PathBuf> {
    Path::new(path).canonicalize().ok()
}

/// Queues paths the OS supplied and tells the frontend about them.
///
/// Anything that is not an existing file is dropped: on Windows and Linux this list comes from
/// `argv`, which also carries flags and the executable's own path.
pub fn accept(app: &AppHandle, paths: Vec<String>) {
    let files: Vec<String> = paths
        .into_iter()
        .filter(|path| Path::new(path).is_file())
        .collect();
    if files.is_empty() {
        return;
    }

    let state = app.state::<OpenedFiles>();
    {
        let mut allowed = lock(&state.allowed);
        for path in &files {
            if let Some(resolved) = canonical(path) {
                allowed.insert(resolved);
            }
        }
    }
    lock(&state.pending).extend(files.clone());

    let _ = app.emit(OPENED_FILES_EVENT, files);
}

/// Collects file paths from a process argument list.
pub fn paths_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1) // argv[0] is the executable
        .filter(|arg| !arg.starts_with('-'))
        .filter(|arg| Path::new(arg).is_file())
        .collect()
}

/// Drains the queue. The frontend calls this once on mount, for paths that arrived before it could
/// listen for `opened-files`.
#[tauri::command]
pub fn opened_files_take(app: AppHandle) -> Vec<String> {
    let state = app.state::<OpenedFiles>();
    let mut pending = lock(&state.pending);
    std::mem::take(&mut *pending)
}

/// Reads a file the OS opened. Refuses every other path.
#[tauri::command]
pub fn opened_file_read(app: AppHandle, path: String) -> Result<String, String> {
    let resolved = canonical(&path).ok_or_else(|| format!("Unable to resolve \"{path}\""))?;
    let state = app.state::<OpenedFiles>();
    if !lock(&state.allowed).contains(&resolved) {
        return Err(format!("\"{path}\" was not opened by the system"));
    }
    std::fs::read_to_string(&resolved).map_err(|err| format!("Unable to read \"{path}\": {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_from_args_keeps_existing_files_only() {
        let this_file = file!().to_string();
        let exists = Path::new(&this_file).is_file();
        let args = vec![
            "devdrivr".to_string(),
            "--flag".to_string(),
            "/definitely/not/here.json".to_string(),
            this_file.clone(),
        ];
        let found = paths_from_args(args);
        if exists {
            assert_eq!(found, vec![this_file]);
        } else {
            assert!(found.is_empty());
        }
    }

    #[test]
    fn paths_from_args_drops_the_executable() {
        let this_file = file!().to_string();
        if !Path::new(&this_file).is_file() {
            return;
        }
        assert!(paths_from_args(vec![this_file]).is_empty());
    }
}
