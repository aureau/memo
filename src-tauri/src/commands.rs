use std::path::PathBuf;

use crate::{
    db::{Database, DbResult},
    models::Meeting,
    recording,
};
use tauri::{AppHandle, State};

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

#[tauri::command]
pub fn resolve_audio_path(
    app: AppHandle,
    meeting_id: String,
    audio_path: Option<String>,
) -> Result<Option<String>, String> {
    if let Some(path) = audio_path.filter(|value| !value.trim().is_empty()) {
        let candidate = PathBuf::from(path.trim());
        if candidate.exists() {
            return Ok(Some(candidate.to_string_lossy().to_string()));
        }
    }

    let derived = recording::meeting_audio_path(&app, &meeting_id)?;
    if derived.exists() {
        return Ok(Some(derived.to_string_lossy().to_string()));
    }

    Ok(None)
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("path is empty".to_string());
    }

    let candidate = PathBuf::from(path);
    if !candidate.exists() {
        return Err("file not found".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .args(["-R", path])
            .status()
            .map_err(|error| error.to_string())?;

        if status.success() {
            Ok(())
        } else {
            Err("failed to open Finder".to_string())
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("show in Finder is only supported on macOS".to_string())
    }
}
