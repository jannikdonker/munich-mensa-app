use std::{
    fs, io,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

/// Shared HTTP client. The User-Agent identifies the app, as the OSM tile policy requires.
pub struct HttpClient(reqwest::Client);

impl HttpClient {
    pub fn new() -> reqwest::Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(concat!(
                "MunichMensa/",
                env!("CARGO_PKG_VERSION"),
                " (Tauri app; canteen map for Munich)"
            ))
            .timeout(Duration::from_secs(15))
            .build()?;
        Ok(Self(client))
    }

    /// GETs `url` and returns the body, or `None` for a 404.
    pub async fn get(&self, url: &str) -> Result<Option<Vec<u8>>, String> {
        let response = self.0.get(url).send().await.map_err(|e| e.to_string())?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let response = response.error_for_status().map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        Ok(Some(bytes.to_vec()))
    }
}

pub fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Writes via a temp file + rename so concurrent readers never see a half-written file.
pub fn write_file(file: &Path, contents: &[u8]) -> io::Result<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = file.with_extension(format!("tmp{}", COUNTER.fetch_add(1, Ordering::Relaxed)));
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, file)
}
