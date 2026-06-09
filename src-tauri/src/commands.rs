use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

use chrono::{DateTime, Datelike, Local, NaiveDate, Timelike};
use crate::{
    db::{Database, DbError, DbResult},
    models::Meeting,
    recording,
};
use tauri::{AppHandle, Manager, State};

fn command_result<T>(result: DbResult<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

fn recover_orphan_recordings(app: &AppHandle, db: &Database) -> DbResult<usize> {
    let recordings_dir = app
        .path()
        .app_data_dir()
        .map_err(|error: tauri::Error| DbError::InvalidInput(error.to_string()))?
        .join("recordings");
    recover_orphan_recordings_in(db, &recordings_dir)
}

fn recover_orphan_recordings_in(db: &Database, recordings_dir: &Path) -> DbResult<usize> {
    if !recordings_dir.is_dir() {
        return Ok(0);
    }

    let mut recovered = 0usize;
    for entry in fs::read_dir(recordings_dir).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        if !entry.file_type().map_err(io_error)?.is_dir() {
            continue;
        }

        let id = entry.file_name().to_string_lossy().to_string();
        if db.get_meeting(&id)?.is_some() {
            continue;
        }

        let audio_path = entry.path().join("audio.wav");
        if !audio_path.is_file() {
            continue;
        }

        let meeting = meeting_from_orphan_audio(&id, &audio_path)?;
        db.save_meeting(meeting)?;
        recovered += 1;
    }

    Ok(recovered)
}

fn io_error(error: std::io::Error) -> DbError {
    DbError::InvalidInput(error.to_string())
}

fn meeting_from_orphan_audio(id: &str, audio_path: &Path) -> DbResult<Meeting> {
    let metadata = fs::metadata(audio_path).map_err(io_error)?;
    let modified = metadata
        .modified()
        .unwrap_or_else(|_| SystemTime::now());
    let modified_at: DateTime<Local> = modified.into();
    let date = modified_at.date_naive();

    Ok(Meeting {
        id: id.to_string(),
        title: "New recording".to_string(),
        day: relative_day_label(date),
        date: format_date_label(date),
        time: format_clock_label(modified_at),
        duration: format_duration(wav_duration_seconds(audio_path)?),
        size: format_bytes(metadata.len()),
        status: "untranscribed".to_string(),
        source: "Microphone".to_string(),
        tags: Vec::new(),
        transcript: None,
        notes: None,
        first_line: Some(String::new()),
        audio_path: Some(audio_path.to_string_lossy().to_string()),
    })
}

fn relative_day_label(date: NaiveDate) -> String {
    let today = Local::now().date_naive();
    if date == today {
        "Today".to_string()
    } else if today.pred_opt().is_some_and(|yesterday| date == yesterday) {
        "Yesterday".to_string()
    } else {
        "Earlier".to_string()
    }
}

fn format_date_label(date: NaiveDate) -> String {
    format!("{} {}", date.format("%b"), date.day())
}

fn format_clock_label(dt: DateTime<Local>) -> String {
    let hour24 = dt.hour();
    let minute = dt.minute();
    let meridiem = if hour24 >= 12 { "p" } else { "a" };
    let hour12 = hour24 % 12;
    let hour12 = if hour12 == 0 { 12 } else { hour12 };
    format!("{hour12}:{minute:02}{meridiem}")
}

fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}:{secs:02}")
    } else {
        format!("{minutes:02}:{secs:02}")
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

fn wav_duration_seconds(path: &Path) -> DbResult<u64> {
    let reader = hound::WavReader::open(path)
        .map_err(|error| DbError::InvalidInput(error.to_string()))?;
    let sample_rate = u64::from(reader.spec().sample_rate.max(1));
    Ok(u64::from(reader.duration()) / sample_rate)
}

#[tauri::command]
pub fn list_meetings(app: AppHandle, db: State<'_, Database>) -> Result<Vec<Meeting>, String> {
    command_result(recover_orphan_recordings(&app, &db).and_then(|_| db.list_meetings()))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use std::path::PathBuf;

    #[test]
    fn recovers_finished_audio_without_a_meeting_row() {
        let app_data = PathBuf::from(env!("HOME"))
            .join("Library/Application Support/com.memo.desktop");
        let db_path = app_data.join("memo.sqlite3");
        let recordings_dir = app_data.join("recordings");
        let orphan_id = "rec_0c8f671867b744b4b4b375e47763c16c";

        if !db_path.exists() || !recordings_dir.join(orphan_id).join("audio.wav").exists() {
            return;
        }

        let db = Database::open(&db_path).expect("database opens");
        if db.get_meeting(orphan_id).expect("lookup works").is_some() {
            return;
        }

        let recovered = recover_orphan_recordings_in(&db, &recordings_dir).expect("recovery works");
        assert!(recovered >= 1);

        let meeting = db
            .get_meeting(orphan_id)
            .expect("lookup works")
            .expect("orphan meeting saved");
        assert_eq!(meeting.title, "New recording");
        assert!(["Today", "Yesterday", "Earlier"].contains(&meeting.day.as_str()));
        assert!(meeting.audio_path.as_ref().is_some_and(|path| path.contains(orphan_id)));
        assert!(meeting.duration.starts_with("59:") || meeting.duration.starts_with("1:"));
    }
}
