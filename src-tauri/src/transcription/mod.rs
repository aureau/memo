use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::Utc;
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use thiserror::Error;
use uuid::Uuid;

const CHUNK_SECONDS: u64 = 10 * 60;
const GROQ_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL: &str = "whisper-large-v3";

type Result<T> = std::result::Result<T, TranscriptionError>;

#[derive(Debug, Error)]
pub enum TranscriptionError {
    #[error("groq api key is not configured")]
    MissingApiKey,
    #[error("audio file not found")]
    FileNotFound,
    #[error("{0}")]
    Api(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Wav(#[from] hound::Error),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl From<TranscriptionError> for String {
    fn from(value: TranscriptionError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeInput {
    pub meeting_id: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegmentDto {
    pub t: String,
    pub who: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptDto {
    pub id: String,
    pub meeting_id: String,
    pub content: String,
    pub segments: Vec<TranscriptSegmentDto>,
    pub model: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
struct GroqSegment {
    start: f64,
    text: String,
}

#[derive(Debug, Deserialize)]
struct GroqResponse {
    text: String,
    segments: Option<Vec<GroqSegment>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppConfig {
    groq_api_key: Option<String>,
}

#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    input: TranscribeInput,
) -> std::result::Result<TranscriptDto, String> {
    transcribe(&app, input).await.map_err(Into::into)
}

#[tauri::command]
pub fn set_groq_api_key(
    app: AppHandle,
    api_key: String,
) -> std::result::Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("api key cannot be empty".to_string());
    }
    save_config(&app, AppConfig {
        groq_api_key: Some(key.to_string()),
    })
    .map_err(Into::into)
}

#[tauri::command]
pub fn has_groq_api_key(app: AppHandle) -> std::result::Result<bool, String> {
    Ok(resolve_api_key(&app).is_ok())
}

async fn transcribe(app: &AppHandle, input: TranscribeInput) -> Result<TranscriptDto> {
    let file_path = PathBuf::from(&input.file_path);
    if !file_path.exists() {
        return Err(TranscriptionError::FileNotFound);
    }

    let api_key = resolve_api_key(app)?;
    let chunks = split_wav_chunks(&file_path, CHUNK_SECONDS)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()?;

    let mut all_segments = Vec::new();
    let mut full_text = Vec::new();

    for (index, chunk_path) in chunks.iter().enumerate() {
        let offset = (index as u64 * CHUNK_SECONDS) as f64;
        let response = upload_chunk(&client, &api_key, chunk_path).await?;
        full_text.push(response.text.trim().to_string());

        if let Some(segments) = response.segments {
            for segment in segments {
                let text = segment.text.trim();
                if text.is_empty() {
                    continue;
                }
                all_segments.push(TranscriptSegmentDto {
                    t: format_timestamp(segment.start + offset),
                    who: "You".to_string(),
                    text: text.to_string(),
                });
            }
        } else if !response.text.trim().is_empty() {
            all_segments.push(TranscriptSegmentDto {
                t: format_timestamp(offset),
                who: "You".to_string(),
                text: response.text.trim().to_string(),
            });
        }
    }

    if all_segments.is_empty() {
        return Err(TranscriptionError::Api(
            "transcription returned no segments".to_string(),
        ));
    }

    let transcript = TranscriptDto {
        id: format!("tr_{}", Uuid::new_v4().simple()),
        meeting_id: input.meeting_id,
        content: full_text.join(" ").trim().to_string(),
        segments: all_segments,
        model: GROQ_MODEL.to_string(),
        created_at: Utc::now().to_rfc3339(),
    };

    persist_transcript(app, &transcript)?;
    Ok(transcript)
}

async fn upload_chunk(
    client: &reqwest::Client,
    api_key: &str,
    chunk_path: &Path,
) -> Result<GroqResponse> {
    let bytes = fs::read(chunk_path)?;
    let part = multipart::Part::bytes(bytes)
        .file_name(
            chunk_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("chunk.wav")
                .to_string(),
        )
        .mime_str("audio/wav")?;

    let form = multipart::Form::new()
        .part("file", part)
        .text("model", GROQ_MODEL)
        .text("response_format", "verbose_json")
        .text("timestamp_granularities[]", "segment");

    let response = client
        .post(GROQ_URL)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(TranscriptionError::Api(format!(
            "groq request failed ({status}): {body}"
        )));
    }

    Ok(response.json::<GroqResponse>().await?)
}

fn split_wav_chunks(file_path: &Path, chunk_seconds: u64) -> Result<Vec<PathBuf>> {
    let mut reader = hound::WavReader::open(file_path)?;
    let spec = reader.spec();
    let frames_per_chunk = spec.sample_rate as u64 * chunk_seconds * u64::from(spec.channels);
    let temp_dir = file_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("transcribe.tmp");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;

    let mut chunk_paths = Vec::new();
    let mut chunk_index = 0usize;
    let mut frames_in_chunk = 0u64;
    let mut writer = new_chunk_writer(&temp_dir, chunk_index, spec)?;

    for sample in reader.samples::<i16>() {
        writer.write_sample(sample?)?;
        frames_in_chunk += 1;
        if frames_in_chunk >= frames_per_chunk {
            writer.finalize()?;
            chunk_paths.push(temp_dir.join(format!("chunk_{chunk_index:03}.wav")));
            chunk_index += 1;
            frames_in_chunk = 0;
            writer = new_chunk_writer(&temp_dir, chunk_index, spec)?;
        }
    }

    if frames_in_chunk > 0 || chunk_paths.is_empty() {
        writer.finalize()?;
        chunk_paths.push(temp_dir.join(format!("chunk_{chunk_index:03}.wav")));
    }

    Ok(chunk_paths)
}

fn new_chunk_writer(
    temp_dir: &Path,
    index: usize,
    spec: hound::WavSpec,
) -> Result<hound::WavWriter<std::io::BufWriter<std::fs::File>>> {
    Ok(hound::WavWriter::create(
        temp_dir.join(format!("chunk_{index:03}.wav")),
        spec,
    )?)
}

fn persist_transcript(app: &AppHandle, transcript: &TranscriptDto) -> Result<()> {
    let dir = transcripts_dir(app)?;
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.json", transcript.meeting_id));
    fs::write(path, serde_json::to_string_pretty(transcript)?)?;
    Ok(())
}

fn transcripts_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| TranscriptionError::Api(error.to_string()))?
        .join("transcripts"))
}

fn config_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| TranscriptionError::Api(error.to_string()))?
        .join("config.json"))
}

fn load_config(app: &AppHandle) -> Result<AppConfig> {
    let path = config_path(app)?;
    load_config_from_path(&path)
}

fn save_config(app: &AppHandle, config: AppConfig) -> Result<()> {
    let path = config_path(app)?;
    save_config_to_path(&path, config)
}

fn load_config_from_path(path: &Path) -> Result<AppConfig> {
    if !path.exists() {
        return Ok(AppConfig { groq_api_key: None });
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw).unwrap_or(AppConfig {
        groq_api_key: None,
    }))
}

fn save_config_to_path(path: &Path, config: AppConfig) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(&config)?)?;
    Ok(())
}

fn resolve_api_key(app: &AppHandle) -> Result<String> {
    if let Ok(key) = std::env::var("GROQ_API_KEY") {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    load_config(app)?
        .groq_api_key
        .filter(|key| !key.trim().is_empty())
        .ok_or(TranscriptionError::MissingApiKey)
}

fn format_timestamp(seconds: f64) -> String {
    let total = seconds.max(0.0).floor() as u64;
    let minutes = total / 60;
    let secs = total % 60;
    format!("{minutes:02}:{secs:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamp_formats_seconds() {
        assert_eq!(format_timestamp(0.0), "00:00");
        assert_eq!(format_timestamp(65.4), "01:05");
        assert_eq!(format_timestamp(600.0), "10:00");
    }

    #[test]
    fn wav_chunks_split_on_duration() {
        let root = std::env::temp_dir().join(format!(
            "memo_transcribe_test_{}",
            std::process::id()
        ));
        if root.exists() {
            fs::remove_dir_all(&root).unwrap();
        }
        fs::create_dir_all(&root).unwrap();
        let wav_path = root.join("audio.wav");
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 4,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        {
            let mut writer = hound::WavWriter::create(&wav_path, spec).unwrap();
            for sample in 0..18i16 {
                writer.write_sample(sample).unwrap();
            }
            writer.finalize().unwrap();
        }

        let chunks = split_wav_chunks(&wav_path, 2).unwrap();
        assert_eq!(chunks.len(), 3);
    }

    #[test]
    fn config_roundtrips_and_ignores_invalid_json() {
        let root = std::env::temp_dir().join(format!("memo_config_test_{}", std::process::id()));
        if root.exists() {
            fs::remove_dir_all(&root).unwrap();
        }
        fs::create_dir_all(&root).unwrap();

        let path = root.join("config.json");
        assert_eq!(load_config_from_path(&path).unwrap().groq_api_key, None);

        save_config_to_path(
            &path,
            AppConfig {
                groq_api_key: Some("gsk_test".to_string()),
            },
        )
        .unwrap();
        assert_eq!(
            load_config_from_path(&path).unwrap().groq_api_key.as_deref(),
            Some("gsk_test")
        );

        fs::write(&path, "{not valid json").unwrap();
        assert_eq!(load_config_from_path(&path).unwrap().groq_api_key, None);

        fs::remove_dir_all(&root).unwrap();
    }
}
