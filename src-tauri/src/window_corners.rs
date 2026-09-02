//! Rounded window corners for the client-side-decorated window.
//!
//! `decorations: false` in tauri.conf.json clears AppKit's `NSWindowStyleMask::Titled` bit, and the
//! rounded corners macOS draws are a property of the titled frame, not of the window as such — so
//! the app renders with four hard 90° corners while every other macOS app is rounded. Windows 11
//! rounds top-level windows in DWM regardless of decoration, and GTK leaves undecorated windows
//! square by convention, so macOS is the only platform that needs anything doing.
//!
//! Deliberately *not* solved the "universal" way — `transparent: true` plus a CSS `border-radius`
//! on the app root. That form needs `macOSPrivateApi`, which forfeits App Store eligibility, and it
//! would replace DWM's correct rounding and shadow on Windows with a hand-drawn one, regressing the
//! platform that already works. Clipping the content layer here fixes the platform that is broken
//! and leaves the other two untouched.

/// AppKit's window corner radius since Big Sur. Not exposed as a constant by the framework, so it
/// is matched by measurement; a wrong value reads as "nearly native", which is worse than square.
#[cfg(target_os = "macos")]
const CORNER_RADIUS: f64 = 10.0;

/// A fullscreen window owns the whole display and is square-cornered natively. Keeping the radius
/// would clip four notches out of the app and show the desktop through them.
///
/// devdrivr's untitled window cannot enter AppKit Spaces fullscreen, so its explicit fullscreen
/// command uses Tauri's borderless simple-fullscreen mode. Zoom/maximize is a different state and
/// stays rounded, matching every other zoomed macOS window.
#[cfg(target_os = "macos")]
fn corner_radius(is_fullscreen: bool) -> f64 {
    if is_fullscreen {
        0.0
    } else {
        CORNER_RADIUS
    }
}

/// Resolve the window's content layer, or log why it could not be reached.
///
/// # Safety
/// Must be called on the main thread; AppKit requires it of every call in here. Every call site is
/// main-thread by construction: Tauri's `setup` hook, its window event handler, and the
/// `window_toggle_fullscreen` command — a synchronous `#[tauri::command]`, which Tauri runs on the
/// main thread. Adding `async` (or `#[tauri::command(async)]`) to that command would move it onto
/// the async runtime's thread pool and invalidate this guarantee.
#[cfg(target_os = "macos")]
unsafe fn content_layer(
    window: &tauri::Window,
) -> Option<(
    &objc2_app_kit::NSWindow,
    objc2::rc::Retained<objc2_quartz_core::CALayer>,
)> {
    use objc2_app_kit::NSWindow;

    let ptr = match window.ns_window() {
        Ok(ptr) => ptr as *const NSWindow,
        Err(error) => {
            eprintln!("[window_corners] no NSWindow: {error}");
            return None;
        }
    };
    if ptr.is_null() {
        return None;
    }

    // SAFETY: `ns_window()` hands back the live NSWindow backing this Tauri window, which outlives
    // this borrow, and the caller has guaranteed the main thread.
    let ns_window = &*ptr;
    let Some(view) = ns_window.contentView() else {
        eprintln!("[window_corners] window has no content view");
        return None;
    };
    view.setWantsLayer(true);
    let Some(layer) = view.layer() else {
        eprintln!("[window_corners] content view has no layer");
        return None;
    };
    Some((ns_window, layer))
}

/// Round the window's corners to match the platform's decorated windows. Call once per window, at
/// startup.
///
/// Failures are logged, never fatal: square corners are cosmetic, and a window that cannot round
/// itself must still open.
#[cfg(target_os = "macos")]
pub fn apply(window: &tauri::Window) {
    use objc2_app_kit::NSColor;

    let is_fullscreen = window.is_fullscreen().unwrap_or(false);

    // SAFETY: called from Tauri's `setup` hook, which runs on the main thread.
    unsafe {
        let Some((ns_window, layer)) = content_layer(window) else {
            return;
        };

        // The corner radius lives on the content view's layer, so the window must stop painting an
        // opaque rectangle behind it or the square background would fill the rounded cut-outs back
        // in. This is native transparency on one window, not Tauri's `transparent` flag — the
        // webview itself stays opaque.
        ns_window.setOpaque(false);
        ns_window.setBackgroundColor(Some(&NSColor::clearColor()));

        layer.setCornerRadius(corner_radius(is_fullscreen));
        layer.setMasksToBounds(true);

        // The drop shadow is cached against the old square silhouette; without this the window
        // keeps a shadow with corners the window no longer has.
        ns_window.invalidateShadow();
    }
}

/// Re-resolve the radius after a resize from the app-owned fullscreen state.
///
/// Separate from [`apply`] because this runs on every frame of a live resize drag: it writes one
/// layer property and skips the opacity, background and shadow work, which only needs doing once
/// and whose `invalidateShadow` would otherwise force a shadow recomputation 60 times a second.
#[cfg(target_os = "macos")]
pub fn refresh(window: &tauri::Window, is_fullscreen: bool) {
    set_radius(window, corner_radius(is_fullscreen));
}

/// Update the radius for the app-controlled fullscreen mode. On macOS the undecorated window uses
/// Tauri's simple fullscreen, which intentionally is not reported by `Window::is_fullscreen()`.
#[cfg(target_os = "macos")]
pub fn set_fullscreen(window: &tauri::Window, is_fullscreen: bool) {
    set_radius(window, corner_radius(is_fullscreen));
}

#[cfg(target_os = "macos")]
fn set_radius(window: &tauri::Window, radius: f64) {
    // SAFETY: called from Tauri's window event handler and from the synchronous
    // `window_toggle_fullscreen` command, both of which run on the main thread.
    unsafe {
        if let Some((_, layer)) = content_layer(window) {
            // The guard exists to keep an ordinary resize — radius unchanged — from touching the
            // layer at all, since a write would dirty it for recompositing. It is not free:
            // reaching this point already cost the `content_layer` lookup above (three ObjC sends
            // and a redundant `setWantsLayer`). That is cheap enough at resize frequency to leave
            // alone, but it is more than the property read this comment used to claim.
            if layer.cornerRadius() != radius {
                layer.setCornerRadius(radius);
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn apply(_window: &tauri::Window) {}

#[cfg(not(target_os = "macos"))]
pub fn refresh(_window: &tauri::Window, _is_fullscreen: bool) {}

#[cfg(not(target_os = "macos"))]
pub fn set_fullscreen(_window: &tauri::Window, _is_fullscreen: bool) {}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn fullscreen_windows_are_square() {
        assert_eq!(corner_radius(true), 0.0);
    }

    #[test]
    fn windowed_corners_match_appkit() {
        assert_eq!(corner_radius(false), CORNER_RADIUS);
    }
}
