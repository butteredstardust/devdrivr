//! Files the operating system hands to devdrivr — "Open With", a double-click on an associated
//! file, or a path passed on the command line.
//!
//! WARNING: `opened_file_read` reads a path outside the filesystem scope in `capabilities`, and
//! `accept` grants that path to the same scope so it can be saved back. Both are safe only because
//! nothing but a path the OS handed over reaches them. Every accepted path is recorded in `allowed`
//! first, and the read compares canonical paths. Do not widen that check.
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
use tauri_plugin_fs::FsExt;

/// Emitted when the OS opens a file while the app already runs.
///
/// The event carries no payload on purpose: it means "the queue changed", and the frontend answers
/// it by draining the queue. Sending the paths as well would hand the same file to a frontend that
/// is also draining at startup, and open it twice.
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
///
/// Each accepted file is also granted to the filesystem scope. The frontend saves through
/// `tauri-plugin-fs`, whose scope in `capabilities` covers `$HOME` and `$DOWNLOAD` only. Without
/// the grant a file opened from `/tmp`, an external volume or a second drive opens and then fails
/// on the first save. The dialog plugin grants a picked path the same way.
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
                let _ = app.fs_scope().allow_file(&resolved);
                allowed.insert(resolved);
            }
        }
    }
    lock(&state.pending).extend(files);

    let _ = app.emit(OPENED_FILES_EVENT, ());
}

/// Decodes `%XX` escapes in a URI path. A malformed escape is kept as written, so `100%zz` stays
/// `100%zz` while the well-formed escapes around it still decode.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok();
            if let Some(byte) = hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_string())
}

/// Turns one process argument into a path. Returns `None` for an argument this process must not
/// open.
///
/// A launcher may pass a `file://` URI rather than a path — the Linux desktop entry takes `%U` when
/// the app also declares a URL scheme, and several file managers pass URIs regardless. The URI form
/// is percent-encoded, so a file named `my notes.json` arrives as `my%20notes.json`.
///
/// Only a local URI is accepted. `file://server/share` names another machine, and a remote
/// authority is refused rather than resolved: on Windows it would otherwise become a UNC path, and
/// on any platform a leftover relative fragment would be joined to the working directory and could
/// name a different local file.
fn path_from_arg(arg: &str) -> Option<PathBuf> {
    let Some(rest) = arg.strip_prefix("file://") else {
        return Some(PathBuf::from(arg));
    };
    // Everything up to the first `/` is the authority. `file:///path` leaves it empty.
    let (authority, path) = rest.split_at(rest.find('/')?);
    if !authority.is_empty() && authority != "localhost" {
        return None;
    }
    // Collapse repeated leading slashes. `file:////server/share` would otherwise keep the `//`
    // prefix that makes a UNC path on Windows.
    let decoded = percent_decode(path.trim_start_matches('/'));
    // A Windows URI carries the drive letter first: `file:///C:/dir` is `C:/dir`, not `/C:/dir`.
    if cfg!(windows) && decoded.as_bytes().get(1) == Some(&b':') {
        Some(PathBuf::from(decoded))
    } else {
        Some(PathBuf::from(format!("/{decoded}")))
    }
}

/// Collects file paths from a process argument list.
///
/// `base` is the working directory those arguments were typed in, and a relative argument is
/// resolved against it. For a forwarded second instance that directory is not this process's own:
/// `devdrivr notes.md` run from another folder names a file this process cannot see from where it
/// started.
pub fn paths_from_args<I: IntoIterator<Item = String>>(args: I, base: &Path) -> Vec<String> {
    args.into_iter()
        .skip(1) // argv[0] is the executable
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            let path = path_from_arg(&arg)?;
            Some(if path.is_absolute() {
                path
            } else {
                base.join(path)
            })
        })
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

/// This process's working directory, for arguments it was started with itself.
pub fn current_dir() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
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

    /// A file that certainly exists, with the directory to resolve it against.
    fn sample_file() -> (PathBuf, String) {
        let base = current_dir();
        (base, file!().to_string())
    }

    #[test]
    fn paths_from_args_keeps_existing_files_only() {
        let (base, name) = sample_file();
        let args = vec![
            "devdrivr".to_string(),
            "--flag".to_string(),
            "/definitely/not/here.json".to_string(),
            name.clone(),
        ];
        assert_eq!(
            paths_from_args(args, &base),
            vec![base.join(&name).to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn paths_from_args_drops_the_executable() {
        let (base, name) = sample_file();
        assert!(paths_from_args(vec![name], &base).is_empty());
    }

    #[test]
    fn paths_from_args_resolves_against_the_callers_directory() {
        let (base, name) = sample_file();
        // The same relative argument, read from a directory that does not hold the file.
        let elsewhere = base.join("icons");
        let args = vec!["devdrivr".to_string(), name];
        assert!(!paths_from_args(args.clone(), &base).is_empty());
        assert!(paths_from_args(args, &elsewhere).is_empty());
    }

    #[test]
    fn paths_from_args_accepts_a_file_uri() {
        let (base, name) = sample_file();
        let absolute = base.join(&name);
        let uri = format!("file://{}", absolute.to_string_lossy());
        let args = vec!["devdrivr".to_string(), uri];
        assert_eq!(
            paths_from_args(args, Path::new("/nowhere")),
            vec![absolute.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn path_from_arg_decodes_percent_escapes() {
        assert_eq!(
            path_from_arg("file:///tmp/my%20notes.json"),
            Some(PathBuf::from("/tmp/my notes.json"))
        );
        // A multi-byte character arrives as one escape per byte.
        assert_eq!(
            path_from_arg("file:///tmp/n%C3%B8tes.json"),
            Some(PathBuf::from("/tmp/nøtes.json"))
        );
    }

    #[test]
    fn path_from_arg_accepts_the_localhost_authority() {
        assert_eq!(
            path_from_arg("file://localhost/tmp/notes.json"),
            Some(PathBuf::from("/tmp/notes.json"))
        );
    }

    #[test]
    fn path_from_arg_refuses_a_remote_uri() {
        // `file://host/path` names another machine. Resolving it would make a UNC path on Windows
        // and a working-directory-relative path everywhere else, so it is refused outright.
        assert_eq!(path_from_arg("file://server/share/notes.json"), None);
        assert_eq!(path_from_arg("file://server"), None);
    }

    #[test]
    fn path_from_arg_collapses_repeated_leading_slashes() {
        assert_eq!(
            path_from_arg("file:////server/share/notes.json"),
            Some(PathBuf::from("/server/share/notes.json"))
        );
    }

    #[test]
    fn percent_decode_keeps_a_malformed_escape() {
        assert_eq!(percent_decode("100%zz done"), "100%zz done");
        assert_eq!(percent_decode("trailing%"), "trailing%");
        // A malformed escape does not stop the well-formed ones around it.
        assert_eq!(percent_decode("a%20b%zz%20c"), "a b%zz c");
    }

    #[test]
    fn paths_from_args_keeps_an_absolute_path_as_given() {
        let (base, name) = sample_file();
        let absolute = base.join(&name).to_string_lossy().into_owned();
        let args = vec!["devdrivr".to_string(), absolute.clone()];
        // The base is wrong on purpose: an absolute argument must ignore it.
        assert_eq!(paths_from_args(args, Path::new("/nowhere")), vec![absolute]);
    }
}
