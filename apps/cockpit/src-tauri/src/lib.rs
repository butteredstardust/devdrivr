mod batch;
mod mcp;
#[cfg(feature = "remote-ui")]
mod remote_ui;
mod window_commands;
mod window_corners;

// The bridge pulls in an AGPL-3.0-only crate. Making this a hard build failure rather than a note
// in a README means a shipped binary cannot acquire that copyleft by way of someone typing
// `--features remote-ui` out of habit, or a CI job inheriting the flag from a shell profile.
#[cfg(all(feature = "remote-ui", not(debug_assertions)))]
compile_error!(
    "the `remote-ui` feature is dev-only: tauri-remote-ui is AGPL-3.0-only and must never be \
     linked into a release build. Use `bun run dev:remote`."
);

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn get_platform_info() -> (String, String) {
    (
        std::env::consts::OS.to_string(),
        std::env::consts::ARCH.to_string(),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add api client tables",
            sql: include_str!("../migrations/002_api_client.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add note tags column",
            sql: include_str!("../migrations/003_notes_tags.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add history metadata columns",
            sql: include_str!("../migrations/004_history_metadata.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add snippets folder column",
            sql: include_str!("../migrations/005_snippets_folder.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add user prompt templates table",
            sql: include_str!("../migrations/006_prompt_templates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add prompt template authors",
            sql: include_str!("../migrations/007_prompt_template_authors.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add notes sort order",
            sql: include_str!("../migrations/008_notes_sort_order.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "backfill nullable persistence columns",
            sql: include_str!("../migrations/009_persistence_backfills.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add API history response snapshots",
            sql: include_str!("../migrations/011_api_history_response.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add snippet favorites",
            sql: include_str!("../migrations/012_snippets_favorite.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let builder = tauri::Builder::default();

    #[cfg(feature = "remote-ui")]
    let builder = builder.plugin(tauri_remote_ui::init());

    builder
        .setup(|app| {
            for window in app.webview_windows().values() {
                window_corners::apply(&window.as_ref().window_ref());
            }
            #[cfg(feature = "remote-ui")]
            remote_ui::start(app.handle());
            Ok(())
        })
        // The radius depends on whether the window is fullscreen, and entering or leaving
        // fullscreen always resizes. Matched on the resize event rather than a dedicated
        // fullscreen hook because Tauri does not emit one.
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                window_corners::refresh(window);
            }
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:cockpit.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        // Links rendered inside the app (Markdown preview, docs, notes) must leave for the user's
        // browser rather than navigate this webview: there is no back button, so following one
        // in-place strands the user on a web page with the app gone.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(mcp::McpManager::default())
        .manage(batch::BatchDb::default())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            window_commands::window_close,
            window_commands::window_focus,
            window_commands::window_is_maximized,
            window_commands::window_minimize,
            window_commands::window_start_resize,
            window_commands::window_toggle_maximize,
            batch::db_execute_batch,
            mcp::mcp_apply_settings,
            mcp::mcp_rotate_key,
            mcp::mcp_restart,
            mcp::mcp_start,
            mcp::mcp_status,
            mcp::mcp_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
