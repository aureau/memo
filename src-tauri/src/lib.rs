pub mod commands;
pub mod db;
pub mod models;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("memo.sqlite3");
            let database = db::Database::open(db_path)?;
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_meetings,
            commands::get_meeting,
            commands::seed_meetings,
            commands::save_meeting,
            commands::rename_meeting,
            commands::delete_meeting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
