use serde::Deserialize;
use tauri::WebviewWindow;
use tauri_runtime::ResizeDirection;

fn command_error(error: tauri::Error) -> String {
    error.to_string()
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
    window.set_focus().map_err(command_error)?;
    window.as_ref().set_focus().map_err(command_error)
}

#[tauri::command]
pub fn window_is_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(command_error)
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(command_error)
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> Result<bool, String> {
    let maximized = window.is_maximized().map_err(command_error)?;
    if maximized {
        window.unmaximize().map_err(command_error)?;
    } else {
        window.maximize().map_err(command_error)?;
    }
    Ok(!maximized)
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
