use crate::models::{validate_meeting, Meeting, MeetingTag, TranscriptSegment};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use std::{
    error::Error,
    fmt,
    path::Path,
    sync::{Mutex, MutexGuard},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub type DbResult<T> = Result<T, DbError>;

#[derive(Debug)]
pub enum DbError {
    Sqlite(rusqlite::Error),
    Json(serde_json::Error),
    InvalidInput(String),
    LockPoisoned,
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(error) => write!(f, "sqlite error: {error}"),
            Self::Json(error) => write!(f, "json error: {error}"),
            Self::InvalidInput(message) => write!(f, "{message}"),
            Self::LockPoisoned => write!(f, "database lock was poisoned"),
        }
    }
}

impl Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl From<serde_json::Error> for DbError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

const MIGRATIONS: &[(i64, &str)] = &[(
    1,
    r#"
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  day TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration TEXT NOT NULL,
  size TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('transcribed', 'transcribing', 'untranscribed')),
  source TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  first_line TEXT,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  format TEXT,
  size_bytes INTEGER,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  segments_json TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meetings_sort_order ON meetings(sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_recordings_meeting_id ON recordings(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id ON transcripts(meeting_id);
"#,
)];

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> DbResult<Self> {
        let mut conn = Connection::open(path)?;
        configure_connection(&conn)?;
        run_migrations(&mut conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn open_in_memory() -> DbResult<Self> {
        let mut conn = Connection::open_in_memory()?;
        configure_connection(&conn)?;
        run_migrations(&mut conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn migrate(&self) -> DbResult<()> {
        let mut conn = self.lock_conn()?;
        run_migrations(&mut conn)
    }

    pub fn list_meetings(&self) -> DbResult<Vec<Meeting>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"
SELECT
  m.id,
  m.title,
  m.day,
  m.date,
  m.time,
  m.duration,
  m.size,
  m.status,
  m.source,
  m.tags_json,
  t.segments_json,
  m.notes,
  m.first_line
FROM meetings m
LEFT JOIN transcripts t ON t.meeting_id = m.id
ORDER BY m.sort_order ASC, m.created_at DESC, m.id ASC
"#,
        )?;

        let mut rows = stmt.query([])?;
        let mut meetings = Vec::new();
        while let Some(row) = rows.next()? {
            meetings.push(meeting_from_row(row)?);
        }

        Ok(meetings)
    }

    pub fn get_meeting(&self, id: &str) -> DbResult<Option<Meeting>> {
        let conn = self.lock_conn()?;
        conn.query_row(
            r#"
SELECT
  m.id,
  m.title,
  m.day,
  m.date,
  m.time,
  m.duration,
  m.size,
  m.status,
  m.source,
  m.tags_json,
  t.segments_json,
  m.notes,
  m.first_line
FROM meetings m
LEFT JOIN transcripts t ON t.meeting_id = m.id
WHERE m.id = ?1
"#,
            params![id],
            |row| meeting_from_row(row).map_err(to_sqlite_conversion_error),
        )
        .optional()
        .map_err(DbError::from)
    }

    pub fn seed_meetings(&self, meetings: Vec<Meeting>) -> DbResult<Vec<Meeting>> {
        {
            let mut conn = self.lock_conn()?;
            let tx = conn.transaction()?;

            for (index, meeting) in meetings.iter().enumerate() {
                upsert_meeting_tx(&tx, meeting, index as i64)?;
            }

            tx.commit()?;
        }

        self.list_meetings()
    }

    pub fn save_meeting(&self, meeting: Meeting) -> DbResult<Meeting> {
        let id = meeting.id.clone();
        {
            let mut conn = self.lock_conn()?;
            let tx = conn.transaction()?;
            let sort_order = existing_sort_order(&tx, &id)?.unwrap_or_else(fresh_sort_order);
            upsert_meeting_tx(&tx, &meeting, sort_order)?;
            tx.commit()?;
        }

        self.get_meeting(&id)?
            .ok_or_else(|| DbError::InvalidInput(format!("meeting not found after save: {id}")))
    }

    pub fn rename_meeting(&self, id: &str, title: &str) -> DbResult<Meeting> {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return Err(DbError::InvalidInput(
                "meeting title is required".to_string(),
            ));
        }

        {
            let conn = self.lock_conn()?;
            let changed = conn.execute(
                "UPDATE meetings SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                params![trimmed, id],
            )?;

            if changed == 0 {
                return Err(DbError::InvalidInput(format!("meeting not found: {id}")));
            }
        }

        self.get_meeting(id)?
            .ok_or_else(|| DbError::InvalidInput(format!("meeting not found: {id}")))
    }

    pub fn delete_meeting(&self, id: &str) -> DbResult<()> {
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM meetings WHERE id = ?1", params![id])?;
        Ok(())
    }

    fn lock_conn(&self) -> DbResult<MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| DbError::LockPoisoned)
    }
}

fn configure_connection(conn: &Connection) -> DbResult<()> {
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(())
}

fn run_migrations(conn: &mut Connection) -> DbResult<()> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"#,
    )?;

    let tx = conn.transaction()?;
    for (version, sql) in MIGRATIONS {
        let already_applied = tx
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                params![version],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();

        if already_applied {
            continue;
        }

        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            params![version],
        )?;
    }
    tx.commit()?;

    Ok(())
}

fn upsert_meeting_tx(tx: &Transaction<'_>, meeting: &Meeting, sort_order: i64) -> DbResult<()> {
    validate_meeting(meeting).map_err(DbError::InvalidInput)?;

    let tags_json = serde_json::to_string(&meeting.tags)?;
    let first_line = meeting.first_line_or_transcript_start();

    tx.execute(
        r#"
INSERT INTO meetings (
  id,
  title,
  day,
  date,
  time,
  duration,
  size,
  status,
  source,
  tags_json,
  notes,
  first_line,
  sort_order,
  created_at,
  updated_at
) VALUES (
  ?1,
  ?2,
  ?3,
  ?4,
  ?5,
  ?6,
  ?7,
  ?8,
  ?9,
  ?10,
  ?11,
  ?12,
  ?13,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  day = excluded.day,
  date = excluded.date,
  time = excluded.time,
  duration = excluded.duration,
  size = excluded.size,
  status = excluded.status,
  source = excluded.source,
  tags_json = excluded.tags_json,
  notes = excluded.notes,
  first_line = excluded.first_line,
  sort_order = excluded.sort_order,
  updated_at = CURRENT_TIMESTAMP
"#,
        params![
            meeting.id,
            meeting.title.trim(),
            meeting.day,
            meeting.date,
            meeting.time,
            meeting.duration,
            meeting.size,
            meeting.status,
            meeting.source,
            tags_json,
            meeting.notes,
            first_line,
            sort_order,
        ],
    )?;

    tx.execute(
        "DELETE FROM transcripts WHERE meeting_id = ?1",
        params![meeting.id],
    )?;

    if let Some(segments) = &meeting.transcript {
        let segments_json = serde_json::to_string(segments)?;
        let content = meeting.transcript_content().unwrap_or_default();
        tx.execute(
            r#"
INSERT INTO transcripts (
  id,
  meeting_id,
  content,
  segments_json,
  model,
  created_at
) VALUES (
  ?1,
  ?2,
  ?3,
  ?4,
  NULL,
  CURRENT_TIMESTAMP
)
"#,
            params![
                format!("transcript_{}", meeting.id),
                meeting.id,
                content,
                segments_json,
            ],
        )?;
    }

    Ok(())
}

fn existing_sort_order(tx: &Transaction<'_>, id: &str) -> DbResult<Option<i64>> {
    tx.query_row(
        "SELECT sort_order FROM meetings WHERE id = ?1",
        params![id],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map_err(DbError::from)
}

fn fresh_sort_order() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default();

    -millis
}

fn meeting_from_row(row: &Row<'_>) -> DbResult<Meeting> {
    let tags_json: String = row.get("tags_json")?;
    let segments_json: Option<String> = row.get("segments_json")?;

    let tags: Vec<MeetingTag> = serde_json::from_str(&tags_json)?;
    let transcript: Option<Vec<TranscriptSegment>> = segments_json
        .map(|json| serde_json::from_str(&json))
        .transpose()?;

    Ok(Meeting {
        id: row.get("id")?,
        title: row.get("title")?,
        day: row.get("day")?,
        date: row.get("date")?,
        time: row.get("time")?,
        duration: row.get("duration")?,
        size: row.get("size")?,
        status: row.get("status")?,
        source: row.get("source")?,
        tags,
        transcript,
        notes: row.get("notes")?,
        first_line: row.get("first_line")?,
    })
}

fn to_sqlite_conversion_error(error: DbError) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}
