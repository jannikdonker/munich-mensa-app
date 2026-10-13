//! `map_resource` command: serves the OpenFreeMap vector map (styles, TileJSON, tiles,
//! fonts, sprites) through the shared HTTP client with a disk cache, so areas you have
//! looked at keep working offline.

use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use tauri::{AppHandle, Manager, State, ipc::Response};

use crate::http::{HttpClient, write_file};

const ORIGIN: &str = "https://tiles.openfreemap.org/";
const DAY: Duration = Duration::from_secs(24 * 60 * 60);
/// Tiles, fonts and sprites live under versioned paths and never change.
const MAX_AGE_IMMUTABLE: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// Path of `url` below the OpenFreeMap origin, if it is one we are willing to fetch.
fn resource_path(url: &str) -> Option<&str> {
    let path = url.strip_prefix(ORIGIN)?;
    let valid = !path.is_empty()
        && !path.starts_with('/')
        && !path.contains("..")
        && path.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '/' | '.' | ',' | '%' | '@')
        });
    valid.then_some(path)
}

/// Styles (`styles/positron`) and the TileJSON (`planet`) have no extension and point to
/// the current tile version, so they are refreshed daily.
fn max_age(path: &str) -> Duration {
    let file_name = path.rsplit('/').next().unwrap_or(path);
    if file_name.contains('.') {
        MAX_AGE_IMMUTABLE
    } else {
        DAY
    }
}

fn cache_root(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_cache_dir().ok()?.join("map"))
}

fn is_younger_than(file: &Path, age: Duration) -> bool {
    fs::metadata(file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_some_and(|elapsed| elapsed < age)
}

#[tauri::command]
pub async fn map_resource(
    app: AppHandle,
    client: State<'_, HttpClient>,
    url: String,
) -> Result<Response, String> {
    let path = resource_path(&url).ok_or_else(|| format!("refusing to fetch {url}"))?;
    // `.bin` keeps `planet` (a file) from clashing with `planet/…` (a directory).
    let file = cache_root(&app).map(|root| root.join(format!("{path}.bin")));
    let fresh = file
        .as_deref()
        .is_some_and(|f| is_younger_than(f, max_age(path)));
    let cached = file.as_ref().and_then(|f| fs::read(f).ok());
    if fresh && let Some(bytes) = cached {
        return Ok(Response::new(bytes));
    }

    match client.get(&url).await {
        Ok(Some(bytes)) => {
            if let Some(f) = &file
                && let Err(e) = write_file(f, &bytes)
            {
                log::warn!("could not cache {path}: {e}");
            }
            Ok(Response::new(bytes))
        }
        Ok(None) => Err(format!("{url} not found")),
        Err(e) => cached.map(Response::new).ok_or(e),
    }
}

/// Deletes cached map files that have not been refreshed for a month, e.g. tiles of
/// superseded OpenFreeMap releases.
pub fn prune_cache(app: &AppHandle) {
    fn prune(dir: &Path) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                prune(&path);
                let _ = fs::remove_dir(&path); // only succeeds once empty
            } else if !is_younger_than(&path, MAX_AGE_IMMUTABLE) {
                let _ = fs::remove_file(&path);
            }
        }
    }
    if let Some(root) = cache_root(app) {
        std::thread::spawn(move || prune(&root));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_openfreemap_resources() {
        assert_eq!(
            resource_path(
                "https://tiles.openfreemap.org/planet/20261004_113936_pt/14/8710/5682.pbf"
            ),
            Some("planet/20261004_113936_pt/14/8710/5682.pbf")
        );
        assert!(
            resource_path("https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf")
                .is_some()
        );
        assert!(
            resource_path("https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png").is_some()
        );
        assert!(resource_path("https://tiles.openfreemap.org/styles/positron").is_some());
    }

    #[test]
    fn rejects_other_urls() {
        assert_eq!(resource_path("https://example.com/planet"), None);
        assert_eq!(
            resource_path("https://tiles.openfreemap.org/../etc/passwd"),
            None
        );
        assert_eq!(resource_path("https://tiles.openfreemap.org/"), None);
        assert_eq!(resource_path("https://tiles.openfreemap.org/a?b=c"), None);
    }

    #[test]
    fn versioned_files_are_cached_longer() {
        assert_eq!(max_age("styles/positron"), DAY);
        assert_eq!(max_age("planet"), DAY);
        assert_eq!(
            max_age("planet/20261004_113936_pt/14/8710/5682.pbf"),
            MAX_AGE_IMMUTABLE
        );
        assert_eq!(max_age("sprites/ofm_f384/ofm.json"), MAX_AGE_IMMUTABLE);
    }
}
