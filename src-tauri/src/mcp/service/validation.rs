use rmcp::ErrorData as McpError;
use serde_json::{json, Value};
use uuid::Uuid;

use super::{
    auth_field, header_text, invalid_api_auth, invalid_api_headers, invalid_argument,
    invalid_prompt_variables, unknown_help_topic, SnippetFragmentInput, BODY_MODES, HELP_TOPICS,
    HTTP_METHODS,
};

pub(super) fn normalize_snippet_fragments(
    fragments: Option<Vec<SnippetFragmentInput>>,
    legacy_content: Option<String>,
    legacy_language: Option<String>,
) -> std::result::Result<Vec<(String, String, String, String)>, McpError> {
    let Some(fragments) = fragments else {
        return Ok(vec![(
            Uuid::new_v4().to_string(),
            "main".to_string(),
            legacy_content.unwrap_or_default(),
            legacy_language.unwrap_or_else(|| "text".to_string()),
        )]);
    };
    if fragments.is_empty() || fragments.len() > 100 {
        return Err(invalid_argument(
            "fragments",
            "A snippet must contain between 1 and 100 fragments",
            &["Supply at least one fragment and no more than 100"],
        ));
    }
    // A caller may send the IDs it read back, so an update keeps fragment identity. Two
    // fragments carrying one ID would write a single row and drop the other without a word.
    let mut seen_ids = std::collections::HashSet::new();
    fragments
        .into_iter()
        .enumerate()
        .map(|(index, fragment)| {
            let name = fragment.name.trim().to_string();
            if name.is_empty() {
                return Err(invalid_argument(
                    "fragments",
                    format!("Fragment {} has an empty name", index + 1),
                    &["Give every fragment a readable name"],
                ));
            }
            let id = fragment
                .id
                .map(|id| id.trim().to_string())
                .filter(|id| !id.is_empty())
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            if !seen_ids.insert(id.clone()) {
                return Err(invalid_argument(
                    "fragments",
                    format!("Fragment {} repeats the id `{id}`", index + 1),
                    &[
                        "Give every fragment its own id",
                        "Omit `id` to have devdrivr assign one",
                    ],
                ));
            }
            Ok((
                id,
                name,
                fragment.content,
                fragment.language.unwrap_or_else(|| "text".to_string()),
            ))
        })
        .collect()
}

pub(super) fn validate_default_language(
    kind: &str,
    supplied: bool,
) -> std::result::Result<(), McpError> {
    if kind != "snippets" && supplied {
        return Err(invalid_argument(
            "defaultLanguage",
            "defaultLanguage is supported only for snippet folders",
            &["Omit defaultLanguage for notes and apiRequests folders"],
        ));
    }
    Ok(())
}

pub(super) fn validate_task_status(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "todo" | "in_progress" | "done" | "blocked" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "taskStatus",
            format!("Unsupported task status: {value}"),
            &["Use one of: todo, in_progress, done, blocked"],
        )),
    }
}

pub(super) fn validate_task_priority(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "low" | "medium" | "high" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "taskPriority",
            format!("Unsupported task priority: {value}"),
            &["Use one of: low, medium, high"],
        )),
    }
}

/// WARNING: Notes skips any row whose colour falls outside this set, so an unchecked write makes
/// an import look successful while the note never appears in the tool.
pub(super) fn validate_note_color(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "yellow" | "green" | "blue" | "pink" | "purple" | "orange" | "red" | "gray" => {
            Ok(value.to_string())
        }
        _ => Err(invalid_argument(
            "color",
            format!("Unsupported note color: {value}"),
            &["Use one of: yellow, green, blue, pink, purple, orange, red, gray"],
        )),
    }
}

/// WARNING: Prompt Templates skips any row whose category falls outside this set, so an unchecked
/// write makes an import look successful while the template never appears in the tool.
pub(super) fn validate_template_category(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "code-review" | "refactoring" | "testing" | "docs" | "debugging" | "learning"
        | "productivity" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "category",
            format!("Unsupported template category: {value}"),
            &[
                "Use one of: code-review, refactoring, testing, docs, debugging, learning, productivity",
            ],
        )),
    }
}

/// WARNING: Prompt Templates skips any row whose target falls outside this set. See
/// [`validate_template_category`].
pub(super) fn validate_template_optimized_for(
    value: &str,
) -> std::result::Result<String, McpError> {
    match value {
        "Claude" | "ChatGPT" | "Cursor" | "Generic" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "optimizedFor",
            format!("Unsupported template target: {value}"),
            &["Use one of: Claude, ChatGPT, Cursor, Generic"],
        )),
    }
}

pub(super) fn validate_task_due_date(value: &str) -> std::result::Result<String, McpError> {
    let parts = value
        .split('-')
        .map(str::parse::<u32>)
        .collect::<std::result::Result<Vec<_>, _>>();
    let valid = parts.ok().is_some_and(|parts| {
        if parts.len() != 3 || value.len() != 10 {
            return false;
        }
        let (year, month, day) = (parts[0], parts[1], parts[2]);
        let leap =
            year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
        let days = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 if leap => 29,
            2 => 28,
            _ => return false,
        };
        day > 0 && day <= days
    });
    if !valid {
        return Err(invalid_argument(
            "taskDueDate",
            format!("Invalid local calendar date: {value}"),
            &["Use a real date in YYYY-MM-DD form"],
        ));
    }
    Ok(value.to_string())
}

pub(super) fn normalize_api_header_entry(entry: Value) -> std::result::Result<Value, McpError> {
    let Value::Object(obj) = entry else {
        return Err(invalid_api_headers(
            "Every header must be an object with key and value",
        ));
    };
    let key = obj
        .get("key")
        .or_else(|| obj.get("name"))
        .and_then(header_text)
        .ok_or_else(|| invalid_api_headers("Every header needs a key"))?;
    let value = obj
        .get("value")
        .map_or_else(|| Some(String::new()), header_text)
        .ok_or_else(|| invalid_api_headers(format!("Header {key} needs a text value")))?;
    // Reject rather than default. A client sending 0 for a disabled header would otherwise have
    // that header quietly switched on.
    let enabled = match obj.get("enabled") {
        None | Some(Value::Null) => true,
        Some(Value::Bool(flag)) => *flag,
        Some(_) => {
            return Err(invalid_api_headers(format!(
                "Header {key} needs enabled as true or false"
            )))
        }
    };
    Ok(json!({ "key": key, "value": value, "enabled": enabled }))
}

/// Accept a method the API Client can send.
///
/// A free-text method reached the database and opened a request the tool could not run.
pub(super) fn validate_http_method(value: &str) -> std::result::Result<String, McpError> {
    let method = value.trim().to_uppercase();
    if HTTP_METHODS.contains(&method.as_str()) {
        return Ok(method);
    }
    Err(invalid_argument(
        "method",
        format!("`{value}` is not a supported HTTP method"),
        &["Use one of GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS"],
    ))
}

/// Accept a body mode the API Client can render.
pub(super) fn validate_body_mode(value: &str) -> std::result::Result<String, McpError> {
    let mode = value.trim().to_lowercase();
    if BODY_MODES.contains(&mode.as_str()) {
        return Ok(mode);
    }
    Err(invalid_argument(
        "bodyMode",
        format!("`{value}` is not a supported body mode"),
        &["Use one of json, text, urlencoded, formdata, none"],
    ))
}

/// Reject a required string that carries no content.
///
/// A record named `"   "` is unreachable in the sidebar, because it renders as an empty row.
pub(super) fn require_non_blank(
    argument: &str,
    value: &str,
) -> std::result::Result<String, McpError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(invalid_argument(
            argument,
            format!("`{argument}` must not be blank"),
            &["Supply a value with at least one non-space character"],
        ));
    }
    Ok(trimmed.to_string())
}

pub(super) fn normalize_api_headers(
    headers: Option<Value>,
) -> std::result::Result<String, McpError> {
    let entries = match headers {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items
            .into_iter()
            .map(normalize_api_header_entry)
            .collect::<std::result::Result<Vec<_>, _>>()?,
        Some(Value::Object(map)) => map
            .into_iter()
            .map(|(key, value)| {
                let value = header_text(&value).ok_or_else(|| {
                    invalid_api_headers(format!("Header {key} needs a text value"))
                })?;
                Ok(json!({ "key": key, "value": value, "enabled": true }))
            })
            .collect::<std::result::Result<Vec<_>, McpError>>()?,
        Some(_) => {
            return Err(invalid_api_headers(
                "Headers must be an array of header objects or a header map",
            ))
        }
    };
    Ok(serde_json::to_string(&Value::Array(entries)).unwrap_or_else(|_| "[]".to_string()))
}

pub(super) fn normalize_prompt_variable(variable: Value) -> std::result::Result<Value, McpError> {
    let Value::Object(obj) = variable else {
        return Err(invalid_prompt_variables(
            "Every variable must be an object with a name",
        ));
    };
    let name = obj
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid_prompt_variables("Every variable needs a non-empty name"))?
        .to_string();
    let label = obj
        .get("label")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map_or_else(|| name.clone(), str::to_string);
    let variable_type = obj.get("type").and_then(Value::as_str).unwrap_or("text");
    if !matches!(variable_type, "text" | "textarea" | "select") {
        return Err(invalid_prompt_variables(format!(
            "Variable {name} has unsupported type {variable_type}"
        )));
    }

    let mut normalized = serde_json::Map::new();
    normalized.insert("name".to_string(), Value::String(name.clone()));
    normalized.insert("label".to_string(), Value::String(label));
    normalized.insert("type".to_string(), Value::String(variable_type.to_string()));

    let options: Vec<Value> = match obj.get("options") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => {
            // Reject before dropping blanks. Filtering a Result stream would swallow the error a
            // non-string option raises and store the rest as if the import had been clean.
            let mut options = Vec::new();
            for item in items {
                let option = item.as_str().map(str::trim).ok_or_else(|| {
                    invalid_prompt_variables(format!("Variable {name} needs text options"))
                })?;
                if !option.is_empty() {
                    options.push(Value::String(option.to_string()));
                }
            }
            options
        }
        Some(_) => {
            return Err(invalid_prompt_variables(format!(
                "Variable {name} needs options as an array of strings"
            )))
        }
    };
    if variable_type == "select" && options.is_empty() {
        return Err(invalid_prompt_variables(format!(
            "Select variable {name} needs at least one option"
        )));
    }
    if !options.is_empty() {
        normalized.insert("options".to_string(), Value::Array(options));
    }

    if let Some(placeholder) = obj.get("placeholder").and_then(Value::as_str) {
        if !placeholder.is_empty() {
            normalized.insert(
                "placeholder".to_string(),
                Value::String(placeholder.to_string()),
            );
        }
    }
    if let Some(required) = obj.get("required").and_then(Value::as_bool) {
        normalized.insert("required".to_string(), Value::Bool(required));
    }
    Ok(Value::Object(normalized))
}

/// WARNING: Prompt Templates drops any stored variable it cannot recognise, so an unchecked write
/// makes an import look successful while the template loses every field the user must fill.
///
/// Apply the rules the tool's own import applies, and reject what it would reject.
pub(super) fn normalize_prompt_variables(
    variables: Option<Value>,
) -> std::result::Result<String, McpError> {
    let normalized = match variables {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items
            .into_iter()
            .map(normalize_prompt_variable)
            .collect::<std::result::Result<Vec<_>, _>>()?,
        Some(_) => return Err(invalid_prompt_variables("Variables must be an array")),
    };
    Ok(serde_json::to_string(&Value::Array(normalized)).unwrap_or_else(|_| "[]".to_string()))
}

/// WARNING: The API Client reads `auth` as a tagged union and sends the named credential on every
/// request. An unknown shape would silently drop the credential, so reject it at the write.
pub(super) fn normalize_api_auth(auth: Value) -> std::result::Result<String, McpError> {
    let Value::Object(obj) = auth else {
        return Err(invalid_api_auth("Auth must be an object with a type field"));
    };
    let normalized = match obj.get("type").and_then(Value::as_str) {
        None => return Err(invalid_api_auth("Auth needs a type field")),
        Some("none") => json!({ "type": "none" }),
        Some("bearer") => json!({ "type": "bearer", "token": auth_field(&obj, "token")? }),
        Some("basic") => json!({
            "type": "basic",
            "username": auth_field(&obj, "username")?,
            "password": auth_field(&obj, "password")?,
        }),
        Some(other) => {
            return Err(invalid_api_auth(format!("Unsupported auth type {other}")));
        }
    };
    Ok(serde_json::to_string(&normalized).unwrap_or_else(|_| r#"{"type":"none"}"#.to_string()))
}

pub(super) fn normalize_tags(tags: Option<Vec<String>>) -> Vec<String> {
    tags.unwrap_or_default()
        .into_iter()
        .map(|tag| tag.trim().to_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect()
}

pub(super) fn normalize_help_topic(
    topic: Option<&str>,
) -> std::result::Result<&'static str, McpError> {
    let topic = topic
        .map(str::trim)
        .filter(|topic| !topic.is_empty())
        .unwrap_or("overview")
        .to_ascii_lowercase();
    HELP_TOPICS
        .iter()
        .copied()
        .find(|known_topic| *known_topic == topic)
        .ok_or_else(|| unknown_help_topic(&topic))
}

#[cfg(test)]
mod tests {
    use super::super::parse_json;

    use super::*;

    #[test]
    fn task_metadata_validation_rejects_invalid_values_and_dates() {
        assert!(validate_task_status("blocked").is_ok());
        assert!(validate_task_priority("high").is_ok());
        assert!(validate_task_due_date("2024-02-29").is_ok());
        assert!(validate_task_status("waiting").is_err());
        assert!(validate_task_priority("urgent").is_err());
        assert!(validate_task_due_date("2026-02-29").is_err());
        assert!(validate_task_due_date("2026-9-8").is_err());
    }

    #[test]
    fn snippet_fragments_preserve_order_and_require_readable_names() {
        let fragments = normalize_snippet_fragments(
            Some(vec![
                SnippetFragmentInput {
                    id: Some("client".to_string()),
                    name: "client.ts".to_string(),
                    content: "fetch(url)".to_string(),
                    language: Some("typescript".to_string()),
                },
                SnippetFragmentInput {
                    id: Some("styles".to_string()),
                    name: "styles.css".to_string(),
                    content: ".root {}".to_string(),
                    language: Some("css".to_string()),
                },
            ]),
            None,
            None,
        )
        .expect("valid fragments");

        assert_eq!(fragments[0].0, "client");
        assert_eq!(fragments[1].1, "styles.css");
        assert!(normalize_snippet_fragments(Some(Vec::new()), None, None).is_err());
        assert!(normalize_snippet_fragments(
            Some(vec![SnippetFragmentInput {
                id: None,
                name: "  ".to_string(),
                content: String::new(),
                language: None,
            }]),
            None,
            None,
        )
        .is_err());
    }

    #[test]
    fn note_color_accepts_only_values_the_tool_can_load() {
        assert_eq!(validate_note_color("purple").expect("purple"), "purple");
        assert!(validate_note_color("teal").is_err());
        assert!(validate_note_color("Yellow").is_err());
        assert!(validate_note_color("#ffcc00").is_err());
    }

    #[test]
    fn template_enums_accept_only_values_the_tool_can_load() {
        assert_eq!(validate_template_category("docs").expect("docs"), "docs");
        assert_eq!(
            validate_template_optimized_for("Claude").expect("Claude"),
            "Claude"
        );
        assert!(validate_template_category("general").is_err());
        assert!(validate_template_category("Docs").is_err());
        assert!(validate_template_optimized_for("GPT-4").is_err());
        assert!(validate_template_optimized_for("claude").is_err());
    }

    #[test]
    fn prompt_variables_normalize_to_the_shape_the_tool_renders() {
        let normalized = normalize_prompt_variables(Some(json!([
            { "name": " code ", "type": "textarea", "required": true },
            { "name": "lang", "label": "Language", "type": "select", "options": ["ts", " ", "rs"] },
        ])))
        .expect("normalize");

        assert_eq!(
            parse_json(&normalized, json!([])),
            json!([
                { "name": "code", "label": "code", "type": "textarea", "required": true },
                { "name": "lang", "label": "Language", "type": "select", "options": ["ts", "rs"] },
            ])
        );
        assert_eq!(normalize_prompt_variables(None).expect("absent"), "[]");
    }

    #[test]
    fn prompt_variables_reject_what_the_tool_would_discard() {
        assert!(normalize_prompt_variables(Some(json!({ "code": "text" }))).is_err());
        assert!(normalize_prompt_variables(Some(json!([{ "label": "No name" }]))).is_err());
        assert!(
            normalize_prompt_variables(Some(json!([{ "name": "x", "type": "date" }]))).is_err()
        );
        assert!(
            normalize_prompt_variables(Some(json!([{ "name": "x", "type": "select" }]))).is_err()
        );
        assert!(normalize_prompt_variables(Some(
            json!([{ "name": "x", "type": "select", "options": [" "] }])
        ))
        .is_err());
    }

    #[test]
    fn prompt_variables_reject_a_non_text_option_instead_of_dropping_it() {
        assert!(normalize_prompt_variables(Some(
            json!([{ "name": "lang", "type": "select", "options": ["ts", 42] }])
        ))
        .is_err());
    }

    #[test]
    fn api_headers_normalize_arrays_maps_and_missing_values() {
        let from_array = normalize_api_headers(Some(json!([
            { "key": "Accept", "value": "application/json" },
            { "key": "X-Trace", "value": "abc", "enabled": false },
        ])))
        .expect("array");
        assert_eq!(
            parse_json(&from_array, json!([])),
            json!([
                { "key": "Accept", "value": "application/json", "enabled": true },
                { "key": "X-Trace", "value": "abc", "enabled": false },
            ])
        );

        let from_map =
            normalize_api_headers(Some(json!({ "Accept": "application/json" }))).expect("map");
        assert_eq!(
            parse_json(&from_map, json!([])),
            json!([{ "key": "Accept", "value": "application/json", "enabled": true }])
        );

        assert_eq!(normalize_api_headers(None).expect("absent"), "[]");
        assert_eq!(
            normalize_api_headers(Some(json!(null))).expect("null"),
            "[]"
        );
    }

    #[test]
    fn api_headers_reject_shapes_the_api_client_cannot_render() {
        assert!(normalize_api_headers(Some(json!("Accept: application/json"))).is_err());
        assert!(normalize_api_headers(Some(json!([{ "value": "no-key" }]))).is_err());
        assert!(normalize_api_headers(Some(json!([{ "key": "Accept", "value": ["a"] }]))).is_err());
        assert!(normalize_api_headers(Some(json!({ "Accept": { "nested": true } }))).is_err());
    }

    #[test]
    fn api_headers_reject_a_non_boolean_enabled_rather_than_switching_it_on() {
        assert!(
            normalize_api_headers(Some(json!([{ "key": "A", "value": "b", "enabled": 0 }])))
                .is_err()
        );
        assert!(normalize_api_headers(Some(
            json!([{ "key": "A", "value": "b", "enabled": "false" }])
        ))
        .is_err());
    }

    #[test]
    fn api_auth_normalizes_each_supported_type_and_rejects_the_rest() {
        assert_eq!(
            parse_json(
                &normalize_api_auth(json!({ "type": "none" })).expect("none"),
                json!({})
            ),
            json!({ "type": "none" })
        );
        assert_eq!(
            parse_json(
                &normalize_api_auth(json!({ "type": "bearer", "token": "t" })).expect("bearer"),
                json!({})
            ),
            json!({ "type": "bearer", "token": "t" })
        );
        // Unknown keys are dropped so the stored row matches the ApiRequestAuth union exactly.
        assert_eq!(
            parse_json(
                &normalize_api_auth(
                    json!({ "type": "basic", "username": "u", "password": "p", "realm": "x" })
                )
                .expect("basic"),
                json!({})
            ),
            json!({ "type": "basic", "username": "u", "password": "p" })
        );

        assert!(normalize_api_auth(json!("bearer")).is_err());
        assert!(normalize_api_auth(json!({ "token": "t" })).is_err());
        assert!(normalize_api_auth(json!({ "type": "oauth2" })).is_err());
    }

    #[test]
    fn api_auth_rejects_a_credential_it_would_otherwise_erase() {
        assert!(normalize_api_auth(json!({ "type": "bearer", "token": 12345 })).is_err());
        assert!(
            normalize_api_auth(json!({ "type": "basic", "username": "u", "password": 1 })).is_err()
        );
        // An absent credential is still allowed, and reads as empty.
        assert_eq!(
            parse_json(
                &normalize_api_auth(json!({ "type": "bearer" })).expect("absent token"),
                json!({})
            ),
            json!({ "type": "bearer", "token": "" })
        );
    }
}
