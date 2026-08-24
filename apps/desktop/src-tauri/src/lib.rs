#[tauri::command]
fn platform_name() -> &'static str { "FounderHQ Desktop" }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![platform_name])
    .run(tauri::generate_context!())
    .expect("error while running FounderHQ desktop");
}
