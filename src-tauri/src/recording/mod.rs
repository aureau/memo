mod mic;
mod system_audio;
mod wav;

use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Sender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use thiserror::Error;
use uuid::Uuid;
use wav::{AudioSpec, WavChunker};

const CHUNK_SECONDS: u64 = 30;
const MAX_DURATION_SECONDS: u64 = 60 * 60;
fn max_duration_seconds() -> u64 {
    if cfg!(debug_assertions) {
        if let Ok(value) = std::env::var("MEMO_DEBUG_MAX_DURATION_SECS") {
            if let Ok(secs) = value.parse::<u64>() {
                return secs.clamp(1, MAX_DURATION_SECONDS);
            }
        }
    }
    MAX_DURATION_SECONDS
}

type Result<T> = std::result::Result<T, RecordingError>;

#[derive(Debug, Error)]
pub enum RecordingError {
    #[error("a recording is already active")]
    AlreadyActive,
    #[error("recording session not found")]
    NotFound,
    #[error("{0}")]
    Capture(String),
    #[error("recording source is not supported on this platform")]
    UnsupportedSource,
    #[error("recording reached the 60 minute maximum")]
    MaxDuration,
    #[error("recording worker stopped unexpectedly")]
    WorkerStopped,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Wav(#[from] hound::Error),
}

impl From<RecordingError> for String {
    fn from(value: RecordingError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecordingSource {
    Microphone,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecordingStatus {
    Recording,
    Paused,
    Finalizing,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRecordingInput {
    pub source: RecordingSource,
    pub meeting_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSessionDto {
    pub id: String,
    pub meeting_id: Option<String>,
    pub source: RecordingSource,
    pub status: RecordingStatus,
    pub started_at: String,
    pub elapsed_s: u64,
    pub chunk_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingArtifactDto {
    pub id: String,
    pub meeting_id: Option<String>,
    pub file_path: String,
    pub format: String,
    pub size_bytes: u64,
    pub source: RecordingSource,
    pub duration_s: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardRecordingDto {
    pub id: String,
    pub discarded: bool,
}

#[derive(Debug)]
struct RecordingRuntime {
    id: String,
    meeting_id: Option<String>,
    source: RecordingSource,
    status: RecordingStatus,
    started_at: String,
    elapsed_frames: u64,
    sample_rate: u32,
    chunk_count: usize,
}

impl RecordingRuntime {
    fn dto(&self) -> RecordingSessionDto {
        RecordingSessionDto {
            id: self.id.clone(),
            meeting_id: self.meeting_id.clone(),
            source: self.source,
            status: self.status,
            started_at: self.started_at.clone(),
            elapsed_s: frames_to_seconds(self.elapsed_frames, self.sample_rate),
            chunk_count: self.chunk_count,
        }
    }
}

#[derive(Debug)]
struct RecordingControl {
    paused: AtomicBool,
    stopped: AtomicBool,
}

impl RecordingControl {
    fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            stopped: AtomicBool::new(false),
        }
    }
}

enum CaptureHandle {
    Microphone(cpal::Stream),
    System(system_audio::SystemAudioCapture),
}

impl CaptureHandle {
    fn stop(self) -> Result<()> {
        match self {
            Self::Microphone(_stream) => Ok(()),
            Self::System(capture) => capture.stop(),
        }
    }
}

enum WriterCommand {
    Samples(Vec<f32>),
    Stop(Sender<Result<RecordingArtifactDto>>),
    Discard(Sender<Result<()>>),
}

struct RecordingHandle {
    runtime: Arc<Mutex<RecordingRuntime>>,
    control: Arc<RecordingControl>,
    completed: Arc<Mutex<Option<RecordingArtifactDto>>>,
    tx: Sender<WriterCommand>,
    capture: Option<CaptureHandle>,
    worker: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct RecordingManager {
    sessions: Mutex<HashMap<String, RecordingHandle>>,
}

#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    manager: State<'_, RecordingManager>,
    input: StartRecordingInput,
) -> std::result::Result<RecordingSessionDto, String> {
    manager.start(app, input).map_err(Into::into)
}

#[tauri::command]
pub fn pause_recording(
    manager: State<'_, RecordingManager>,
    session_id: String,
) -> std::result::Result<RecordingSessionDto, String> {
    manager.pause(&session_id).map_err(Into::into)
}

#[tauri::command]
pub fn resume_recording(
    manager: State<'_, RecordingManager>,
    session_id: String,
) -> std::result::Result<RecordingSessionDto, String> {
    manager.resume(&session_id).map_err(Into::into)
}

#[tauri::command]
pub fn stop_recording(
    manager: State<'_, RecordingManager>,
    session_id: String,
) -> std::result::Result<RecordingArtifactDto, String> {
    manager.stop(&session_id).map_err(Into::into)
}

#[tauri::command]
pub fn discard_recording(
    manager: State<'_, RecordingManager>,
    session_id: String,
) -> std::result::Result<DiscardRecordingDto, String> {
    manager.discard(&session_id).map_err(Into::into)
}

#[tauri::command]
pub fn get_recording_status(
    manager: State<'_, RecordingManager>,
    session_id: String,
) -> std::result::Result<RecordingSessionDto, String> {
    manager.status(&session_id).map_err(Into::into)
}

impl RecordingManager {
    fn start(&self, app: AppHandle, input: StartRecordingInput) -> Result<RecordingSessionDto> {
        let mut sessions = self.sessions.lock().expect("recording sessions poisoned");
        if !sessions.is_empty() {
            return Err(RecordingError::AlreadyActive);
        }

        let id = format!("rec_{}", Uuid::new_v4().simple());
        let started_at = Utc::now().to_rfc3339();
        let root = recording_root(&app, input.meeting_id.as_deref().unwrap_or(&id))?;
        let temp_dir = root.join("chunks.tmp");
        let final_path = root.join("audio.wav");
        fs::create_dir_all(&temp_dir)?;
        fs::create_dir_all(&root)?;

        let (tx, rx) = mpsc::channel::<WriterCommand>();
        let control = Arc::new(RecordingControl::new());
        let (capture, spec) = match input.source {
            RecordingSource::Microphone => {
                let (stream, spec) = mic::start(tx.clone(), control.clone())?;
                (CaptureHandle::Microphone(stream), spec)
            }
            RecordingSource::System => {
                let (capture, spec) = system_audio::start(tx.clone(), control.clone())?;
                (CaptureHandle::System(capture), spec)
            }
        };

        let runtime = Arc::new(Mutex::new(RecordingRuntime {
            id: id.clone(),
            meeting_id: input.meeting_id,
            source: input.source,
            status: RecordingStatus::Recording,
            started_at,
            elapsed_frames: 0,
            sample_rate: spec.sample_rate,
            chunk_count: 0,
        }));

        let completed = Arc::new(Mutex::new(None));
        let worker_runtime = runtime.clone();
        let worker_control = control.clone();
        let worker_completed = completed.clone();
        let worker = thread::spawn(move || {
            writer_loop(
                rx,
                worker_runtime,
                worker_control,
                worker_completed,
                spec,
                temp_dir,
                final_path,
            );
        });

        let dto = runtime.lock().expect("recording runtime poisoned").dto();
        sessions.insert(
            id,
            RecordingHandle {
                runtime,
                control,
                completed,
                tx,
                capture: Some(capture),
                worker: Some(worker),
            },
        );

        Ok(dto)
    }

    fn pause(&self, session_id: &str) -> Result<RecordingSessionDto> {
        let sessions = self.sessions.lock().expect("recording sessions poisoned");
        let handle = sessions.get(session_id).ok_or(RecordingError::NotFound)?;
        handle.control.paused.store(true, Ordering::SeqCst);
        let mut runtime = handle.runtime.lock().expect("recording runtime poisoned");
        runtime.status = RecordingStatus::Paused;
        Ok(runtime.dto())
    }

    fn resume(&self, session_id: &str) -> Result<RecordingSessionDto> {
        let sessions = self.sessions.lock().expect("recording sessions poisoned");
        let handle = sessions.get(session_id).ok_or(RecordingError::NotFound)?;
        handle.control.paused.store(false, Ordering::SeqCst);
        let mut runtime = handle.runtime.lock().expect("recording runtime poisoned");
        runtime.status = RecordingStatus::Recording;
        Ok(runtime.dto())
    }

    fn status(&self, session_id: &str) -> Result<RecordingSessionDto> {
        let sessions = self.sessions.lock().expect("recording sessions poisoned");
        let handle = sessions.get(session_id).ok_or(RecordingError::NotFound)?;
        let dto = handle
            .runtime
            .lock()
            .expect("recording runtime poisoned")
            .dto();
        Ok(dto)
    }

    fn stop(&self, session_id: &str) -> Result<RecordingArtifactDto> {
        let mut handle = self.take_session(session_id)?;
        handle.control.stopped.store(true, Ordering::SeqCst);
        if let Some(capture) = handle.capture.take() {
            capture.stop()?;
        }

        {
            let mut runtime = handle.runtime.lock().expect("recording runtime poisoned");
            runtime.status = RecordingStatus::Finalizing;
        }

        let result = if let Some(worker) = handle.worker.as_ref() {
            if worker.is_finished() {
                handle
                    .completed
                    .lock()
                    .expect("recording completed poisoned")
                    .take()
                    .map(Ok)
                    .ok_or(RecordingError::WorkerStopped)?
            } else {
                let (reply_tx, reply_rx) = mpsc::channel();
                let send_ok = handle.tx.send(WriterCommand::Stop(reply_tx)).is_ok();
                if !send_ok {
                    handle
                        .completed
                        .lock()
                        .expect("recording completed poisoned")
                        .take()
                        .map(Ok)
                        .ok_or(RecordingError::WorkerStopped)?
                } else {
                    match reply_rx.recv_timeout(Duration::from_secs(30)) {
                        Ok(result) => result,
                        Err(_) => handle
                            .completed
                            .lock()
                            .expect("recording completed poisoned")
                            .take()
                            .map(Ok)
                            .ok_or(RecordingError::WorkerStopped)?,
                    }
                }
            }
        } else {
            handle
                .completed
                .lock()
                .expect("recording completed poisoned")
                .take()
                .map(Ok)
                .ok_or(RecordingError::WorkerStopped)?
        };
        if let Some(worker) = handle.worker.take() {
            let _ = worker.join();
        }
        result
    }

    fn discard(&self, session_id: &str) -> Result<DiscardRecordingDto> {
        let mut handle = self.take_session(session_id)?;
        handle.control.stopped.store(true, Ordering::SeqCst);
        if let Some(capture) = handle.capture.take() {
            capture.stop()?;
        }

        let (reply_tx, reply_rx) = mpsc::channel();
        handle
            .tx
            .send(WriterCommand::Discard(reply_tx))
            .map_err(|_| RecordingError::WorkerStopped)?;
        let result = reply_rx.recv().map_err(|_| RecordingError::WorkerStopped)?;
        if let Some(worker) = handle.worker.take() {
            let _ = worker.join();
        }
        result?;
        Ok(DiscardRecordingDto {
            id: session_id.to_string(),
            discarded: true,
        })
    }

    fn take_session(&self, session_id: &str) -> Result<RecordingHandle> {
        self.sessions
            .lock()
            .expect("recording sessions poisoned")
            .remove(session_id)
            .ok_or(RecordingError::NotFound)
    }
}

fn writer_loop(
    rx: mpsc::Receiver<WriterCommand>,
    runtime: Arc<Mutex<RecordingRuntime>>,
    control: Arc<RecordingControl>,
    completed: Arc<Mutex<Option<RecordingArtifactDto>>>,
    spec: AudioSpec,
    temp_dir: PathBuf,
    final_path: PathBuf,
) {
    let artifact_id = runtime.lock().expect("recording runtime poisoned").id.clone();
    let chunk_frames = spec.sample_rate as u64 * CHUNK_SECONDS;
    let mut chunker = match WavChunker::new(spec, temp_dir, final_path.clone(), chunk_frames) {
        Ok(chunker) => chunker,
        Err(error) => {
            fail_all(rx, error);
            return;
        }
    };

    while let Ok(command) = rx.recv() {
        match command {
            WriterCommand::Samples(samples) => {
                if let Err(error) = chunker.push_interleaved_f32(&samples) {
                    fail_all(rx, error);
                    return;
                }

                let mut state = runtime.lock().expect("recording runtime poisoned");
                state.elapsed_frames = chunker.total_frames();
                state.chunk_count = chunker.chunk_count();
                let max_frames = u64::from(state.sample_rate) * max_duration_seconds();
                if state.elapsed_frames >= max_frames {
                    state.status = RecordingStatus::Finalizing;
                    drop(state);
                    control.stopped.store(true, Ordering::SeqCst);
                    let result = finalize_recording(&runtime, &mut chunker, artifact_id);
                    if let Ok(artifact) = &result {
                        *completed.lock().expect("recording completed poisoned") =
                            Some(artifact.clone());
                    }
                    drain_after_complete(rx, result);
                    return;
                }
            }
            WriterCommand::Stop(reply) => {
                let result = finalize_recording(&runtime, &mut chunker, artifact_id);
                let _ = reply.send(result);
                return;
            }
            WriterCommand::Discard(reply) => {
                let result = chunker.discard().map_err(RecordingError::from);
                let _ = reply.send(result);
                return;
            }
        }
    }
}

fn finalize_recording(
    runtime: &Arc<Mutex<RecordingRuntime>>,
    chunker: &mut WavChunker,
    artifact_id: String,
) -> Result<RecordingArtifactDto> {
    let final_path = chunker.finalize()?;
    let size_bytes = fs::metadata(&final_path)?.len();
    let state = runtime.lock().expect("recording runtime poisoned");
    Ok(RecordingArtifactDto {
        id: artifact_id,
        meeting_id: state.meeting_id.clone(),
        file_path: final_path.to_string_lossy().to_string(),
        format: "wav".to_string(),
        size_bytes,
        source: state.source,
        duration_s: frames_to_seconds(state.elapsed_frames, state.sample_rate),
        created_at: Utc::now().to_rfc3339(),
    })
}

fn drain_after_complete(rx: mpsc::Receiver<WriterCommand>, result: Result<RecordingArtifactDto>) {
    let mut pending = Some(result);
    for command in rx {
        match command {
            WriterCommand::Stop(reply) => {
                if let Some(result) = pending.take() {
                    let _ = reply.send(result);
                }
            }
            WriterCommand::Discard(reply) => {
                let _ = reply.send(Ok(()));
            }
            WriterCommand::Samples(_) => {}
        }
    }
}

fn fail_all(rx: mpsc::Receiver<WriterCommand>, error: RecordingError) {
    let message = error.to_string();
    for command in rx {
        let result = Err(RecordingError::Capture(message.clone()));
        match command {
            WriterCommand::Stop(reply) => {
                let _ = reply.send(result);
            }
            WriterCommand::Discard(reply) => {
                let _ = reply.send(Ok(()));
            }
            WriterCommand::Samples(_) => {}
        }
    }
}

pub fn meeting_audio_path(app: &AppHandle, meeting_id: &str) -> std::result::Result<PathBuf, String> {
    Ok(recording_root(app, meeting_id)?.join("audio.wav"))
}

fn recording_root(app: &AppHandle, meeting_or_session_id: &str) -> Result<PathBuf> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| RecordingError::Capture(error.to_string()))?;
    Ok(app_data_dir
        .join("recordings")
        .join(sanitize_path_component(meeting_or_session_id)))
}

fn sanitize_path_component(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn frames_to_seconds(frames: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        0
    } else {
        frames / u64::from(sample_rate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_components_are_sanitized() {
        assert_eq!(sanitize_path_component("../meeting 1"), "___meeting_1");
    }

    #[test]
    fn frame_duration_rounds_down_to_seconds() {
        assert_eq!(frames_to_seconds(96_001, 48_000), 2);
    }

    #[test]
    fn max_duration_auto_finalizes_and_leaves_recoverable_artifact() {
        use std::sync::mpsc;

        let temp = std::env::temp_dir().join(format!(
            "memo_max_duration_test_{}",
            std::process::id()
        ));
        if temp.exists() {
            fs::remove_dir_all(&temp).unwrap();
        }
        let chunks_dir = temp.join("chunks.tmp");
        let final_path = temp.join("audio.wav");
        let spec = AudioSpec {
            sample_rate: 8_000,
            channels: 1,
        };

        std::env::set_var("MEMO_DEBUG_MAX_DURATION_SECS", "1");

        let (tx, rx) = mpsc::channel();
        let runtime = Arc::new(Mutex::new(RecordingRuntime {
            id: "rec_test".to_string(),
            meeting_id: None,
            source: RecordingSource::Microphone,
            status: RecordingStatus::Recording,
            started_at: Utc::now().to_rfc3339(),
            elapsed_frames: 0,
            sample_rate: spec.sample_rate,
            chunk_count: 0,
        }));
        let control = Arc::new(RecordingControl::new());
        let completed = Arc::new(Mutex::new(None));
        let output_path = final_path.clone();
        let worker_control = control.clone();
        let worker_completed = completed.clone();
        let worker = thread::spawn(move || {
            writer_loop(
                rx,
                runtime,
                worker_control,
                worker_completed,
                spec,
                chunks_dir,
                output_path,
            );
        });

        tx.send(WriterCommand::Samples(vec![0.0; 8_000]))
            .expect("one second of samples sent");
        drop(tx);

        worker.join().expect("worker joined");

        let artifact = completed
            .lock()
            .expect("completed poisoned")
            .clone()
            .expect("artifact stored after max duration");
        assert!(final_path.exists());
        assert_eq!(artifact.duration_s, 1);
        assert!(artifact.size_bytes > 0);
        assert!(control.stopped.load(Ordering::SeqCst));

        let _ = fs::remove_dir_all(temp);
    }
}
