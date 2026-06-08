use crate::{
    db::{Database, DbResult},
    models::Meeting,
};
use tauri::State;

fn command_result<T>(result: DbResult<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_meetings(db: State<'_, Database>) -> Result<Vec<Meeting>, String> {
    command_result(db.list_meetings())
}

#[tauri::command]
pub fn get_meeting(id: String, db: State<'_, Database>) -> Result<Option<Meeting>, String> {
    command_result(db.get_meeting(&id))
}

#[tauri::command]
pub fn seed_meetings(
    meetings: Vec<Meeting>,
    db: State<'_, Database>,
) -> Result<Vec<Meeting>, String> {
    command_result(db.seed_meetings(meetings))
}

#[tauri::command]
pub fn save_meeting(meeting: Meeting, db: State<'_, Database>) -> Result<Meeting, String> {
    command_result(db.save_meeting(meeting))
}

#[tauri::command]
pub fn rename_meeting(
    id: String,
    title: String,
    db: State<'_, Database>,
) -> Result<Meeting, String> {
    command_result(db.rename_meeting(&id, &title))
}

#[tauri::command]
pub fn delete_meeting(id: String, db: State<'_, Database>) -> Result<(), String> {
    command_result(db.delete_meeting(&id))
}
