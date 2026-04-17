mod service;
mod types;

use std::{io::ErrorKind, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::get,
    Router,
};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, RwLock};
use tokio_util::sync::CancellationToken;

use service::CockpitMcpService;
pub use types::{McpSettings, McpStatus};

type SharedSettings = Arc<RwLock<McpSettings>>;

pub struct McpManager {
    running: Mutex<Option<RunningMcp>>,
}

impl Default for McpManager {
    fn default() -> Self {
        Self {
            running: Mutex::new(None),
        }
    }
}

struct RunningMcp {
    settings: SharedSettings,
    status: McpStatus,
    cancellation: CancellationToken,
    handle: tokio::task::JoinHandle<()>,
    last_error: Arc<RwLock<Option<String>>>,
}

fn status_for(settings: &McpSettings, running: bool, last_error: Option<String>) -> McpStatus {
    McpStatus {
        running,
        host: settings.host.clone(),
        port: settings.port,
        url: format!("http://{}:{}/mcp", settings.host, settings.port),
        last_error,
    }
}

fn cockpit_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("Failed to resolve app config directory: {err}"))?;
    std::fs::create_dir_all(&app_config_dir)
        .map_err(|err| format!("Failed to create app config directory: {err}"))?;
    Ok(app_config_dir.join("cockpit.db"))
}

async fn shutdown_running(running: RunningMcp) {
    running.cancellation.cancel();
    let abort_handle = running.handle.abort_handle();
    if tokio::time::timeout(Duration::from_millis(750), running.handle)
        .await
        .is_err()
    {
        abort_handle.abort();
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
}

async fn auth_middleware(
    State(settings): State<SharedSettings>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let expected = settings.read().await.api_key.clone();
    match extract_bearer_token(&headers) {
        Some(token) if token == expected => Ok(next.run(request).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

async fn health() -> &'static str {
    "OK"
}

async fn bind_listener_with_retries(
    addr: SocketAddr,
) -> Result<tokio::net::TcpListener, std::io::Error> {
    let mut last_error = None;
    for _ in 0..10 {
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => return Ok(listener),
            Err(err) if err.kind() == ErrorKind::AddrInUse => {
                last_error = Some(err);
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(err) => return Err(err),
        }
    }
    Err(last_error.expect("address-in-use retry loop must store an error"))
}

async fn start_server(
    app: AppHandle,
    manager: &McpManager,
    settings: McpSettings,
) -> Result<McpStatus, String> {
    if settings.host != "127.0.0.1" {
        return Err("MCP server only supports 127.0.0.1 for the MVP".to_string());
    }
    if settings.api_key.trim().is_empty() {
        return Err("MCP API key is required".to_string());
    }

    let mut guard = manager.running.lock().await;
    if guard
        .as_ref()
        .is_some_and(|running| running.handle.is_finished())
    {
        *guard = None;
    }
    if let Some(running) = guard.as_mut() {
        if running.status.host == settings.host && running.status.port == settings.port {
            *running.settings.write().await = settings.clone();
            running.status = status_for(&settings, true, running.last_error.read().await.clone());
            return Ok(running.status.clone());
        }
    }
    if let Some(running) = guard.take() {
        shutdown_running(running).await;
    }

    let db_path = cockpit_db_path(&app)?;
    let connect_options = SqliteConnectOptions::new()
        .filename(db_path)
        .journal_mode(SqliteJournalMode::Wal)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await
        .map_err(|err| format!("Failed to connect MCP to cockpit database: {err}"))?;

    let addr: SocketAddr = format!("{}:{}", settings.host, settings.port)
        .parse()
        .map_err(|err| format!("Invalid MCP bind address: {err}"))?;
    let listener = bind_listener_with_retries(addr)
        .await
        .map_err(|err| format!("Failed to bind MCP server on {addr}: {err}"))?;

    let shared_settings = Arc::new(RwLock::new(settings.clone()));
    let cancellation = CancellationToken::new();
    let last_error = Arc::new(RwLock::new(None));
    let service_settings = shared_settings.clone();
    let service_app = app.clone();
    let mcp_service = StreamableHttpService::new(
        move || {
            Ok(CockpitMcpService::new(
                pool.clone(),
                service_settings.clone(),
                service_app.clone(),
            ))
        },
        LocalSessionManager::default().into(),
        StreamableHttpServerConfig {
            cancellation_token: cancellation.child_token(),
            ..StreamableHttpServerConfig::default()
        },
    );

    let router = Router::new()
        .route("/health", get(health))
        .nest_service("/mcp", mcp_service)
        .layer(middleware::from_fn_with_state(
            shared_settings.clone(),
            auth_middleware,
        ));

    let shutdown = cancellation.clone();
    let error_slot = last_error.clone();
    let handle = tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                shutdown.cancelled().await;
            })
            .await
        {
            *error_slot.write().await = Some(err.to_string());
        }
    });

    let status = status_for(&settings, true, None);
    *guard = Some(RunningMcp {
        settings: shared_settings,
        status: status.clone(),
        cancellation,
        handle,
        last_error,
    });
    Ok(status)
}

#[tauri::command]
pub async fn mcp_start(
    app: AppHandle,
    manager: tauri::State<'_, McpManager>,
    settings: McpSettings,
) -> Result<McpStatus, String> {
    start_server(app, &manager, settings).await
}

#[tauri::command]
pub async fn mcp_stop(
    manager: tauri::State<'_, McpManager>,
    settings: McpSettings,
) -> Result<McpStatus, String> {
    let mut guard = manager.running.lock().await;
    if let Some(running) = guard.take() {
        shutdown_running(running).await;
    }
    Ok(status_for(&settings, false, None))
}

#[tauri::command]
pub async fn mcp_restart(
    app: AppHandle,
    manager: tauri::State<'_, McpManager>,
    settings: McpSettings,
) -> Result<McpStatus, String> {
    {
        let mut guard = manager.running.lock().await;
        if let Some(running) = guard.take() {
            shutdown_running(running).await;
        }
    }
    start_server(app, &manager, settings).await
}

#[tauri::command]
pub async fn mcp_apply_settings(
    app: AppHandle,
    manager: tauri::State<'_, McpManager>,
    settings: McpSettings,
) -> Result<McpStatus, String> {
    if settings.enabled {
        start_server(app, &manager, settings).await
    } else {
        mcp_stop(manager, settings).await
    }
}

#[tauri::command]
pub async fn mcp_status(
    manager: tauri::State<'_, McpManager>,
    settings: McpSettings,
) -> Result<McpStatus, String> {
    let mut guard = manager.running.lock().await;
    if guard
        .as_ref()
        .is_some_and(|running| running.handle.is_finished())
    {
        if let Some(running) = guard.take() {
            let current = running.settings.read().await.clone();
            let last_error = running
                .last_error
                .read()
                .await
                .clone()
                .or_else(|| Some("MCP server stopped unexpectedly".to_string()));
            return Ok(status_for(&current, false, last_error));
        }
    }
    if let Some(running) = guard.as_ref() {
        let last_error = running.last_error.read().await.clone();
        let current = running.settings.read().await.clone();
        return Ok(status_for(&current, true, last_error));
    }
    Ok(status_for(&settings, false, None))
}

#[tauri::command]
pub fn mcp_rotate_key() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
