//! Fetches JSON from the TUM eat-api (https://github.com/TUM-Dev/eat-api).

use tauri::{AppHandle, State};

use crate::{
    cache::{Fetched, cached},
    http::HttpClient,
};

const BASE_URL: &str = "https://tum-dev.github.io/eat-api/";

/// Only plain relative JSON paths like `en/mensa-garching/2026/42.json` are allowed.
fn validate_path(path: &str) -> Result<(), String> {
    let valid = path.ends_with(".json")
        && !path.starts_with('/')
        && !path.contains("..")
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '/' | '.'));
    if valid {
        Ok(())
    } else {
        Err(format!("invalid eat-api path: {path}"))
    }
}

/// Returns the JSON at `path`, served from cache while it is younger than `max_age_secs`.
/// `data` is `null` when eat-api has nothing published there (404).
#[tauri::command]
pub async fn eat_api_get(
    app: AppHandle,
    client: State<'_, HttpClient>,
    path: String,
    max_age_secs: u64,
) -> Result<Fetched, String> {
    validate_path(&path)?;
    cached(&app, &format!("eat-api/{path}"), max_age_secs, || async {
        match client.get(&format!("{BASE_URL}{path}")).await? {
            Some(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|e| e.to_string()),
            None => Ok(None),
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::validate_path;

    #[test]
    fn accepts_eat_api_paths() {
        assert!(validate_path("enums/canteens.json").is_ok());
        assert!(validate_path("en/stucafe-garching/2026/42.json").is_ok());
    }

    #[test]
    fn rejects_other_paths() {
        assert!(validate_path("../secret.json").is_err());
        assert!(validate_path("/etc/passwd.json").is_err());
        assert!(validate_path("https://evil.example/x.json").is_err());
        assert!(validate_path("enums/canteens.txt").is_err());
    }
}
