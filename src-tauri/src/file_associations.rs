use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};
use tauri::{AppHandle, Manager};

struct Association {
    id: &'static str,
    label: &'static str,
    extensions: &'static [&'static str],
    #[allow(dead_code)] // Linux uses MIME types; macOS uses the matching filename extensions.
    mime_types: &'static [&'static str],
}

const ASSOCIATIONS: &[Association] = &[
    Association {
        id: "plain-text",
        label: "Plain text and source",
        extensions: &[
            "txt", "toml", "ini", "cfg", "conf", "env", "log", "ts", "tsx", "sh", "zsh", "py",
            "rs", "go", "java", "mmd", "mermaid",
        ],
        mime_types: &["text/plain"],
    },
    Association {
        id: "json",
        label: "JSON",
        extensions: &["json"],
        mime_types: &["application/json"],
    },
    Association {
        id: "yaml",
        label: "YAML",
        extensions: &["yaml", "yml"],
        mime_types: &["application/yaml"],
    },
    Association {
        id: "xml",
        label: "XML",
        extensions: &["xml"],
        mime_types: &["application/xml"],
    },
    Association {
        id: "delimited-data",
        label: "Delimited data",
        extensions: &["csv", "tsv"],
        mime_types: &["text/csv"],
    },
    Association {
        id: "markdown",
        label: "Markdown",
        extensions: &["md", "markdown"],
        mime_types: &["text/markdown"],
    },
    Association {
        id: "css",
        label: "CSS",
        extensions: &["css"],
        mime_types: &["text/css"],
    },
    Association {
        id: "html",
        label: "HTML",
        extensions: &["html", "htm"],
        mime_types: &["text/html"],
    },
    Association {
        id: "javascript",
        label: "JavaScript",
        extensions: &["js", "jsx"],
        mime_types: &["text/javascript"],
    },
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationStatus {
    id: String,
    label: String,
    detail: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAssociationStatus {
    platform: String,
    management: String,
    available: bool,
    items: Vec<AssociationStatus>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct Backups(HashMap<String, String>);

fn backup_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("file-association-backups.json"))
        .map_err(|error| error.to_string())
}

fn read_backups(app: &AppHandle) -> Result<Backups, String> {
    let path = backup_path(app)?;
    match fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json)
            .map_err(|error| format!("File-association recovery data is corrupt: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Backups::default()),
        Err(error) => Err(format!(
            "Could not read file-association recovery data: {error}"
        )),
    }
}

fn write_backups(app: &AppHandle, backups: &Backups) -> Result<(), String> {
    let path = backup_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(backups).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn definition(id: &str) -> Result<&'static Association, String> {
    ASSOCIATIONS
        .iter()
        .find(|association| association.id == id)
        .ok_or_else(|| format!("Unknown file association: {id}"))
}

fn extension_detail(association: &Association) -> String {
    association
        .extensions
        .iter()
        .map(|extension| format!(".{extension}"))
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(target_os = "linux")]
fn mime_detail(association: &Association) -> String {
    format!(
        "MIME: {} • declared for {}",
        association.mime_types.join(", "),
        extension_detail(association)
    )
}

fn summarized_status(values: &[Option<String>], expected: &str) -> String {
    let matched = values
        .iter()
        .filter(|value| value.as_deref() == Some(expected))
        .count();
    if matched == values.len() && !values.is_empty() {
        "active"
    } else if matched > 0 {
        "partial"
    } else {
        "inactive"
    }
    .to_string()
}

#[cfg(target_os = "linux")]
fn linux_default(mime_type: &str) -> Option<String> {
    let output = std::process::Command::new("xdg-mime")
        .args(["query", "default", mime_type])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "linux")]
fn linux_set(mime_type: &str, desktop_file: &str) -> Result<(), String> {
    let status = std::process::Command::new("xdg-mime")
        .args(["default", desktop_file, mime_type])
        .status()
        .map_err(|error| format!("Could not run xdg-mime: {error}"))?;
    status
        .success()
        .then_some(())
        .ok_or_else(|| format!("xdg-mime could not update {mime_type}"))
}

#[cfg(target_os = "linux")]
fn linux_alternative(mime_type: &str, excluded: &str) -> Option<String> {
    let output = std::process::Command::new("gio")
        .env("LC_ALL", "C")
        .args(["mime", mime_type])
        .output()
        .ok()?;
    output.status.success().then_some(())?;
    parse_gio_alternative(&String::from_utf8_lossy(&output.stdout), excluded)
}

#[cfg(any(target_os = "linux", test))]
fn parse_gio_alternative(output: &str, excluded: &str) -> Option<String> {
    let mut in_candidates = false;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed == "Registered applications:" || trimmed == "Recommended applications:" {
            in_candidates = true;
            continue;
        }
        if trimmed.ends_with(':') {
            in_candidates = false;
            continue;
        }
        if in_candidates && trimmed.ends_with(".desktop") && trimmed != excluded {
            return Some(trimmed.to_string());
        }
    }
    None
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::{c_char, c_void, CString};

    type CFStringRef = *const c_void;
    const UTF8: u32 = 0x0800_0100;
    const ALL_ROLES: u32 = u32::MAX;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            value: *const c_char,
            encoding: u32,
        ) -> CFStringRef;
        fn CFStringGetCString(
            value: CFStringRef,
            buffer: *mut c_char,
            buffer_size: isize,
            encoding: u32,
        ) -> bool;
        fn CFRelease(value: *const c_void);
        fn CFRetain(value: *const c_void) -> *const c_void;
        fn CFArrayGetCount(array: *const c_void) -> isize;
        fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
    }

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        static kUTTagClassFilenameExtension: CFStringRef;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CFStringRef,
            tag: CFStringRef,
            conforming_to: CFStringRef,
        ) -> CFStringRef;
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            roles: u32,
        ) -> CFStringRef;
        fn LSCopyAllRoleHandlersForContentType(
            content_type: CFStringRef,
            roles: u32,
        ) -> *const c_void;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            roles: u32,
            handler_bundle_id: CFStringRef,
        ) -> i32;
    }

    unsafe fn cf_string(value: &str) -> Result<CFStringRef, String> {
        let value = CString::new(value).map_err(|_| "Invalid association value".to_string())?;
        let string = CFStringCreateWithCString(std::ptr::null(), value.as_ptr(), UTF8);
        (!string.is_null())
            .then_some(string)
            .ok_or_else(|| "Could not create native string".to_string())
    }

    unsafe fn uti(extension: &str) -> Result<CFStringRef, String> {
        let tag = cf_string(extension)?;
        let result = UTTypeCreatePreferredIdentifierForTag(
            kUTTagClassFilenameExtension,
            tag,
            std::ptr::null(),
        );
        CFRelease(tag);
        (!result.is_null())
            .then_some(result)
            .ok_or_else(|| format!("macOS does not recognize .{extension}"))
    }

    unsafe fn string_value(value: CFStringRef) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let mut buffer = vec![0_i8; 1024];
        let success = CFStringGetCString(value, buffer.as_mut_ptr(), buffer.len() as isize, UTF8);
        CFRelease(value);
        success.then(|| {
            let bytes = buffer
                .iter()
                .take_while(|byte| **byte != 0)
                .map(|byte| *byte as u8)
                .collect::<Vec<_>>();
            String::from_utf8_lossy(&bytes).into_owned()
        })
    }

    pub fn default_handler(extension: &str) -> Option<String> {
        unsafe {
            let uti = uti(extension).ok()?;
            let handler = LSCopyDefaultRoleHandlerForContentType(uti, ALL_ROLES);
            CFRelease(uti);
            string_value(handler)
        }
    }

    pub fn set_handler(extension: &str, handler: &str) -> Result<(), String> {
        unsafe {
            let uti = uti(extension)?;
            let handler = cf_string(handler)?;
            let result = LSSetDefaultRoleHandlerForContentType(uti, ALL_ROLES, handler);
            CFRelease(handler);
            CFRelease(uti);
            (result == 0)
                .then_some(())
                .ok_or_else(|| format!("macOS rejected the .{extension} association ({result})"))
        }
    }

    pub fn alternative_handler(extension: &str, excluded: &str) -> Option<String> {
        unsafe {
            let uti = uti(extension).ok()?;
            let handlers = LSCopyAllRoleHandlersForContentType(uti, ALL_ROLES);
            CFRelease(uti);
            if handlers.is_null() {
                return None;
            }
            let mut result = None;
            for index in 0..CFArrayGetCount(handlers) {
                let value = CFArrayGetValueAtIndex(handlers, index);
                if value.is_null() {
                    continue;
                }
                let owned = CFRetain(value);
                if let Some(handler) = string_value(owned) {
                    if handler != excluded {
                        result = Some(handler);
                        break;
                    }
                }
            }
            CFRelease(handlers);
            result
        }
    }
}

#[tauri::command]
pub fn file_associations_status(app: AppHandle) -> FileAssociationStatus {
    let app_id = app.config().identifier.as_str();
    #[cfg(target_os = "macos")]
    let items = ASSOCIATIONS
        .iter()
        .map(|association| AssociationStatus {
            id: association.id.to_string(),
            label: association.label.to_string(),
            detail: extension_detail(association),
            status: summarized_status(
                &association
                    .extensions
                    .iter()
                    .map(|value| macos::default_handler(value))
                    .collect::<Vec<_>>(),
                app_id,
            ),
        })
        .collect();

    #[cfg(target_os = "linux")]
    let items = ASSOCIATIONS
        .iter()
        .map(|association| AssociationStatus {
            id: association.id.to_string(),
            label: association.label.to_string(),
            detail: mime_detail(association),
            status: summarized_status(
                &association
                    .mime_types
                    .iter()
                    .map(|value| linux_default(value))
                    .collect::<Vec<_>>(),
                &format!("{app_id}.desktop"),
            ),
        })
        .collect();

    #[cfg(windows)]
    let items = ASSOCIATIONS
        .iter()
        .map(|association| AssociationStatus {
            id: association.id.to_string(),
            label: association.label.to_string(),
            detail: extension_detail(association),
            status: "system".to_string(),
        })
        .collect();

    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    let items = Vec::new();

    FileAssociationStatus {
        platform: std::env::consts::OS.to_string(),
        management: if cfg!(windows) { "system" } else { "direct" }.to_string(),
        available: cfg!(any(target_os = "macos", target_os = "linux", windows)),
        items,
    }
}

#[tauri::command]
pub fn file_association_set(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    let association = definition(&id)?;
    let app_id = app.config().identifier.as_str();

    #[cfg(target_os = "macos")]
    {
        let original_backups = read_backups(&app)?;
        let mut next_backups = original_backups.clone();
        let mut changes = Vec::new();

        for extension in association.extensions {
            let current = macos::default_handler(extension);
            let key = format!("macos:{extension}");
            if enabled {
                if current.as_deref() == Some(app_id) {
                    continue;
                }
                let previous = current.ok_or_else(|| {
                    format!(
                        ".{extension} has no current default app, so it cannot be restored safely"
                    )
                })?;
                next_backups
                    .0
                    .entry(key)
                    .or_insert_with(|| previous.clone());
                changes.push((*extension, previous, app_id.to_string()));
            } else if current.as_deref() == Some(app_id) {
                let restore = next_backups
                    .0
                    .get(&key)
                    .cloned()
                    .or_else(|| macos::alternative_handler(extension, app_id))
                    .ok_or_else(|| format!("No alternative app is available for .{extension}"))?;
                changes.push((*extension, app_id.to_string(), restore));
                next_backups.0.remove(&key);
            } else {
                next_backups.0.remove(&key);
            }
        }

        // Enabling must journal the previous handlers first. Disabling keeps the existing journal
        // until every restore succeeds, so a crash can never discard the only recovery path.
        if enabled {
            write_backups(&app, &next_backups)?;
        }
        let mut applied: Vec<(&str, String)> = Vec::new();
        for (extension, previous, target) in &changes {
            if let Err(error) = macos::set_handler(extension, target) {
                let mut rollback_errors = Vec::new();
                for (changed_extension, rollback) in applied.iter().rev() {
                    if let Err(rollback_error) = macos::set_handler(changed_extension, rollback) {
                        rollback_errors.push(rollback_error);
                    }
                }
                if rollback_errors.is_empty() && enabled {
                    if let Err(journal_error) = write_backups(&app, &original_backups) {
                        return Err(format!(
                            "{error}; rollback succeeded but recovery data could not be reset: {journal_error}"
                        ));
                    }
                }
                return Err(if rollback_errors.is_empty() {
                    error
                } else {
                    format!(
                        "{error}; rollback also failed: {}",
                        rollback_errors.join("; ")
                    )
                });
            }
            applied.push((extension, previous.clone()));
        }
        if !enabled {
            write_backups(&app, &next_backups)?;
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let original_backups = read_backups(&app)?;
        let mut next_backups = original_backups.clone();
        let desktop_file = format!("{app_id}.desktop");
        let mut changes = Vec::new();

        for mime_type in association.mime_types {
            let current = linux_default(mime_type);
            let key = format!("linux:{mime_type}");
            if enabled {
                if current.as_deref() == Some(desktop_file.as_str()) {
                    continue;
                }
                let previous = current.ok_or_else(|| {
                    format!(
                        "{mime_type} has no current default app, so it cannot be restored safely"
                    )
                })?;
                next_backups
                    .0
                    .entry(key)
                    .or_insert_with(|| previous.clone());
                changes.push((*mime_type, previous, desktop_file.clone()));
            } else if current.as_deref() == Some(desktop_file.as_str()) {
                let restore = next_backups
                    .0
                    .get(&key)
                    .cloned()
                    .or_else(|| linux_alternative(mime_type, &desktop_file))
                    .ok_or_else(|| format!("No alternative app is available for {mime_type}"))?;
                changes.push((*mime_type, desktop_file.clone(), restore));
                next_backups.0.remove(&key);
            } else {
                next_backups.0.remove(&key);
            }
        }

        if enabled {
            write_backups(&app, &next_backups)?;
        }
        let mut applied: Vec<(&str, String)> = Vec::new();
        for (mime_type, previous, target) in &changes {
            if let Err(error) = linux_set(mime_type, target) {
                let mut rollback_errors = Vec::new();
                for (changed_mime, rollback) in applied.iter().rev() {
                    if let Err(rollback_error) = linux_set(changed_mime, rollback) {
                        rollback_errors.push(rollback_error);
                    }
                }
                if rollback_errors.is_empty() && enabled {
                    if let Err(journal_error) = write_backups(&app, &original_backups) {
                        return Err(format!(
                            "{error}; rollback succeeded but recovery data could not be reset: {journal_error}"
                        ));
                    }
                }
                return Err(if rollback_errors.is_empty() {
                    error
                } else {
                    format!(
                        "{error}; rollback also failed: {}",
                        rollback_errors.join("; ")
                    )
                });
            }
            applied.push((mime_type, previous.clone()));
        }
        if !enabled {
            write_backups(&app, &next_backups)?;
        }
        Ok(())
    }

    #[cfg(windows)]
    {
        let _ = (app, association, enabled);
        return open_windows_default_apps();
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    {
        let _ = (app, association, enabled);
        Err("File associations are not supported on this platform".to_string())
    }
}

#[cfg(windows)]
fn open_windows_default_apps() -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg("ms-settings:defaultapps")
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open Windows Default Apps: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn association_ids_are_unique_and_extensions_are_covered_once() {
        let mut ids = std::collections::HashSet::new();
        let mut extensions = std::collections::HashSet::new();
        for association in ASSOCIATIONS {
            assert!(ids.insert(association.id));
            for &extension in association.extensions {
                assert!(
                    extensions.insert(extension),
                    "duplicate extension: {extension}"
                );
            }
        }

        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid Tauri config");
        let configured = config["bundle"]["fileAssociations"]
            .as_array()
            .expect("bundle file associations")
            .iter()
            .flat_map(|entry| entry["ext"].as_array().expect("extension list"))
            .map(|extension| extension.as_str().expect("string extension"))
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(extensions, configured);
    }

    #[test]
    fn parses_registered_gio_alternative_without_using_the_summary_line() {
        let output = "Default application for ‘text/plain’: com.devdrivr.cockpit.desktop\nRegistered applications:\n\tcom.devdrivr.cockpit.desktop\n\torg.gnome.TextEditor.desktop\nRecommended applications:\n\torg.gnome.TextEditor.desktop\n";
        assert_eq!(
            parse_gio_alternative(output, "com.devdrivr.cockpit.desktop").as_deref(),
            Some("org.gnome.TextEditor.desktop")
        );
    }
}
