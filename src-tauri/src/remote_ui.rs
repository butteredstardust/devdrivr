//! Dev-only bridge that lets an ordinary browser drive the running app.
//!
//! `scripts/tauri-browser-stub.js` already makes <http://localhost:1420> openable in Chrome, but
//! its IPC is *faked* — every query returns canned data, so a browser session can only ever verify
//! layout. This bridge is the other half: `tauri-remote-ui` serves the built bundle over HTTP and
//! forwards `invoke`/`listen` across a WebSocket into the live native webview, so the page in the
//! browser talks to the real SQLite database, the real filesystem and the real MCP server. That
//! matters on macOS in particular, where WKWebView exposes no CDP endpoint and the native window
//! cannot be driven by Playwright at all.
//!
//! # Licensing
//!
//! `tauri-remote-ui` is **AGPL-3.0-only**. Linking it into a distributed binary would place the
//! whole of devdrivr under that copyleft, so it is an optional dependency behind the `remote-ui`
//! Cargo feature and the `compile_error!` in `lib.rs` refuses to build it in release mode. Nothing
//! that reaches a user contains it, which is also why it is not listed in the Acknowledgments tab.
//!
//! # What the browser is actually looking at
//!
//! The plugin serves static files from `bundle_path`, which defaults to the configured
//! `frontendDist` (`../dist`, relative to this crate). It cannot proxy the Vite dev server, and the
//! WebSocket has to be same-origin, so the browser cannot simply load :1420 instead. `dev:remote`
//! therefore runs `vite build --watch` alongside `tauri dev`: the native window keeps full HMR off
//! :1420 while the browser gets a rebuilt-on-save bundle a second or two behind it. Both are driving
//! the same app process either way.

use tauri::{AppHandle, Manager};
use tauri_remote_ui::{RemoteUiConfig, RemoteUiExt};

/// Fixed rather than OS-assigned so the URL is stable across restarts and can be bookmarked, and
/// so tooling does not have to scrape stdout to find out where to connect.
pub const PORT: u16 = 9090;

/// Start the bridge in the background once the app is up.
///
/// Spawned rather than awaited because `setup` is synchronous and a failure here must not take the
/// app down with it — a busy port is a nuisance during development, not a reason to refuse to boot.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let config = RemoteUiConfig::default()
            // `Localhost` is the default and is deliberately left alone: the plugin ships with no
            // authentication, authorization or TLS whatsoever, so any wider scope would hand
            // anyone on the network the ability to invoke every command the app exposes.
            .set_port(Some(PORT))
            // Without this the native window is replaced by a blocking screen while a browser is
            // connected, which defeats the point — the two views are meant to be comparable.
            .enable_application_ui();

        match app.start_remote_ui(config).await {
            Ok(()) => {
                let label = app
                    .get_webview_window("main")
                    .map(|_| "main")
                    .unwrap_or("<no main window>");
                println!("remote-ui: http://127.0.0.1:{PORT} -> window {label}");
            }
            Err(err) => eprintln!("remote-ui: failed to start on port {PORT}: {err:?}"),
        }
    });
}
