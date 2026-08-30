use serde::Deserialize;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;
use tauri::WebviewWindow;
use tauri_runtime::ResizeDirection;

fn command_error(error: tauri::Error) -> String {
    error.to_string()
}

#[derive(Default)]
pub struct WindowFullscreenState {
    is_fullscreen: AtomicBool,
    transition_in_flight: AtomicBool,
}

impl WindowFullscreenState {
    pub fn is_fullscreen(&self) -> bool {
        self.is_fullscreen.load(Ordering::SeqCst)
    }
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
pub fn window_get_state(
    window: WebviewWindow,
    fullscreen_state: State<'_, WindowFullscreenState>,
) -> Result<WindowState, String> {
    current_state(&window, fullscreen_state.is_fullscreen())
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(command_error)
}

#[tauri::command]
pub fn window_toggle_maximize(
    window: WebviewWindow,
    fullscreen_state: State<'_, WindowFullscreenState>,
) -> Result<WindowState, String> {
    let maximized = window.is_maximized().map_err(command_error)?;
    if maximized {
        window.unmaximize().map_err(command_error)?;
    } else {
        window.maximize().map_err(command_error)?;
    }
    current_state(&window, fullscreen_state.is_fullscreen())
}

#[tauri::command]
pub fn window_toggle_fullscreen(
    window: WebviewWindow,
    fullscreen_state: State<'_, WindowFullscreenState>,
) -> Result<WindowState, String> {
    if fullscreen_state
        .transition_in_flight
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("a fullscreen transition is already in progress".to_string());
    }

    let previous = fullscreen_state.is_fullscreen();
    let target = !previous;
    // Publish before resizing so the synchronous resize event sees the new state and applies the
    // correct corner radius without trying to lock state held by this command.
    fullscreen_state
        .is_fullscreen
        .store(target, Ordering::SeqCst);

    // An undecorated AppKit window cannot enter macOS Spaces fullscreen. Tauri's simple
    // fullscreen is the native borderless-display mode intended for this exact case; on Windows
    // and Linux the same API falls back to the platform's ordinary fullscreen implementation.
    if let Err(error) = window.set_simple_fullscreen(target) {
        fullscreen_state
            .is_fullscreen
            .store(previous, Ordering::SeqCst);
        fullscreen_state
            .transition_in_flight
            .store(false, Ordering::SeqCst);
        return Err(command_error(error));
    }
    crate::window_corners::set_fullscreen(&window.as_ref().window_ref(), target);

    let state = current_state(&window, target);
    fullscreen_state
        .transition_in_flight
        .store(false, Ordering::SeqCst);
    state
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(command_error)
}

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
