mod batch;
mod mcp;
mod note_assets;
mod opened_files;
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
        Migration {
            version: 13,
            description: "add shared resource folders",
            sql: include_str!("../migrations/013_resource_folders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add durable trash",
            sql: include_str!("../migrations/014_durable_trash.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add structured note tasks",
            sql: include_str!("../migrations/015_note_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "add stable note link index",
            sql: include_str!("../migrations/016_note_links.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add snippet fragments and descriptions",
            sql: include_str!("../migrations/017_snippet_fragments.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let builder = tauri::Builder::default();

    // Registered before every other plugin, as the plugin requires. On Windows and Linux a second
    // "Open With" launches a second process; without this the user gets a second devdrivr window
    // instead of the file appearing in the one already open.
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        if let Some(window) = app.webview_windows().values().next() {
            let _ = window.set_focus();
        }
        opened_files::accept(app, opened_files::paths_from_args(argv));
    }));

    #[cfg(feature = "remote-ui")]
    let builder = builder.plugin(tauri_remote_ui::init());

    builder
        .setup(|app| {
            for window in app.webview_windows().values() {
                window_corners::apply(&window.as_ref().window_ref());
            }
            // Windows and Linux deliver the launch path here. macOS uses `RunEvent::Opened` below.
            opened_files::accept(
                app.handle(),
                opened_files::paths_from_args(std::env::args()),
            );
            #[cfg(feature = "remote-ui")]
            remote_ui::start(app.handle());
            Ok(())
        })
        // The radius depends on whether the window is fullscreen, and entering or leaving
        // fullscreen always resizes. Matched on the resize event rather than a dedicated
        // fullscreen hook because Tauri does not emit one.
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                let fullscreen = window
                    .app_handle()
                    .state::<window_commands::WindowFullscreenState>()
                    .is_fullscreen();
                window_corners::refresh(window, fullscreen);
            }
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                // Legacy filename kept deliberately so existing installations retain their data.
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
        .manage(window_commands::WindowFullscreenState::default())
        .manage(opened_files::OpenedFiles::default())
        .manage(mcp::McpManager::default())
        .manage(batch::BatchDb::default())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            window_commands::window_close,
            window_commands::window_focus,
            window_commands::window_get_state,
            window_commands::window_minimize,
            window_commands::window_start_resize,
            window_commands::window_toggle_fullscreen,
            window_commands::window_toggle_maximize,
            batch::db_execute_batch,
            mcp::mcp_apply_settings,
            mcp::mcp_rotate_key,
            mcp::mcp_restart,
            mcp::mcp_start,
            mcp::mcp_status,
            mcp::mcp_stop,
            note_assets::note_asset_import,
            note_assets::note_asset_resolve,
            note_assets::note_assets_delete_orphans,
            note_assets::note_assets_export,
            note_assets::note_assets_find_orphans,
            note_assets::note_assets_restore,
            opened_files::opened_file_read,
            opened_files::opened_files_take,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        // macOS routes an associated file through the application delegate, not through argv, and
        // does so for both a cold launch and a file opened while the app runs.
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().into_owned())
                    .collect();
                opened_files::accept(app, paths);
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app, event);
            }
        });
}
