mod cache;
mod eat_api;
#[cfg(target_os = "linux")]
mod gestures;
mod http;
mod map_data;
mod swm;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = http::HttpClient::new().expect("failed to build HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(client)
        .invoke_handler(tauri::generate_handler![
            eat_api::eat_api_get,
            map_data::map_resource,
            swm::swm_menu
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            map_data::prune_cache(app.handle());
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                gestures::forward_touchpad_pinch(&window)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
