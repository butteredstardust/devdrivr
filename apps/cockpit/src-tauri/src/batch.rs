//! Atomic multi-statement writes against the cockpit database.
//!
//! `tauri-plugin-sql` runs every statement through `pool.execute(...)`, acquiring a
//! connection from a multi-connection pool per statement. A JS-side `BEGIN` / writes /
//! `COMMIT` sequence therefore has no guarantee of landing on one connection, so it
//! provides no atomicity. This module owns a dedicated `max_connections(1)` pool (the
//! same approach the MCP service uses) and runs each batch inside a real sqlx
//! transaction, so a batch either fully applies or fully rolls back.

use std::path::PathBuf;

use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions},
    Executor,
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

/// A single parameterised statement in a batch.
#[derive(Debug, Deserialize)]
pub struct BatchStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

/// Lazily-opened single-connection pool used only for atomic batches.
#[derive(Default)]
pub struct BatchDb {
    pool: Mutex<Option<SqlitePool>>,
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

impl BatchDb {
    async fn pool(&self, app: &AppHandle) -> Result<SqlitePool, String> {
        let mut guard = self.pool.lock().await;
        if let Some(pool) = guard.as_ref() {
            return Ok(pool.clone());
        }

        let db_path = cockpit_db_path(app)?;
        // `create_if_missing` is deliberately omitted: the plugin owns creation and
        // migrations. If the file is absent the app has not booted far enough to write.
        let connect_options = SqliteConnectOptions::new()
            .filename(&db_path)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(std::time::Duration::from_secs(5));

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(connect_options)
            .await
            .map_err(|err| format!("Failed to open cockpit database for batch write: {err}"))?;

        *guard = Some(pool.clone());
        Ok(pool)
    }
}

/// Binds a JSON parameter to a sqlx query.
///
/// JSON has no integer/float distinction at the type level, so numbers are bound as
/// `i64` when they are integral and `f64` otherwise. Arrays and objects are bound as
/// their serialised form, matching what `tauri-plugin-sql` does for non-scalar values.
fn bind_param<'q>(
    query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: &JsonValue,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match value {
        JsonValue::Null => query.bind(Option::<String>::None),
        JsonValue::Bool(b) => query.bind(*b),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else {
                query.bind(n.as_f64().unwrap_or_default())
            }
        }
        JsonValue::String(s) => query.bind(s.clone()),
        other => query.bind(other.to_string()),
    }
}

/// Executes every statement inside one transaction on one connection.
///
/// `immediate` maps to `BEGIN IMMEDIATE`, which takes the write lock up front instead of
/// upgrading mid-transaction (used where a read-then-write ordering matters).
#[tauri::command]
pub async fn db_execute_batch(
    app: AppHandle,
    db: State<'_, BatchDb>,
    statements: Vec<BatchStatement>,
    immediate: bool,
) -> Result<(), String> {
    if statements.is_empty() {
        return Ok(());
    }

    let pool = db.pool(&app).await?;
    let mut conn = pool
        .acquire()
        .await
        .map_err(|err| format!("Failed to acquire batch connection: {err}"))?;

    conn.execute(if immediate {
        "BEGIN IMMEDIATE"
    } else {
        "BEGIN"
    })
    .await
    .map_err(|err| format!("Failed to begin batch transaction: {err}"))?;

    for statement in &statements {
        let mut query = sqlx::query(&statement.sql);
        for param in &statement.params {
            query = bind_param(query, param);
        }
        if let Err(err) = query.execute(&mut *conn).await {
            // Same connection, so the rollback is guaranteed to target this transaction.
            let rollback = conn.execute("ROLLBACK").await;
            if let Err(rollback_err) = rollback {
                return Err(format!(
                    "Batch statement failed ({err}); rollback also failed ({rollback_err})"
                ));
            }
            return Err(format!("Batch statement failed: {err}"));
        }
    }

    conn.execute("COMMIT")
        .await
        .map_err(|err| format!("Failed to commit batch transaction: {err}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialises_statements_with_default_params() {
        let parsed: Vec<BatchStatement> =
            serde_json::from_str(r#"[{"sql":"DELETE FROM notes"}]"#).expect("valid payload");
        assert_eq!(parsed.len(), 1);
        assert!(parsed[0].params.is_empty());
    }

    #[test]
    fn deserialises_mixed_scalar_params() {
        let parsed: Vec<BatchStatement> = serde_json::from_str(
            r#"[{"sql":"UPDATE notes SET sort_order = $1 WHERE id = $2","params":[1024,"a"]}]"#,
        )
        .expect("valid payload");
        assert_eq!(parsed[0].params.len(), 2);
        assert!(parsed[0].params[0].is_number());
        assert!(parsed[0].params[1].is_string());
    }
}
