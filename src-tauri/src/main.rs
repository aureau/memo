#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod recording;

fn main() {
    tauri::Builder::default()
        .manage(recording::RecordingManager::default())
        .invoke_handler(tauri::generate_handler![
            recording::start_recording,
            recording::pause_recording,
            recording::resume_recording,
            recording::stop_recording,
            recording::discard_recording,
            recording::get_recording_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
