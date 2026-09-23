//! Rules for saved API request fields: auth redaction, methods and body modes.

use super::*;

pub(super) const REDACTED_AUTH_VALUE: &str = "***REDACTED***";

pub(super) fn redacted_auth(auth: Value, expose: bool) -> Value {
    if expose {
        return auth;
    }
    match auth {
        Value::Object(mut obj) => {
            match obj.get("type").and_then(Value::as_str) {
                Some("bearer") => {
                    obj.insert("__devdrivrRedacted".to_string(), Value::Bool(true));
                    obj.insert(
                        "token".to_string(),
                        Value::String(REDACTED_AUTH_VALUE.to_string()),
                    );
                }
                Some("basic") => {
                    obj.insert("__devdrivrRedacted".to_string(), Value::Bool(true));
                    obj.insert(
                        "password".to_string(),
                        Value::String(REDACTED_AUTH_VALUE.to_string()),
                    );
                }
                _ => {}
            }
            Value::Object(obj)
        }
        other => other,
    }
}

pub(super) fn strip_redaction_marker(auth: Value) -> Value {
    match auth {
        Value::Object(mut obj) => {
            obj.remove("__devdrivrRedacted");
            Value::Object(obj)
        }
        other => other,
    }
}

/// Reads a header key or value that an MCP client sent as a JSON scalar.
pub(super) fn header_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

/// The methods the API Client offers. Kept in step with `METHODS` in
/// `src/tools/api-client/request-model.ts`.
pub(super) const HTTP_METHODS: [&str; 7] =
    ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/// The methods that carry a body. Kept in step with `BODY_METHODS` in the same file.
pub(super) const BODY_METHODS: [&str; 5] = ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/// The body modes the API Client offers. Kept in step with `BODY_MODE_IDS` in
/// `src/lib/api-import.ts`.
pub(super) const BODY_MODES: [&str; 5] = ["json", "text", "urlencoded", "formdata", "none"];

/// Settle the body mode against the method, the way the API Client does when the method changes.
///
/// A GET with `bodyMode: "json"` shows a body editor for a body that is never sent.
pub(super) fn body_mode_for_method(method: &str, mode: Option<String>) -> String {
    if !BODY_METHODS.contains(&method) {
        return "none".to_string();
    }
    mode.unwrap_or_else(|| "json".to_string())
}

/// Reject rather than default. Erasing a credential the client did send would report a successful
/// write for a request that can no longer authenticate.
pub(super) fn auth_field(
    obj: &serde_json::Map<String, Value>,
    field: &str,
) -> std::result::Result<String, McpError> {
    match obj.get(field) {
        None | Some(Value::Null) => Ok(String::new()),
        Some(Value::String(text)) => Ok(text.clone()),
        Some(_) => Err(invalid_api_auth(format!("Auth field {field} must be text"))),
    }
}

pub(super) fn resolve_auth_update(incoming: Value, current_auth: &str) -> String {
    let mut incoming_obj = match incoming {
        Value::Object(obj) => obj,
        other => return serde_json::to_string(&other).unwrap_or_else(|_| current_auth.to_string()),
    };

    let redacted = incoming_obj
        .remove("__devdrivrRedacted")
        .and_then(|value| value.as_bool())
        == Some(true);

    if redacted {
        if let Ok(Value::Object(current_obj)) = serde_json::from_str::<Value>(current_auth) {
            match incoming_obj.get("type").and_then(Value::as_str) {
                Some("bearer")
                    if incoming_obj
                        .get("token")
                        .and_then(Value::as_str)
                        .is_some_and(|value| value == REDACTED_AUTH_VALUE) =>
                {
                    if let Some(token) = current_obj.get("token") {
                        incoming_obj.insert("token".to_string(), token.clone());
                    }
                }
                Some("basic")
                    if incoming_obj
                        .get("password")
                        .and_then(Value::as_str)
                        .is_some_and(|value| value == REDACTED_AUTH_VALUE) =>
                {
                    if let Some(password) = current_obj.get("password") {
                        incoming_obj.insert("password".to_string(), password.clone());
                    }
                }
                _ => {}
            }
        }
    }

    serde_json::to_string(&Value::Object(incoming_obj)).unwrap_or_else(|_| current_auth.to_string())
}
