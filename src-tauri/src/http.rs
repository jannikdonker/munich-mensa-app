use std::{
    fs, io,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

/// Largest response body accepted. The biggest real ones (dense map tiles) are well under
/// 1 MB; the cap keeps a misbehaving server from filling memory.
const MAX_BODY_BYTES: usize = 10 * 1024 * 1024;

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

    /// GETs `url` and returns the body, or `None` for a 404. Bodies over
    /// `MAX_BODY_BYTES` (after decompression) are an error.
    pub async fn get(&self, url: &str) -> Result<Option<Vec<u8>>, String> {
        let response = self.0.get(url).send().await.map_err(|e| e.to_string())?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let mut response = response.error_for_status().map_err(|e| e.to_string())?;
        let too_large = || format!("{url}: response larger than {MAX_BODY_BYTES} bytes");
        if response
            .content_length()
            .is_some_and(|len| len > MAX_BODY_BYTES as u64)
        {
            return Err(too_large());
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            if body.len() + chunk.len() > MAX_BODY_BYTES {
                return Err(too_large());
            }
            body.extend_from_slice(&chunk);
        }
        Ok(Some(body))
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
