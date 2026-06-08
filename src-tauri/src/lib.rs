pub mod commands;
pub mod db;
pub mod models;
pub mod recording;
pub mod transcription;

use recording::RecordingManager;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("memo.sqlite3");
            let database = db::Database::open(db_path)?;
            app.manage(database);
            app.manage(RecordingManager::default());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_meetings,
            commands::get_meeting,
            commands::seed_meetings,
            commands::save_meeting,
            commands::rename_meeting,
            commands::delete_meeting,
            commands::resolve_audio_path,
            commands::reveal_in_finder,
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
