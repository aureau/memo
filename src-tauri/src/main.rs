#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod recording;
mod transcription;

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
            transcription::transcribe_audio,
            transcription::set_groq_api_key,
            transcription::has_groq_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
