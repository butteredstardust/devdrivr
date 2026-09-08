//! Window lifecycle commands for the title bar.
//!
//! The window is titled on every platform: Windows and Linux hide the frame with
//! `decorations: false`, and macOS keeps the AppKit frame and hides only its title bar
//! (`titleBarStyle: Overlay` in tauri.macos.conf.json). A titled window is what lets macOS report
//! and enter its own fullscreen, so the state below is read from the platform rather than tracked
//! here.

use serde::Deserialize;
use serde::Serialize;
use tauri::WebviewWindow;
use tauri_runtime::ResizeDirection;

fn command_error(error: tauri::Error) -> String {
    error.to_string()
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    is_fullscreen: bool,
    is_maximized: bool,
}

fn current_state(window: &WebviewWindow, fullscreen: bool) -> Result<WindowState, String> {
    Ok(WindowState {
        is_fullscreen: fullscreen,
        is_maximized: window.is_maximized().map_err(command_error)?,
    })
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub enum WindowResizeDirection {
    East,
    North,
    NorthEast,
    NorthWest,
    South,
    SouthEast,
    SouthWest,
    West,
}

impl From<WindowResizeDirection> for ResizeDirection {
    fn from(direction: WindowResizeDirection) -> Self {
        match direction {
            WindowResizeDirection::East => Self::East,
            WindowResizeDirection::North => Self::North,
            WindowResizeDirection::NorthEast => Self::NorthEast,
            WindowResizeDirection::NorthWest => Self::NorthWest,
            WindowResizeDirection::South => Self::South,
            WindowResizeDirection::SouthEast => Self::SouthEast,
            WindowResizeDirection::SouthWest => Self::SouthWest,
            WindowResizeDirection::West => Self::West,
        }
    }
}

#[tauri::command]
pub fn window_focus(window: WebviewWindow) -> Result<(), String> {
    // One call is enough: `WebviewWindow::set_focus` already forwards to the underlying window.
    window.set_focus().map_err(command_error)
}

#[tauri::command]
pub fn window_get_state(window: WebviewWindow) -> Result<WindowState, String> {
    let fullscreen = window.is_fullscreen().map_err(command_error)?;
    current_state(&window, fullscreen)
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(command_error)
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> Result<WindowState, String> {
    let maximized = window.is_maximized().map_err(command_error)?;
    if maximized {
        window.unmaximize().map_err(command_error)?;
    } else {
        window.maximize().map_err(command_error)?;
    }
    let fullscreen = window.is_fullscreen().map_err(command_error)?;
    current_state(&window, fullscreen)
}

/// Enter or leave the platform's own fullscreen mode.
///
/// On macOS this is a fullscreen Space: the zoom animation, the menu bar that drops down on hover,
/// the Mission Control tile, and Split View. The green button and `⌃⌘F` reach the same state, so
/// the title bar reads the window rather than a flag of its own.
///
/// The returned state is the *target*. macOS animates the transition, and the window reports the
/// target from the moment the toggle is accepted, which is what the title bar needs.
#[tauri::command]
pub fn window_toggle_fullscreen(window: WebviewWindow) -> Result<WindowState, String> {
    let target = !window.is_fullscreen().map_err(command_error)?;
    window.set_fullscreen(target).map_err(command_error)?;
    current_state(&window, target)
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(command_error)
}

/// Start an edge or corner resize drag for the undecorated Windows and Linux frame. macOS keeps
/// its native frame, so it resizes from the OS edges and never calls this.
#[tauri::command]
pub fn window_start_resize(
    window: WebviewWindow,
    direction: WindowResizeDirection,
) -> Result<(), String> {
    window
        .as_ref()
        .window()
        .start_resize_dragging(direction.into())
        .map_err(command_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_every_frontend_resize_direction() {
        for direction in [
            "East",
            "North",
            "NorthEast",
            "NorthWest",
            "South",
            "SouthEast",
            "SouthWest",
            "West",
        ] {
            let json = format!("\"{direction}\"");
            serde_json::from_str::<WindowResizeDirection>(&json).unwrap();
        }
    }
}
