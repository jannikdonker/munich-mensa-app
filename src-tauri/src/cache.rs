//! Disk cache for downloaded JSON, so menus stay readable offline.

use std::{fs, future::Future, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::http::{unix_now, write_file};

#[derive(Serialize, Deserialize)]
struct CacheEntry {
    fetched_at: u64,
    /// `None` records "nothing published" (e.g. a 404 for a week without a menu).
    body: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
    data: Option<Value>,
    /// Unix seconds of when `data` was downloaded.
    fetched_at: u64,
    /// True when the network failed and `data` came from an expired cache entry.
    stale: bool,
}

impl From<CacheEntry> for Fetched {
    fn from(entry: CacheEntry) -> Self {
        Self {
            data: entry.body,
            fetched_at: entry.fetched_at,
            stale: false,
        }
    }
}

fn cache_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("data");
    Ok(dir.join(key.replace('/', "__")))
}

fn read_cache(file: &PathBuf) -> Option<CacheEntry> {
    serde_json::from_slice(&fs::read(file).ok()?).ok()
}

/// Returns the cached value for `key` while it is younger than `max_age_secs`, otherwise
/// runs `fetch` and caches its result. When `fetch` fails, an older cached copy is
/// returned with `stale: true`.
pub async fn cached<F, Fut>(
    app: &AppHandle,
    key: &str,
    max_age_secs: u64,
    fetch: F,
) -> Result<Fetched, String>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<Option<Value>, String>>,
{
    let file = cache_file(app, key)?;
    let cached = match read_cache(&file) {
        Some(entry) if unix_now().saturating_sub(entry.fetched_at) < max_age_secs => {
            return Ok(entry.into());
        }
        cached => cached,
    };

    match fetch().await {
        Ok(body) => {
            let entry = CacheEntry {
                fetched_at: unix_now(),
                body,
            };
            let json = serde_json::to_vec(&entry).map_err(|e| e.to_string())?;
            if let Err(e) = write_file(&file, &json) {
                log::warn!("could not cache {key}: {e}");
            }
            Ok(entry.into())
        }
        Err(err) => match cached {
            Some(entry) => {
                log::warn!("fetching {key} failed ({err}), serving cached copy");
                Ok(Fetched {
                    stale: true,
                    ..entry.into()
                })
            }
            None => Err(err),
        },
    }
}
