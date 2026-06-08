use serde::{Deserialize, Serialize};

pub const MEETING_STATUSES: [&str; 3] = ["transcribed", "transcribing", "untranscribed"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MeetingTag {
    pub label: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TranscriptSegment {
    pub t: String,
    pub who: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub day: String,
    pub date: String,
    pub time: String,
    pub duration: String,
    pub size: String,
    pub status: String,
    pub source: String,
    #[serde(default)]
    pub tags: Vec<MeetingTag>,
    #[serde(default)]
    pub transcript: Option<Vec<TranscriptSegment>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_line: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_path: Option<String>,
}

impl Meeting {
    pub fn first_line_or_transcript_start(&self) -> Option<String> {
        self.first_line
            .as_ref()
            .filter(|line| !line.trim().is_empty())
            .cloned()
            .or_else(|| {
                self.transcript
                    .as_ref()
                    .and_then(|segments| segments.first())
                    .map(|segment| segment.text.clone())
            })
    }

    pub fn transcript_content(&self) -> Option<String> {
        self.transcript.as_ref().map(|segments| {
            segments
                .iter()
                .map(|segment| segment.text.as_str())
                .collect::<Vec<_>>()
                .join("\n")
        })
    }
}

pub fn validate_meeting(meeting: &Meeting) -> Result<(), String> {
    if meeting.id.trim().is_empty() {
        return Err("meeting id is required".to_string());
    }

    if meeting.title.trim().is_empty() {
        return Err("meeting title is required".to_string());
    }

    if !MEETING_STATUSES.contains(&meeting.status.as_str()) {
        return Err(format!("unsupported meeting status: {}", meeting.status));
    }

    Ok(())
}
