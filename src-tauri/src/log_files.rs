//! Reads part of a log file, so the Log Viewer can open a file of any size and read only the bytes
//! that a writer appended.
//!
//! WARNING: `log_file_read` reads only a path that the filesystem scope allows. The open dialog, a
//! file drop and an OS open grant a path to that scope, so this command reads the same files as
//! `plugin-fs`. Do not remove the scope check.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use tauri::ipc::Response;
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

/// The largest range that one call returns. The frontend asks for less.
const MAX_READ_BYTES: u64 = 16 * 1024 * 1024;
/// The first bytes of the file, for byte order mark detection when the range starts later.
const HEAD_BYTES: usize = 4;
/// File size (u64 LE), range start (u64 LE), file identity (u64 LE), head length (u32 LE), head
/// bytes (4).
const HEADER_BYTES: usize = 8 + 8 + 8 + 4 + HEAD_BYTES;

/// A range of a file, and the facts the frontend needs to join it to the previous range.
#[derive(Debug, PartialEq)]
struct LogRange {
    size: u64,
    begin: u64,
    head: Vec<u8>,
    bytes: Vec<u8>,
}

/// Reads from `start` to the end of the file, but never more than `limit` bytes.
///
/// A larger range keeps its last `limit` bytes. A `start` after the end of the file means that the
/// file got shorter, so the read starts again from the tail. The caller detects both cases when
/// `begin` differs from `start`.
fn read_range<F: Read + Seek>(
    file: &mut F,
    size: u64,
    start: Option<u64>,
    limit: u64,
) -> std::io::Result<LogRange> {
    let tail = size.saturating_sub(limit);
    let begin = match start {
        Some(start) if start <= size => start.max(tail),
        _ => tail,
    };

    let mut head = Vec::with_capacity(HEAD_BYTES);
    file.seek(SeekFrom::Start(0))?;
    file.by_ref().take(HEAD_BYTES as u64).read_to_end(&mut head)?;

    // Read only up to `size`. A writer can append while this runs, and the next read collects
    // those bytes, because it starts at `size`.
    let mut bytes = Vec::with_capacity((size - begin) as usize);
    file.seek(SeekFrom::Start(begin))?;
    file.by_ref().take(size - begin).read_to_end(&mut bytes)?;
    Ok(LogRange {
        size: begin + bytes.len() as u64,
        begin,
        head,
        bytes,
    })
}

/// Identifies the file behind a path. A rotated log is a new file with a new identity, even when
/// it is already as large as the old one. `0` means unknown.
fn file_identity(metadata: &std::fs::Metadata) -> u64 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        // Two file systems can use the same inode number.
        metadata.ino() ^ metadata.dev().rotate_left(32)
    }
    #[cfg(not(unix))]
    {
        metadata
            .created()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |time| time.as_nanos() as u64)
    }
}

fn encode(range: LogRange, identity: u64) -> Vec<u8> {
    let mut out = Vec::with_capacity(HEADER_BYTES + range.bytes.len());
    out.extend_from_slice(&range.size.to_le_bytes());
    out.extend_from_slice(&range.begin.to_le_bytes());
    out.extend_from_slice(&identity.to_le_bytes());
    out.extend_from_slice(&(range.head.len() as u32).to_le_bytes());
    let mut head = [0u8; HEAD_BYTES];
    head[..range.head.len()].copy_from_slice(&range.head);
    out.extend_from_slice(&head);
    out.extend_from_slice(&range.bytes);
    out
}

/// Reads a log file from `start`, or its tail when `start` is absent, as raw bytes.
///
/// The response starts with a header of `HEADER_BYTES`. See `HEADER_BYTES` for the layout.
#[tauri::command]
pub fn log_file_read(
    app: AppHandle,
    path: String,
    start: Option<u64>,
    max_bytes: u64,
) -> Result<Response, String> {
    let resolved = Path::new(&path)
        .canonicalize()
        .map_err(|err| format!("Unable to resolve \"{path}\": {err}"))?;
    if !app.fs_scope().is_allowed(&resolved) {
        return Err(format!("\"{path}\" is not in the allowed file scope"));
    }
    let mut file =
        File::open(&resolved).map_err(|err| format!("Unable to open \"{path}\": {err}"))?;
    let metadata = file
        .metadata()
        .map_err(|err| format!("Unable to inspect \"{path}\": {err}"))?;
    let range = read_range(&mut file, metadata.len(), start, max_bytes.min(MAX_READ_BYTES))
        .map_err(|err| format!("Unable to read \"{path}\": {err}"))?;
    Ok(Response::new(encode(range, file_identity(&metadata))))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn read(data: &[u8], start: Option<u64>, limit: u64) -> LogRange {
        read_range(&mut Cursor::new(data), data.len() as u64, start, limit).unwrap()
    }

    #[test]
    fn reads_the_tail_when_no_start_is_given() {
        let range = read(b"one\ntwo\nthree\n", None, 6);
        assert_eq!(range.begin, 8);
        assert_eq!(range.bytes, b"three\n");
        assert_eq!(range.size, 14);
        assert_eq!(range.head, b"one\n");
    }

    #[test]
    fn reads_the_appended_bytes_from_start() {
        let range = read(b"one\ntwo\n", Some(4), 100);
        assert_eq!(range.begin, 4);
        assert_eq!(range.bytes, b"two\n");
    }

    #[test]
    fn keeps_the_last_bytes_of_a_large_append() {
        let range = read(b"0123456789", Some(2), 3);
        assert_eq!(range.begin, 7);
        assert_eq!(range.bytes, b"789");
    }

    #[test]
    fn reads_the_tail_again_when_the_file_got_shorter() {
        let range = read(b"new\n", Some(100), 100);
        assert_eq!(range.begin, 0);
        assert_eq!(range.bytes, b"new\n");
    }

    #[test]
    fn reports_no_bytes_when_nothing_was_appended() {
        let range = read(b"abc", Some(3), 100);
        assert_eq!(range.begin, 3);
        assert!(range.bytes.is_empty());
    }

    #[test]
    fn encodes_a_short_head_with_its_length() {
        let out = encode(read(b"ab", None, 100), 7);
        assert_eq!(out.len(), HEADER_BYTES + 2);
        assert_eq!(u64::from_le_bytes(out[0..8].try_into().unwrap()), 2);
        assert_eq!(u64::from_le_bytes(out[8..16].try_into().unwrap()), 0);
        assert_eq!(u64::from_le_bytes(out[16..24].try_into().unwrap()), 7);
        assert_eq!(u32::from_le_bytes(out[24..28].try_into().unwrap()), 2);
        assert_eq!(&out[28..32], &[b'a', b'b', 0, 0]);
        assert_eq!(&out[32..], b"ab");
    }
}
